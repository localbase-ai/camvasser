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

    const properties = await prisma.organizationProperty.findMany({
      where: { organizationId },
      include: {
        project: {
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
