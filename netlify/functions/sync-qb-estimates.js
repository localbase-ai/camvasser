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
    const tenant = tenantParam || userTenants[0] || 'budroofing';

    // Verify user has access to this tenant
    if (!userTenants.includes(tenant)) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Access denied to tenant' })
      };
    }

    console.log(`[sync-qb-estimates] Starting sync for tenant: ${tenant}`);

    // Open the QuickBooks SQLite database
    let qbDb;
    try {
      qbDb = new Database(QB_DB_PATH, { readonly: true });
    } catch (err) {
      console.error('[sync-qb-estimates] Could not open QuickBooks database:', err.message);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'QuickBooks database not available',
          details: 'Run the QB sync script in renu first'
        })
      };
    }

    // Get today's date for filtering (sync from today forward)
    const today = new Date().toISOString().split('T')[0];

    // Query estimates from SQLite - get all for now, we'll filter in upsert
    const estimates = qbDb.prepare(`
      SELECT
        id, doc_number, txn_date, customer_id, customer_name, customer_email,
        total_amt, txn_status, expiration_date, accepted_date, private_note,
        created_time, last_updated_time
      FROM estimates
      ORDER BY last_updated_time DESC
    `).all();

    console.log(`[sync-qb-estimates] Found ${estimates.length} estimates in QuickBooks DB`);

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const estimate of estimates) {
      // Skip if no total amount
      if (!estimate.total_amt || estimate.total_amt <= 0) {
        skipped++;
        continue;
      }

      // Map QB status to proposal status
      let status = 'pending';
      if (estimate.txn_status === 'Accepted') {
        status = 'signed';
      } else if (estimate.txn_status === 'Closed') {
        status = 'closed';
      } else if (estimate.txn_status === 'Rejected') {
        status = 'rejected';
      }

      // Check if this estimate already exists
      const existingProposal = await prisma.proposal.findFirst({
        where: { qbEstimateId: estimate.id }
      });

      const proposalData = {
        customerName: estimate.customer_name || null,
        customerEmail: estimate.customer_email || null,
        proposalAmount: estimate.total_amt,
        sentDate: estimate.txn_date ? new Date(estimate.txn_date) : null,
        signedDate: estimate.accepted_date ? new Date(estimate.accepted_date) : null,
        status,
        tenant,
        qbEstimateId: estimate.id,
        qbCustomerId: estimate.customer_id || null,
        qbDocNumber: estimate.doc_number || null,
        qbSyncedAt: new Date()
      };

      // Look up Customer by qbCustomerId to set proposal.customerId
      if (estimate.customer_id) {
        const customer = await prisma.customer.findFirst({
          where: { tenant, qbCustomerId: estimate.customer_id }
        });
        if (customer) {
          proposalData.customerId = customer.id;
        }
      }

      if (existingProposal) {
        // Update existing
        await prisma.proposal.update({
          where: { id: existingProposal.id },
          data: proposalData
        });
        updated++;
      } else {
        // Create new - need a unique proposalId
        await prisma.proposal.create({
          data: {
            ...proposalData,
            proposalId: `qb-est-${estimate.id}`
          }
        });
        created++;
      }
    }

    qbDb.close();

    console.log(`[sync-qb-estimates] Sync complete: ${created} created, ${updated} updated, ${skipped} skipped`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        synced: created + updated,
        created,
        updated,
        skipped,
        total: estimates.length,
        message: `Synced ${created + updated} estimates from QuickBooks`
      })
    };

  } catch (error) {
    console.error('[sync-qb-estimates] Error:', error);
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
