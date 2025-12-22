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

    // Parse special field queries from search (e.g., "no:email", "has:phone", "email:empty")
    let searchText = (search || '').trim();
    const fieldFilters = [];

    // Pattern: no:field, has:field, field:empty
    const fieldQueryPattern = /(no:\w+|has:\w+|\w+:empty)/gi;
    searchText = searchText.replace(fieldQueryPattern, (match) => {
      const lower = match.trim().toLowerCase();
      if (lower.startsWith('no:')) {
        const field = lower.substring(3);
        fieldFilters.push({ field, isEmpty: true });
      } else if (lower.startsWith('has:')) {
        const field = lower.substring(4);
        fieldFilters.push({ field, isEmpty: false });
      } else if (lower.endsWith(':empty')) {
        const field = lower.replace(':empty', '');
        fieldFilters.push({ field, isEmpty: true });
      }
      return ''; // Remove from search text
    }).trim();

    // Map field names to database columns
    const fieldMap = {
      email: 'email',
      phone: 'phone',
      name: 'firstName', // Will check both firstName and lastName
      firstname: 'firstName',
      lastname: 'lastName',
      address: 'address'
    };

    // Apply field filters to where clause
    for (const filter of fieldFilters) {
      const dbField = fieldMap[filter.field];
      if (!dbField) continue;

      if (filter.field === 'name') {
        // Special case: name checks both firstName and lastName (both are required, so only check empty string)
        if (filter.isEmpty) {
          // no:name - both firstName AND lastName are empty
          where.AND = where.AND || [];
          where.AND.push({ firstName: '' });
          where.AND.push({ lastName: '' });
        } else {
          // has:name - at least one of firstName or lastName is not empty
          where.AND = where.AND || [];
          where.AND.push({
            OR: [
              { firstName: { not: '' } },
              { lastName: { not: '' } }
            ]
          });
        }
      } else {
        if (filter.isEmpty) {
          // no:field - field is null OR empty string
          where.AND = where.AND || [];
          where.AND.push({
            OR: [
              { [dbField]: null },
              { [dbField]: '' }
            ]
          });
        } else {
          // has:field - field is not null AND not empty
          where.AND = where.AND || [];
          where.AND.push({ [dbField]: { not: null } });
          where.AND.push({ [dbField]: { not: '' } });
        }
      }
    }

    // Handle search - use PostgreSQL full-text search
    let leads, total;

    if (searchText) {
      // Sanitize search query for tsquery
      const sanitizedSearch = searchText.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean).join(' & ');

      if (sanitizedSearch) {
        // Build additional WHERE conditions for field filters
        const fieldConditions = [];
        for (const filter of fieldFilters) {
          const dbField = fieldMap[filter.field];
          if (!dbField) continue;

          if (filter.field === 'name') {
            if (filter.isEmpty) {
              fieldConditions.push(`("firstName" IS NULL OR "firstName" = '') AND ("lastName" IS NULL OR "lastName" = '')`);
            } else {
              fieldConditions.push(`("firstName" IS NOT NULL AND "firstName" != '') OR ("lastName" IS NOT NULL AND "lastName" != '')`);
            }
          } else {
            if (filter.isEmpty) {
              fieldConditions.push(`("${dbField}" IS NULL OR "${dbField}" = '')`);
            } else {
              fieldConditions.push(`"${dbField}" IS NOT NULL AND "${dbField}" != ''`);
            }
          }
        }
        const fieldConditionsSql = fieldConditions.length > 0 ? ' AND ' + fieldConditions.join(' AND ') : '';

        // Use raw query for full-text search
        const searchQuery = `
          SELECT * FROM "User"
          WHERE tenant = $1
          AND search_vector @@ to_tsquery('english', $2)
          ${fieldConditionsSql}
          ORDER BY ts_rank(search_vector, to_tsquery('english', $2)) DESC, "createdAt" DESC
          LIMIT $3 OFFSET $4
        `;

        const countQuery = `
          SELECT COUNT(*) as count FROM "User"
          WHERE tenant = $1
          AND search_vector @@ to_tsquery('english', $2)
          ${fieldConditionsSql}
        `;

        const [searchResults, countResults] = await Promise.all([
          prisma.$queryRawUnsafe(searchQuery, tenant, sanitizedSearch, limitNum, skip),
          prisma.$queryRawUnsafe(countQuery, tenant, sanitizedSearch)
        ]);

        leads = searchResults;
        total = Number(countResults[0]?.count || 0);
      } else {
        // Empty search after sanitization, return all with field filters
        [leads, total] = await Promise.all([
          prisma.lead.findMany({ where, orderBy, take: limitNum, skip }),
          prisma.lead.count({ where })
        ]);
      }
    } else {
      // No text search, use regular Prisma query (field filters already in where)
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
