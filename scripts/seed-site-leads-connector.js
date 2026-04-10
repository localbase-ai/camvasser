#!/usr/bin/env node
/**
 * Seed or update a tenant's encrypted site_leads connector config.
 *
 * Writes Tenant.siteLeadsConfig with:
 *   {
 *     "adapter":     "<adapter-key>",
 *     "enabled":     true,
 *     "credentials": "<aes-gcm ciphertext>"   // encrypts { connectionString }
 *   }
 *
 * Usage:
 *   DATABASE_URL=<prod-camvasser-url> \
 *   CONNECTOR_ENC_KEY=<base64-32-bytes> \
 *   node scripts/seed-site-leads-connector.js <tenant-slug> <adapter-key> <site-postgres-url>
 *
 * Generate an encryption key once with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Same key must be set on camvasser's Netlify env as CONNECTOR_ENC_KEY.
 */

import { PrismaClient } from '@prisma/client';
import { encryptJson } from '../netlify/functions/lib/crypto.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL env var is required.');
  process.exit(1);
}

if (!process.env.CONNECTOR_ENC_KEY) {
  console.error('CONNECTOR_ENC_KEY env var is required.');
  console.error('Generate one with:');
  console.error('  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
  process.exit(1);
}

const [, , tenantSlug, adapterKey, connectionString] = process.argv;

if (!tenantSlug || !adapterKey || !connectionString) {
  console.error('Usage: node scripts/seed-site-leads-connector.js <tenant-slug> <adapter-key> <site-postgres-url>');
  console.error('');
  console.error('Example:');
  console.error('  node scripts/seed-site-leads-connector.js kcroofrestoration kcroof-v1 "postgresql://..."');
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const existing = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, slug: true, name: true }
  });

  if (!existing) {
    console.error(`Tenant with slug="${tenantSlug}" not found. Create the tenant row first.`);
    process.exit(1);
  }

  const credentialsCiphertext = encryptJson({ connectionString });

  const siteLeadsConfig = {
    adapter: adapterKey,
    enabled: true,
    credentials: credentialsCiphertext
  };

  await prisma.tenant.update({
    where: { slug: tenantSlug },
    data: { siteLeadsConfig }
  });

  console.log(`✅ Updated siteLeadsConfig for tenant "${existing.name}" (${tenantSlug})`);
  console.log(`   adapter: ${adapterKey}`);
  console.log(`   credentials: <encrypted, ${credentialsCiphertext.length} bytes>`);
  console.log(`   enabled: true`);
} catch (err) {
  console.error('Error:', err);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}

process.exit(0);
