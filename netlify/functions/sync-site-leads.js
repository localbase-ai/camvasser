import { PrismaClient } from '@prisma/client';
import pg from 'pg';
import { verifyToken } from './lib/auth.js';
import { decryptJson } from './lib/crypto.js';

const { Client } = pg;
const prisma = new PrismaClient();

/**
 * Per-source-schema adapters.
 *
 * Each adapter knows how to query a specific site's `leads` table and
 * map a row into camvasser's Lead shape. The cursor parameter $1 is the
 * created_at of the latest lead already synced for this tenant (or null
 * on first run), and adapters must filter by that to stay incremental.
 *
 * To add a new site, register a new adapter here and point a tenant's
 * site_leads_connector.adapter field at it in tenant-config.js.
 */
const SITE_LEAD_ADAPTERS = {
  'kcroof-v1': {
    query: `
      SELECT
        id::text        AS external_id,
        name,
        email,
        phone,
        address,
        city,
        state,
        roof_age,
        symptoms,
        urgency,
        how_heard,
        message,
        source          AS original_source,
        page_url,
        created_at
      FROM leads
      WHERE ($1::timestamptz IS NULL OR created_at >= $1::timestamptz)
      ORDER BY created_at ASC
      LIMIT 1000
    `,
    map: (row, tenantSlug) => {
      const nameParts = String(row.name || '').trim().split(/\s+/);
      return {
        externalId: row.external_id,
        externalSource: tenantSlug,
        firstName: nameParts[0] || '',
        lastName: nameParts.slice(1).join(' ') || '',
        email: row.email || null,
        phone: row.phone || null,
        address: row.address || null,
        city: row.city || null,
        state: row.state || null,
        source: 'site',
        leadSource: tenantSlug,
        dataSource: 'site-postgres',
        flowType: 'website-evaluation',
        flowSlug: 'free-evaluation',
        urgencyLevel: row.urgency || null,
        flowData: {
          roof_age: row.roof_age,
          symptoms: row.symptoms,
          how_heard: row.how_heard,
          message: row.message,
          page_url: row.page_url,
          original_source: row.original_source
        },
        sourceCreatedAt: row.created_at
      };
    }
  },
  'budroofing-v1': {
    query: `
      SELECT
        id::text          AS external_id,
        name,
        email,
        phone,
        service,
        message,
        heard_about_from,
        form_type,
        created_at
      FROM leads
      WHERE ($1::timestamptz IS NULL OR created_at >= $1::timestamptz)
      ORDER BY created_at ASC
      LIMIT 1000
    `,
    map: (row, tenantSlug) => {
      const nameParts = String(row.name || '').trim().split(/\s+/);
      return {
        externalId: row.external_id,
        externalSource: tenantSlug,
        firstName: nameParts[0] || '',
        lastName: nameParts.slice(1).join(' ') || '',
        email: row.email || null,
        phone: row.phone || null,
        source: 'site',
        leadSource: tenantSlug,
        dataSource: 'site-postgres',
        flowType: row.form_type || 'lead_form',
        flowData: {
          service: row.service,
          message: row.message,
          heard_about_from: row.heard_about_from
        },
        sourceCreatedAt: row.created_at
      };
    }
  }
};

/**
 * Sync a single tenant's site_leads_connector.
 * Pulls incremental rows from the site's Postgres and upserts into camvasser Lead.
 */
/**
 * Load and decrypt a tenant's site_leads connector config from the Tenant row.
 * Stored shape in Tenant.siteLeadsConfig (JSONB):
 *   {
 *     "adapter":     "kcroof-v1",          // which SITE_LEAD_ADAPTERS entry to use
 *     "enabled":     true,                 // soft toggle
 *     "credentials": "<base64-ciphertext>" // encrypts { connectionString }
 *   }
 * The plaintext credentials object is decrypted on-demand here and never
 * logged, cached, or returned to callers.
 */
