import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';

const prisma = new PrismaClient();
const SMARTLEAD_API_KEY = process.env.SMARTLEAD_API_KEY || 'd5660b37-5572-4f17-b72d-18ccd7a01bf6_d867d1e';
const SMARTLEAD_BASE_URL = 'https://server.smartlead.ai/api/v1';

// Chunked processing - each invocation handles one batch
// Frontend polls and triggers continuation until complete
export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body);

    // If continuing existing job
    if (body.jobId) {
      return await processBatch(body.jobId);
    }

    // Otherwise start new job
    return await startJob(body);

  } catch (error) {
    console.error('Error in push-to-smartlead:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message })
    };
  } finally {
    await prisma.$disconnect();
  }
};

async function startJob({ campaignName, filters }) {
  if (!campaignName) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Campaign name is required' }) };
  }

  const { tenant, tag, statusFilter, campaign, search } = filters || {};

  // Build query matching get-prospects logic
  const where = {};

  if (tenant) {
    where.tenant = tenant;
  }

  // Tag filter
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
    const projectIds = projectsWithTag.map(p => p.id);
    if (projectIds.length === 0) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
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

  // Search filter
  if (search) {
    let searchText = search.trim();
    const fieldFilters = [];
    const fieldQueryPattern = /(no:\w+|has:\w+|\w+:empty)/gi;
    searchText = searchText.replace(fieldQueryPattern, (match) => {
      const lower = match.trim().toLowerCase();
      if (lower.startsWith('no:')) {
        fieldFilters.push({ field: lower.substring(3), isEmpty: true });
      } else if (lower.startsWith('has:')) {
        fieldFilters.push({ field: lower.substring(4), isEmpty: false });
      } else if (lower.endsWith(':empty')) {
        fieldFilters.push({ field: lower.replace(':empty', ''), isEmpty: true });
      }
      return '';
    }).trim();

    const fieldMap = { email: 'emails', emails: 'emails', phone: 'phones', phones: 'phones', name: 'name' };

    for (const filter of fieldFilters) {
      const dbField = fieldMap[filter.field];
      if (!dbField) continue;
      if (dbField === 'emails' || dbField === 'phones') {
        where.AND = where.AND || [];
        if (filter.isEmpty) {
          where.AND.push({ OR: [{ [dbField]: null }, { [dbField]: { equals: [] } }] });
        } else {
          where.AND.push({ [dbField]: { not: null } });
        }
      }
    }

    if (searchText) {
      where.AND = where.AND || [];
      where.AND.push({
        OR: [
          { name: { contains: searchText, mode: 'insensitive' } },
          { emails: { array_contains: searchText.toLowerCase() } }
        ]
      });
    }
  }

  // Fetch all prospects (this should be fast enough for most datasets)
  const prospects = await prisma.prospect.findMany({
    where,
    select: { id: true, name: true, emails: true, companyName: true, phones: true },
    orderBy: { id: 'asc' }
  });

  console.log('Found prospects:', prospects.length);

  // Filter to only those with valid emails
  const leadsToUpload = [];
  const seenEmails = new Set();

  for (const prospect of prospects) {
    if (!Array.isArray(prospect.emails) || prospect.emails.length === 0) continue;
    const email = typeof prospect.emails[0] === 'string' ? prospect.emails[0] : prospect.emails[0]?.email;
    if (!email || seenEmails.has(email.toLowerCase())) continue;
    seenEmails.add(email.toLowerCase());

    const nameParts = (prospect.name || '').trim().split(' ');
    leadsToUpload.push({
      email: email.toLowerCase(),
      first_name: nameParts[0] || '',
      last_name: nameParts.slice(1).join(' ') || '',
      company_name: prospect.companyName || '',
      phone_number: prospect.phones?.[0]?.number || '',
      location: ''
    });
  }

  console.log('Prospects with valid emails:', leadsToUpload.length);

  if (leadsToUpload.length === 0) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'No contacts with valid emails match the current filters' })
    };
  }

  // Create campaign in SmartLead
  const createResponse = await fetch(`${SMARTLEAD_BASE_URL}/campaigns/create?api_key=${SMARTLEAD_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: campaignName })
  });

  const createData = await createResponse.json();
  console.log('SmartLead campaign created:', createData);

  if (!createData.id) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to create SmartLead campaign', details: createData })
    };
  }

  // Create job record with leads stored for batch processing
  const job = await prisma.backgroundJob.create({
    data: {
      id: createId(),
      type: 'push-to-smartlead',
      status: 'running',
      tenant,
      total: leadsToUpload.length,
      progress: 0,
      updatedAt: new Date(),
      input: {
        campaignName,
        campaignId: createData.id,
        filters,
        leads: leadsToUpload,
        batchIndex: 0,
        uploaded: 0,
        duplicates: 0,
        invalid: 0,
        alreadyInCampaign: 0,
        errors: []
      }
    }
  });

  console.log('Created job:', job.id, 'with', leadsToUpload.length, 'leads');

  // Process first batch immediately
  return await processBatch(job.id);
}

async function processBatch(jobId) {
  const job = await prisma.backgroundJob.findUnique({ where: { id: jobId } });

  if (!job) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Job not found' }) };
  }

  if (job.status === 'completed' || job.status === 'failed') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: job.status, result: job.result })
    };
  }

  const { campaignId, leads, batchIndex, uploaded, duplicates, invalid, alreadyInCampaign, errors, campaignName, filters } = job.input;
  const batchSize = 300;
  const startIdx = batchIndex * batchSize;

  // Check if we're done
  if (startIdx >= leads.length) {
    const result = {
      success: errors.length === 0,
      campaignId,
      campaignName,
      validEmailCount: leads.length,
      uploaded,
      duplicates,
      invalid,
      alreadyInCampaign,
      totalBatches: Math.ceil(leads.length / batchSize),
      filters,
      smartleadUrl: `https://app.smartlead.ai/app/email-campaign/${campaignId}/analytics`,
      errors: errors.length > 0 ? errors : undefined
    };

    await prisma.backgroundJob.update({
      where: { id: jobId },
      data: { status: 'completed', progress: 100, result }
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed', result })
    };
  }

  // Process current batch
  const batch = leads.slice(startIdx, startIdx + batchSize);
  const batchNum = batchIndex + 1;
  let newUploaded = uploaded;
  let newDuplicates = duplicates;
  let newInvalid = invalid;
  let newAlreadyInCampaign = alreadyInCampaign;
  const newErrors = [...errors];

  try {
    console.log(`Processing batch ${batchNum}, ${batch.length} leads`);

    const uploadResponse = await fetch(`${SMARTLEAD_BASE_URL}/campaigns/${campaignId}/leads?api_key=${SMARTLEAD_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_list: batch })
    });

    const uploadData = await uploadResponse.json();
    console.log('SmartLead response:', JSON.stringify(uploadData));

    if (!uploadResponse.ok) {
      newErrors.push(`Batch ${batchNum}: HTTP ${uploadResponse.status}`);
    } else if (uploadData.ok || uploadData.upload_count !== undefined) {
      newUploaded += uploadData.upload_count || 0;
      newDuplicates += uploadData.duplicate_count || 0;
      newInvalid += uploadData.invalid_email_count || 0;
      newAlreadyInCampaign += uploadData.already_in_campaign_count || 0;
    } else {
      newErrors.push(`Batch ${batchNum}: ${uploadData.error || uploadData.message || 'Unknown error'}`);
    }
  } catch (e) {
    console.error('Batch upload error:', e);
    newErrors.push(`Batch ${batchNum}: ${e.message}`);
  }

  // Update job with progress
  const progress = Math.floor(((startIdx + batch.length) / leads.length) * 100);
  const nextBatchIndex = batchIndex + 1;
  const hasMore = (nextBatchIndex * batchSize) < leads.length;

  await prisma.backgroundJob.update({
    where: { id: jobId },
    data: {
      progress,
      input: {
        ...job.input,
        batchIndex: nextBatchIndex,
        uploaded: newUploaded,
        duplicates: newDuplicates,
        invalid: newInvalid,
        alreadyInCampaign: newAlreadyInCampaign,
        errors: newErrors
      }
    }
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      status: 'running',
      jobId,
      progress,
      batchCompleted: batchNum,
      totalBatches: Math.ceil(leads.length / batchSize),
      uploaded: newUploaded,
      hasMore
    })
  };
}
