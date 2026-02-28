/**
 * Sync QuickBooks invoices & payments to completed leads in Camvasser
 *
 * Step 1: Match completed leads to QB customers by name/email
 * Step 2: Sync invoice & payment data into lead flowData
 *
 * Usage:
 *   node scripts/sync-qb-activity.js --dry-run     # Preview matches only
 *   node scripts/sync-qb-activity.js                # Apply changes
 *   node scripts/sync-qb-activity.js --prod         # Run against production DB
 */

import { PrismaClient } from '@prisma/client';
import Database from 'better-sqlite3';

const QB_DB_PATH = process.env.QUICKBOOKS_DB_PATH || '/Users/ryanriggin/Work/renu/data/quickbooks/quickbooks.db';
const TENANT = 'budroofing';

const dryRun = process.argv.includes('--dry-run');
const useProd = process.argv.includes('--prod');

// If --prod, use the production DATABASE_URL
if (useProd) {
  process.env.DATABASE_URL = 'postgresql://postgres.yrntqcdcmpogpfvqabwp:***REMOVED***@aws-1-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true';
}

const prisma = new PrismaClient();

function normalize(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeEmail(email) {
  return (email || '').toLowerCase().trim() || null;
}

function getLastName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

function namesAreSimilar(leadName, qbName) {
  const a = normalize(leadName);
  const b = normalize(qbName);
  if (!a || !b) return false;

  // Exact match
  if (a === b) return true;

  // One starts with the other (e.g. "dannyphelp" / "dannyphelps")
  if (a.startsWith(b) || b.startsWith(a)) return true;

  // Same last name (e.g. Kelly Ellis / Kullen Ellis)
  const lastA = getLastName(leadName);
  const lastB = getLastName(qbName);
  if (lastA.length > 2 && lastA === lastB) return true;

  return false;
}

async function main() {
  if (dryRun) console.log('=== DRY RUN MODE ===\n');
  if (useProd) console.log('=== PRODUCTION DB ===\n');

  // Open QB SQLite database
  const qbDb = new Database(QB_DB_PATH, { readonly: true });

  // --- Load QB data ---
  const qbCustomers = qbDb.prepare('SELECT id, name, email, address FROM customers WHERE active = 1').all();
  const qbInvoices = qbDb.prepare('SELECT id, txn_number, txn_date, customer_id, customer_name, total_amt, balance FROM invoices ORDER BY txn_date').all();
  const qbPayments = qbDb.prepare('SELECT id, txn_number, txn_date, customer_id, customer_name, total_amt FROM payments ORDER BY txn_date').all();
  const qbInvoiceLines = qbDb.prepare('SELECT invoice_id, line_num, amount, description, item_name, quantity, unit_price FROM invoice_lines ORDER BY invoice_id, line_num').all();

  console.log(`QB data: ${qbCustomers.length} customers, ${qbInvoices.length} invoices, ${qbPayments.length} payments\n`);

  // Build QB lookup maps
  const customersByName = new Map();
  const customersByEmail = new Map();
  const customersByLastName = new Map(); // for fuzzy matching
  for (const c of qbCustomers) {
    const key = normalize(c.name);
    if (key) customersByName.set(key, c);
    const email = normalizeEmail(c.email);
    if (email && !email.includes('fake') && !email.includes('placeholder')) {
      customersByEmail.set(email, c);
    }
    // Index by last name for fuzzy matching
    const last = getLastName(c.name);
    if (last.length > 2) {
      if (!customersByLastName.has(last)) customersByLastName.set(last, []);
      customersByLastName.get(last).push(c);
    }
  }

  // Group invoices, payments, and line items by customer_id
  const invoicesByCustomer = new Map();
  for (const inv of qbInvoices) {
    if (!invoicesByCustomer.has(inv.customer_id)) invoicesByCustomer.set(inv.customer_id, []);
    invoicesByCustomer.get(inv.customer_id).push(inv);
  }

  const paymentsByCustomer = new Map();
  for (const pmt of qbPayments) {
    if (!paymentsByCustomer.has(pmt.customer_id)) paymentsByCustomer.set(pmt.customer_id, []);
    paymentsByCustomer.get(pmt.customer_id).push(pmt);
  }

  const linesByInvoice = new Map();
  for (const line of qbInvoiceLines) {
    if (!linesByInvoice.has(line.invoice_id)) linesByInvoice.set(line.invoice_id, []);
    linesByInvoice.get(line.invoice_id).push(line);
  }

  // --- Load completed leads ---
  const leads = await prisma.lead.findMany({
    where: { tenant: TENANT, status: 'completed' }
  });

  console.log(`Completed leads: ${leads.length}\n`);
  console.log('='.repeat(70));

  let matched = 0;
  let alreadyLinked = 0;
  let synced = 0;
  let noMatch = 0;
  const reviewList = [];

  for (const lead of leads) {
    const existingQbId = lead.flowData?.quickbooks_customer_id || lead.flowData?.qb_customer_id;
    const leadName = `${lead.firstName} ${lead.lastName}`.trim();

    // Step 1: Find QB customer match
    let qbCustomer = null;
    let matchMethod = null;

    if (existingQbId) {
      // Already linked — use existing ID
      qbCustomer = qbCustomers.find(c => c.id === existingQbId);
      matchMethod = 'existing';
      alreadyLinked++;
    } else {
      // Try exact normalized name match first
      const nameKey = normalize(leadName);
      qbCustomer = customersByName.get(nameKey);
      if (qbCustomer) {
        matchMethod = 'name';
      }

      // Try fuzzy name match: same last name with similar first name
      if (!qbCustomer) {
        const leadLast = getLastName(leadName);
        const candidates = customersByLastName.get(leadLast) || [];
        if (candidates.length === 1) {
          // Only one QB customer with this last name — high confidence
          qbCustomer = candidates[0];
          matchMethod = 'fuzzy-name';
        } else if (candidates.length > 1) {
          // Multiple, try to narrow by first name similarity
          const leadFirst = normalize(lead.firstName);
          const best = candidates.find(c => {
            const qbFirst = normalize(c.name.split(/\s+/)[0]);
            return qbFirst.startsWith(leadFirst) || leadFirst.startsWith(qbFirst);
          });
          if (best) {
            qbCustomer = best;
            matchMethod = 'fuzzy-name';
          }
        }
      }

      // Try email match — only accept if names are similar
      if (!qbCustomer && lead.email) {
        const emails = lead.email.split('/').map(e => normalizeEmail(e));
        for (const email of emails) {
          const emailMatch = customersByEmail.get(email);
          if (emailMatch) {
            if (namesAreSimilar(leadName, emailMatch.name)) {
              qbCustomer = emailMatch;
              matchMethod = 'email+name';
            } else {
              // Names don't match — add to review, don't sync
              reviewList.push({
                lead: leadName,
                leadEmail: lead.email,
                qbName: emailMatch.name,
                qbId: emailMatch.id,
                reason: 'Email matched but names differ'
              });
            }
            break;
          }
        }
      }

      if (qbCustomer) {
        matched++;
        const tag = matchMethod === 'name' ? '' : ` [${matchMethod}]`;
        console.log(`\nMATCH${tag}: "${leadName}" → QB "${qbCustomer.name}" (ID: ${qbCustomer.id})`);
      }
    }

    if (!qbCustomer) {
      noMatch++;
      if (!reviewList.find(r => r.lead === leadName)) {
        console.log(`\nNO MATCH: "${leadName}" (${lead.email || 'no email'})`);
      }
      continue;
    }

    // Step 2: Build jobs array from invoices + payments
    const custInvoices = invoicesByCustomer.get(qbCustomer.id) || [];
    const custPayments = paymentsByCustomer.get(qbCustomer.id) || [];

    if (custInvoices.length === 0 && custPayments.length === 0) {
      if (matchMethod !== 'existing') {
        console.log(`  ↳ QB customer found but no invoices/payments, skipping`);
        noMatch++;
        matched--;
      }
      continue;
    }

    // Build jobs from invoices
    const jobs = custInvoices.map(inv => {
      const lines = linesByInvoice.get(inv.id) || [];
      const items = lines
        .filter(l => l.item_name)
        .map(l => l.item_name);

      const paid = inv.balance === 0 && inv.total_amt > 0;

      return {
        date: inv.txn_date,
        invoice_number: inv.txn_number,
        amount: inv.total_amt,
        status: paid ? 'paid' : 'open',
        items
      };
    });

    const totalRevenue = custPayments.reduce((sum, p) => sum + (p.total_amt || 0), 0);

    if (matchMethod === 'existing') {
      console.log(`\nSYNC: "${leadName}" (QB ${qbCustomer.id}) — ${custInvoices.length} invoices, ${custPayments.length} payments, $${totalRevenue.toFixed(2)}`);
    } else {
      console.log(`  ↳ ${custInvoices.length} invoices, ${custPayments.length} payments, $${totalRevenue.toFixed(2)}`);
    }

    // Step 3: Update lead flowData
    if (!dryRun) {
      const updatedFlowData = {
        ...(lead.flowData || {}),
        qb_customer_id: qbCustomer.id,
        qb_customer_name: qbCustomer.name,
        jobs,
        total_revenue: totalRevenue,
        synced_from_qb_at: new Date().toISOString()
      };

      await prisma.lead.update({
        where: { id: lead.id },
        data: { flowData: updatedFlowData }
      });
    }

    synced++;
  }

  qbDb.close();

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('\nSummary:');
  console.log(`  Completed leads:    ${leads.length}`);
  console.log(`  Already linked:     ${alreadyLinked}`);
  console.log(`  New matches:        ${matched}`);
  console.log(`  Synced (total):     ${synced}`);
  console.log(`  No match:           ${noMatch}`);

  if (reviewList.length > 0) {
    console.log(`\n⚠️  REVIEW (${reviewList.length} — not synced):`);
    for (const r of reviewList) {
      console.log(`  "${r.lead}" (${r.leadEmail}) → QB "${r.qbName}" (ID: ${r.qbId}) — ${r.reason}`);
    }
  }

  if (dryRun) {
    console.log('\n=== DRY RUN — run without --dry-run to apply ===');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
