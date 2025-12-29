import { PrismaClient } from '@prisma/client';
import Database from 'better-sqlite3';

const prisma = new PrismaClient();
const db = new Database('/Users/ryanriggin/Work/renu/data/localbase.db');

function normalizeEmail(email) {
  return email?.toLowerCase().trim() || null;
}

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/**
 * Check if record looks like test/fake data
 */
function isTestRecord(customer) {
  const email = (customer.email || '').toLowerCase();
  const firstName = (customer.first_name || '').toLowerCase();

  if (email.includes('placeholder')) return true;
  if (email.includes('fake')) return true;
  if (email.includes('@fake.biz')) return true;
  if (email.includes('example.com')) return true;
  if (email.includes('testing')) return true;
  if (email.startsWith('riggin+')) return true;
  if (email.startsWith('rriggin+')) return true;
  if (email.match(/^customer\d+@placeholder/)) return true;
  if (email.match(/^\d{10,}@/)) return true;
  if (email.includes('@jfd')) return true;
  if (email.includes('roofmaxxtesting')) return true;
  if (firstName === 'testing' || firstName === 'test') return true;
  if (firstName === 'unknown' && !customer.last_name) return true;

  return false;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (dryRun) {
    console.log('=== DRY RUN MODE - No changes will be made ===\n');
  }

  // Get existing Camvasser leads
  const existingLeads = await prisma.lead.findMany({
    select: { id: true, email: true, phone: true, firstName: true, lastName: true, address: true }
  });

  // Build lookup maps
  const leadsByEmail = new Map();
  const leadsByPhone = new Map();

  for (const lead of existingLeads) {
    const email = normalizeEmail(lead.email);
    const phone = normalizePhone(lead.phone);
    if (email) leadsByEmail.set(email, lead);
    if (phone) leadsByPhone.set(phone, lead);
  }

  console.log(`Existing Camvasser leads: ${existingLeads.length}`);
  console.log(`  By email: ${leadsByEmail.size}`);
  console.log(`  By phone: ${leadsByPhone.size}`);

  // Get LocalBase customers
  const customers = db.prepare(`
    SELECT
      email, phone, first_name, last_name, primary_address,
      alternate_email, alternate_phone, notes, services_received
    FROM customers
  `).all();

  console.log(`\nLocalBase customers: ${customers.length}`);
  console.log('\n' + '='.repeat(60) + '\n');

  let created = 0;
  let enriched = 0;
  let skipped = 0;

  let testSkipped = 0;

  for (const customer of customers) {
    // Skip test/fake records
    if (isTestRecord(customer)) {
      testSkipped++;
      continue;
    }

    // Skip records with no contact info
    if (!customer.email && !customer.phone) {
      testSkipped++;
      continue;
    }

    const email = normalizeEmail(customer.email);
    const phone = normalizePhone(customer.phone);

    // Check for existing lead
    let existingLead = null;
    if (email) existingLead = leadsByEmail.get(email);
    if (!existingLead && phone) existingLead = leadsByPhone.get(phone);

    if (existingLead) {
      // Enrich existing lead with missing data
      const updates = {};

      if (!existingLead.address && customer.primary_address) {
        updates.address = customer.primary_address;
      }
      if (!existingLead.phone && customer.phone) {
        updates.phone = customer.phone;
      }
      if (!existingLead.email && customer.email) {
        updates.email = customer.email;
      }

      if (Object.keys(updates).length > 0) {
        console.log(`ENRICH: ${existingLead.firstName} ${existingLead.lastName} <- ${Object.keys(updates).join(', ')}`);

        if (!dryRun) {
          await prisma.lead.update({
            where: { id: existingLead.id },
            data: updates
          });
        }
        enriched++;
      } else {
        skipped++;
      }
    } else {
      // Create new lead
      const firstName = customer.first_name || 'Unknown';
      const lastName = customer.last_name || '';

      console.log(`CREATE: ${firstName} ${lastName} | ${customer.email || customer.phone}`);

      if (!dryRun) {
        const newLead = await prisma.lead.create({
          data: {
            firstName,
            lastName,
            email: customer.email || null,
            phone: customer.phone || null,
            address: customer.primary_address || null,
            tenant: 'budroofing',
            dataSource: 'localbase',
            status: 'imported',
            notes: customer.notes || null,
            flowData: {
              services_received: customer.services_received,
              imported_from: 'localbase',
              imported_at: new Date().toISOString()
            }
          }
        });

        // Add to lookup maps for deduping subsequent records
        if (email) leadsByEmail.set(email, newLead);
        if (phone) leadsByPhone.set(phone, newLead);
      }
      created++;
    }
  }

  // Final count
  const finalLeadCount = dryRun ? existingLeads.length + created : await prisma.lead.count();

  console.log('\n' + '='.repeat(60));
  console.log('\nSummary:');
  console.log(`  LocalBase customers processed: ${customers.length}`);
  console.log(`  Test/invalid records skipped: ${testSkipped}`);
  console.log(`  New leads created: ${created}`);
  console.log(`  Existing leads enriched: ${enriched}`);
  console.log(`  Skipped (already complete): ${skipped}`);
  console.log(`  Total leads now: ${finalLeadCount}`);

  if (dryRun) {
    console.log('\n=== This was a DRY RUN - run without --dry-run to apply changes ===');
  }

  db.close();
  await prisma.$disconnect();
}

main().catch(console.error);
