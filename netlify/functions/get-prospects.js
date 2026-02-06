import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';

const prisma = new PrismaClient();

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
    const { limit, page, projectId, sortBy, sortDir, search, tag, tags, statusFilter, campaign, tenant, contactType, id, idsOnly, hasEmail } = event.queryStringParameters || {};
    const limitNum = limit ? parseInt(limit) : 25;
    const pageNum = page ? parseInt(page) : 1;
    const skip = (pageNum - 1) * limitNum;

    // If id is provided, return single prospect
    if (id) {
      const prospect = await prisma.prospect.findUnique({
        where: { id },
        include: {
          Project: {
            select: { id: true, address: true, city: true, state: true, postalCode: true, publicUrl: true, tags: true, coordinates: true, notepad: true }
          },
          OrganizationContact: {
            include: {
              Organization: {
                select: { id: true, name: true, type: true }
              }
            }
          }
        }
      });

      if (!prospect) {
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Prospect not found' })
        };
      }

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prospect)
      };
    }

    // If contactType is 'org', return only org contacts
    // If contactType is 'all', return both prospects and org contacts merged
    // Default (no contactType or 'prospect') returns only prospects
    if (contactType === 'org' || contactType === 'all') {
      return await handleOrgContacts(event, user, contactType);
    }

    // Build where clause
    const where = {};

    // Filter by tenant - verify user has access to requested tenant
    const requestedTenant = tenant || user.slug;
    if (requestedTenant && requestedTenant !== user.slug) {
      // User requesting different tenant - verify they have access
      const hasAccess = await prisma.userTenant.findFirst({
        where: { userId: user.userId, Tenant: { slug: requestedTenant } }
      });
      if (!hasAccess) {
        return {
          statusCode: 403,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Access denied to this tenant' })
        };
      }
    }
    const tenantSlug = requestedTenant;
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

    // Filter by campaign
    if (campaign) {
      where.campaign = campaign;
    }

    // Filter by hasEmail
    if (hasEmail === 'true') {
      where.AND = where.AND || [];
      where.AND.push({ emails: { not: null } });
    }

    // Filter by project tag(s) (prospects whose project has these tags)
    // Support both single tag (tag) and multiple tags (tags, comma-separated)
    const tagList = tags ? tags.split(',').filter(Boolean) : (tag ? [tag] : []);
    if (tagList.length > 0) {
      // Find projects with matching any of the tags using parameterized query
      // Build OR conditions with parameterized placeholders
      const tagPatterns = tagList.map(t => `%"value": "${t.replace(/"/g, '')}"%`);
      const conditions = tagPatterns.map((_, i) => `tags::text ILIKE $${i + 1}`);
      const projectIds = await prisma.$queryRawUnsafe(
        `SELECT id FROM "Project" WHERE ${conditions.join(' OR ')}`,
        ...tagPatterns
      );
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
      name: 'name',
      address: 'project.address',
      wp: 'enrichedAt'
    };

    // Apply field filters to where clause
    for (const filter of fieldFilters) {
      const dbField = fieldMap[filter.field];
      if (!dbField) continue;

      if (dbField === 'name') {
        // name is required, so check empty string and placeholder "---"
        if (filter.isEmpty) {
          where.AND = where.AND || [];
          where.AND.push({
            OR: [
              { name: '' },
              { name: '---' }
            ]
          });
        } else {
          where.AND = where.AND || [];
          where.AND.push({
            AND: [
              { name: { not: '' } },
              { name: { not: '---' } }
            ]
          });
        }
      } else if (dbField === 'emails' || dbField === 'phones') {
        // These are JSON arrays - null means no data
        // Note: In this dataset, empty arrays are stored as null, not []
        where.AND = where.AND || [];
        if (filter.isEmpty) {
          where.AND.push({ [dbField]: null });
        } else {
          where.AND.push({ [dbField]: { not: null } });
        }
      } else if (dbField === 'project.address') {
        // Filter by related project's address field
        where.AND = where.AND || [];
        if (filter.isEmpty) {
          where.AND.push({
            OR: [
              { project: null },
              { Project: { address: null } },
              { Project: { address: '' } }
            ]
          });
        } else {
          where.AND.push({
            Project: {
              AND: [
                { address: { not: null } },
                { address: { not: '' } }
              ]
            }
          });
        }
      } else if (dbField === 'enrichedAt') {
        // enrichedAt is a timestamp - null means not enriched
        where.AND = where.AND || [];
        if (filter.isEmpty) {
          where.AND.push({ enrichedAt: null });
        } else {
          where.AND.push({ enrichedAt: { not: null } });
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
        } else if (fieldLower === 'tag' || fieldLower === 'tags') {
          // Search for contacts by project tag value (partial match)
          const tagPattern = `%${value.trim().replace(/"/g, '')}%`;
          const projectsWithTag = await prisma.$queryRaw`
            SELECT id FROM "Project"
            WHERE tags::text ILIKE ${tagPattern}
          `;
          const tagProjectIds = projectsWithTag.map(p => p.id);
          if (tagProjectIds.length === 0) {
            // No matching projects, return empty
            where.id = { in: [] };
          } else {
            where.projectId = { in: tagProjectIds };
          }
        } else {
          // Simple ILIKE search for other field queries
          where.OR = [
            { name: { contains: value.trim(), mode: 'insensitive' } },
            { companyName: { contains: value.trim(), mode: 'insensitive' } },
            { jobTitle: { contains: value.trim(), mode: 'insensitive' } }
          ];
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
        // Search name, company, job title, and project tags
        // First find projects with matching tags
        const tagPattern = `%${searchText}%`;
        const projectsWithTag = await prisma.$queryRaw`
          SELECT id FROM "Project"
          WHERE tags::text ILIKE ${tagPattern}
        `;
        const tagProjectIds = projectsWithTag.map(p => p.id);

        // Build OR conditions including tag matches
        const orConditions = [
          { name: { contains: searchText, mode: 'insensitive' } },
          { companyName: { contains: searchText, mode: 'insensitive' } },
          { jobTitle: { contains: searchText, mode: 'insensitive' } }
        ];

        // Add project tag match if any found
        if (tagProjectIds.length > 0) {
          orConditions.push({ projectId: { in: tagProjectIds } });
        }

        where.OR = orConditions;
      }
    }

    // If idsOnly is true, return just the IDs (for bulk operations)
    if (idsOnly === 'true') {
      const allIds = await prisma.prospect.findMany({
        where,
        select: { id: true }
      });
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: allIds.map(p => p.id) })
      };
    }

    // Build sort order
    const validSortFields = ['name', 'createdAt', 'updatedAt', 'isHomeowner', 'companyName', 'status'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDirection = sortDir === 'asc' ? 'asc' : 'desc';

    let prospects, totalCount, homeownerCount;

    // Regular Prisma query
    const orderBy = sortField === 'status'
      ? { [sortField]: { sort: sortDirection, nulls: 'first' } }
      : { [sortField]: sortDirection };

    // Build tenant where clause for campaigns query
    const campaignWhere = tenantSlug ? { tenant: tenantSlug } : {};

    [prospects, totalCount, homeownerCount] = await Promise.all([
      prisma.prospect.findMany({
        where,
        orderBy,
        take: limitNum,
        skip,
        include: {
          Project: {
            select: { id: true, address: true, city: true, state: true, postalCode: true, publicUrl: true, tags: true, coordinates: true, notepad: true }
          },
          OrganizationContact: {
            include: {
              Organization: {
                select: { id: true, name: true, type: true }
              }
            }
          }
        }
      }),
      prisma.prospect.count({ where }),
      prisma.prospect.count({ where: { ...where, isHomeowner: true } })
    ]);

    // Get available campaigns for filter dropdown (only on first page load)
    let campaigns = [];
    if (pageNum === 1) {
      const campaignGroups = await prisma.prospect.groupBy({
        by: ['campaign'],
        where: campaignWhere,
        _count: { id: true }
      });
      campaigns = campaignGroups
        .filter(c => c.campaign)
        .map(c => ({ value: c.campaign, count: c._count.id }))
        .sort((a, b) => b.count - a.count);
    }

    // Normalize field names for frontend (Project -> project)
    const normalizedProspects = prospects.map(p => ({
      ...p,
      project: p.Project,
      Project: undefined
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        count: normalizedProspects.length,
        total: totalCount,
        page: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        homeowners: homeownerCount,
        campaigns,
        prospects: normalizedProspects
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

// Handle org contacts (contactType=org or contactType=all)
async function handleOrgContacts(event, user, contactType) {
  const { limit, page, search, tenant } = event.queryStringParameters || {};
  const limitNum = limit ? parseInt(limit) : 25;
  const pageNum = page ? parseInt(page) : 1;
  const skip = (pageNum - 1) * limitNum;
  const tenantSlug = tenant || user.slug;

  // Build org contact where clause
  const orgWhere = {
    Organization: { tenant: tenantSlug }
  };

  if (search) {
    orgWhere.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { title: { contains: search, mode: 'insensitive' } },
      { Organization: { name: { contains: search, mode: 'insensitive' } } }
    ];
  }

  if (contactType === 'org') {
    // Only org contacts
    const [orgContacts, totalCount] = await Promise.all([
      prisma.organizationContact.findMany({
        where: orgWhere,
        orderBy: { name: 'asc' },
        take: limitNum,
        skip,
        include: {
          Organization: { select: { id: true, name: true, type: true, address: true, city: true, state: true, postalCode: true } },
          prospect: {
            include: {
              Project: { select: { id: true, address: true, city: true, state: true, postalCode: true } }
            }
          }
        }
      }),
      prisma.organizationContact.count({ where: orgWhere })
    ]);

    // Transform to prospect-like shape for UI consistency
    const prospects = orgContacts.map(oc => ({
      id: `org_${oc.id}`,
      _orgContactId: oc.id,
      name: oc.name,
      phones: oc.phone ? [{ phone_number: oc.phone }] : null,
      emails: oc.email ? [{ email_address: oc.email }] : null,
      companyName: oc.Organization?.name,
      jobTitle: oc.title,
      isOrgContact: true,
      organization: oc.Organization,
      project: oc.prospect?.Project || null,
      createdAt: oc.createdAt,
      notes: oc.notes
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        count: prospects.length,
        total: totalCount,
        page: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        homeowners: 0,
        prospects
      })
    };
  }

  // contactType === 'all' - merge both
  const prospectWhere = { tenant: tenantSlug };
  if (search) {
    // Find projects with matching tags
    const tagPattern = `%${search}%`;
    const projectsWithTag = await prisma.$queryRaw`
      SELECT id FROM "Project"
      WHERE tags::text ILIKE ${tagPattern}
    `;
    const tagProjectIds = projectsWithTag.map(p => p.id);

    const orConditions = [
      { name: { contains: search, mode: 'insensitive' } },
      { companyName: { contains: search, mode: 'insensitive' } },
      { jobTitle: { contains: search, mode: 'insensitive' } }
    ];

    if (tagProjectIds.length > 0) {
      orConditions.push({ projectId: { in: tagProjectIds } });
    }

    prospectWhere.OR = orConditions;
  }

  const [prospects, prospectCount, orgContacts, orgCount] = await Promise.all([
    prisma.prospect.findMany({
      where: prospectWhere,
      orderBy: { name: 'asc' },
      take: limitNum,
      skip,
      include: {
        Project: { select: { id: true, address: true, city: true, state: true, postalCode: true, publicUrl: true, tags: true, coordinates: true, notepad: true } }
      }
    }),
    prisma.prospect.count({ where: prospectWhere }),
    prisma.organizationContact.findMany({
      where: orgWhere,
      orderBy: { name: 'asc' },
      take: limitNum,
      skip,
      include: {
        Organization: { select: { id: true, name: true, type: true, address: true, city: true, state: true, postalCode: true } }
      }
    }),
    prisma.organizationContact.count({ where: orgWhere })
  ]);

  // Transform org contacts
  const orgProspects = orgContacts.map(oc => ({
    id: `org_${oc.id}`,
    _orgContactId: oc.id,
    name: oc.name,
    phones: oc.phone ? [{ phone_number: oc.phone }] : null,
    emails: oc.email ? [{ email_address: oc.email }] : null,
    companyName: oc.Organization?.name,
    jobTitle: oc.title,
    isOrgContact: true,
    organization: oc.Organization,
    createdAt: oc.createdAt,
    notes: oc.notes
  }));

  // Merge and sort by name
  const merged = [...prospects.map(p => ({ ...p, isOrgContact: false })), ...orgProspects]
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const totalCount = prospectCount + orgCount;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      count: merged.length,
      total: totalCount,
      page: pageNum,
      totalPages: Math.ceil(totalCount / limitNum),
      homeowners: 0,
      prospects: merged.slice(0, limitNum) // Limit after merge
    })
  };
}
