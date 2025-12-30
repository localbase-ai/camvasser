import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const SMARTLEAD_API_KEY = process.env.SMARTLEAD_API_KEY || 'd5660b37-5572-4f17-b72d-18ccd7a01bf6_d867d1e';
const SMARTLEAD_BASE_URL = 'https://server.smartlead.ai/api/v1';

// Background function - can run up to 15 minutes
export const config = {
  type: 'background'
};

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let jobId = null;

  try {
    const { campaignName, filters } = JSON.parse(event.body);

    if (!campaignName) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Campaign name is required' }) };
    }

    const { tenant, tag, statusFilter, campaign, search } = filters || {};

    // Create job record for tracking
    const job = await prisma.backgroundJob.create({
      data: {
        type: 'push-to-smartlead',
        status: 'running',
        tenant,
        input: { campaignName, filters }
      }
    });
    jobId = job.id;

    console.log('Created job:', jobId);
    console.log('Push to SmartLead filters:', { tenant, tag, statusFilter, campaign, search });

    // Build query matching get-prospects logic
    const where = {};

    if (tenant) {
      where.tenant = tenant;
    }

    // Tag filter - find projects with matching tag, then filter prospects
    let projectIds = null;
    if (tag) {
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
        await prisma.backgroundJob.update({
          where: { id: jobId },
          data: { status: 'failed', error: `No projects found with tag "${tag}"` }
        });
        return;
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

      const fieldMap = {
        email: 'emails',
        emails: 'emails',
        phone: 'phones',
        phones: 'phones',
        name: 'name'
      };

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

    // Count first
    const totalCount = await prisma.prospect.count({ where });
    console.log('Total matching prospects:', totalCount);

    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: { total: totalCount }
    });

    // Fetch ALL prospects using cursor-based pagination (handles large datasets)
    const allProspects = [];
    let cursor = undefined;
    const fetchBatchSize = 1000;

    while (true) {
      const batch = await prisma.prospect.findMany({
        where,
        select: {
          id: true,
          name: true,
          emails: true,
          companyName: true,
          phones: true
        },
        take: fetchBatchSize,
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { id: 'asc' }
      });

      if (batch.length === 0) break;

      allProspects.push(...batch);
      cursor = batch[batch.length - 1].id;

      console.log(`Fetched batch: ${batch.length}, total so far: ${allProspects.length}`);

      // Update progress
      await prisma.backgroundJob.update({
        where: { id: jobId },
        data: { progress: Math.floor((allProspects.length / totalCount) * 50) }
      });

      if (batch.length < fetchBatchSize) break;
    }

    const prospects = allProspects;
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

      const nameParts = (prospect.name || '').trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      const phone = prospect.phones?.[0]?.number || '';

      leadsToUpload.push({
        email: email.toLowerCase(),
        first_name: firstName,
        last_name: lastName,
        company_name: prospect.companyName || '',
        phone_number: phone,
        location: ''
      });
    }

    console.log('Found prospects:', prospects.length, 'With valid emails:', leadsToUpload.length);

    if (leadsToUpload.length === 0) {
      await prisma.backgroundJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          error: 'No contacts with valid emails match the current filters',
          result: { prospectsFound: prospects.length, filters: { tenant, tag, statusFilter, campaign, search } }
        }
      });
      return;
    }

    // Create campaign in SmartLead
    const createResponse = await fetch(`${SMARTLEAD_BASE_URL}/campaigns/create?api_key=${SMARTLEAD_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: campaignName })
    });

    const createData = await createResponse.json();
    console.log('SmartLead campaign creation response:', JSON.stringify(createData));

    const campaignId = createData.id;
    if (!campaignId) {
      console.error('SmartLead campaign creation failed:', createData);
      await prisma.backgroundJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          error: 'Failed to create SmartLead campaign',
          result: createData
        }
      });
      return;
    }

    console.log('Created campaign ID:', campaignId);

    // Upload leads in batches sequentially (more reliable for large uploads)
    // SmartLead API limit is 350 leads per batch, 60 requests per minute
    const batchSize = 300; // Stay under 350 limit with safety margin
    let totalUploaded = 0;
    let duplicates = 0;
    let invalid = 0;
    let alreadyInCampaign = 0;
    const uploadErrors = [];
    const batchResults = [];

    for (let i = 0; i < leadsToUpload.length; i += batchSize) {
      const batch = leadsToUpload.slice(i, i + batchSize);

      try {
        const uploadResponse = await fetch(`${SMARTLEAD_BASE_URL}/campaigns/${campaignId}/leads?api_key=${SMARTLEAD_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lead_list: batch })
        });

        const uploadData = await uploadResponse.json();
        console.log('SmartLead upload response (batch', Math.floor(i / batchSize) + 1, '):', JSON.stringify(uploadData));

        const batchNum = Math.floor(i / batchSize) + 1;
        const batchResult = { batch: batchNum, size: batch.length, response: uploadData };

        if (!uploadResponse.ok) {
          console.error('SmartLead HTTP error:', uploadResponse.status, uploadResponse.statusText);
          uploadErrors.push(`Batch ${batchNum}: HTTP ${uploadResponse.status}`);
          batchResult.error = `HTTP ${uploadResponse.status}`;
        } else if (uploadData.ok || uploadData.upload_count !== undefined) {
          totalUploaded += uploadData.upload_count || 0;
          duplicates += uploadData.duplicate_count || 0;
          invalid += uploadData.invalid_email_count || 0;
          alreadyInCampaign += uploadData.already_in_campaign_count || 0;
          console.log('Batch', batchNum, 'uploaded:', uploadData.upload_count, 'duplicates:', uploadData.duplicate_count, 'already in campaign:', uploadData.already_in_campaign_count);
        } else {
          uploadErrors.push(`Batch ${batchNum}: ${uploadData.error || uploadData.message || 'Unknown error'}`);
          batchResult.error = uploadData.error || uploadData.message;
        }

        batchResults.push(batchResult);
      } catch (e) {
        uploadErrors.push(e.message);
      }

      // Rate limit: wait 1.5 seconds between batches (SmartLead allows 60 requests/minute)
      if (i + batchSize < leadsToUpload.length) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      // Update progress (50-100% for upload phase)
      const uploadProgress = 50 + Math.floor(((i + batch.length) / leadsToUpload.length) * 50);
      await prisma.backgroundJob.update({
        where: { id: jobId },
        data: { progress: uploadProgress }
      });
    }

    if (uploadErrors.length > 0) {
      console.error('SmartLead upload errors:', uploadErrors);
    }

    // Mark job complete
    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        progress: 100,
        result: {
          success: uploadErrors.length === 0,
          campaignId,
          campaignName,
          queryCount: totalCount,
          fetchedCount: prospects.length,
          validEmailCount: leadsToUpload.length,
          uploaded: totalUploaded,
          duplicates,
          invalid,
          alreadyInCampaign,
          totalBatches: Math.ceil(leadsToUpload.length / batchSize),
          successfulBatches: batchResults.filter(b => !b.error).length,
          filters: { tenant, tag, statusFilter, campaign, search },
          smartleadUrl: `https://app.smartlead.ai/app/email-campaign/${campaignId}/analytics`,
          errors: uploadErrors.length > 0 ? uploadErrors : undefined
        }
      }
    });

    console.log('Job completed:', jobId);

  } catch (error) {
    console.error('Error pushing to SmartLead:', error);
    if (jobId) {
      await prisma.backgroundJob.update({
        where: { id: jobId },
        data: { status: 'failed', error: error.message }
      });
    }
  } finally {
    await prisma.$disconnect();
  }
};
