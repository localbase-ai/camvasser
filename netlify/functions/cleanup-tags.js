import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';
import axios from 'axios';

const prisma = new PrismaClient();

// Fetch valid tags from CompanyCam API
async function fetchValidTagsFromCompanyCam(tenant) {
  const tokenKey = `${tenant.toUpperCase()}_COMPANYCAM_TOKEN`;
  const apiToken = process.env[tokenKey] || process.env.COMPANYCAM_API_TOKEN;

  if (!apiToken) {
    throw new Error(`No CompanyCam API token found for tenant: ${tenant}`);
  }

  const response = await axios.get('https://api.companycam.com/v2/tags', {
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Accept': 'application/json'
    },
    timeout: 10000
  });

  return new Set((response.data || []).map(tag => tag.id));
}

export async function handler(event) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
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
    const { tenant, dryRun = false } = JSON.parse(event.body || '{}');

    if (!tenant) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Tenant is required' })
      };
    }

    // Fetch valid tags from CompanyCam
    const validTagIds = await fetchValidTagsFromCompanyCam(tenant);
    console.log(`Found ${validTagIds.size} valid tags in CompanyCam`);

    // Fetch all projects with tags for this tenant
    const projects = await prisma.project.findMany({
      where: {
        tenant,
        tags: { not: null }
      },
      select: {
        id: true,
        address: true,
        tags: true
      }
    });

    let projectsUpdated = 0;
    let tagsRemoved = 0;
    const removedTagNames = new Set();

    for (const project of projects) {
      if (!project.tags || !Array.isArray(project.tags)) continue;

      const validTags = project.tags.filter(tag => {
        const isValid = validTagIds.has(tag.id);
        if (!isValid && tag.value) {
          removedTagNames.add(tag.display_value || tag.value);
        }
        return isValid;
      });

      const removedCount = project.tags.length - validTags.length;

      if (removedCount > 0) {
        if (!dryRun) {
          await prisma.project.update({
            where: { id: project.id },
            data: { tags: validTags }
          });
        }
        projectsUpdated++;
        tagsRemoved += removedCount;
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        dryRun,
        validTagsInCompanyCam: validTagIds.size,
        projectsScanned: projects.length,
        projectsUpdated,
        tagsRemoved,
        removedTagNames: Array.from(removedTagNames).sort()
      })
    };

  } catch (error) {
    console.error('Error cleaning up tags:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to cleanup tags',
        details: error.message
      })
    };
  }
}
