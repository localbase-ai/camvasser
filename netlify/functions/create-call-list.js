import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { verifyToken } from './lib/auth.js';

const prisma = new PrismaClient();

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
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
    const { name, contactIds = [], leadIds = [], tenant, assignedToUserId, assignedUserIds = [], scriptId } = JSON.parse(event.body);

    if (!name || !tenant) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Name and tenant are required' })
      };
    }

    // Determine assignees - support both legacy single assignee and new multi-assignee
    const userIdsToAssign = assignedUserIds.length > 0
      ? assignedUserIds
      : (assignedToUserId ? [assignedToUserId] : [user.userId]);

    // Create the call list with items and assignments
    const callList = await prisma.callList.create({
      data: {
        id: createId(),
        name,
        tenantId: tenant,
        userId: user.userId,
        assignedToUserId: userIdsToAssign[0] || user.userId, // legacy field - first assignee
        scriptId: scriptId || null,
        CallListItem: {
          create: [
            ...contactIds.map((contactId, index) => ({
              id: createId(),
              contactId,
              position: index
            })),
            ...leadIds.map((leadId, index) => ({
              id: createId(),
              leadId,
              position: contactIds.length + index
            }))
          ]
        },
        CallListAssignment: {
          create: userIdsToAssign.map(userId => ({ id: createId(), userId }))
        }
      },
      include: {
        _count: {
          select: { CallListItem: true }
        },
        CallListAssignment: {
          include: {
            BusinessUser: {
              select: { id: true, name: true }
            }
          }
        }
      }
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, callList })
    };

  } catch (error) {
    console.error('Error creating call list:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to create call list' })
    };
  }
}
