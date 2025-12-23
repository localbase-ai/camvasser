import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';
import pg from 'pg';

const prisma = new PrismaClient();

// Bud Roofing website Neon database connection
const BUDROOFING_DB_URL = process.env.BUDROOFING_POSTGRES_URL ||
  'postgresql://neondb_owner:npg_dRqjZs28KoDa@ep-damp-bonus-ado4wq8n-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require';

export async function handler(event) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
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
    const tenant = 'budroofing';

    console.log(`[sync-budroofing] Starting sync for tenant: ${tenant}`);

    // Connect to Bud Roofing Neon database
    const client = new pg.Client({
      connectionString: BUDROOFING_DB_URL,
      ssl: { rejectUnauthorized: false }
    });

    await client.connect();

    // Get leads from last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await client.query(`
      SELECT id, name, email, phone, service, message, heard_about_from, form_type, created_at
      FROM leads
      WHERE created_at >= $1
      ORDER BY created_at DESC
    `, [thirtyDaysAgo]);

    await client.end();

    const websiteLeads = result.rows;
    console.log(`[sync-budroofing] Found ${websiteLeads.length} leads from website`);

    // Get existing leads to avoid duplicates (by budroofing_lead_id stored in flowData)
    const existingLeads = await prisma.lead.findMany({
      where: {
        tenant,
        source: 'website'
      },
      select: {
        id: true,
        flowData: true
      }
    });

    // Build set of existing website lead IDs
    const existingLeadIds = new Set();
    for (const lead of existingLeads) {
      if (lead.flowData && typeof lead.flowData === 'object' && lead.flowData.budroofing_lead_id) {
        existingLeadIds.add(lead.flowData.budroofing_lead_id);
      }
    }

    console.log(`[sync-budroofing] Found ${existingLeadIds.size} existing website leads`);

    // Filter to only new leads
    const newLeads = websiteLeads.filter(lead => !existingLeadIds.has(lead.id));
    console.log(`[sync-budroofing] ${newLeads.length} new leads to sync`);

    // Create leads for new submissions
    let created = 0;
    for (const lead of newLeads) {
      // Parse name into first/last
      const nameParts = (lead.name || 'Unknown').split(' ');
      const firstName = nameParts[0] || 'Unknown';
      const lastName = nameParts.slice(1).join(' ') || '';

      try {
        await prisma.lead.create({
          data: {
            firstName,
            lastName,
            email: lead.email || null,
            phone: lead.phone || null,
            tenant,
            source: 'website',
            flowType: lead.form_type || 'contact',
            campaign: lead.heard_about_from || 'website',
            status: 'new',
            notes: lead.message || null,
            flowData: {
              budroofing_lead_id: lead.id,
              service_requested: lead.service,
              form_type: lead.form_type,
              heard_about_from: lead.heard_about_from,
              original_message: lead.message,
              synced_at: new Date().toISOString()
            }
          }
        });
        created++;
      } catch (err) {
        console.error(`[sync-budroofing] Error creating lead for website lead ${lead.id}:`, err.message);
      }
    }

    console.log(`[sync-budroofing] Created ${created} new leads`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        synced: created,
        total: websiteLeads.length,
        skipped: websiteLeads.length - created,
        message: `Synced ${created} new leads from Bud Roofing website`
      })
    };

  } catch (error) {
    console.error('[sync-budroofing] Error:', error);
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
