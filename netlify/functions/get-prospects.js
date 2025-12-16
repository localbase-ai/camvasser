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
    const { limit, page, projectId, sortBy, sortDir, search, tag, statusFilter } = event.queryStringParameters || {};
    const limitNum = limit ? parseInt(limit) : 25;
    const pageNum = page ? parseInt(page) : 1;
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where = {};

    // Filter by tenant (from authenticated user)
    if (user.slug) {
      where.tenant = user.slug;
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

    // Handle search with field:value syntax
    if (search) {
      // Strip common filler words for more natural searches
      let cleanedSearch = search
        .replace(/^(show\s+me\s+)?(all\s+)?(the\s+)?(contacts?|people|prospects?)\s+(with|where|who|that\s+have)\s+/i, '')
        .replace(/^(find\s+)?(all\s+)?(the\s+)?/i, '')
        .replace(/^(get\s+)?(all\s+)?(the\s+)?/i, '')
        .replace(/^(list\s+)?(all\s+)?(the\s+)?/i, '')
        .trim();

      const searchLower = cleanedSearch.toLowerCase().trim();

      // Check for field:value or field=value syntax
      const colonMatch = cleanedSearch.match(/^(\w+)[:=](.+)$/i);

      if (colonMatch) {
        const [, field, value] = colonMatch;
        const fieldLower = field.toLowerCase();
        const valueLower = value.toLowerCase().trim();

        if (fieldLower === 'status') {
          // status:yes/has = has any status, status:no/none = no status set
          if (['yes', 'true', 'has', 'set'].includes(valueLower)) {
            // Has status: not null AND not empty string
            where.AND = [
              { status: { not: null } },
              { status: { not: '' } }
            ];
          } else if (['no', 'false', 'none', 'null'].includes(valueLower)) {
            // No status: null OR empty string
            where.OR = [
              { status: null },
              { status: '' }
            ];
          } else {
            // Search for specific status value
            where.status = { contains: value.trim(), mode: 'insensitive' };
          }
        } else if (fieldLower === 'name') {
          where.name = { contains: value.trim(), mode: 'insensitive' };
        } else if (fieldLower === 'homeowner' || fieldLower === 'owner') {
          where.isHomeowner = ['yes', 'true', '1'].includes(valueLower);
        } else if (fieldLower === 'email') {
          if (['yes', 'true', '1', 'has'].includes(valueLower)) {
            where.emails = { not: { equals: null } };
          } else if (['no', 'false', '0', 'none'].includes(valueLower)) {
            where.emails = { equals: null };
          }
        } else if (fieldLower === 'resident') {
          where.isCurrentResident = ['yes', 'true', '1'].includes(valueLower);
        } else if (fieldLower === 'tag' || fieldLower === 'tags') {
          // tags:yes = has any tag, tags:no = no tags, tags:value = specific tag
          if (['yes', 'true', '1', 'has', 'any'].includes(valueLower)) {
            // Has any tag - find projects with non-empty tags array
            const projectIds = await prisma.$queryRaw`
              SELECT id FROM "Project"
              WHERE tags IS NOT NULL
              AND tags::text != '[]'
              AND tags::text != 'null'
            `;
            const ids = projectIds.map(p => p.id);
            if (ids.length > 0) {
              where.projectId = { in: ids };
            } else {
              where.projectId = { in: [] }; // No matches
            }
          } else if (['no', 'false', '0', 'none'].includes(valueLower)) {
            // No tags
            const projectIds = await prisma.$queryRaw`
              SELECT id FROM "Project"
              WHERE tags IS NULL
              OR tags::text = '[]'
              OR tags::text = 'null'
            `;
            const ids = projectIds.map(p => p.id);
            if (ids.length > 0) {
              where.projectId = { in: ids };
            } else {
              where.projectId = { in: [] };
            }
          } else {
            // Specific tag value
            const tagPattern = `%"value": "${value.trim()}"%`;
            const projectIds = await prisma.$queryRaw`
              SELECT id FROM "Project"
              WHERE tags::text ILIKE ${tagPattern}
            `;
            const ids = projectIds.map(p => p.id);
            if (ids.length > 0) {
              where.projectId = { in: ids };
            } else {
              where.projectId = { in: [] };
            }
          }
        }
      } else {
        // Check for natural language tag queries
        if (['has tags', 'with tags', 'have tags', 'tagged'].includes(searchLower)) {
          const projectIds = await prisma.$queryRaw`
            SELECT id FROM "Project"
            WHERE tags IS NOT NULL
            AND tags::text != '[]'
            AND tags::text != 'null'
          `;
          const ids = projectIds.map(p => p.id);
          where.projectId = ids.length > 0 ? { in: ids } : { in: [] };
        } else if (['no tags', 'without tags', 'untagged', 'not tagged'].includes(searchLower)) {
          const projectIds = await prisma.$queryRaw`
            SELECT id FROM "Project"
            WHERE tags IS NULL
            OR tags::text = '[]'
            OR tags::text = 'null'
          `;
          const ids = projectIds.map(p => p.id);
          where.projectId = ids.length > 0 ? { in: ids } : { in: [] };
        } else {
          // Simple text search across name and status
          where.OR = [
            { name: { contains: cleanedSearch, mode: 'insensitive' } },
            { status: { contains: cleanedSearch, mode: 'insensitive' } }
          ];
        }
      }
    }

    // Build sort order
    const validSortFields = ['name', 'createdAt', 'updatedAt', 'isHomeowner', 'companyName', 'status'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDirection = sortDir === 'asc' ? 'asc' : 'desc';
    // For status, put nulls first (uncalled contacts at top)
    const orderBy = sortField === 'status'
      ? { [sortField]: { sort: sortDirection, nulls: 'first' } }
      : { [sortField]: sortDirection };

    const prospects = await prisma.prospect.findMany({
      where,
      orderBy,
      take: limitNum,
      skip,
      include: {
        project: {
          select: {
            id: true,
            address: true,
            city: true,
            state: true,
            publicUrl: true,
            tags: true
          }
        }
      }
    });

    const totalCount = await prisma.prospect.count({ where });
    const homeownerCount = await prisma.prospect.count({
      where: { ...where, isHomeowner: true }
    });

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
