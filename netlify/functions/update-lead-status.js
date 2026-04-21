import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { verifyToken } from './lib/auth.js';

const prisma = new PrismaClient();

// Valid lead status values (from kanban board)
const VALID_STATUSES = [
  'new',
  'contacted',
  'appointment_scheduled',
  'pending',
  'insurance_claim',
  'proposal_sent',
  'follow_up',
  'proposal_signed',
  'job_scheduled',
  'on_hold',
  'completed',
  'lost',
  'killed',
  'unqualified'
];

export async function handler(event) {
  // Only allow POST/PATCH
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'PATCH') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const user = verifyToken(authHeader);

  if (!user) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized - Please log in' })
    };
  }

  try {
    const { leadId, status, ownerName, firstName, lastName, tags, measurementUrl, email, phone, address, city, state, postalCode, projectId, organizationId } = JSON.parse(event.body);

    if (!leadId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'leadId is required' })
      };
    }

    // Allow null/empty to clear status, otherwise validate
    if (status && !VALID_STATUSES.includes(status)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Invalid status value',
          validStatuses: VALID_STATUSES
        })
      };
    }

    // Verify the lead exists
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { tenant: true, projectId: true }
    });

    if (!lead) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Lead not found' })
      };
    }

    // Check if user has access to this tenant (via UserTenant membership or matching slug)
    const hasAccess = lead.tenant === user.slug || await prisma.userTenant.findFirst({
      where: {
        userId: user.userId,
        tenant: { slug: lead.tenant }
      }
    });

    if (!hasAccess) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Access denied' })
      };
    }

    // Build update data
    const updateData = {};
    if (status !== undefined) {
      updateData.status = status || null;
    }
    if (ownerName !== undefined) {
      updateData.ownerName = ownerName || null;
    }
    if (firstName !== undefined) {
      updateData.firstName = firstName;
    }
    if (lastName !== undefined) {
      updateData.lastName = lastName;
    }
    if (tags !== undefined) {
      updateData.tags = tags;
    }
    if (measurementUrl !== undefined) {
      updateData.measurementUrl = measurementUrl || null;
    }
    if (email !== undefined) {
      updateData.email = email || null;
    }
    if (phone !== undefined) {
      updateData.phone = phone || null;
    }
    if (address !== undefined) {
      updateData.address = address || null;
    }
    if (city !== undefined) {
      updateData.city = city || null;
    }
    if (state !== undefined) {
      updateData.state = state || null;
    }
    if (postalCode !== undefined) {
      updateData.postalCode = postalCode || null;
    }
    if (projectId !== undefined) {
      updateData.projectId = projectId || null;
    }
    if (organizationId !== undefined) {
      updateData.organizationId = organizationId || null;
    }

    // Update the lead
    const updated = await prisma.lead.update({
      where: { id: leadId },
      data: updateData
    });

    // Sync address fields to linked Project, or create one if none exists
    const addressChanged = address !== undefined || city !== undefined || state !== undefined || postalCode !== undefined;
    const linkedProjectId = updated.projectId || lead.projectId;
    if (addressChanged && updated.address) {
      if (linkedProjectId) {
        // Update existing project
        const projectUpdate = {};
        if (address !== undefined) projectUpdate.address = address || null;
        if (city !== undefined) projectUpdate.city = city || null;
        if (state !== undefined) projectUpdate.state = state || null;
        if (postalCode !== undefined) projectUpdate.postalCode = postalCode || null;
        await prisma.project.update({
          where: { id: linkedProjectId },
          data: projectUpdate
        });
        console.log(`Synced address to project ${linkedProjectId}:`, projectUpdate);
      } else {
        // No linked project — create a local one and link it
        const newProjectId = `local_${crypto.randomBytes(6).toString('hex')}`;
        await prisma.project.create({
          data: {
            id: newProjectId,
            tenant: lead.tenant,
            address: updated.address,
            city: updated.city,
            state: updated.state,
            postalCode: updated.postalCode,
            status: 'active',
            name: 'Manual Address',
            createdAt: new Date(),
            updatedAt: new Date(),
            lastSyncedAt: new Date()
          }
        });
        // Link project to the lead
        await prisma.lead.update({
          where: { id: leadId },
          data: { projectId: newProjectId }
        });
        updated.projectId = newProjectId;
        console.log(`Created local project ${newProjectId} for lead ${leadId}`);
      }
    }

    console.log(`Updated lead ${leadId}:`, updateData);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        lead: {
          id: updated.id,
          status: updated.status,
          ownerName: updated.ownerName,
          tags: updated.tags,
          email: updated.email,
          phone: updated.phone,
          address: updated.address,
          city: updated.city,
          state: updated.state,
          postalCode: updated.postalCode,
          projectId: updated.projectId
        }
      })
    };

  } catch (error) {
    console.error('Error updating lead status:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to update lead status',
        details: error.message
      })
    };
  }
}
