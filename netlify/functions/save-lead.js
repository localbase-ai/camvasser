import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';

const prisma = new PrismaClient();

export async function handler(event) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Verify authentication
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
    const data = JSON.parse(event.body);

    const { firstName, lastName, email, phone, address, projectId, tenant, status, ownerName, notes, leadSource } = data;

    // Validate required fields - only firstName and tenant required for manual entry
    if (!firstName || !tenant) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Missing required fields',
          required: ['firstName', 'tenant']
        })
      };
    }

    // Save to database
    const lead = await prisma.lead.create({
      data: {
        firstName,
        lastName: lastName || '',
        email: email || null,
        phone: phone || null,
        address: address || null,
        projectId: projectId || null,
        tenant,
        status: status || 'new',
        ownerName: ownerName || null,
        notes: notes || null,
        leadSource: leadSource || 'manual',
        dataSource: 'manual'
      }
    });

    console.log('Lead saved:', lead.id);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        leadId: lead.id,
        lead
      })
    };

  } catch (error) {
    console.error('Error saving lead:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to save lead',
        details: error.message
      })
    };
  }
}
