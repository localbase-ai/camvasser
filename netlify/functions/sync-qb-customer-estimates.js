import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { verifyToken } from './lib/auth.js';
import { getAccessToken } from './lib/quickbooks.js';

const prisma = new PrismaClient();
const QB_API_BASE = 'https://quickbooks.api.intuit.com';

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
    const { qbCustomerId, tenant } = JSON.parse(event.body);

    if (!qbCustomerId || !tenant) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'qbCustomerId and tenant are required' })
      };
    }

    const accessToken = await getAccessToken();
    const companyId = process.env.QUICKBOOKS_COMPANY_ID;

    // Fetch estimates from QB API
    const query = `SELECT * FROM Estimate WHERE CustomerRef = '${qbCustomerId}' ORDERBY MetaData.CreateTime DESC MAXRESULTS 50`;
    const url = `${QB_API_BASE}/v3/company/${companyId}/query?query=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[sync-qb-customer-estimates] QB API error:', res.status, errText);
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'QuickBooks API error', status: res.status })
      };
    }

    const data = await res.json();
    const estimates = data.QueryResponse?.Estimate || [];

    console.log(`[sync-qb-customer-estimates] Found ${estimates.length} estimates for QB customer ${qbCustomerId}`);

    // Find or create local Customer
    let customer = await prisma.customer.findFirst({
      where: { tenant, qbCustomerId: qbCustomerId }
    });

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let linked = 0;

    for (const est of estimates) {
      if (!est.TotalAmt || est.TotalAmt <= 0) {
        skipped++;
        continue;
      }

      // Map QB status
      let status = 'pending';
      if (est.TxnStatus === 'Accepted') status = 'signed';
      else if (est.TxnStatus === 'Closed') status = 'closed';
      else if (est.TxnStatus === 'Rejected') status = 'rejected';

      // Try to find a matching lead by name or email
      const customerName = est.CustomerRef?.name || null;
      let matchedLeadId = null;
      if (customerName) {
        const nameParts = customerName.trim().split(/\s+/);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        if (firstName && lastName) {
          const matchedLead = await prisma.lead.findFirst({
            where: {
              tenant,
              firstName: { equals: firstName, mode: 'insensitive' },
              lastName: { equals: lastName, mode: 'insensitive' }
            },
            orderBy: { createdAt: 'desc' },
            select: { id: true }
          });
          if (matchedLead) {
            matchedLeadId = matchedLead.id;
            linked++;
          }
        }
      }

      const proposalData = {
        customerName,
        customerEmail: null, // QB estimate doesn't carry email
        proposalAmount: est.TotalAmt,
        sentDate: est.TxnDate ? new Date(est.TxnDate) : null,
        signedDate: est.TxnStatus === 'Accepted' && est.MetaData?.LastUpdatedTime
          ? new Date(est.MetaData.LastUpdatedTime) : null,
        status,
        tenant,
        qbEstimateId: est.Id,
        qbCustomerId,
        qbDocNumber: est.DocNumber || null,
        qbSyncedAt: new Date(),
        updatedAt: new Date(),
        customerId: customer?.id || null,
        leadId: matchedLeadId
      };

      const existing = await prisma.proposal.findFirst({
        where: { qbEstimateId: est.Id }
      });

      if (existing) {
        // Preserve existing leadId if already set and we didn't find a new match
        if (!matchedLeadId && existing.leadId) {
          delete proposalData.leadId;
        }
        await prisma.proposal.update({
          where: { id: existing.id },
          data: proposalData
        });
        updated++;
      } else {
        await prisma.proposal.create({
          data: {
            id: createId(),
            proposalId: `qb-est-${est.Id}`,
            ...proposalData
          }
        });
        created++;
      }
    }

    console.log(`[sync-qb-customer-estimates] Done: ${created} created, ${updated} updated, ${skipped} skipped, ${linked} linked to leads`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        created,
        updated,
        skipped,
        linked,
        total: estimates.length
      })
    };

  } catch (error) {
    console.error('[sync-qb-customer-estimates] Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message })
    };
  }
}
