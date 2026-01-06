import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';

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
    const { id, limit, page, search, status, sortBy, sortDir, tag, tags, hasTags, hasProspects, tenant } = event.queryStringParameters || {};

    // If fetching by ID, return single project
    if (id) {
      const project = await prisma.project.findUnique({
        where: { id },
        include: {
          prospects: true
        }
      });

      if (!project) {
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Project not found' })
        };
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projects: [project], total: 1, totalPages: 1 })
      };
    }

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

    // Filter by hasTags - projects with non-empty tags array
    if (hasTags === 'true') {
      where.AND = where.AND || [];
      where.AND.push({
        tags: { not: null }
      });
      // Need raw SQL to check array not empty - will handle in query
    }

    // Parse special field queries from search (e.g., "no:city", "has:address")
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

    // Map field names to database columns for projects
    const fieldMap = {
      address: 'address',
      city: 'city',
      state: 'state',
      tags: 'tags',
      contacts: 'prospects', // special handling
      prospects: 'prospects'
    };

    // Apply field filters to where clause
    for (const filter of fieldFilters) {
      const dbField = fieldMap[filter.field];
      if (!dbField) continue;

      if (dbField === 'prospects') {
        // Special: check if has contacts/prospects
        if (filter.isEmpty) {
          where.prospects = { none: {} };
        } else {
          where.prospects = { some: {} };
        }
      } else if (dbField === 'tags') {
        // Tags is a JSON array
        if (filter.isEmpty) {
          where.AND = where.AND || [];
          where.AND.push({
            OR: [
              { tags: null },
              { tags: { equals: [] } }
            ]
          });
        } else {
          where.AND = where.AND || [];
          where.AND.push({ tags: { not: null } });
        }
      } else {
        // Regular nullable string fields
        if (filter.isEmpty) {
          where.AND = where.AND || [];
          where.AND.push({
            OR: [
              { [dbField]: null },
              { [dbField]: '' }
            ]
          });
        } else {
          where.AND = where.AND || [];
          where.AND.push({ [dbField]: { not: null } });
          where.AND.push({ [dbField]: { not: '' } });
        }
      }
    }

    if (searchText) {
      const colonMatch = searchText.match(/^(\w+)[:=](.+)$/i);

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
          // Simple ILIKE search for other field queries
          where.OR = [
            { address: { contains: value.trim(), mode: 'insensitive' } },
            { city: { contains: value.trim(), mode: 'insensitive' } },
            { state: { contains: value.trim(), mode: 'insensitive' } },
            { postalCode: { contains: value.trim(), mode: 'insensitive' } },
            { name: { contains: value.trim(), mode: 'insensitive' } }
          ];
        }
      } else {
        // Simple ILIKE search for general queries
        where.OR = [
          { address: { contains: searchText, mode: 'insensitive' } },
          { city: { contains: searchText, mode: 'insensitive' } },
          { state: { contains: searchText, mode: 'insensitive' } },
          { postalCode: { contains: searchText, mode: 'insensitive' } },
          { name: { contains: searchText, mode: 'insensitive' } }
        ];
      }
    }

    // Filter by tag(s) if provided - use raw SQL for PostgreSQL JSON search
    // Support both single tag (tag) and multiple tags (tags, comma-separated)
    const tagList = tags ? tags.split(',').filter(Boolean) : (tag ? [tag] : []);
    if (tagList.length > 0) {
      // Build tag patterns - any tag matches (OR)
      const tagPatterns = tagList.map(t => `%"value": "${t}"%`);
      const tagOrCondition = tagPatterns.map(p => `tags::text ILIKE '${p.replace(/'/g, "''")}'`).join(' OR ');

      // Build conditions for the tag query
      const tagConditions = [`(${tagOrCondition})`];
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
        // No projects match these tags, return empty result
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

    {
      // Handle special sorting cases
      if (sortBy === 'tags') {
        // Sort by first tag value alphabetically using raw SQL
        // Build WHERE conditions
        const conditions = [];
        if (where.tenant) conditions.push(`p.tenant = '${where.tenant}'`);
        if (where.status) conditions.push(`p.status = '${where.status}'`);
        if (where.id?.in) conditions.push(`p.id IN (${where.id.in.map(id => `'${id}'`).join(',')})`);
        if (hasTags === 'true') conditions.push(`p.tags IS NOT NULL AND p.tags::text != '[]' AND p.tags::text != 'null'`);
        // Add search OR conditions (including tags JSON search)
        if (where.OR) {
          const orConditions = where.OR.map(cond => {
            const field = Object.keys(cond)[0];
            const value = cond[field].contains.replace(/'/g, "''");
            return `p."${field}" ILIKE '%${value}%'`;
          });
          // Also search in tags JSON
          if (searchText) {
            orConditions.push(`p.tags::text ILIKE '%${searchText.replace(/'/g, "''")}%'`);
          }
          if (orConditions.length > 0) conditions.push(`(${orConditions.join(' OR ')})`);
        }

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
        if (hasTags === 'true') conditions.push(`p.tags IS NOT NULL AND p.tags::text != '[]' AND p.tags::text != 'null'`);
        // Add search OR conditions (including tags JSON search)
        if (where.OR) {
          const orConditions = where.OR.map(cond => {
            const field = Object.keys(cond)[0];
            const value = cond[field].contains.replace(/'/g, "''");
            return `p."${field}" ILIKE '%${value}%'`;
          });
          // Also search in tags JSON
          if (searchText) {
            orConditions.push(`p.tags::text ILIKE '%${searchText.replace(/'/g, "''")}%'`);
          }
          if (orConditions.length > 0) conditions.push(`(${orConditions.join(' OR ')})`);
        }

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
