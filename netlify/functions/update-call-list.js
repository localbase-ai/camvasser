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
    const { id, name, assignedUserIds = [], scriptId, tenant } = JSON.parse(event.body);

    if (!id || !tenant) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'List ID and tenant are required' })
      };
    }

    // Verify the list exists and belongs to the tenant
    const existingList = await prisma.callList.findFirst({
      where: { id, tenantId: tenant },
      include: { CallListAssignment: true }
    });

    if (!existingList) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Call list not found' })
      };
    }

    // Build update data
    const updateData = {};
    if (name) updateData.name = name;
    if (scriptId !== undefined) updateData.scriptId = scriptId || null;

    // Handle assignee updates - delete all existing and create new
    const existingAssigneeIds = existingList.CallListAssignment.map(a => a.userId);
    const toRemove = existingAssigneeIds.filter(uid => !assignedUserIds.includes(uid));
    const toAdd = assignedUserIds.filter(uid => !existingAssigneeIds.includes(uid));

    // Update legacy field to first assignee
    if (assignedUserIds.length > 0) {
      updateData.assignedToUserId = assignedUserIds[0];
    }

    // Perform the update in a transaction
    await prisma.$transaction(async (tx) => {
      // Update the call list
      if (Object.keys(updateData).length > 0) {
        await tx.callList.update({
          where: { id },
          data: updateData
        });
      }

      // Remove old assignments
      if (toRemove.length > 0) {
        await tx.callListAssignment.deleteMany({
          where: {
            callListId: id,
            userId: { in: toRemove }
          }
        });
      }

      // Add new assignments
      if (toAdd.length > 0) {
        await tx.callListAssignment.createMany({
          data: toAdd.map(userId => ({
            id: `cla_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`,
            callListId: id,
            userId
          }))
        });
      }
    });

    // Fetch updated list
    const updatedList = await prisma.callList.findUnique({
      where: { id },
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
      body: JSON.stringify({ success: true, callList: updatedList })
    };

  } catch (error) {
    console.error('Error updating call list:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to update call list' })
    };
  }
}
