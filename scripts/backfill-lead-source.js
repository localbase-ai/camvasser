import { PrismaClient } from '@prisma/client';
import Database from 'better-sqlite3';

const prisma = new PrismaClient();
const db = new Database('/Users/ryanriggin/Work/renu/data/roofmaxx_deals/roofmaxx_deals.db');

function normalizeEmail(email) {
  return email?.toLowerCase().trim() || null;
}

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (dryRun) {
    console.log('=== DRY RUN MODE - No changes will be made ===\n');
  }

  // Get all deals with lead_source
  const deals = db.prepare(`
    SELECT customer_email, customer_phone, lead_source
    FROM deals
    WHERE lead_source IS NOT NULL AND lead_source != ''
  `).all();

  console.log(`Deals with lead_source: ${deals.length}`);

  // Build lookup maps
  const sourceByEmail = new Map();
  const sourceByPhone = new Map();

  for (const deal of deals) {
    const email = normalizeEmail(deal.customer_email);
    const phone = normalizePhone(deal.customer_phone);

    if (email && !sourceByEmail.has(email)) {
      sourceByEmail.set(email, deal.lead_source);
    }
    if (phone && !sourceByPhone.has(phone)) {
      sourceByPhone.set(phone, deal.lead_source);
    }
  }

  console.log(`Unique emails with source: ${sourceByEmail.size}`);
  console.log(`Unique phones with source: ${sourceByPhone.size}`);

  // Get all leads without leadSource
  const leads = await prisma.lead.findMany({
    where: { leadSource: null },
    select: { id: true, email: true, phone: true, firstName: true, lastName: true }
  });

  console.log(`\nLeads without leadSource: ${leads.length}`);
  console.log('\n' + '='.repeat(60) + '\n');

  let updated = 0;
  let notFound = 0;
  const sourceCounts = {};

  for (const lead of leads) {
    const email = normalizeEmail(lead.email);
    const phone = normalizePhone(lead.phone);

    let leadSource = null;
    if (email) leadSource = sourceByEmail.get(email);
    if (!leadSource && phone) leadSource = sourceByPhone.get(phone);

    if (leadSource) {
      sourceCounts[leadSource] = (sourceCounts[leadSource] || 0) + 1;

      if (!dryRun) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { leadSource }
        });
      }
      updated++;
    } else {
      notFound++;
    }
  }

  console.log('Summary:');
  console.log(`  Leads updated: ${updated}`);
  console.log(`  No match found: ${notFound}`);
  console.log('\nBy lead source:');
  Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([source, count]) => {
      console.log(`  ${source}: ${count}`);
    });

  if (dryRun) {
    console.log('\n=== This was a DRY RUN - run without --dry-run to apply changes ===');
  }

  db.close();
  await prisma.$disconnect();
}

main().catch(console.error);
