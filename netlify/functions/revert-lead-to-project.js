import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';

const prisma = new PrismaClient();

// Generate a project-style ID
function generateProjectId() {
  return 'proj_local_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
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
    const { leadId, deleteLead = true, createProspect = false } = JSON.parse(event.body || '{}');

    if (!leadId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'leadId is required' })
      };
    }

    // Fetch the lead
    const lead = await prisma.lead.findUnique({
      where: { id: leadId }
    });

    if (!lead) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Lead not found' })
      };
    }

    if (!lead.address) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Lead has no address to convert to project' })
      };
    }

    // Parse address into components (basic parsing)
    // Expected format: "123 Main St, City, ST 12345" or similar
    const addressParts = lead.address.split(',').map(s => s.trim());
    let streetAddress = addressParts[0] || lead.address;
    let city = null;
    let state = null;
    let postalCode = null;

    if (addressParts.length >= 2) {
      city = addressParts[1];
    }
    if (addressParts.length >= 3) {
      // Last part might be "ST 12345" or just "ST"
      const stateZip = addressParts[2].split(/\s+/);
      state = stateZip[0];
      if (stateZip.length > 1) {
        postalCode = stateZip.slice(1).join(' ');
      }
    }
    if (addressParts.length >= 4) {
      postalCode = addressParts[3];
    }

    // Check if a project with this address already exists
    let project = await prisma.project.findFirst({
      where: {
        address: { contains: streetAddress, mode: 'insensitive' },
        tenant: lead.tenant
      }
    });

    let projectCreated = false;
    let prospectCreated = false;
    let prospect = null;

    if (!project) {
      // Create new project
      project = await prisma.project.create({
        data: {
          id: generateProjectId(),
          tenant: lead.tenant,
          address: streetAddress,
          city,
          state,
          postalCode,
          coordinates: lead.coordinates,
          status: 'active',
          public: true
        }
      });
      projectCreated = true;
    }

    // Optionally create a prospect from the lead's contact info
    if (createProspect && (lead.firstName || lead.lastName)) {
      const fullName = [lead.firstName, lead.lastName].filter(Boolean).join(' ');

      // Generate a whitepages-style ID for the prospect
      const whitepagesId = 'WP_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 6);

      prospect = await prisma.prospect.create({
        data: {
          whitepagesId,
          projectId: project.id,
          name: fullName,
          phones: lead.phone ? [{ number: lead.phone, type: 'unknown' }] : [],
          emails: lead.email ? [lead.email] : [],
          tenant: lead.tenant,
          lookupAddress: lead.address,
          notes: lead.notes,
          isHomeowner: false,
          isCurrentResident: true
        }
      });
      prospectCreated = true;
    }

    // Delete the lead if requested
    let leadDeleted = false;
    if (deleteLead) {
      await prisma.lead.delete({
        where: { id: leadId }
      });
      leadDeleted = true;
    }

    console.log(`Reverted lead ${leadId} to project ${project.id}${projectCreated ? ' (created)' : ' (existing)'}${leadDeleted ? ', lead deleted' : ''}${prospectCreated ? ', prospect created' : ''}`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        project,
        projectCreated,
        prospect: prospectCreated ? prospect : null,
        prospectCreated,
        leadDeleted
      })
    };

  } catch (error) {
    console.error('Error reverting lead to project:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to revert lead to project',
        details: error.message
      })
    };
  }
}
