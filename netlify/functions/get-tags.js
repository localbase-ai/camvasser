import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

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

export async function handler(event) {
  // Only allow GET
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

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

  try {
    const { tenant } = event.queryStringParameters || {};

    // Build where clause
    const where = {
      tags: { not: null }
    };

    // Filter by tenant if provided
    if (tenant) {
      where.tenant = tenant;
    }

    // Fetch projects with tags
    const projects = await prisma.project.findMany({
      where,
      select: {
        tags: true
      }
    });

    // Collect unique tags
    const tagMap = new Map();
    projects.forEach(project => {
      if (project.tags && Array.isArray(project.tags)) {
        project.tags.forEach(tag => {
          if (tag.value && !tagMap.has(tag.value)) {
            tagMap.set(tag.value, {
              id: tag.id,
              value: tag.value,
              display_value: tag.display_value,
              tag_type: tag.tag_type
            });
          }
        });
      }
    });

    // Convert to sorted array
    const tags = Array.from(tagMap.values()).sort((a, b) =>
      a.display_value.localeCompare(b.display_value)
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        count: tags.length,
        tags
      })
    };

  } catch (error) {
    console.error('Error fetching tags:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to fetch tags',
        details: error.message
      })
    };
  }
}
