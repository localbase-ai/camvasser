import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';

const prisma = new PrismaClient();

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const user = verifyToken(authHeader);
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const { q, tenant: tenantParam } = event.queryStringParameters || {};
  const tenant = tenantParam || user.slug;

  if (!q || q.trim().length < 2) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results: [] })
    };
  }

  const search = q.trim();
  const words = search.split(/\s+/).filter(Boolean);

  try {
    // Build name match conditions for multi-word queries
    const nameMatch = words.length >= 2
      ? [
          { AND: [{ firstName: { contains: words[0], mode: 'insensitive' } }, { lastName: { contains: words.slice(1).join(' '), mode: 'insensitive' } }] },
          { AND: [{ lastName: { contains: words[0], mode: 'insensitive' } }, { firstName: { contains: words.slice(1).join(' '), mode: 'insensitive' } }] }
        ]
      : [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } }
        ];

    // Search all tables in parallel
    const [leads, customers, prospects, projects] = await Promise.all([
      // Leads
      prisma.lead.findMany({
        where: {
          tenant,
          OR: [
            ...nameMatch,
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
            { address: { contains: search, mode: 'insensitive' } }
          ]
        },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, address: true, status: true },
        take: 10,
        orderBy: { updatedAt: 'desc' }
      }),

      // Customers
      prisma.customer.findMany({
        where: {
          tenant,
          OR: [
            ...nameMatch,
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
            { qbDisplayName: { contains: search, mode: 'insensitive' } }
          ]
        },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, qbDisplayName: true },
        take: 10,
        orderBy: { updatedAt: 'desc' }
      }),

      // Prospects (has 'name' not firstName/lastName, and JSON array fields)
      prisma.prospect.findMany({
        where: {
          tenant,
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { lookupAddress: { contains: search, mode: 'insensitive' } },
            { companyName: { contains: search, mode: 'insensitive' } }
          ]
        },
        select: { id: true, name: true, lookupAddress: true, companyName: true, status: true },
        take: 10,
        orderBy: { updatedAt: 'desc' }
      }),

      // Projects
      prisma.project.findMany({
        where: {
          tenant,
          OR: [
            { address: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } }
          ]
        },
        select: { id: true, name: true, address: true, city: true, state: true },
        take: 10,
        orderBy: { createdAt: 'desc' }
      })
    ]);

    const results = [
      ...leads.map(l => ({
        type: 'lead',
        id: l.id,
        title: [l.firstName, l.lastName].filter(Boolean).join(' ') || '—',
        subtitle: l.address || l.email || l.phone || '',
        status: l.status
      })),
      ...customers.map(c => ({
        type: 'customer',
        id: c.id,
        title: c.qbDisplayName || [c.firstName, c.lastName].filter(Boolean).join(' ') || '—',
        subtitle: c.email || c.phone || ''
      })),
      ...prospects.map(p => ({
        type: 'contact',
        id: p.id,
        title: p.name || '—',
        subtitle: p.lookupAddress || p.companyName || '',
        status: p.status
      })),
      ...projects.map(p => ({
        type: 'project',
        id: p.id,
        title: p.name || p.address || '—',
        subtitle: [p.city, p.state].filter(Boolean).join(', ')
      }))
    ];

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results })
    };

  } catch (error) {
    console.error('Global search error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Search failed', details: error.message })
    };
  }
}
