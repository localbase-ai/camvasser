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
    const { organizationId } = event.queryStringParameters || {};

    if (!organizationId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'organizationId is required' })
      };
    }

    // Verify user has access to this organization's tenant
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { tenant: true }
    });

    if (!organization) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Organization not found' })
      };
    }

    // Check tenant access - user must belong to the organization's tenant
    const hasAccess = organization.tenant === user.slug || await prisma.userTenant.findFirst({
      where: { userId: user.userId, Tenant: { slug: organization.tenant } }
    });

    if (!hasAccess) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Access denied to this organization' })
      };
    }

    const properties = await prisma.organizationProperty.findMany({
      where: { organizationId },
      include: {
        Project: {
          select: {
            id: true,
            address: true,
            city: true,
            state: true,
            postalCode: true,
            name: true,
            featureImage: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties })
    };

  } catch (error) {
    console.error('Error fetching organization properties:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to fetch organization properties',
        details: error.message
      })
    };
  }
}
