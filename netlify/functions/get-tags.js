import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';

const prisma = new PrismaClient();

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

    // Skip CompanyCam validation - local tags are valid even if IDs changed in CompanyCam
    const validTagIds = null;

    // Fetch projects with tags
    const projects = await prisma.project.findMany({
      where,
      select: {
        tags: true
      }
    });

    // Collect unique tags (filtering out deleted ones if we have valid tag list)
    const tagMap = new Map();
    projects.forEach(project => {
      if (project.tags && Array.isArray(project.tags)) {
        project.tags.forEach(tag => {
          // Skip if tag has no value
          if (!tag.value) return;

          // Skip if we have a valid tag list and this tag isn't in it
          if (validTagIds && !validTagIds.has(tag.id)) return;

          if (!tagMap.has(tag.value)) {
            // Handle both camelCase (from resync) and snake_case (from API) formats
            const displayValue = tag.displayValue || tag.display_value;
            const tagType = tag.tagType || tag.tag_type;

            tagMap.set(tag.value, {
              id: tag.id,
              value: tag.value,
              display_value: displayValue,
              tag_type: tagType
            });
          }
        });
      }
    });

    // Convert to sorted array
    const tags = Array.from(tagMap.values()).sort((a, b) =>
      (a.display_value || a.value || '').localeCompare(b.display_value || b.value || '')
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
