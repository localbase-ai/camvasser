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
    const { limit, page, projectId, sortBy, sortDir, search, tag, statusFilter, campaign, tenant, contactType } = event.queryStringParameters || {};
    const limitNum = limit ? parseInt(limit) : 25;
    const pageNum = page ? parseInt(page) : 1;
    const skip = (pageNum - 1) * limitNum;

    // If contactType is 'org', return only org contacts
    // If contactType is 'all', return both prospects and org contacts merged
    // Default (no contactType or 'prospect') returns only prospects
    if (contactType === 'org' || contactType === 'all') {
      return await handleOrgContacts(event, user, contactType);
    }

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

    // Filter by campaign
    if (campaign) {
      where.campaign = campaign;
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
      address: 'project.address'
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
      } else if (dbField === 'project.address') {
        // Filter by related project's address field
        where.AND = where.AND || [];
        if (filter.isEmpty) {
          where.AND.push({
            OR: [
              { project: null },
              { project: { address: null } },
              { project: { address: '' } }
            ]
          });
        } else {
          where.AND.push({
            project: {
              AND: [
                { address: { not: null } },
                { address: { not: '' } }
              ]
            }
          });
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
        // Simple ILIKE search for general queries
        where.OR = [
          { name: { contains: searchText, mode: 'insensitive' } },
          { companyName: { contains: searchText, mode: 'insensitive' } },
          { jobTitle: { contains: searchText, mode: 'insensitive' } }
        ];
      }
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
          project: {
            select: { id: true, address: true, city: true, state: true, postalCode: true, publicUrl: true, tags: true, coordinates: true, notepad: true }
          },
          organizationContacts: {
            include: {
              organization: {
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

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        count: prospects.length,
        total: totalCount,
        page: pageNum,
        totalPages: Math.ceil(totalCount / limitNum),
        homeowners: homeownerCount,
        campaigns,
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

// Handle org contacts (contactType=org or contactType=all)
async function handleOrgContacts(event, user, contactType) {
  const { limit, page, search, tenant } = event.queryStringParameters || {};
  const limitNum = limit ? parseInt(limit) : 25;
  const pageNum = page ? parseInt(page) : 1;
  const skip = (pageNum - 1) * limitNum;
  const tenantSlug = tenant || user.slug;

  // Build org contact where clause
  const orgWhere = {
    organization: { tenant: tenantSlug }
  };

  if (search) {
    orgWhere.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { title: { contains: search, mode: 'insensitive' } },
      { organization: { name: { contains: search, mode: 'insensitive' } } }
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
          organization: { select: { id: true, name: true, type: true, address: true, city: true, state: true, postalCode: true } },
          prospect: {
            include: {
              project: { select: { id: true, address: true, city: true, state: true, postalCode: true } }
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
      companyName: oc.organization?.name,
      jobTitle: oc.title,
      isOrgContact: true,
      organization: oc.organization,
      project: oc.prospect?.project || null,
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
    prospectWhere.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { companyName: { contains: search, mode: 'insensitive' } },
      { jobTitle: { contains: search, mode: 'insensitive' } }
    ];
  }

  const [prospects, prospectCount, orgContacts, orgCount] = await Promise.all([
    prisma.prospect.findMany({
      where: prospectWhere,
      orderBy: { name: 'asc' },
      take: limitNum,
      skip,
      include: {
        project: { select: { id: true, address: true, city: true, state: true, postalCode: true, publicUrl: true, tags: true, coordinates: true, notepad: true } }
      }
    }),
    prisma.prospect.count({ where: prospectWhere }),
    prisma.organizationContact.findMany({
      where: orgWhere,
      orderBy: { name: 'asc' },
      take: limitNum,
      skip,
      include: {
        organization: { select: { id: true, name: true, type: true, address: true, city: true, state: true, postalCode: true } }
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
    companyName: oc.organization?.name,
    jobTitle: oc.title,
    isOrgContact: true,
    organization: oc.organization,
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
