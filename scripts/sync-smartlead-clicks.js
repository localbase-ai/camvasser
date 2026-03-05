/**
 * Sync Smartlead click engagement to Camvasser
 *
 * 1. On click in Smartlead + exists in Camvasser → enrich with engagement data
 * 2. On click in Smartlead + NOT in Camvasser → create as prospect (contact)
 *
 * Usage:
 *   node scripts/sync-smartlead-clicks.js --dry-run   # Preview only
 *   node scripts/sync-smartlead-clicks.js              # Apply changes
 */

import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';

const SMARTLEAD_API_BASE = 'https://server.smartlead.ai/api/v1';
const API_KEY = process.env.SMARTLEAD_API_KEY;
const TENANT = 'budroofing';

const dryRun = process.argv.includes('--dry-run');

if (!API_KEY) {
  console.error('SMARTLEAD_API_KEY not set. Pass it as env var.');
  process.exit(1);
}

const prisma = new PrismaClient();

// Junk emails to skip (bots, system addresses)
const JUNK_EMAILS = new Set(['uspscustomersupport@usps.gov', 'noemail@noemail.com', 'unknown@unknown.com']);
const JUNK_DOMAINS = ['fakeemail.com', 'fake.biz', 'roofmaxxtesting.com'];

function isJunkEmail(email) {
  if (JUNK_EMAILS.has(email)) return true;
  if (JUNK_DOMAINS.some(d => email.endsWith(d))) return true;
  if (!email.includes('@')) return true;
  return false;
}

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

async function fetchAllClickers() {
  const allCampaigns = await fetch(`${SMARTLEAD_API_BASE}/campaigns?api_key=${API_KEY}`).then(r => r.json());
  const campaigns = allCampaigns.filter(c => c.status === 'ACTIVE');
  console.log(`Scanning ${campaigns.length} active campaign(s): ${campaigns.map(c => c.name).join(', ')}`);
  const clickerMap = new Map();

  for (const campaign of campaigns) {
    const resp = await fetch(`${SMARTLEAD_API_BASE}/campaigns/${campaign.id}/leads-export?api_key=${API_KEY}`);
    const csv = await resp.text();
    const lines = csv.trim().split('\n');

    // Parse headers to find column indexes
    const headers = parseCsvLine(lines[0]);
    const idx = {};
    for (const col of ['first_name', 'last_name', 'email', 'company_name', 'open_count', 'click_count', 'reply_count']) {
      idx[col] = headers.indexOf(col);
    }

    for (let i = 1; i < lines.length; i++) {
      const fields = parseCsvLine(lines[i]);
      const email = (fields[idx.email] || '').toLowerCase().trim();
      const firstName = fields[idx.first_name] || '';
      const lastName = fields[idx.last_name] || '';
      const company = fields[idx.company_name] || '';
      const opens = parseInt(fields[idx.open_count]) || 0;
      const clicks = parseInt(fields[idx.click_count]) || 0;
      const replies = parseInt(fields[idx.reply_count]) || 0;

      if (clicks === 0 || !email || isJunkEmail(email)) continue;

      if (!clickerMap.has(email)) {
        clickerMap.set(email, { email, firstName, lastName, company, opens: 0, clicks: 0, replies: 0, campaigns: [] });
      }
      const cl = clickerMap.get(email);
      cl.opens += opens;
      cl.clicks += clicks;
      cl.replies += replies;
      cl.campaigns.push(campaign.name);
    }
  }

  return clickerMap;
}

async function main() {
  if (dryRun) console.log('=== DRY RUN ===\n');

  console.log('Fetching Smartlead click data...');
  const clickers = await fetchAllClickers();
  console.log(`Found ${clickers.size} unique clickers\n`);

  // Load all Camvasser leads and prospects with emails
  const leads = await prisma.lead.findMany({
    where: { tenant: TENANT, email: { not: null } },
    select: { id: true, email: true, firstName: true, lastName: true, flowData: true }
  });

  const prospects = await prisma.prospect.findMany({
    where: { tenant: TENANT },
    select: { id: true, name: true, emails: true, campaign: true, notes: true }
  });

  // Build email lookup maps
  const leadsByEmail = new Map();
  for (const l of leads) {
    for (const e of l.email.split('/').map(x => x.toLowerCase().trim()).filter(Boolean)) {
      leadsByEmail.set(e, l);
    }
  }

  const prospectsByEmail = new Map();
  for (const p of prospects) {
    if (Array.isArray(p.emails)) {
      for (const e of p.emails) {
        const addr = (typeof e === 'string' ? e : e?.address || '').toLowerCase().trim();
        if (addr) prospectsByEmail.set(addr, p);
      }
    }
  }

  let enrichedLeads = 0;
  let enrichedProspects = 0;
  let created = 0;
  let skipped = 0;

  for (const [email, cl] of clickers) {
    const lead = leadsByEmail.get(email);
    const prospect = prospectsByEmail.get(email);

    const engagementData = {
      smartlead_opens: cl.opens,
      smartlead_clicks: cl.clicks,
      smartlead_replies: cl.replies,
      smartlead_campaigns: cl.campaigns,
      smartlead_synced_at: new Date().toISOString()
    };

    if (lead) {
      // Enrich existing lead
      console.log(`ENRICH LEAD: ${cl.firstName} ${cl.lastName} <${email}> — ${cl.clicks} clicks`);

      if (!dryRun) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            flowData: { ...(lead.flowData || {}), ...engagementData }
          }
        });
      }
      enrichedLeads++;
    } else if (prospect) {
      // Enrich existing prospect
      console.log(`ENRICH PROSPECT: ${cl.firstName} ${cl.lastName} <${email}> — ${cl.clicks} clicks`);

      if (!dryRun) {
        const existingNotes = prospect.notes || '';
        const tag = `[smartlead: ${cl.clicks} clicks, ${cl.opens} opens, campaigns: ${cl.campaigns.join(', ')}]`;
        const newNotes = existingNotes.includes('[smartlead:')
          ? existingNotes.replace(/\[smartlead:.*?\]/, tag)
          : (existingNotes ? existingNotes + '\n' + tag : tag);

        await prisma.prospect.update({
          where: { id: prospect.id },
          data: {
            campaign: cl.campaigns.join(', '),
            notes: newNotes
          }
        });
      }
      enrichedProspects++;
    } else {
      // Create new prospect
      console.log(`CREATE PROSPECT: ${cl.firstName} ${cl.lastName} <${email}> (${cl.company}) — ${cl.clicks} clicks`);

      if (!dryRun) {
        await prisma.prospect.create({
          data: {
            id: createId(),
            name: `${cl.firstName} ${cl.lastName}`.trim() || email,
            emails: [email],
            companyName: cl.company || null,
            tenant: TENANT,
            campaign: cl.campaigns.join(', '),
            status: 'clicked',
            notes: `[smartlead: ${cl.clicks} clicks, ${cl.opens} opens, ${cl.replies} replies, campaigns: ${cl.campaigns.join(', ')}]`
          }
        });
      }
      created++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('Summary:');
  console.log(`  Clickers:           ${clickers.size}`);
  console.log(`  Enriched leads:     ${enrichedLeads}`);
  console.log(`  Enriched prospects: ${enrichedProspects}`);
  console.log(`  Created prospects:  ${created}`);

  if (dryRun) console.log('\n=== DRY RUN — run without --dry-run to apply ===');

  await prisma.$disconnect();
}

main().catch(console.error);
