import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Helper function to verify JWT token
function verifyToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

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
    const { type, limit, page, sortBy, sortDir, search, tenant: tenantParam } = event.queryStringParameters || {};
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

    // Fetch users
    const where = tenant ? { tenant } : {};

    // Handle search - use PostgreSQL full-text search
    let leads, total;

    if (search && search.trim()) {
      // Sanitize search query for tsquery
      const sanitizedSearch = search.trim().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean).join(' & ');

      if (sanitizedSearch) {
        // Use raw query for full-text search
        const searchQuery = `
          SELECT * FROM "User"
          WHERE tenant = $1
          AND search_vector @@ to_tsquery('english', $2)
          ORDER BY ts_rank(search_vector, to_tsquery('english', $2)) DESC, "createdAt" DESC
          LIMIT $3 OFFSET $4
        `;

        const countQuery = `
          SELECT COUNT(*) as count FROM "User"
          WHERE tenant = $1
          AND search_vector @@ to_tsquery('english', $2)
        `;

        const [searchResults, countResults] = await Promise.all([
          prisma.$queryRawUnsafe(searchQuery, tenant, sanitizedSearch, limitNum, skip),
          prisma.$queryRawUnsafe(countQuery, tenant, sanitizedSearch)
        ]);

        leads = searchResults;
        total = Number(countResults[0]?.count || 0);
      } else {
        // Empty search after sanitization, return all
        [leads, total] = await Promise.all([
          prisma.lead.findMany({ where, orderBy, take: limitNum, skip }),
          prisma.lead.count({ where })
        ]);
      }
    } else {
      // No search, use regular Prisma query
      [leads, total] = await Promise.all([
        prisma.lead.findMany({ where, orderBy, take: limitNum, skip }),
        prisma.lead.count({ where })
      ]);
    }

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
