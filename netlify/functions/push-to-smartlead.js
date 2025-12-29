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

    // Build query matching get-prospects logic
    const where = {};

    if (tenant) {
      where.tenant = tenant;
    }

    // Tag filter - find projects with matching tag, then filter prospects
    let projectIds = null;
    if (tag) {
      const projectsWithTag = await prisma.$queryRaw`
        SELECT id FROM "Project"
        WHERE tags::text ILIKE ${`%"value":"${tag}"%`}
        ${tenant ? prisma.$queryRaw`AND tenant = ${tenant}` : prisma.$queryRaw``}
      `;
      projectIds = projectsWithTag.map(p => p.id);
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
      const searchLower = search.toLowerCase();
      where.AND = where.AND || [];
      where.AND.push({
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { emails: { array_contains: searchLower } }
        ]
      });
    }

    // Fetch prospects with emails
    const prospects = await prisma.prospect.findMany({
      where,
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

    if (leadsToUpload.length === 0) {
      return {
        statusCode: 400,
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
    if (!createData.ok || !createData.id) {
      console.error('SmartLead campaign creation failed:', createData);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to create SmartLead campaign', details: createData })
      };
    }

    const campaignId = createData.id;

    // Upload leads in batches of 100
    const batchSize = 100;
    let totalUploaded = 0;
    let duplicates = 0;
    let invalid = 0;

    for (let i = 0; i < leadsToUpload.length; i += batchSize) {
      const batch = leadsToUpload.slice(i, i + batchSize);

      const uploadResponse = await fetch(`${SMARTLEAD_BASE_URL}/campaigns/${campaignId}/leads?api_key=${SMARTLEAD_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_list: batch })
      });

      const uploadData = await uploadResponse.json();
      if (uploadData.ok) {
        totalUploaded += uploadData.upload_count || 0;
        duplicates += uploadData.duplicate_count || 0;
        invalid += uploadData.invalid_email_count || 0;
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        campaignId,
        campaignName,
        totalContacts: leadsToUpload.length,
        uploaded: totalUploaded,
        duplicates,
        invalid,
        smartleadUrl: `https://app.smartlead.ai/app/email-campaign/${campaignId}/leads`
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
