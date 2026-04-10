#!/usr/bin/env node
/**
 * Integration test for sync-site-leads against PRODUCTION.
 *
 * Usage:
 *   DATABASE_URL=<prod-camvasser-url> \
 *   KCROOFRESTORATION_POSTGRES_URL=<kcroof-neon-url> \
 *   node scripts/test-sync-site-leads.js
 *
 * Runs one sync for the kcroofrestoration tenant and prints the result.
 * Safe to run multiple times — the unique (tenant, externalSource, externalId)
 * constraint makes this idempotent.
 */

import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes('supabase')) {
  console.error('[test-sync] Refusing to run: DATABASE_URL must be set to the production (supabase) URL.');
  console.error('          This script writes to the tenant Lead table and should only be run against prod intentionally.');
  process.exit(1);
}

if (!process.env.KCROOFRESTORATION_POSTGRES_URL) {
  console.error('[test-sync] KCROOFRESTORATION_POSTGRES_URL env var is required.');
  process.exit(1);
}

// Dynamic import so the PrismaClient inside sync-site-leads picks up DATABASE_URL.
const { syncConnector } = await import('../netlify/functions/sync-site-leads.js');

const tenantSlug = 'kcroofrestoration';
const connectorConfig = {
  adapter: 'kcroof-v1',
  connection_string_env: 'KCROOFRESTORATION_POSTGRES_URL'
};

console.log(`[test-sync] Syncing tenant="${tenantSlug}" adapter="${connectorConfig.adapter}"`);
console.log(`[test-sync] Camvasser DB:`, process.env.DATABASE_URL.replace(/:[^:@]+@/, ':<pw>@'));
console.log(`[test-sync] Site DB     :`, process.env.KCROOFRESTORATION_POSTGRES_URL.replace(/:[^:@]+@/, ':<pw>@'));
console.log('');

try {
  const result = await syncConnector(tenantSlug, connectorConfig);
  console.log('[test-sync] Result:');
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error('[test-sync] ERROR:', err);
  process.exit(1);
}

// Quick verification: count leads for this tenant+source
const prisma = new PrismaClient();
try {
  const count = await prisma.lead.count({
    where: { tenant: tenantSlug, externalSource: tenantSlug }
  });
  console.log(`\n[test-sync] Camvasser Lead count for tenant="${tenantSlug}" externalSource="${tenantSlug}": ${count}`);

  const recent = await prisma.lead.findMany({
    where: { tenant: tenantSlug, externalSource: tenantSlug },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      externalId: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      leadSource: true,
      createdAt: true
    }
  });
  console.log('\n[test-sync] 5 most recent site-sourced leads:');
  console.table(recent);
} finally {
  await prisma.$disconnect();
}

process.exit(0);
