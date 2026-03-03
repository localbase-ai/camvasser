import { PrismaClient } from '@prisma/client';
import { verifyToken, getUserTenants } from './lib/auth.js';
import Database from 'better-sqlite3';

const prisma = new PrismaClient();

// Path to the QuickBooks SQLite database (synced by renu)
const QB_DB_PATH = process.env.QUICKBOOKS_DB_PATH || '/Users/ryanriggin/Work/renu/data/quickbooks/quickbooks.db';

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
    const { tenant: tenantParam } = event.queryStringParameters || {};
    const userTenants = await getUserTenants(user.id);
    const tenantSlugs = userTenants.map(t => t.slug || t);
    const tenant = tenantParam || tenantSlugs[0] || 'budroofing';

    // Verify user has access to this tenant
    if (!tenantSlugs.includes(tenant)) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Access denied to tenant' })
      };
    }

    console.log(`[sync-qb-invoices] Starting sync for tenant: ${tenant}`);

    // Open the QuickBooks SQLite database
    let qbDb;
    try {
      qbDb = new Database(QB_DB_PATH, { readonly: true });
    } catch (err) {
      console.error('[sync-qb-invoices] Could not open QuickBooks database:', err.message);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'QuickBooks database not available',
          details: 'Run the QB sync script in renu first'
        })
      };
    }

    // Query invoices from SQLite
    const invoices = qbDb.prepare(`
      SELECT
        id, txn_number, txn_date, customer_id, customer_name,
        total_amt, balance
      FROM invoices
      ORDER BY last_updated_time DESC
    `).all();

    console.log(`[sync-qb-invoices] Found ${invoices.length} invoices in QuickBooks DB`);

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const invoice of invoices) {
      // Skip if no total amount or zero
      if (!invoice.total_amt || invoice.total_amt <= 0) {
        skipped++;
        continue;
      }

      // Determine status based on balance
      const status = invoice.balance === 0 ? 'paid' : 'open';

      // Check if this invoice already exists
      const existing = await prisma.invoice.findFirst({
        where: { qbInvoiceId: invoice.id }
      });

      const invoiceData = {
        tenant,
        invoiceAmount: invoice.total_amt,
        balance: invoice.balance ?? null,
        status,
        invoiceDate: invoice.txn_date ? new Date(invoice.txn_date) : null,
        customerName: invoice.customer_name || null,
        qbInvoiceId: invoice.id,
        qbCustomerId: invoice.customer_id || null,
        qbDocNumber: invoice.txn_number || null,
        qbSyncedAt: new Date()
      };

      // Look up Customer by qbCustomerId — create stub if missing
      if (invoice.customer_id) {
        let customer = await prisma.customer.findFirst({
          where: { tenant, qbCustomerId: invoice.customer_id }
        });
        if (!customer) {
          // Parse "First Last" from QB customer_name
          const nameParts = (invoice.customer_name || '').trim().split(/\s+/);
          const firstName = nameParts[0] || '';
          const lastName = nameParts.slice(1).join(' ') || '';
          customer = await prisma.customer.create({
            data: {
              firstName,
              lastName,
              tenant,
              qbCustomerId: invoice.customer_id,
              qbDisplayName: invoice.customer_name || null
            }
          });
        }
        invoiceData.customerId = customer.id;
      }

      if (existing) {
        await prisma.invoice.update({
          where: { id: existing.id },
          data: invoiceData
        });
        updated++;
      } else {
        await prisma.invoice.create({
          data: invoiceData
        });
        created++;
      }
    }

    qbDb.close();

    console.log(`[sync-qb-invoices] Sync complete: ${created} created, ${updated} updated, ${skipped} skipped`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        synced: created + updated,
        created,
        updated,
        skipped,
        total: invoices.length,
        message: `Synced ${created + updated} invoices from QuickBooks`
      })
    };

  } catch (error) {
    console.error('[sync-qb-invoices] Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
}
