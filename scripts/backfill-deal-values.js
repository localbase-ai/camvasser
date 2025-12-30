import { PrismaClient } from '@prisma/client';
import Database from 'better-sqlite3';

const prisma = new PrismaClient();
const localbase = new Database('/Users/ryanriggin/Work/renu/data/localbase.db', { readonly: true });
const quickbooks = new Database('/Users/ryanriggin/Work/renu/data/quickbooks/quickbooks.db', { readonly: true });

function normalizeEmail(email) {
  return email?.toLowerCase().trim() || null;
}

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

function normalizeName(firstName, lastName) {
  const full = `${firstName || ''} ${lastName || ''}`.toLowerCase().trim();
  return full.replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (dryRun) {
    console.log('=== DRY RUN MODE ===\n');
  }

  // Get completed leads without job_value
  const completedLeads = await prisma.lead.findMany({
    where: { status: 'completed' }
  });

  const needsValue = completedLeads.filter(l => !(l.flowData && l.flowData.job_value));
  console.log(`Completed leads: ${completedLeads.length}`);
  console.log(`Missing job_value: ${needsValue.length}\n`);

  // === LOCALBASE: customers with jobs ===
  const customersWithJobs = localbase.prepare(`
    SELECT
      c.id, c.email, c.phone, c.first_name, c.last_name,
      SUM(j.total_amount) as total_job_value,
      GROUP_CONCAT(j.job_date) as job_dates
    FROM customers c
    JOIN customer_jobs j ON j.customer_id = c.id
    GROUP BY c.id
  `).all();

  const lbByEmail = new Map();
  const lbByPhone = new Map();
  const lbByName = new Map();

  for (const c of customersWithJobs) {
    const email = normalizeEmail(c.email);
    const phone = normalizePhone(c.phone);
    const name = normalizeName(c.first_name, c.last_name);
    if (email) lbByEmail.set(email, c);
    if (phone) lbByPhone.set(phone, c);
    if (name && name.length > 3) lbByName.set(name, c);
  }

  console.log(`Localbase customers with jobs: ${customersWithJobs.length}`);

  // === QUICKBOOKS: customers with invoices ===
  const qbCustomers = quickbooks.prepare(`
    SELECT
      c.id, c.name, c.email, c.phone,
      SUM(i.total_amt) as total_job_value,
      GROUP_CONCAT(i.txn_date) as job_dates
    FROM customers c
    JOIN invoices i ON i.customer_id = c.id
    GROUP BY c.id
  `).all();

  const qbByEmail = new Map();
  const qbByPhone = new Map();
  const qbByName = new Map();

  for (const c of qbCustomers) {
    const email = normalizeEmail(c.email);
    const phone = normalizePhone(c.phone);
    const name = c.name?.toLowerCase().trim().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ');
    if (email) qbByEmail.set(email, c);
    if (phone) qbByPhone.set(phone, c);
    if (name && name.length > 3) qbByName.set(name, c);
  }

  console.log(`QuickBooks customers with invoices: ${qbCustomers.length}`);
  console.log('='.repeat(60) + '\n');

  let updated = 0;
  let notFound = 0;

  for (const lead of needsValue) {
    const email = normalizeEmail(lead.email);
    const phone = normalizePhone(lead.phone);
    const name = normalizeName(lead.firstName, lead.lastName);

    let match = null;
    let source = null;

    // Try localbase first (email -> phone -> name)
    if (email) match = lbByEmail.get(email);
    if (!match && phone) match = lbByPhone.get(phone);
    if (!match && name) match = lbByName.get(name);
    if (match) source = 'localbase';

    // Try QuickBooks if no localbase match
    if (!match) {
      if (email) match = qbByEmail.get(email);
      if (!match && phone) match = qbByPhone.get(phone);
      if (!match && name) match = qbByName.get(name);
      if (match) source = 'quickbooks';
    }

    if (match && match.total_job_value) {
      console.log(`MATCH [${source}]: ${lead.firstName} ${lead.lastName} -> $${match.total_job_value}`);

      if (!dryRun) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: {
            flowData: {
              ...(lead.flowData || {}),
              job_value: match.total_job_value,
              job_dates: match.job_dates,
              backfilled_from: source,
              backfilled_at: new Date().toISOString()
            }
          }
        });
      }
      updated++;
    } else {
      console.log(`NO MATCH: ${lead.firstName} ${lead.lastName} | ${email || phone || name}`);
      notFound++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('\nSummary:');
  console.log(`  Updated with job value: ${updated}`);
  console.log(`  No match found: ${notFound}`);

  if (dryRun) {
    console.log('\n=== DRY RUN - run without --dry-run to apply ===');
  }

  localbase.close();
  quickbooks.close();
  await prisma.$disconnect();
}

main().catch(console.error);
