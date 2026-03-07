import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';

const prisma = new PrismaClient();

// Valid lead status values (from kanban board)
const VALID_STATUSES = [
  'new',
  'contacted',
  'appointment_scheduled',
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
    const { leadId, status, ownerName, firstName, lastName, tags } = JSON.parse(event.body);

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
      select: { tenant: true }
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

    // Update the lead
    const updated = await prisma.lead.update({
      where: { id: leadId },
      data: updateData
    });

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
          tags: updated.tags
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
