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
      body: JSON.stringify({ error: 'Unauthorized' })
    };
  }

  try {
    const { tenantId } = event.queryStringParameters || {};

    if (!tenantId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'tenantId is required' })
      };
    }

    const scripts = await prisma.callScript.findMany({
      where: { tenantId },
      include: {
        _count: {
          select: { CallList: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scripts })
    };

  } catch (error) {
    console.error('Error fetching call scripts:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to fetch call scripts' })
    };
  }
}
