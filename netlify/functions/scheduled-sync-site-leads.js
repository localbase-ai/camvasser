import { PrismaClient } from '@prisma/client';
import { syncConnector } from './sync-site-leads.js';

const prisma = new PrismaClient();

/**
 * Scheduled function — runs every 15 minutes.
 * Syncs site leads for all tenants that have an enabled siteLeadsConfig.
 */
export const config = {
  schedule: '*/15 * * * *'
};

export async function handler(event) {
  console.log('[scheduled-sync] Starting scheduled site-leads sync');

  // Find all tenants with an enabled site leads connector
  const tenants = await prisma.tenant.findMany({
    where: {
      siteLeadsConfig: { not: null }
    },
    select: { slug: true, siteLeadsConfig: true }
  });

  const enabledTenants = tenants.filter(
    t => t.siteLeadsConfig && t.siteLeadsConfig.enabled !== false
  );

  console.log(`[scheduled-sync] Found ${enabledTenants.length} tenant(s) with site leads enabled`);

  const results = {};

  for (const tenant of enabledTenants) {
    try {
      console.log(`[scheduled-sync] Syncing tenant="${tenant.slug}"`);
      results[tenant.slug] = await syncConnector(tenant.slug);
      console.log(`[scheduled-sync] ${tenant.slug}: ${results[tenant.slug].newInCamvasser} new leads`);
    } catch (err) {
      console.error(`[scheduled-sync] ${tenant.slug} failed:`, err.message);
      results[tenant.slug] = { error: err.message };
    }
  }

  await prisma.$disconnect();

  console.log('[scheduled-sync] Done:', JSON.stringify(results));

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true, results })
  };
}
