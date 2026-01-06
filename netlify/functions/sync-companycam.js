import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';
import { loadTenantConfig } from './lib/tenant-config.js';
import { syncProject } from './lib/project-sync.js';

const prisma = new PrismaClient();

/**
 * Fetch projects from CompanyCam API
 */
async function fetchProjects(apiToken, sinceDate = null) {
  const projects = [];
  let page = 1;
  const perPage = 50;
  const maxPages = 20; // Limit to avoid timeout

  while (page <= maxPages) {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage),
      sort: 'updated_at',
      direction: 'desc'
    });

    const response = await fetch(
      `https://api.companycam.com/v2/projects?${params}`,
      {
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        console.log('[Sync] Rate limited, returning partial results');
        break;
      }
      throw new Error(`CompanyCam API error: ${response.status}`);
    }

    const pageProjects = await response.json();

    if (!pageProjects || pageProjects.length === 0) break;

    // Filter by date if provided
    if (sinceDate) {
      const filtered = pageProjects.filter(p => new Date(p.updated_at) >= sinceDate);
      projects.push(...filtered);
      if (filtered.length < pageProjects.length) break;
    } else {
      projects.push(...pageProjects);
    }

    if (pageProjects.length < perPage) break;
    page++;
  }

  return projects;
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
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
    const config = loadTenantConfig();
    const tenantConfig = config.tenants[user.slug];

    if (!tenantConfig) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Tenant not found' })
      };
    }

    const apiToken = process.env[tenantConfig.companycam_api_token_env];

    if (!apiToken) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'CompanyCam API token not configured' })
      };
    }

    // Parse options from body
    let days = 30;
    if (event.body) {
      try {
        const body = JSON.parse(event.body);
        if (body.days) days = parseInt(body.days, 10);
      } catch (e) {}
    }

    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    console.log(`[Sync] Fetching projects updated since ${sinceDate.toISOString()}`);

    const projects = await fetchProjects(apiToken, sinceDate);

    console.log(`[Sync] Found ${projects.length} projects to sync`);

    let synced = 0;
    let errors = 0;

    for (const project of projects) {
      try {
        await syncProject(project, user.slug, apiToken);
        synced++;
      } catch (error) {
        console.error(`[Sync] Error syncing ${project.id}:`, error.message);
        errors++;
      }
    }

    // Get updated totals
    const totalProjects = await prisma.project.count({ where: { tenant: user.slug } });
    const photoSum = await prisma.project.aggregate({
      where: { tenant: user.slug },
      _sum: { photoCount: true }
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        synced,
        errors,
        totalProjects,
        totalPhotos: photoSum._sum.photoCount || 0,
        message: `Synced ${synced} projects`
      })
    };

  } catch (error) {
    console.error('[Sync] Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Sync failed', details: error.message })
    };
  } finally {
    await prisma.$disconnect();
  }
}
