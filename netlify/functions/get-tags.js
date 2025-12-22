import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';
import axios from 'axios';

const prisma = new PrismaClient();

// Fetch valid tags from CompanyCam API
async function fetchValidTagsFromCompanyCam(tenant) {
  const tokenKey = `${tenant.toUpperCase()}_COMPANYCAM_TOKEN`;
  const apiToken = process.env[tokenKey] || process.env.COMPANYCAM_API_TOKEN;

  if (!apiToken) {
    console.warn(`No CompanyCam API token found for tenant: ${tenant}`);
    return null; // Return null to skip validation if no token
  }

  try {
    const response = await axios.get('https://api.companycam.com/v2/tags', {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    // Return a Set of valid tag IDs for fast lookup
    return new Set((response.data || []).map(tag => tag.id));
  } catch (error) {
    console.error('Error fetching tags from CompanyCam:', error.message);
    return null; // Return null to skip validation on error
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

    // Fetch valid tags from CompanyCam (for filtering deleted tags)
    const validTagIds = tenant ? await fetchValidTagsFromCompanyCam(tenant) : null;

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
