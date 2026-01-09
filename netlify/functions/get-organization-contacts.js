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

    const contacts = await prisma.organizationContact.findMany({
      where: { organizationId },
      include: {
        Prospect: {
          select: {
            id: true,
            name: true,
            phones: true,
            emails: true
          }
        }
      },
      orderBy: [
        { isPrimary: 'desc' },
        { name: 'asc' }
      ]
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contacts })
    };

  } catch (error) {
    console.error('Error fetching organization contacts:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to fetch organization contacts',
        details: error.message
      })
    };
  }
}
