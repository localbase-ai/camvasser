import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';
import { buildLeadsWhereClause } from './lib/leads-query.js';

const prisma = new PrismaClient();

export async function handler(event) {
  // Only allow GET
  if (event.httpMethod !== 'GET') {
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
      body: JSON.stringify({ error: 'Unauthorized - Please log in' })
    };
  }

  try {
    const { type, limit, page, sortBy, sortDir, search, status, tenant: tenantParam } = event.queryStringParameters || {};
    // Use tenant from query param, fall back to user.slug for backwards compat
    const tenant = tenantParam || user.slug;

    const limitNum = limit ? parseInt(limit) : 25;
    const pageNum = page ? parseInt(page) : 1;
    const skip = (pageNum - 1) * limitNum;

    // Build sort order - default to createdAt desc
    const validSortFields = ['createdAt', 'firstName', 'lastName', 'email', 'phone', 'address', 'status'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDirection = sortDir === 'asc' ? 'asc' : 'desc';
    const orderBy = { [sortField]: sortDirection };

    if (type === 'business') {
      // Fetch business user signups
      const [businessUsers, total] = await Promise.all([
        prisma.businessUser.findMany({
          orderBy,
          take: limitNum,
          skip
        }),
        prisma.businessUser.count()
      ]);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'business',
          count: businessUsers.length,
          total,
          page: pageNum,
          totalPages: Math.ceil(total / limitNum),
          leads: businessUsers
        })
      };
    }

    // Build where clause using extracted utility
    const where = buildLeadsWhereClause({ tenant, search, status });

    // Execute Prisma query
    let leads, total;
    [leads, total] = await Promise.all([
      prisma.lead.findMany({ where, orderBy, take: limitNum, skip }),
      prisma.lead.count({ where })
    ]);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'lead',
        tenant: tenant || 'all',
        count: leads.length,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
        leads
      })
    };

  } catch (error) {
    console.error('Error fetching leads:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to fetch leads',
        details: error.message
      })
    };
  }
}
