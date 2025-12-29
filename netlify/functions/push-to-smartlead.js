import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const SMARTLEAD_API_KEY = process.env.SMARTLEAD_API_KEY || 'd5660b37-5572-4f17-b72d-18ccd7a01bf6_d867d1e';
const SMARTLEAD_BASE_URL = 'https://server.smartlead.ai/api/v1';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { campaignName, filters } = JSON.parse(event.body);

    if (!campaignName) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Campaign name is required' }) };
    }

    const { tenant, tag, statusFilter, campaign, search } = filters || {};

    console.log('Push to SmartLead filters:', { tenant, tag, statusFilter, campaign, search });

    // Build query matching get-prospects logic
    const where = {};

    if (tenant) {
      where.tenant = tenant;
    }

    // Tag filter - find projects with matching tag, then filter prospects
    let projectIds = null;
    if (tag) {
      // JSON has space after colon: "value": "tag" not "value":"tag"
      const tagPattern = `%"value": "${tag}"%`;
      let projectsWithTag;
      if (tenant) {
        projectsWithTag = await prisma.$queryRaw`
          SELECT id FROM "Project"
          WHERE tags::text ILIKE ${tagPattern}
          AND tenant = ${tenant}
        `;
      } else {
        projectsWithTag = await prisma.$queryRaw`
          SELECT id FROM "Project"
          WHERE tags::text ILIKE ${tagPattern}
        `;
      }
      projectIds = projectsWithTag.map(p => p.id);
      if (projectIds.length === 0) {
        return {
          statusCode: 400,
          body: JSON.stringify({ error: `No projects found with tag "${tag}"` })
        };
      }
      where.projectId = { in: projectIds };
    }

    // Status filter
    if (statusFilter) {
      if (statusFilter === 'no_status') {
        where.OR = [{ status: null }, { status: '' }];
      } else {
        where.status = statusFilter;
      }
    }

    // Campaign filter
    if (campaign) {
      where.campaign = campaign;
    }

    // Search filter - handle special field queries like has:email, no:phone
    if (search) {
      let searchText = search.trim();

      // Parse special field queries from search
      const fieldFilters = [];
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
        return '';
      }).trim();

      // Map field names to database columns
      const fieldMap = {
        email: 'emails',
        emails: 'emails',
        phone: 'phones',
        phones: 'phones',
        name: 'name'
      };

      // Apply field filters
      for (const filter of fieldFilters) {
        const dbField = fieldMap[filter.field];
        if (!dbField) continue;

        if (dbField === 'emails' || dbField === 'phones') {
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
          }
        }
      }

      // Handle remaining search text as name/email search
      if (searchText) {
        const searchLower = searchText.toLowerCase();
        where.AND = where.AND || [];
        where.AND.push({
          OR: [
            { name: { contains: searchText, mode: 'insensitive' } },
            { emails: { array_contains: searchLower } }
          ]
        });
      }
    }

    // Count first to verify
    const totalCount = await prisma.prospect.count({ where });
    console.log('Total matching prospects:', totalCount);

    // Fetch ALL prospects in batches to avoid connection pooler limits
    const batchSize = 500;
    const prospects = [];
    let skip = 0;

    while (true) {
      const batch = await prisma.prospect.findMany({
        where,
        skip,
        take: batchSize,
        select: {
          id: true,
          name: true,
          emails: true,
          companyName: true,
          phones: true,
          project: {
            select: { address: true, city: true, state: true, postalCode: true }
          }
        }
      });

      if (batch.length === 0) break;
      prospects.push(...batch);
      skip += batchSize;

      console.log(`Fetched batch: ${batch.length}, total so far: ${prospects.length}`);

      if (batch.length < batchSize) break; // Last batch
    }

    console.log('Actually fetched:', prospects.length);

    // Filter to only those with valid emails
    const leadsToUpload = [];
    const seenEmails = new Set();

    for (const prospect of prospects) {
      if (!Array.isArray(prospect.emails) || prospect.emails.length === 0) continue;

      const email = typeof prospect.emails[0] === 'string'
        ? prospect.emails[0]
        : prospect.emails[0]?.email;

      if (!email || seenEmails.has(email.toLowerCase())) continue;
      seenEmails.add(email.toLowerCase());

      // Parse name
      const nameParts = (prospect.name || '').trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Get phone
      const phone = prospect.phones?.[0]?.number || '';

      // Build address
      const addr = prospect.project
        ? [prospect.project.address, prospect.project.city, prospect.project.state, prospect.project.postalCode].filter(Boolean).join(', ')
        : '';

      leadsToUpload.push({
        email: email.toLowerCase(),
        first_name: firstName,
        last_name: lastName,
        company_name: prospect.companyName || '',
        phone_number: phone,
        location: addr
      });
    }

    console.log('Found prospects:', prospects.length, 'With valid emails:', leadsToUpload.length);

    if (leadsToUpload.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'No contacts with valid emails match the current filters',
          debug: { prospectsFound: prospects.length, filters: { tenant, tag, statusFilter, campaign, search } }
        })
      };
    }

    // Create campaign in SmartLead
    const createResponse = await fetch(`${SMARTLEAD_BASE_URL}/campaigns/create?api_key=${SMARTLEAD_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: campaignName })
    });

    const createData = await createResponse.json();
    console.log('SmartLead campaign creation response:', JSON.stringify(createData));

    // SmartLead returns id directly, not nested
    const campaignId = createData.id;
    if (!campaignId) {
      console.error('SmartLead campaign creation failed:', createData);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to create SmartLead campaign', details: createData })
      };
    }

    console.log('Created campaign ID:', campaignId);

    // Upload leads in larger batches (SmartLead supports up to 1000) and in parallel
    const batchSize = 500;
    let totalUploaded = 0;
    let duplicates = 0;
    let invalid = 0;

    // Create all batch upload promises
    const uploadPromises = [];
    for (let i = 0; i < leadsToUpload.length; i += batchSize) {
      const batch = leadsToUpload.slice(i, i + batchSize);
      uploadPromises.push(
        fetch(`${SMARTLEAD_BASE_URL}/campaigns/${campaignId}/leads?api_key=${SMARTLEAD_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lead_list: batch })
        }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }))
      );
    }

    // Run all uploads in parallel
    const results = await Promise.all(uploadPromises);
    const uploadErrors = [];
    for (const uploadData of results) {
      console.log('SmartLead upload response:', JSON.stringify(uploadData));
      if (uploadData.ok) {
        totalUploaded += uploadData.upload_count || 0;
        duplicates += uploadData.duplicate_count || 0;
        invalid += uploadData.invalid_email_count || 0;
      } else {
        uploadErrors.push(uploadData.error || uploadData.message || 'Unknown error');
      }
    }
    if (uploadErrors.length > 0) {
      console.error('SmartLead upload errors:', uploadErrors);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        campaignId,
        campaignName,
        queryCount: totalCount,
        fetchedCount: prospects.length,
        validEmailCount: leadsToUpload.length,
        uploaded: totalUploaded,
        duplicates,
        invalid,
        filters: { tenant, tag, statusFilter, campaign, search },
        smartleadUrl: `https://app.smartlead.ai/app/email-campaign/${campaignId}/analytics`
      })
    };

  } catch (error) {
    console.error('Error pushing to SmartLead:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message })
    };
  } finally {
    await prisma.$disconnect();
  }
};
