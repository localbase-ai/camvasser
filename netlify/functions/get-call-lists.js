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
    const { tenant, assignedTo, all } = event.queryStringParameters || {};

    if (!tenant) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Tenant is required' })
      };
    }

    const where = { tenantId: tenant };

    // Filter by assignee unless 'all' is requested
    // Check both legacy assignedToUserId and new assignments table
    if (!all && assignedTo) {
      where.OR = [
        { assignedToUserId: assignedTo },
        { CallListAssignment: { some: { userId: assignedTo } } }
      ];
    }

    const callLists = await prisma.callList.findMany({
      where,
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
      },
      orderBy: { createdAt: 'desc' }
    });

    // Get legacy assignee names (for backwards compatibility)
    const assigneeIds = [...new Set(callLists.map(l => l.assignedToUserId).filter(Boolean))];
    const assignees = assigneeIds.length > 0 ? await prisma.businessUser.findMany({
      where: { id: { in: assigneeIds } },
      select: { id: true, name: true }
    }) : [];
    const assigneeMap = new Map(assignees.map(a => [a.id, a.name]));

    const enrichedLists = callLists.map(list => {
      // Combine legacy assignee with new assignments
      const assignedUsers = list.CallListAssignment.map(a => ({ id: a.BusinessUser.id, name: a.BusinessUser.name }));
      if (list.assignedToUserId && !assignedUsers.find(u => u.id === list.assignedToUserId)) {
        const legacyName = assigneeMap.get(list.assignedToUserId);
        if (legacyName) {
          assignedUsers.unshift({ id: list.assignedToUserId, name: legacyName });
        }
      }
      return {
        ...list,
        itemCount: list._count.CallListItem,
        assigneeName: list.assignedToUserId ? assigneeMap.get(list.assignedToUserId) : null,
        assignedUsers
      };
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callLists: enrichedLists })
    };

  } catch (error) {
    console.error('Error fetching call lists:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to fetch call lists' })
    };
  }
}
