/**
 * Sync Camvasser lead statuses to Smartlead as a custom field
 *
 * For each lead that exists in both Camvasser and Smartlead (matched by email),
 * sets `camvasser_status` custom field on the Smartlead lead so campaigns
 * can segment by lead status (new, contacted, completed, etc.).
 *
 * Usage:
 *   node scripts/sync-smartlead-status.js --dry-run   # Preview only
 *   node scripts/sync-smartlead-status.js              # Apply changes
 */

import { PrismaClient } from '@prisma/client';

const SMARTLEAD_API_BASE = 'https://server.smartlead.ai/api/v1';
const API_KEY = process.env.SMARTLEAD_API_KEY;
const TENANT = 'budroofing';

const dryRun = process.argv.includes('--dry-run');

if (!API_KEY) {
  console.error('SMARTLEAD_API_KEY not set. Pass it as env var.');
  process.exit(1);
}

const prisma = new PrismaClient();

/**
 * Parse a CSV line that may contain quoted fields with commas inside
 */
function parseCsvLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Fetch all leads from every Smartlead campaign via CSV export.
 * Returns a Map of email -> [{ campaignId, leadId, email }]
 */
async function fetchSmartleadLeads() {
  const campaigns = await fetch(`${SMARTLEAD_API_BASE}/campaigns?api_key=${API_KEY}`).then(r => r.json());
  console.log(`Found ${campaigns.length} Smartlead campaigns`);

  // email -> array of { campaignId, campaignName, leadId }
  const leadMap = new Map();

  for (const campaign of campaigns) {
    const resp = await fetch(`${SMARTLEAD_API_BASE}/campaigns/${campaign.id}/leads-export?api_key=${API_KEY}`);
    const csv = await resp.text();
    const lines = csv.trim().split('\n');
    if (lines.length < 2) continue;

    const headers = parseCsvLine(lines[0]);
    const idIdx = headers.indexOf('id');
    const emailIdx = headers.indexOf('email');

    if (idIdx === -1 || emailIdx === -1) {
      console.warn(`  Skipping campaign "${campaign.name}" (id=${campaign.id}) — missing id/email columns`);
      continue;
    }

    let count = 0;
    for (let i = 1; i < lines.length; i++) {
      const fields = parseCsvLine(lines[i]);
      const email = (fields[emailIdx] || '').toLowerCase().trim();
      const leadId = fields[idIdx];

      if (!email || !leadId) continue;

      if (!leadMap.has(email)) {
        leadMap.set(email, []);
      }
      leadMap.get(email).push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        leadId
      });
      count++;
    }
    console.log(`  Campaign "${campaign.name}" — ${count} leads`);
  }

  return leadMap;
}

/**
 * Small delay to avoid rate limiting
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  if (dryRun) console.log('=== DRY RUN ===\n');

  // 1. Fetch all Camvasser leads with emails + status
  console.log('Fetching Camvasser leads...');
  const leads = await prisma.lead.findMany({
    where: { tenant: TENANT, email: { not: null } },
    select: { id: true, email: true, firstName: true, lastName: true, status: true }
  });

  // Build email -> status lookup (leads can have slash-separated emails)
  const statusByEmail = new Map();
  for (const lead of leads) {
    for (const e of lead.email.split('/').map(x => x.toLowerCase().trim()).filter(Boolean)) {
      statusByEmail.set(e, lead.status || 'new');
    }
  }
  console.log(`Found ${leads.length} Camvasser leads (${statusByEmail.size} unique emails)\n`);

  // 2. Fetch all Smartlead campaign leads
  console.log('Fetching Smartlead campaign leads...');
  const smartleadLeads = await fetchSmartleadLeads();
  console.log(`\nFound ${smartleadLeads.size} unique emails across all Smartlead campaigns\n`);

  // 3. Match and update
  let matched = 0;
  let updated = 0;
  let errors = 0;
  const unmatched = [];

  for (const [email, instances] of smartleadLeads) {
    const status = statusByEmail.get(email);

    if (!status) {
      unmatched.push(email);
      continue;
    }

    matched++;

    for (const { campaignId, campaignName, leadId } of instances) {
      console.log(`  ${email} → camvasser_status: "${status}" (campaign: ${campaignName}, lead: ${leadId})`);

      if (!dryRun) {
        try {
          const resp = await fetch(
            `${SMARTLEAD_API_BASE}/campaigns/${campaignId}/leads/${leadId}?api_key=${API_KEY}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email,
                custom_fields: { camvasser_status: status }
              })
            }
          );

          if (!resp.ok) {
            const errText = await resp.text();
            console.error(`    ERROR: ${resp.status} ${errText}`);
            errors++;
          } else {
            updated++;
          }

          await sleep(200);
        } catch (err) {
          console.error(`    ERROR: ${err.message}`);
          errors++;
        }
      } else {
        updated++;
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('Summary:');
  console.log(`  Smartlead emails:   ${smartleadLeads.size}`);
  console.log(`  Matched:            ${matched}`);
  console.log(`  Updated:            ${updated} (across all campaigns)`);
  console.log(`  Unmatched:          ${unmatched.length}`);
  if (errors > 0) {
    console.log(`  Errors:             ${errors}`);
  }

  if (dryRun) console.log('\n=== DRY RUN — run without --dry-run to apply ===');

  await prisma.$disconnect();
}

main().catch(console.error);
