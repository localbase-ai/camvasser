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

  // Verify auth
  const authHeader = event.headers.authorization || event.headers.Authorization;
  const user = verifyToken(authHeader);
  if (!user) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorized' })
    };
  }

  try {
    const { leadId } = event.queryStringParameters || {};

    if (!leadId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'leadId is required' })
      };
    }

    const appointments = await prisma.appointment.findMany({
      where: { leadId },
      orderBy: { startTime: 'desc' }
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        appointments
      })
    };

  } catch (error) {
    console.error('Error fetching appointments:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to fetch appointments',
        details: error.message
      })
    };
  }
}
