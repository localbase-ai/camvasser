import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';

const prisma = new PrismaClient();

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
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
    const { id, tenant: tenantParam } = event.queryStringParameters || {};
    const tenant = tenantParam || user.slug;

    if (!id) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing lead id' })
      };
    }

    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        customer: true,
        organization: { select: { id: true, name: true, type: true } }
      }
    });

    if (!lead) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Lead not found' })
      };
    }

    // Tenant check
    if (tenant && lead.tenant !== tenant) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Lead not found' })
      };
    }

    // Attach project data if lead has a projectId
    if (lead.projectId) {
      const project = await prisma.project.findUnique({
        where: { id: lead.projectId },
        select: { id: true, publicUrl: true, slug: true, name: true, address: true, photoCount: true }
      });
      if (project) lead.project = project;
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead })
    };

  } catch (error) {
    console.error('Error fetching lead:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to fetch lead', details: error.message })
    };
  }
}
