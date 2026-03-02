/**
 * Push all Camvasser leads (with emails) to Smartlead "Camvasser Master" campaign.
 *
 * This is the master lead pool in Smartlead — no sequences, never started.
 * Every lead gets a `camvasser_status` custom field for segmentation.
 * Smartlead dedupes by email, so safe to re-run.
 *
 * Usage:
 *   node scripts/push-leads-to-smartlead.js --dry-run   # Preview only
 *   node scripts/push-leads-to-smartlead.js              # Push for real
 */

import { PrismaClient } from '@prisma/client';

const SMARTLEAD_API_BASE = 'https://server.smartlead.ai/api/v1';
const API_KEY = process.env.SMARTLEAD_API_KEY;
const TENANT = 'budroofing';
const CAMPAIGN_NAME = 'Camvasser Master';
const BATCH_SIZE = 100;

const dryRun = process.argv.includes('--dry-run');

if (!API_KEY) {
  console.error('SMARTLEAD_API_KEY not set. Pass it as env var.');
  process.exit(1);
}

const prisma = new PrismaClient();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function findOrCreateCampaign() {
  const campaigns = await fetch(`${SMARTLEAD_API_BASE}/campaigns?api_key=${API_KEY}`).then(r => r.json());
  const existing = campaigns.find(c => c.name === CAMPAIGN_NAME);

  if (existing) {
    console.log(`Found existing campaign: "${CAMPAIGN_NAME}" (id: ${existing.id})`);
    return existing.id;
  }

  if (dryRun) {
    console.log(`Would create campaign: "${CAMPAIGN_NAME}"`);
    return null;
  }

  const resp = await fetch(`${SMARTLEAD_API_BASE}/campaigns/create?api_key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: CAMPAIGN_NAME })
  });
  const data = await resp.json();

  if (!data.id) {
    console.error('Failed to create campaign:', data);
    process.exit(1);
  }

  console.log(`Created campaign: "${CAMPAIGN_NAME}" (id: ${data.id})`);
  return data.id;
}

async function main() {
  if (dryRun) console.log('=== DRY RUN ===\n');

  // 1. Fetch all leads with emails
  console.log('Fetching Camvasser leads...');
  const leads = await prisma.lead.findMany({
    where: { tenant: TENANT, email: { not: null } },
    select: { id: true, email: true, firstName: true, lastName: true, phone: true, status: true, address: true, city: true, state: true },
    orderBy: { id: 'asc' }
  });
  console.log(`Found ${leads.length} leads with emails\n`);

  // 2. Build Smartlead lead list (deduped by email)
  const seenEmails = new Set();
  const leadList = [];

  for (const lead of leads) {
    // Take first email if slash-separated
    const emails = lead.email.split('/').map(x => x.toLowerCase().trim()).filter(Boolean);
    const email = emails[0];
    if (!email || seenEmails.has(email)) continue;
    seenEmails.add(email);

    const location = [lead.city, lead.state].filter(Boolean).join(', ');

    leadList.push({
      email,
      first_name: lead.firstName || '',
      last_name: lead.lastName || '',
      phone_number: lead.phone || '',
      company_name: '',
      location,
      custom_fields: {
        camvasser_status: lead.status || 'new'
      }
    });
  }

  console.log(`Deduplicated to ${leadList.length} unique emails\n`);

  // Status breakdown
  const statusCounts = {};
  for (const l of leadList) {
    const s = l.custom_fields.camvasser_status;
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }
  console.log('Status breakdown:');
  for (const [s, c] of Object.entries(statusCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${s.padEnd(25)}${c}`);
  }
  console.log();

  // 3. Find or create campaign
  const campaignId = await findOrCreateCampaign();

  if (dryRun) {
    console.log(`\nWould push ${leadList.length} leads in ${Math.ceil(leadList.length / BATCH_SIZE)} batches`);
    console.log('\n=== DRY RUN — run without --dry-run to apply ===');
    await prisma.$disconnect();
    return;
  }

  // 4. Push in batches
  let totalUploaded = 0;
  let totalDuplicates = 0;
  let totalInvalid = 0;
  let totalAlreadyInCampaign = 0;
  const totalBatches = Math.ceil(leadList.length / BATCH_SIZE);

  for (let i = 0; i < leadList.length; i += BATCH_SIZE) {
    const batch = leadList.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    console.log(`Batch ${batchNum}/${totalBatches} — ${batch.length} leads...`);

    try {
      const resp = await fetch(`${SMARTLEAD_API_BASE}/campaigns/${campaignId}/leads?api_key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_list: batch })
      });

      const data = await resp.json();

      if (!resp.ok) {
        console.error(`  ERROR: ${resp.status} ${JSON.stringify(data)}`);
      } else {
        totalUploaded += data.upload_count || 0;
        totalDuplicates += data.duplicate_count || 0;
        totalInvalid += data.invalid_email_count || 0;
        totalAlreadyInCampaign += data.already_in_campaign_count || 0;
        console.log(`  uploaded: ${data.upload_count || 0}, dupes: ${data.duplicate_count || 0}, invalid: ${data.invalid_email_count || 0}, already: ${data.already_in_campaign_count || 0}`);
      }
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
    }

    if (i + BATCH_SIZE < leadList.length) {
      await sleep(500);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('Summary:');
  console.log(`  Campaign:             ${CAMPAIGN_NAME} (id: ${campaignId})`);
  console.log(`  Total leads:          ${leadList.length}`);
  console.log(`  Uploaded:             ${totalUploaded}`);
  console.log(`  Duplicates:           ${totalDuplicates}`);
  console.log(`  Already in campaign:  ${totalAlreadyInCampaign}`);
  console.log(`  Invalid emails:       ${totalInvalid}`);

  await prisma.$disconnect();
}

main().catch(console.error);
