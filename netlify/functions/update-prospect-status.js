import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';

const prisma = new PrismaClient();

// Valid status values
const VALID_STATUSES = [
  'left_voicemail',
  'hung_up',
  'wrong_number',
  'callback',
  'appointment_set',
  'follow_up_email_sent',
  'roof_replaced',
  'not_interested',
  'no_need',
  'no_answer',
  'wants_quote_phone',
  'follow_up_sms_sent'
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
    const { prospectId, status } = JSON.parse(event.body);

    if (!prospectId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'prospectId is required' })
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

    // Verify the prospect belongs to this tenant
    const prospect = await prisma.prospect.findUnique({
      where: { id: prospectId },
      select: { tenant: true }
    });

    if (!prospect) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Prospect not found' })
      };
    }

    // Check if user has access to this tenant (via UserTenant membership or matching slug)
    const hasAccess = prospect.tenant === user.slug || await prisma.userTenant.findFirst({
      where: {
        userId: user.userId,
        tenant: { slug: prospect.tenant }
      }
    });

    if (!hasAccess) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Access denied' })
      };
    }

    // Update the status
    const updated = await prisma.prospect.update({
      where: { id: prospectId },
      data: {
        status: status || null,
        updatedAt: new Date()
      }
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        prospect: {
          id: updated.id,
          status: updated.status
        }
      })
    };

  } catch (error) {
    console.error('Error updating prospect status:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to update prospect status',
        details: error.message
      })
    };
  }
}
