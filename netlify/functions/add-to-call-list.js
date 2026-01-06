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
    const { callListId, contactIds = [], leadIds = [] } = JSON.parse(event.body);

    if (!callListId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Call list ID is required' })
      };
    }

    // Get current max position
    const maxItem = await prisma.callListItem.findFirst({
      where: { callListId },
      orderBy: { position: 'desc' }
    });
    let nextPosition = (maxItem?.position ?? -1) + 1;

    // Get existing items to avoid duplicates
    const existingItems = await prisma.callListItem.findMany({
      where: { callListId },
      select: { contactId: true, leadId: true }
    });
    const existingContactIds = new Set(existingItems.map(i => i.contactId).filter(Boolean));
    const existingLeadIds = new Set(existingItems.map(i => i.leadId).filter(Boolean));

    // Filter out duplicates
    const newContactIds = contactIds.filter(id => !existingContactIds.has(id));
    const newLeadIds = leadIds.filter(id => !existingLeadIds.has(id));

    // Create new items
    const itemsToCreate = [
      ...newContactIds.map(contactId => ({
        callListId,
        contactId,
        position: nextPosition++
      })),
      ...newLeadIds.map(leadId => ({
        callListId,
        leadId,
        position: nextPosition++
      }))
    ];

    if (itemsToCreate.length > 0) {
      await prisma.callListItem.createMany({
        data: itemsToCreate
      });
    }

    const skipped = (contactIds.length - newContactIds.length) + (leadIds.length - newLeadIds.length);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        added: itemsToCreate.length,
        skipped
      })
    };

  } catch (error) {
    console.error('Error adding to call list:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to add to call list' })
    };
  }
}
