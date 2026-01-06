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
    const { listId } = event.queryStringParameters || {};

    if (!listId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'List ID is required' })
      };
    }

    const items = await prisma.callListItem.findMany({
      where: { callListId: listId },
      orderBy: { position: 'asc' }
    });

    // Fetch associated contacts and leads
    const contactIds = items.filter(i => i.contactId).map(i => i.contactId);
    const leadIds = items.filter(i => i.leadId).map(i => i.leadId);

    const [contacts, leads] = await Promise.all([
      contactIds.length > 0 ? prisma.prospect.findMany({
        where: { id: { in: contactIds } },
        select: { id: true, name: true, phones: true, emails: true, status: true }
      }) : [],
      leadIds.length > 0 ? prisma.lead.findMany({
        where: { id: { in: leadIds } },
        select: { id: true, firstName: true, lastName: true, phone: true, email: true, status: true }
      }) : []
    ]);

    const contactMap = new Map(contacts.map(c => [c.id, c]));
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
      body: JSON.stringify({ items: enrichedItems })
    };

  } catch (error) {
    console.error('Error fetching call list items:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to fetch call list items' })
    };
  }
}
