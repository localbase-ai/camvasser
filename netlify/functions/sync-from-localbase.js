import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';

const prisma = new PrismaClient();

// LocalBase API endpoint (runs on localhost during dev)
const LOCALBASE_URL = process.env.LOCALBASE_URL || 'http://localhost:3000';

export async function handler(event) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Verify authentication
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
    const tenant = tenantParam || user.slug || 'budroofing';

    console.log(`[sync-from-localbase] Starting sync for tenant: ${tenant}`);

    // Query LocalBase for RoofMaxx deals from last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sinceDateStr = sevenDaysAgo.toISOString().split('T')[0];

    const query = `
      SELECT
        deal_id,
        customer_name,
        customer_email,
        customer_phone,
        address,
        city,
        state,
        zip,
        lead_source,
        status,
        created_at
      FROM deals
      WHERE created_at >= '${sinceDateStr}'
      ORDER BY created_at DESC
    `;

    const response = await fetch(`${LOCALBASE_URL}/api/db/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        database: 'data/roofmaxx_deals/roofmaxx_deals.db',
        sql: query
      })
    });

    if (!response.ok) {
      throw new Error(`LocalBase API error: ${response.status}`);
    }

    const result = await response.json();

    if (!result.success || !result.data) {
      throw new Error('Invalid response from LocalBase');
    }

    const deals = result.data;
    console.log(`[sync-from-localbase] Found ${deals.length} deals from LocalBase`);

    // Get existing leads to avoid duplicates (by roofmaxx deal_id stored in flowData)
    const existingLeads = await prisma.lead.findMany({
      where: {
        tenant,
        dataSource: 'roofmaxx'
      },
      select: {
        id: true,
        flowData: true
      }
    });

    // Build set of existing deal IDs
    const existingDealIds = new Set();
    for (const lead of existingLeads) {
      if (lead.flowData && typeof lead.flowData === 'object' && lead.flowData.roofmaxx_deal_id) {
        existingDealIds.add(lead.flowData.roofmaxx_deal_id);
      }
    }

    console.log(`[sync-from-localbase] Found ${existingDealIds.size} existing RoofMaxx leads`);

    // Filter to only new deals
    const newDeals = deals.filter(deal => !existingDealIds.has(deal.deal_id));
    console.log(`[sync-from-localbase] ${newDeals.length} new deals to sync`);

    // Create leads for new deals
    let created = 0;
    for (const deal of newDeals) {
      // Parse customer name into first/last
      const nameParts = (deal.customer_name || 'Unknown Customer').split(' ');
      const firstName = nameParts[0] || 'Unknown';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Build full address
      const addressParts = [deal.address, deal.city, deal.state, deal.zip].filter(Boolean);
      const fullAddress = addressParts.join(', ');

      try {
        await prisma.lead.create({
          data: {
            firstName,
            lastName,
            email: deal.customer_email || null,
            phone: deal.customer_phone || null,
            address: fullAddress || null,
            tenant,
            dataSource: 'roofmaxx',
            flowType: 'sync',
            campaign: deal.lead_source || 'roofmaxx',
            status: 'new',
            flowData: {
              roofmaxx_deal_id: deal.deal_id,
              roofmaxx_status: deal.status,
              synced_at: new Date().toISOString()
            }
          }
        });
        created++;
      } catch (err) {
        console.error(`[sync-from-localbase] Error creating lead for deal ${deal.deal_id}:`, err.message);
      }
    }

    console.log(`[sync-from-localbase] Created ${created} new leads`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        synced: created,
        total: deals.length,
        skipped: deals.length - created,
        message: `Synced ${created} new leads from RoofMaxx`
      })
    };

  } catch (error) {
    console.error('[sync-from-localbase] Error:', error);
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
