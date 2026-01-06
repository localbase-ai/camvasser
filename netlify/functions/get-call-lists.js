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
    if (!all && assignedTo) {
      where.assignedToUserId = assignedTo;
    }

    const callLists = await prisma.callList.findMany({
      where,
      include: {
        _count: {
          select: { items: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Get assignee names
    const assigneeIds = [...new Set(callLists.map(l => l.assignedToUserId).filter(Boolean))];
    const assignees = assigneeIds.length > 0 ? await prisma.businessUser.findMany({
      where: { id: { in: assigneeIds } },
      select: { id: true, name: true }
    }) : [];
    const assigneeMap = new Map(assignees.map(a => [a.id, a.name]));

    const enrichedLists = callLists.map(list => ({
      ...list,
      assigneeName: list.assignedToUserId ? assigneeMap.get(list.assignedToUserId) : null
    }));

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
