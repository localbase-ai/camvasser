import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Valid entity types
const VALID_ENTITY_TYPES = ['lead', 'prospect', 'project'];

// Helper function to verify JWT token
function verifyToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

// Generate a cuid-like ID
function generateId() {
  return 'n' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

export async function handler(event) {
  // Verify authentication
  const authHeader = event.headers.authorization || event.headers.Authorization;
  const user = verifyToken(authHeader);

  if (!user) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized - Please log in' })
    };
  }

  // Route based on HTTP method
  switch (event.httpMethod) {
    case 'GET':
      return getNotes(event, user);
    case 'POST':
      return addNote(event, user);
    case 'DELETE':
      return deleteNote(event, user);
    default:
      return {
        statusCode: 405,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Method not allowed' })
      };
  }
}

// GET /notes?entityType=lead&entityId=xxx&tenant=xxx
async function getNotes(event, user) {
  try {
    const { entityType, entityId, tenant } = event.queryStringParameters || {};

    if (!entityType || !entityId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'entityType and entityId are required' })
      };
    }

    if (!VALID_ENTITY_TYPES.includes(entityType)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Invalid entityType. Must be one of: ${VALID_ENTITY_TYPES.join(', ')}` })
      };
    }

    const where = { entityType, entityId };
    if (tenant) where.tenant = tenant;

    const notes = await prisma.note.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        count: notes.length,
        notes
      })
    };

  } catch (error) {
    console.error('Error fetching notes:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to fetch notes', details: error.message })
    };
  }
}

// POST /notes { entityType, entityId, content, tenant }
async function addNote(event, user) {
  try {
    const { entityType, entityId, content, tenant } = JSON.parse(event.body || '{}');

    if (!entityType || !entityId || !content || !tenant) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'entityType, entityId, content, and tenant are required' })
      };
    }

    if (!VALID_ENTITY_TYPES.includes(entityType)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Invalid entityType. Must be one of: ${VALID_ENTITY_TYPES.join(', ')}` })
      };
    }

    const note = await prisma.note.create({
      data: {
        id: generateId(),
        entityType,
        entityId,
        content: content.trim(),
        tenant,
        authorId: user.userId || null,
        authorName: user.name || user.email || null
      }
    });

    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, note })
    };

  } catch (error) {
    console.error('Error adding note:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to add note', details: error.message })
    };
  }
}

// DELETE /notes?id=xxx
async function deleteNote(event, user) {
  try {
    const { id } = event.queryStringParameters || {};

    if (!id) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Note id is required' })
      };
    }

    await prisma.note.delete({
      where: { id }
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    console.error('Error deleting note:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to delete note', details: error.message })
    };
  }
}
