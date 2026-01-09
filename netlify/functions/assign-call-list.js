import { PrismaClient } from '@prisma/client';
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
    const { callListId, userIds } = JSON.parse(event.body || '{}');

    if (!callListId || !Array.isArray(userIds)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'callListId and userIds array are required' })
      };
    }

    // Verify the call list exists
    const callList = await prisma.callList.findUnique({
      where: { id: callListId },
      include: { CallListAssignment: true }
    });

    if (!callList) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Call list not found' })
      };
    }

    // Get current assignment user IDs
    const currentUserIds = callList.CallListAssignment.map(a => a.userId);

    // Determine what to add and remove
    const toAdd = userIds.filter(id => !currentUserIds.includes(id));
    const toRemove = currentUserIds.filter(id => !userIds.includes(id));

    // Remove old assignments
    if (toRemove.length > 0) {
      await prisma.callListAssignment.deleteMany({
        where: {
          callListId,
          userId: { in: toRemove }
        }
      });
    }

    // Add new assignments
    if (toAdd.length > 0) {
      await prisma.callListAssignment.createMany({
        data: toAdd.map(userId => ({
          callListId,
          userId
        }))
      });
    }

    // Fetch updated list with assignments
    const updatedList = await prisma.callList.findUnique({
      where: { id: callListId },
      include: {
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
      body: JSON.stringify({
        success: true,
        assignedUsers: updatedList.CallListAssignment.map(a => ({ id: a.BusinessUser.id, name: a.BusinessUser.name }))
      })
    };

  } catch (error) {
    console.error('Error assigning call list:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to assign call list' })
    };
  }
}