async function loadTenantConnector(tenantSlug) {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { slug: true, siteLeadsConfig: true }
  });
  if (!tenant) {
    throw new Error(`Tenant "${tenantSlug}" not found`);
  }
  const config = tenant.siteLeadsConfig;
  if (!config || typeof config !== 'object') {
    throw new Error(`Tenant "${tenantSlug}" has no site_leads connector configured`);
  }
  if (config.enabled === false) {
    throw new Error(`Tenant "${tenantSlug}" site_leads connector is disabled`);
  }
  if (!config.adapter) {
    throw new Error(`Tenant "${tenantSlug}" site_leads connector has no adapter set`);
  }
  if (!config.credentials) {
    throw new Error(`Tenant "${tenantSlug}" site_leads connector has no credentials`);
  }

  let credentials;
  try {
    credentials = decryptJson(config.credentials);
  } catch (err) {
    throw new Error(`Failed to decrypt credentials for tenant "${tenantSlug}": ${err.message}`);
  }

  if (!credentials.connectionString) {
    throw new Error(`Decrypted credentials for tenant "${tenantSlug}" are missing connectionString`);
  }

  return {
    adapter: config.adapter,
    connectionString: credentials.connectionString
  };
}

export async function syncConnector(tenantSlug) {
  const { adapter: adapterKey, connectionString } = await loadTenantConnector(tenantSlug);

  const adapter = SITE_LEAD_ADAPTERS[adapterKey];
  if (!adapter) {
    throw new Error(`Unknown site_leads adapter: ${adapterKey}`);
  }

  // Cursor = latest source-createdAt we've already synced for this tenant+source.
  // We store the site's created_at in our Lead.createdAt so MAX(createdAt) is the cursor.
  const cursorRow = await prisma.lead.aggregate({
    where: { tenant: tenantSlug, externalSource: tenantSlug },
    _max: { createdAt: true }
  });
  const cursor = cursorRow._max.createdAt || null;

  // Connect to the site's Postgres and pull.
  const client = new Client({ connectionString });
  let rows;
  try {
    await client.connect();
    const result = await client.query(adapter.query, [cursor]);
    rows = result.rows;
  } finally {
    await client.end();
  }

  // Count existing rows for this tenant+source so we can report how many
  // leads are genuinely new after the upsert loop finishes.
  const beforeCount = await prisma.lead.count({
    where: { tenant: tenantSlug, externalSource: tenantSlug }
  });

  let upserted = 0;
  let skipped = 0;
  const errors = [];

  for (const row of rows) {
    const mapped = adapter.map(row, tenantSlug);
    if (!mapped.externalId) {
      skipped++;
      continue;
    }

    const { sourceCreatedAt, ...leadData } = mapped;

    try {
      await prisma.lead.upsert({
        where: {
          tenant_externalSource_externalId: {
            tenant: tenantSlug,
            externalSource: mapped.externalSource,
            externalId: mapped.externalId
          }
        },
        create: {
          tenant: tenantSlug,
          createdAt: sourceCreatedAt || new Date(),
          ...leadData
        },
        // Only update contact/address + flowData on re-sync. Do NOT overwrite
        // status/ownerName/notes — those are CRM-user edits we want to preserve.
        update: {
          firstName: leadData.firstName,
          lastName: leadData.lastName,
          email: leadData.email,
          phone: leadData.phone,
          address: leadData.address,
          city: leadData.city,
          state: leadData.state,
          flowData: leadData.flowData
        }
      });
      upserted++;
    } catch (err) {
      console.error(`[sync-site-leads] Failed to upsert lead ${mapped.externalId}:`, err.message);
      errors.push({ externalId: mapped.externalId, error: err.message });
    }
  }

  const afterCount = await prisma.lead.count({
    where: { tenant: tenantSlug, externalSource: tenantSlug }
  });

  return {
    adapter: adapterKey,
    totalPulled: rows.length,
    upserted,
    newInCamvasser: afterCount - beforeCount,
    skipped,
    errorCount: errors.length,
    errors: errors.slice(0, 10),
    cursor: cursor ? cursor.toISOString() : null
  };
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
    console.log(`[sync-site-leads] Starting sync for tenant ${user.slug}`);
    const result = await syncConnector(user.slug);
    console.log(`[sync-site-leads] Finished:`, result);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        tenant: user.slug,
        ...result
      })
    };
  } catch (err) {
    console.error('[sync-site-leads] Error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Sync failed',
        details: err.message
      })
    };
  } finally {
    await prisma.$disconnect();
  }
}
