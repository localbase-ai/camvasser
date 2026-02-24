// Import realtor clickers CSV as Prospects + Organizations
// - Creates new prospects for contacts not already in the system
// - Tags ALL clickers (new + existing) with campaign 'KC Realtor Clickers'
// - Updates companyName on existing prospects where missing
// - Creates Organizations for each company
// - Links all prospects to their org via OrganizationContact
//
// Usage: node scripts/import-realtor-clickers.js <csv-file> [--dry-run]

import { PrismaClient } from '@prisma/client';
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { createId } from '@paralleldrive/cuid2';
import 'dotenv/config';

const prisma = new PrismaClient();
const TENANT = 'budroofing';
const CAMPAIGN = 'KC Realtor Clickers';

// Map email domains to company names
const DOMAIN_TO_COMPANY = {
  'reecenichols.com': 'Reece Nichols',
  'reececommercial.com': 'Reece Nichols Commercial',
  'unitedrealestate.com': 'United Real Estate',
  'kbsells.com': 'KB Sells',
  'movewithplatinum.com': 'Platinum Realty',
  'openarea.com': 'Open Area Real Estate',
};

function getCompanyFromEmail(email) {
  if (!email) return null;
  const domain = email.split('@')[1]?.toLowerCase();
  return DOMAIN_TO_COMPANY[domain] || null;
}

function cleanLinkedIn(url) {
  if (!url || url === '--') return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('linkedin.com')) return `https://www.${url}`;
  return null;
}

async function main() {
  const csvFile = process.argv[2];
  const dryRun = process.argv.includes('--dry-run');

  if (!csvFile) {
    console.log('Usage: node scripts/import-realtor-clickers.js <csv-file> [--dry-run]');
    process.exit(1);
  }

  if (dryRun) console.log('=== DRY RUN - no records will be created ===\n');

  // --- Parse CSV ---
  const records = [];
  const parser = createReadStream(csvFile).pipe(
    parse({ columns: true, skip_empty_lines: true, trim: true })
  );
  for await (const row of parser) {
    records.push(row);
  }
  console.log(`Found ${records.length} records in CSV\n`);

  // --- Build lookup of existing prospects by email ---
  const allProspects = await prisma.prospect.findMany({
    where: { tenant: TENANT, emails: { not: { equals: null } } },
    select: { id: true, emails: true, name: true, companyName: true, campaign: true, linkedinUrl: true }
  });

  const emailToProspect = new Map();
  for (const p of allProspects) {
    if (Array.isArray(p.emails)) {
      for (const e of p.emails) {
        const key = (typeof e === 'string' ? e : '').toLowerCase();
        if (key) emailToProspect.set(key, p);
      }
    }
  }

  // --- Step 1: Create Organizations ---
  console.log('--- Creating Organizations ---');
  const orgMap = new Map(); // company name -> org record

  for (const companyName of Object.values(DOMAIN_TO_COMPANY)) {
    const existing = await prisma.organization.findFirst({
      where: { name: companyName, tenant: TENANT }
    });

    if (existing) {
      console.log(`  EXISTS: ${companyName} (${existing.id})`);
      orgMap.set(companyName, existing);
    } else {
      console.log(`  CREATE ORG: ${companyName}`);
      if (!dryRun) {
        const org = await prisma.organization.create({
          data: {
            id: createId(),
            name: companyName,
            type: 'real_estate',
            tenant: TENANT,
            updatedAt: new Date(),
          }
        });
        orgMap.set(companyName, org);
      } else {
        orgMap.set(companyName, { id: `dry-run-${companyName}` });
      }
    }
  }

  // --- Step 2: Create new prospects + update existing ones ---
  console.log('\n--- Processing Contacts ---');
  let created = 0;
  let updated = 0;
  let linked = 0;
  let skippedNoEmail = 0;

  for (const row of records) {
    const email = row.Email?.toLowerCase()?.trim();
    if (!email) {
      console.log(`  SKIP: no email`);
      skippedNoEmail++;
      continue;
    }

    const firstName = row.first_name?.trim() || '';
    const lastName = row.last_name?.trim() || '';
    const fullName = row['Full Name']?.trim() || `${firstName} ${lastName}`.trim();
    const linkedinUrl = cleanLinkedIn(row['LinkedIn URL']);

    let company = row['Company Name']?.trim();
    if (!company || company === '--') {
      company = getCompanyFromEmail(email);
    }

    const existingProspect = emailToProspect.get(email);

    let prospectId;

    if (existingProspect) {
      // Update existing: set campaign, companyName, linkedinUrl if missing
      const updates = {};
      if (!existingProspect.campaign) updates.campaign = CAMPAIGN;
      if (!existingProspect.companyName && company) updates.companyName = company;
      if (!existingProspect.linkedinUrl && linkedinUrl) updates.linkedinUrl = linkedinUrl;

      if (Object.keys(updates).length > 0) {
        console.log(`  UPDATE: ${existingProspect.name} <${email}> — ${Object.keys(updates).join(', ')}`);
        if (!dryRun) {
          await prisma.prospect.update({ where: { id: existingProspect.id }, data: updates });
        }
        updated++;
      } else {
        console.log(`  OK: ${existingProspect.name} <${email}> (already tagged)`);
      }

      prospectId = existingProspect.id;
    } else {
      // Create new prospect
      prospectId = createId();
      console.log(`  CREATE: ${fullName} <${email}> @ ${company || 'unknown'}`);
      if (!dryRun) {
        await prisma.prospect.create({
          data: {
            id: prospectId,
            name: fullName,
            emails: [email],
            companyName: company,
            jobTitle: 'Realtor',
            linkedinUrl,
            isHomeowner: false,
            isCurrentResident: false,
            tenant: TENANT,
            campaign: CAMPAIGN,
            status: 'prospect',
          }
        });
      }
      created++;
    }

    // --- Step 3: Link to Organization ---
    if (company && orgMap.has(company)) {
      const org = orgMap.get(company);

      // Check if link already exists
      const existingLink = dryRun ? null : await prisma.organizationContact.findFirst({
        where: { organizationId: org.id, prospectId }
      });

      if (!existingLink) {
        console.log(`    LINK → ${company}`);
        if (!dryRun) {
          await prisma.organizationContact.create({
            data: {
              id: createId(),
              organizationId: org.id,
              prospectId,
              name: existingProspect?.name || fullName,
              title: 'Realtor',
              email,
              updatedAt: new Date(),
            }
          });
        }
        linked++;
      }
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Organizations created: ${[...orgMap.values()].filter(o => typeof o.id === 'string' && !o.id.startsWith('dry-run')).length}`);
  console.log(`New contacts created: ${created}`);
  console.log(`Existing contacts updated: ${updated}`);
  console.log(`Org links created: ${linked}`);
  console.log(`Skipped (no email): ${skippedNoEmail}`);
  if (dryRun) console.log('\n(dry run - nothing was actually written)');

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
