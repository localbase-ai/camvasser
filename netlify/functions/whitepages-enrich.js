import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';
import { getProperty } from './lib/whitepages.js';

const prisma = new PrismaClient();

// Statuses that trigger REPLACE (old data was bad)
const REPLACE_STATUSES = ['bad_number', 'wrong_number'];

function normalizePhone(phone) {
  return (phone || '').replace(/\D/g, '').slice(-10);
}

function mergePhones(existing, newPhones, mode) {
  if (mode === 'replace') return newPhones;

  const existingNormalized = new Set(existing.map(p => normalizePhone(p.phone_number || p.number)));
  const merged = [...existing];

  for (const phone of newPhones) {
    const norm = normalizePhone(phone.number);
    if (!existingNormalized.has(norm)) {
      merged.push({
        phone_number: phone.number.replace(/^1/, ''),
        line_type: phone.type?.toLowerCase() || 'unknown',
        source: 'whitepages'
      });
    }
  }
  return merged;
}

function mergeEmails(existing, newEmails, mode) {
  if (mode === 'replace') return newEmails.map(e => e.email || e);

  const existingSet = new Set((existing || []).map(e => (e.email || e).toLowerCase()));
  const merged = [...(existing || [])];

  for (const email of newEmails) {
    const emailStr = email.email || email;
    if (!existingSet.has(emailStr.toLowerCase())) {
      merged.push(emailStr);
    }
  }
  return merged;
}

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
    const { tenant, limit = 50 } = JSON.parse(event.body || '{}');

    if (!tenant) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Tenant is required' })
      };
    }

    // Get prospects that need enrichment
    const prospects = await prisma.prospect.findMany({
      where: {
        tenant,
        enrichedAt: null,
        OR: [
          { status: null },
          { status: { in: ['no_answer', 'bad_number', 'wrong_number'] } }
        ],
        Project: { isNot: null }
      },
      include: {
        Project: true
      },
      take: parseInt(limit)
    });

    // Group by address
    const byAddress = new Map();
    for (const p of prospects) {
      if (!p.Project?.address) continue;
      const key = [p.Project.address, p.Project.city, p.Project.state]
        .filter(Boolean).join('|').toLowerCase();
      if (!byAddress.has(key)) {
        byAddress.set(key, { address: p.Project, prospects: [] });
      }
      byAddress.get(key).prospects.push(p);
    }

    let processed = 0;
    let phonesFound = 0;
    let emailsFound = 0;
    let apiCalls = 0;

    for (const [, { address, prospects }] of byAddress) {
      // Call Whitepages Property API
      let wpData;
      try {
        wpData = await getProperty({
          street: address.address,
          city: address.city,
          state: address.state
        });
        apiCalls++;
      } catch (err) {
        console.error(`WP error for ${address.address}:`, err.message);
        continue;
      }

      const owner = wpData.result?.ownership_info?.person_owners?.[0];
      if (!owner) continue;

      for (const prospect of prospects) {
        const existingPhones = typeof prospect.phones === 'string'
          ? JSON.parse(prospect.phones || '[]')
          : (prospect.phones || []);
        const existingEmails = typeof prospect.emails === 'string'
          ? JSON.parse(prospect.emails || '[]')
          : (prospect.emails || []);

        const mode = REPLACE_STATUSES.includes(prospect.status) ? 'replace' : 'merge';

        const newPhones = mergePhones(existingPhones, owner.phones || [], mode);
        const newEmails = mergeEmails(existingEmails, owner.emails || [], mode);
        const newName = (!prospect.name || prospect.name === '---') ? owner.name : prospect.name;

        // Count new data found
        phonesFound += newPhones.length - existingPhones.length;
        emailsFound += newEmails.length - existingEmails.length;

        await prisma.prospect.update({
          where: { id: prospect.id },
          data: {
            name: newName,
            phones: newPhones,
            emails: newEmails,
            enrichedAt: new Date()
          }
        });

        processed++;
      }
    }

    // Get total enriched count
    const enrichedCount = await prisma.prospect.count({
      where: { enrichedAt: { not: null } }
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        processed,
        apiCalls,
        phonesFound,
        emailsFound,
        enrichedCount
      })
    };

  } catch (error) {
    console.error('WhitePages enrich error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message || 'Enrichment failed' })
    };
  }
}
