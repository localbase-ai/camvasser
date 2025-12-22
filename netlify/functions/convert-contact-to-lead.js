import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';

const prisma = new PrismaClient();

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
    const { prospectId, deleteProspect = false } = JSON.parse(event.body || '{}');

    if (!prospectId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'prospectId is required' })
      };
    }

    // Fetch the prospect with their project
    const prospect = await prisma.prospect.findUnique({
      where: { id: prospectId },
      include: {
        project: {
          select: {
            address: true,
            city: true,
            state: true,
            postalCode: true,
            coordinates: true
          }
        }
      }
    });

    if (!prospect) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Prospect not found' })
      };
    }

    // Parse the name into first/last
    const nameParts = (prospect.name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Get primary phone and email
    const phones = prospect.phones || [];
    const primaryPhone = phones[0]?.number || phones[0] || null;

    const emails = prospect.emails || [];
    const primaryEmail = emails[0]?.address || emails[0] || null;

    // Build address string
    const addressParts = [];
    if (prospect.project?.address) addressParts.push(prospect.project.address);
    if (prospect.project?.city) addressParts.push(prospect.project.city);
    if (prospect.project?.state) addressParts.push(prospect.project.state);
    if (prospect.project?.postalCode) addressParts.push(prospect.project.postalCode);
    const fullAddress = addressParts.join(', ') || prospect.lookupAddress || null;

    // Create the lead
    const lead = await prisma.lead.create({
      data: {
        firstName,
        lastName,
        email: primaryEmail,
        phone: primaryPhone,
        address: fullAddress,
        projectId: prospect.projectId,
        tenant: prospect.tenant || user.slug,
        status: 'new',
        source: 'converted_from_contact',
        coordinates: prospect.project?.coordinates || null,
        notes: prospect.notes || null
      }
    });

    // Optionally delete the prospect
    if (deleteProspect) {
      await prisma.prospect.delete({
        where: { id: prospectId }
      });
    }

    console.log(`Converted prospect ${prospectId} to lead ${lead.id}${deleteProspect ? ' (prospect deleted)' : ''}`);

    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        lead,
        prospectDeleted: deleteProspect
      })
    };

  } catch (error) {
    console.error('Error converting contact to lead:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to convert contact to lead',
        details: error.message
      })
    };
  }
}
