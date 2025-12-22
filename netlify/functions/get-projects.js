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
    const { limit, page, search, status, sortBy, sortDir, tag, hasProspects, tenant } = event.queryStringParameters || {};
    const limitNum = limit ? parseInt(limit) : 25;
    const pageNum = page ? parseInt(page) : 1;
    const skip = (pageNum - 1) * limitNum;

    // Build where clause
    const where = {};

    // Filter by tenant if provided (required for non-admin users)
    if (tenant) {
      where.tenant = tenant;
    }

    if (status) {
      where.status = status;
    }

    // Filter by hasProspects
    if (hasProspects === 'true') {
      where.prospects = { some: {} };
    } else if (hasProspects === 'false') {
      where.prospects = { none: {} };
    }

    // Handle search - use PostgreSQL full-text search for general queries
    let useFullTextSearch = false;
    let fullTextQuery = null;

    if (search) {
      const colonMatch = search.match(/^(\w+)[:=](.+)$/i);

      if (colonMatch) {
        const [, field, value] = colonMatch;
        const fieldLower = field.toLowerCase();
        const valueLower = value.toLowerCase().trim();

        if (fieldLower === 'tag') {
          // Tag search via JSON
          const tagPattern = `%"value": "${value.trim()}"%`;
          const projectIds = await prisma.$queryRaw`
            SELECT id FROM "Project"
            WHERE tags::text ILIKE ${tagPattern}
          `;
          const ids = projectIds.map(p => p.id);
          if (ids.length === 0) {
            return {
              statusCode: 200,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ count: 0, total: 0, page: pageNum, totalPages: 0, projects: [] })
            };
          }
          where.id = { in: ids };
        } else if (fieldLower === 'contacts' || fieldLower === 'prospects') {
          if (['yes', 'true', 'has', '1'].includes(valueLower)) {
            where.prospects = { some: {} };
          } else if (['no', 'false', 'none', '0'].includes(valueLower)) {
            where.prospects = { none: {} };
          }
        } else {
          // Use full-text search for other queries
          useFullTextSearch = true;
          fullTextQuery = value.trim();
        }
      } else {
        // Use full-text search for general queries
        useFullTextSearch = true;
        fullTextQuery = search.trim();
      }
    }

    // Filter by tag if provided - use raw SQL for PostgreSQL JSON search
    // Prisma's string_contains doesn't work reliably with JSON fields on PostgreSQL
    if (tag) {
      const tagPattern = `%"value": "${tag}"%`;

      // Build conditions for the tag query
      const tagConditions = [`tags::text ILIKE '${tagPattern.replace(/'/g, "''")}'`];
      if (tenant) tagConditions.push(`tenant = '${tenant}'`);

      // Handle hasProspects in the tag query
      let tagQuery;
      if (hasProspects === 'true') {
        tagQuery = `
          SELECT DISTINCT p.id FROM "Project" p
          INNER JOIN "Prospect" pr ON pr."projectId" = p.id
          WHERE ${tagConditions.join(' AND ')}
        `;
      } else if (hasProspects === 'false') {
        tagQuery = `
          SELECT p.id FROM "Project" p
          LEFT JOIN "Prospect" pr ON pr."projectId" = p.id
          WHERE ${tagConditions.join(' AND ')}
          GROUP BY p.id
          HAVING COUNT(pr.id) = 0
        `;
      } else {
        tagQuery = `SELECT id FROM "Project" WHERE ${tagConditions.join(' AND ')}`;
      }

      const projectIds = await prisma.$queryRawUnsafe(tagQuery);
      const ids = projectIds.map(p => p.id);
      if (ids.length === 0) {
        // No projects match this tag, return empty result
        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            count: 0,
            total: 0,
            page: pageNum,
            totalPages: 0,
            projects: []
          })
        };
      }
      where.id = { in: ids };
    }

    // Build sort order
    const validSortFields = ['address', 'city', 'state', 'photoCount', 'lastSyncedAt', 'ccCreatedAt'];
    const sortDirection = sortDir === 'asc' ? 'asc' : 'desc';

    let projects, totalCount;

    if (useFullTextSearch && fullTextQuery) {
      // Sanitize search query for tsquery
      const sanitizedSearch = fullTextQuery.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean).join(' & ');

      if (sanitizedSearch) {
        // Build WHERE conditions
        const statusCondition = where.status ? `AND status = '${where.status}'` : '';
        const idCondition = where.id?.in ? `AND id IN (${where.id.in.map(id => `'${id}'`).join(',')})` : '';

        const searchQuery = `
          SELECT id, address, city, state, "postalCode", status, "photoCount", "publicUrl",
                 "featureImage", tags, "ccCreatedAt", "ccUpdatedAt", "lastSyncedAt", coordinates
          FROM "Project"
          WHERE search_vector @@ to_tsquery('english', $1)
          ${statusCondition}
          ${idCondition}
          ORDER BY ts_rank(search_vector, to_tsquery('english', $1)) DESC, "ccCreatedAt" DESC
          LIMIT $2 OFFSET $3
        `;

        const countQuery = `
          SELECT COUNT(*) as count FROM "Project"
          WHERE search_vector @@ to_tsquery('english', $1)
          ${statusCondition}
          ${idCondition}
        `;

        const [searchResults, countResults] = await Promise.all([
          prisma.$queryRawUnsafe(searchQuery, sanitizedSearch, limitNum, skip),
          prisma.$queryRawUnsafe(countQuery, sanitizedSearch)
        ]);

        // Get prospect counts for each project
        const projectIds = searchResults.map(p => p.id);
        const prospectCounts = projectIds.length > 0 ? await prisma.prospect.groupBy({
          by: ['projectId'],
          where: { projectId: { in: projectIds } },
          _count: { id: true }
        }) : [];

        const countMap = {};
        prospectCounts.forEach(pc => { countMap[pc.projectId] = pc._count.id; });

        projects = searchResults.map(p => ({
          ...p,
          prospectCount: countMap[p.id] || 0,
          prospects: []
        }));
        totalCount = Number(countResults[0]?.count || 0);
      } else {
        useFullTextSearch = false;
      }
    }

    if (!useFullTextSearch || !fullTextQuery) {
      // Handle special sorting cases
      if (sortBy === 'tags') {
        // Sort by first tag value alphabetically using raw SQL
        // Build WHERE conditions
        const conditions = [];
        if (where.tenant) conditions.push(`p.tenant = '${where.tenant}'`);
        if (where.status) conditions.push(`p.status = '${where.status}'`);
        if (where.id?.in) conditions.push(`p.id IN (${where.id.in.map(id => `'${id}'`).join(',')})`);

        // Handle hasProspects filter
        let hasProspectsJoin = '';
        let hasProspectsCondition = '';
        if (hasProspects === 'true') {
          hasProspectsJoin = 'INNER JOIN "Prospect" pr ON pr."projectId" = p.id';
          hasProspectsCondition = 'GROUP BY p.id HAVING COUNT(pr.id) > 0';
        } else if (hasProspects === 'false') {
          hasProspectsJoin = 'LEFT JOIN "Prospect" pr ON pr."projectId" = p.id';
          hasProspectsCondition = 'GROUP BY p.id HAVING COUNT(pr.id) = 0';
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const orderDirection = sortDirection.toUpperCase();

        const tagSortQuery = hasProspects ? `
          SELECT p.id, p.address, p.city, p.state, p."postalCode", p.status, p."photoCount",
                 p."publicUrl", p."featureImage", p.tags, p."ccCreatedAt", p."ccUpdatedAt", p."lastSyncedAt", p.tenant, p.coordinates,
                 COUNT(pr.id) as "prospectCount"
          FROM "Project" p
          ${hasProspectsJoin}
          ${whereClause}
          ${hasProspectsCondition}
          ORDER BY (p.tags->0->>'value') ${orderDirection} NULLS LAST, p."ccCreatedAt" DESC
          LIMIT $1 OFFSET $2
        ` : `
          SELECT p.id, p.address, p.city, p.state, p."postalCode", p.status, p."photoCount",
                 p."publicUrl", p."featureImage", p.tags, p."ccCreatedAt", p."ccUpdatedAt", p."lastSyncedAt", p.tenant, p.coordinates,
                 (SELECT COUNT(*) FROM "Prospect" WHERE "projectId" = p.id) as "prospectCount"
          FROM "Project" p
          ${whereClause}
          ORDER BY (tags->0->>'value') ${orderDirection} NULLS LAST, "ccCreatedAt" DESC
          LIMIT $1 OFFSET $2
        `;

        const countQuery = hasProspects ? `
          SELECT COUNT(DISTINCT p.id) as count
          FROM "Project" p
          ${hasProspectsJoin}
          ${whereClause}
          ${hasProspectsCondition.replace('GROUP BY p.id ', '')}
        ` : `SELECT COUNT(*) as count FROM "Project" p ${whereClause}`;

        const [rawProjects, countResults] = await Promise.all([
          prisma.$queryRawUnsafe(tagSortQuery, limitNum, skip),
          prisma.$queryRawUnsafe(countQuery)
        ]);

        // Fetch prospects for these projects
        const tagProjectIds = rawProjects.map(p => p.id);
        const tagProspects = tagProjectIds.length > 0 ? await prisma.prospect.findMany({
          where: { projectId: { in: tagProjectIds } },
          select: { id: true, name: true, isHomeowner: true, isDead: true, phones: true, emails: true, projectId: true },
          orderBy: { isHomeowner: 'desc' }
        }) : [];

        // Group prospects by projectId
        const tagProspectsByProject = {};
        tagProspects.forEach(p => {
          if (!tagProspectsByProject[p.projectId]) tagProspectsByProject[p.projectId] = [];
          tagProspectsByProject[p.projectId].push(p);
        });

        projects = rawProjects.map(p => ({
          ...p,
          prospectCount: Number(p.prospectCount) || 0,
          prospects: tagProspectsByProject[p.id] || []
        }));
        totalCount = Number(countResults[0]?.count || 0);
      } else if (sortBy === 'ccCreatedAt' || !sortBy) {
        // Use raw SQL for ccCreatedAt to handle NULLS LAST
        const conditions = [];
        if (where.tenant) conditions.push(`p.tenant = '${where.tenant}'`);
        if (where.status) conditions.push(`p.status = '${where.status}'`);
        if (where.id?.in) conditions.push(`p.id IN (${where.id.in.map(id => `'${id}'`).join(',')})`);

        let hasProspectsJoin = '';
        let hasProspectsCondition = '';
        if (hasProspects === 'true') {
          hasProspectsJoin = 'INNER JOIN "Prospect" pr ON pr."projectId" = p.id';
          hasProspectsCondition = 'GROUP BY p.id HAVING COUNT(pr.id) > 0';
        } else if (hasProspects === 'false') {
          hasProspectsJoin = 'LEFT JOIN "Prospect" pr ON pr."projectId" = p.id';
          hasProspectsCondition = 'GROUP BY p.id HAVING COUNT(pr.id) = 0';
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const orderDirection = sortDirection.toUpperCase();

        const dateQuery = hasProspects ? `
          SELECT p.id, p.address, p.city, p.state, p."postalCode", p.status, p."photoCount",
                 p."publicUrl", p."featureImage", p.tags, p."ccCreatedAt", p."ccUpdatedAt", p."lastSyncedAt", p.tenant, p.coordinates,
                 COUNT(pr.id) as "prospectCount"
          FROM "Project" p
          ${hasProspectsJoin}
          ${whereClause}
          ${hasProspectsCondition}
          ORDER BY p."ccCreatedAt" ${orderDirection} NULLS LAST
          LIMIT $1 OFFSET $2
        ` : `
          SELECT p.id, p.address, p.city, p.state, p."postalCode", p.status, p."photoCount",
                 p."publicUrl", p."featureImage", p.tags, p."ccCreatedAt", p."ccUpdatedAt", p."lastSyncedAt", p.tenant, p.coordinates,
                 (SELECT COUNT(*) FROM "Prospect" WHERE "projectId" = p.id) as "prospectCount"
          FROM "Project" p
          ${whereClause}
          ORDER BY p."ccCreatedAt" ${orderDirection} NULLS LAST
          LIMIT $1 OFFSET $2
        `;

        const countQuery = hasProspects ? `
          SELECT COUNT(DISTINCT p.id) as count
          FROM "Project" p
          ${hasProspectsJoin}
          ${whereClause}
          ${hasProspectsCondition.replace('GROUP BY p.id ', '')}
        ` : `SELECT COUNT(*) as count FROM "Project" p ${whereClause}`;

        const [rawProjects, countResults] = await Promise.all([
          prisma.$queryRawUnsafe(dateQuery, limitNum, skip),
          prisma.$queryRawUnsafe(countQuery)
        ]);

        // Fetch prospects for these projects
        const projectIds = rawProjects.map(p => p.id);
        const prospects = projectIds.length > 0 ? await prisma.prospect.findMany({
          where: { projectId: { in: projectIds } },
          select: { id: true, name: true, isHomeowner: true, isDead: true, phones: true, emails: true, projectId: true },
          orderBy: { isHomeowner: 'desc' }
        }) : [];

        // Group prospects by projectId
        const prospectsByProject = {};
        prospects.forEach(p => {
          if (!prospectsByProject[p.projectId]) prospectsByProject[p.projectId] = [];
          prospectsByProject[p.projectId].push(p);
        });

        projects = rawProjects.map(p => ({
          ...p,
          prospectCount: Number(p.prospectCount) || 0,
          prospects: prospectsByProject[p.id] || []
        }));
        totalCount = Number(countResults[0]?.count || 0);
      } else {
        let orderBy;
        if (sortBy === 'prospectCount') {
          orderBy = { prospects: { _count: sortDirection } };
        } else {
          const sortField = validSortFields.includes(sortBy) ? sortBy : 'ccCreatedAt';
          orderBy = { [sortField]: sortDirection };
        }

        // Fetch projects with prospect counts and prospect details
        const rawProjects = await prisma.project.findMany({
          where,
          orderBy,
          take: limitNum,
          skip,
          select: {
            id: true,
            address: true,
            city: true,
            state: true,
            postalCode: true,
            status: true,
            photoCount: true,
            publicUrl: true,
            featureImage: true,
            tags: true,
            coordinates: true,
            ccCreatedAt: true,
            ccUpdatedAt: true,
            lastSyncedAt: true,
            prospects: {
              select: { id: true, name: true, isHomeowner: true, isDead: true, phones: true, emails: true },
              orderBy: { isHomeowner: 'desc' }
            },
            _count: { select: { prospects: true } }
          }
        });

        // Flatten the _count field
        projects = rawProjects.map(p => ({
          ...p,
          prospectCount: p._count.prospects,
          _count: undefined
        }));

        totalCount = await prisma.project.count({ where });
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        count: projects.length,
        total: totalCount,
        page: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        projects
      })
    };

  } catch (error) {
    console.error('Error fetching projects:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to fetch projects',
        details: error.message
      })
    };
  }
}
