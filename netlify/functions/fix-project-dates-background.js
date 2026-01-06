import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';
import { loadTenantConfig } from './lib/tenant-config.js';

const prisma = new PrismaClient();

/**
 * Fetch all projects from CompanyCam (basic info only, no labels)
 */
async function fetchAllProjects(apiToken) {
  const projects = [];
  let page = 1;
  const perPage = 50;
  const maxPages = 200; // Safety limit

  while (page <= maxPages) {
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(perPage)
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
        console.log('[FixDates] Rate limited, waiting 30s...');
        await new Promise(r => setTimeout(r, 30000));
        continue;
      }
      throw new Error(`CompanyCam API error: ${response.status}`);
    }

    const pageProjects = await response.json();

    if (!pageProjects || pageProjects.length === 0) break;

    projects.push(...pageProjects);
    console.log(`[FixDates] Fetched page ${page}, total: ${projects.length}`);

    if (pageProjects.length < perPage) break;
    page++;

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 50));
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

    console.log('[FixDates] Starting date fix migration...');

    // Fetch all projects from CompanyCam
    const ccProjects = await fetchAllProjects(apiToken);
    console.log(`[FixDates] Fetched ${ccProjects.length} projects from CompanyCam`);

    // Create a map for quick lookup
    const ccProjectMap = new Map();
    for (const p of ccProjects) {
      ccProjectMap.set(p.id, p);
    }

    // Get all local projects with bad dates
    const localProjects = await prisma.project.findMany({
      where: {
        tenant: user.slug,
        OR: [
          { ccCreatedAt: null },
          { ccCreatedAt: { lt: new Date('2000-01-01') } }
        ]
      },
      select: { id: true }
    });

    console.log(`[FixDates] Found ${localProjects.length} projects needing date fix`);

    let updated = 0;
    let notFound = 0;

    for (const local of localProjects) {
      const cc = ccProjectMap.get(local.id);

      if (!cc) {
        notFound++;
        continue;
      }

      const ccCreatedAt = cc.created_at ? new Date(cc.created_at * 1000) : null;
      const ccUpdatedAt = cc.updated_at ? new Date(cc.updated_at * 1000) : null;

      if (ccCreatedAt) {
        await prisma.project.update({
          where: { id: local.id },
          data: {
            ccCreatedAt,
            ccUpdatedAt
          }
        });
        updated++;

        if (updated % 500 === 0) {
          console.log(`[FixDates] Updated ${updated} projects...`);
        }
      }
    }

    console.log(`[FixDates] Complete - Updated: ${updated}, Not found: ${notFound}`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        updated,
        notFound,
        message: `Fixed dates for ${updated} projects`
      })
    };

  } catch (error) {
    console.error('[FixDates] Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Migration failed', details: error.message })
    };
  } finally {
    await prisma.$disconnect();
  }
}
