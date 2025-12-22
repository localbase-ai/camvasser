import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

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
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

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
    const { limit, page, projectId, sortBy, sortDir, search, tag, statusFilter, tenant } = event.queryStringParameters || {};
    const limitNum = limit ? parseInt(limit) : 25;
    const pageNum = page ? parseInt(page) : 1;
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where = {};

    // Filter by tenant from query param, fall back to user.slug for backwards compat
    const tenantSlug = tenant || user.slug;
    if (tenantSlug) {
      where.tenant = tenantSlug;
    }

    if (projectId) {
      where.projectId = projectId;
    }

    // Filter by status dropdown
    if (statusFilter) {
      if (statusFilter === 'no_status') {
        // Use AND to not conflict with search OR clauses
        where.AND = where.AND || [];
        where.AND.push({
          OR: [
            { status: null },
            { status: '' }
          ]
        });
      } else {
        where.status = statusFilter;
      }
    }

    // Filter by project tag (prospects whose project has this tag)
    if (tag) {
      // Find projects with matching tag using raw SQL
      const tagPattern = `%"value": "${tag}"%`;
      const projectIds = await prisma.$queryRaw`
        SELECT id FROM "Project"
        WHERE tags::text ILIKE ${tagPattern}
      `;
      const ids = projectIds.map(p => p.id);
      if (ids.length === 0) {
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            count: 0,
            total: 0,
            page: pageNum,
            totalPages: 0,
            homeowners: 0,
            prospects: []
          })
        };
      }
      where.projectId = { in: ids };
    }

    // Handle search - use PostgreSQL full-text search for general queries
    let useFullTextSearch = false;
    let fullTextQuery = null;

    // Parse special field queries from search (e.g., "no:email", "has:phone")
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

    // Map field names to database columns for prospects
    const fieldMap = {
      email: 'emails',
      emails: 'emails',
      phone: 'phones',
      phones: 'phones',
      name: 'name'
    };

    // Apply field filters to where clause
    for (const filter of fieldFilters) {
      const dbField = fieldMap[filter.field];
      if (!dbField) continue;

      if (dbField === 'name') {
        // name is required, so only check empty string
        if (filter.isEmpty) {
          where.AND = where.AND || [];
          where.AND.push({ name: '' });
        } else {
          where.AND = where.AND || [];
          where.AND.push({ name: { not: '' } });
        }
      } else if (dbField === 'emails' || dbField === 'phones') {
        // These are JSON arrays - null or empty array means no data
        if (filter.isEmpty) {
          where.AND = where.AND || [];
          where.AND.push({
            OR: [
              { [dbField]: null },
              { [dbField]: { equals: [] } }
            ]
          });
        } else {
          where.AND = where.AND || [];
          where.AND.push({ [dbField]: { not: null } });
          // Can't easily check for non-empty array in Prisma, but not null is close enough
        }
      }
    }

    if (searchText) {
      const searchLower = searchText.toLowerCase().trim();

      // Check for field:value or field=value syntax (keep special handling)
      const colonMatch = searchText.match(/^(\w+)[:=](.+)$/i);

      if (colonMatch) {
        const [, field, value] = colonMatch;
        const fieldLower = field.toLowerCase();
        const valueLower = value.toLowerCase().trim();

        if (fieldLower === 'status') {
          if (['yes', 'true', 'has', 'set'].includes(valueLower)) {
            where.AND = where.AND || [];
            where.AND.push({ status: { not: null } }, { status: { not: '' } });
          } else if (['no', 'false', 'none', 'null'].includes(valueLower)) {
            where.OR = [{ status: null }, { status: '' }];
          } else {
            where.status = { contains: value.trim(), mode: 'insensitive' };
          }
        } else if (fieldLower === 'homeowner' || fieldLower === 'owner') {
          where.isHomeowner = ['yes', 'true', '1'].includes(valueLower);
        } else if (fieldLower === 'resident') {
          where.isCurrentResident = ['yes', 'true', '1'].includes(valueLower);
        } else {
          // Use full-text search for other field queries
          useFullTextSearch = true;
          fullTextQuery = value.trim();
        }
      } else if (['has tags', 'with tags', 'have tags', 'tagged', 'no tags', 'without tags', 'untagged'].includes(searchLower)) {
        // Keep tag filter logic
        const hasTags = ['has tags', 'with tags', 'have tags', 'tagged'].includes(searchLower);
        const projectIds = await prisma.$queryRaw`
          SELECT id FROM "Project"
          WHERE ${hasTags ?
            prisma.$queryRaw`tags IS NOT NULL AND tags::text != '[]' AND tags::text != 'null'` :
            prisma.$queryRaw`tags IS NULL OR tags::text = '[]' OR tags::text = 'null'`}
        `;
        const ids = projectIds.map(p => p.id);
        where.projectId = ids.length > 0 ? { in: ids } : { in: [] };
      } else {
        // Use full-text search for general queries
        useFullTextSearch = true;
        fullTextQuery = searchText.trim();
      }
    }

    // Build sort order
    const validSortFields = ['name', 'createdAt', 'updatedAt', 'isHomeowner', 'companyName', 'status'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDirection = sortDir === 'asc' ? 'asc' : 'desc';

    let prospects, totalCount, homeownerCount;

    if (useFullTextSearch && fullTextQuery) {
      // Sanitize search query for tsquery
      const sanitizedSearch = fullTextQuery.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean).join(' & ');

      if (sanitizedSearch) {
        // Build WHERE conditions for raw query
        const tenantCondition = user.slug ? `AND p.tenant = '${user.slug}'` : '';
        const projectCondition = where.projectId ? `AND p."projectId" IN (${typeof where.projectId === 'object' && where.projectId.in ? where.projectId.in.map(id => `'${id}'`).join(',') : `'${where.projectId}'`})` : '';
        const statusCondition = where.status ? `AND p.status = '${where.status}'` : '';

        const searchQuery = `
          SELECT p.*,
                 row_to_json(proj.*) as project_data
          FROM "Prospect" p
          LEFT JOIN "Project" proj ON p."projectId" = proj.id
          WHERE p.search_vector @@ to_tsquery('english', $1)
          ${tenantCondition}
          ${projectCondition}
          ${statusCondition}
          ORDER BY ts_rank(p.search_vector, to_tsquery('english', $1)) DESC, p."createdAt" DESC
          LIMIT $2 OFFSET $3
        `;

        const countQuery = `
          SELECT COUNT(*) as count FROM "Prospect" p
          WHERE p.search_vector @@ to_tsquery('english', $1)
          ${tenantCondition}
          ${projectCondition}
          ${statusCondition}
        `;

        const homeownerQuery = `
          SELECT COUNT(*) as count FROM "Prospect" p
          WHERE p.search_vector @@ to_tsquery('english', $1)
          AND p."isHomeowner" = true
          ${tenantCondition}
          ${projectCondition}
          ${statusCondition}
        `;

        const [searchResults, countResults, homeownerResults] = await Promise.all([
          prisma.$queryRawUnsafe(searchQuery, sanitizedSearch, limitNum, skip),
          prisma.$queryRawUnsafe(countQuery, sanitizedSearch),
          prisma.$queryRawUnsafe(homeownerQuery, sanitizedSearch)
        ]);

        // Map results to include project relation
        prospects = searchResults.map(r => ({
          ...r,
          project: r.project_data
        }));
        totalCount = Number(countResults[0]?.count || 0);
        homeownerCount = Number(homeownerResults[0]?.count || 0);
      } else {
        // Empty search, fall through to regular query
        useFullTextSearch = false;
      }
    }

    if (!useFullTextSearch || !fullTextQuery) {
      // Regular Prisma query
      const orderBy = sortField === 'status'
        ? { [sortField]: { sort: sortDirection, nulls: 'first' } }
        : { [sortField]: sortDirection };

      [prospects, totalCount, homeownerCount] = await Promise.all([
        prisma.prospect.findMany({
          where,
          orderBy,
          take: limitNum,
          skip,
          include: {
            project: {
              select: { id: true, address: true, city: true, state: true, postalCode: true, publicUrl: true, tags: true, coordinates: true }
            }
          }
        }),
        prisma.prospect.count({ where }),
        prisma.prospect.count({ where: { ...where, isHomeowner: true } })
      ]);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        count: prospects.length,
        total: totalCount,
        page: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        homeowners: homeownerCount,
        prospects
      })
    };

  } catch (error) {
    console.error('Error fetching prospects:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to fetch prospects',
        details: error.message
      })
    };
  }
}
