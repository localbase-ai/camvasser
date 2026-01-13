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
    const { listId, limit, offset } = event.queryStringParameters || {};

    if (!listId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'List ID is required' })
      };
    }

    // Parse pagination params (default: no limit = all items for backwards compatibility)
    const take = limit ? parseInt(limit, 10) : undefined;
    const skip = offset ? parseInt(offset, 10) : 0;

    // Fetch the call list with script (only on first request)
    const callList = skip === 0 ? await prisma.callList.findUnique({
      where: { id: listId },
      include: { CallScript: true }
    }) : null;

    // Get total count for pagination
    const total = await prisma.callListItem.count({
      where: { callListId: listId }
    });

    const items = await prisma.callListItem.findMany({
      where: { callListId: listId },
      orderBy: { position: 'asc' },
      ...(take && { take }),
      skip
    });

    // Fetch associated contacts and leads
    const contactIds = items.filter(i => i.contactId).map(i => i.contactId);
    const leadIds = items.filter(i => i.leadId).map(i => i.leadId);

    const [contacts, leads] = await Promise.all([
      contactIds.length > 0 ? prisma.prospect.findMany({
        where: { id: { in: contactIds } }
      }) : [],
      leadIds.length > 0 ? prisma.lead.findMany({
        where: { id: { in: leadIds } },
        select: { id: true, firstName: true, lastName: true, phone: true, email: true, status: true, address: true, updatedAt: true }
      }) : []
    ]);

    // Get project IDs from contacts and fetch projects for tags and coordinates
    const projectIds = [...new Set(contacts.filter(c => c.projectId).map(c => c.projectId))];
    const projects = projectIds.length > 0 ? await prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, tags: true, address: true, city: true, state: true, coordinates: true }
    }) : [];
    const projectMap = new Map(projects.map(p => [p.id, p]));

    // Fetch latest note for each contact
    const latestNotes = contactIds.length > 0 ? await prisma.$queryRaw`
      SELECT DISTINCT ON ("entityId") *
      FROM "Note"
      WHERE "entityType" = 'prospect' AND "entityId" = ANY(${contactIds})
      ORDER BY "entityId", "createdAt" DESC
    ` : [];
    const noteMap = new Map(latestNotes.map(n => [n.entityId, n]));

    // Attach project tags and latest note to contacts
    const contactsWithTags = contacts.map(c => ({
      ...c,
      project: c.projectId ? projectMap.get(c.projectId) : null,
      latestNote: noteMap.get(c.id) || null
    }));

    const contactMap = new Map(contactsWithTags.map(c => [c.id, c]));
    const leadMap = new Map(leads.map(l => [l.id, l]));

    // Attach contact/lead data to items
    const enrichedItems = items.map(item => ({
      ...item,
      contact: item.contactId ? contactMap.get(item.contactId) : null,
      lead: item.leadId ? leadMap.get(item.leadId) : null
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: enrichedItems,
        script: callList?.CallScript || null,
        total,
        offset: skip,
        hasMore: take ? (skip + items.length) < total : false
      })
    };

  } catch (error) {
    console.error('Error fetching call list items:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to fetch call list items', details: error.message })
    };
  }
}
