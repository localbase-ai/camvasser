// Enrich prospects with WhitePages data (emails, phones)
// POST /.netlify/functions/whitepages-enrich
// Body: { tenant, limit?, campaign? }

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_KEY = process.env.WHITEPAGES_API_KEY;

async function lookupProperty(address, city, state, zip) {
  const params = new URLSearchParams({
    street: address,
    city: city,
    state_code: state,
    zipcode: zip
  });

  const url = `https://api.whitepages.com/v2/property/?${params}`;

  const response = await fetch(url, {
    headers: { 'X-Api-Key': API_KEY }
  });

  return response.json();
}

export async function handler(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  if (!API_KEY) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'WhitePages API key not configured' })
    };
  }

  try {
    const { tenant, limit = 50, campaign } = JSON.parse(event.body || '{}');

    if (!tenant) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Tenant required' })
      };
    }

    // Find prospects that need enrichment (no emails yet)
    const whereClause = {
      tenant,
      emails: null,
      project: { isNot: null }
    };

    if (campaign) {
      whereClause.campaign = campaign;
    }

    const prospects = await prisma.prospect.findMany({
      where: whereClause,
      include: { project: true },
      take: limit
    });

    console.log(`WhitePages enrichment: Found ${prospects.length} prospects to process`);

    let processed = 0;
    let emailsFound = 0;
    let phonesFound = 0;
    let errors = 0;

    for (const prospect of prospects) {
      if (!prospect.project?.address) {
        continue;
      }

      try {
        const result = await lookupProperty(
          prospect.project.address,
          prospect.project.city || '',
          prospect.project.state || 'KS',
          prospect.project.postalCode || ''
        );

        if (result.result) {
          // Combine residents and owners
          const residents = result.result.residents || [];
          const owners = result.result.ownership_info?.person_owners || [];
          const allPeople = [...residents, ...owners];

          // Find matching person by name (fuzzy match)
          const prospectNameLower = prospect.name?.toLowerCase() || '';
          let matchedPerson = allPeople.find(p => {
            const personNameLower = p.name?.toLowerCase() || '';
            // Check if names overlap
            const prospectParts = prospectNameLower.split(' ');
            const personParts = personNameLower.split(' ');
            return prospectParts.some(part => personParts.includes(part) && part.length > 2);
          });

          // If no name match, use first person with data
          if (!matchedPerson && allPeople.length > 0) {
            matchedPerson = allPeople[0];
          }

          if (matchedPerson) {
            const emails = matchedPerson.emails?.map(e => ({
              email_address: e.email,
              source: 'whitepages'
            })) || [];

            const phones = matchedPerson.phones?.map(p => ({
              phone_number: p.number?.replace(/\D/g, ''),
              line_type: p.type?.toLowerCase() || 'unknown',
              source: 'whitepages'
            })) || [];

            // Update prospect
            const updateData = {};

            if (emails.length > 0) {
              updateData.emails = emails;
              emailsFound += emails.length;
            }

            // Merge phones if prospect already has some
            if (phones.length > 0) {
              const existingPhones = prospect.phones || [];
              const existingNumbers = existingPhones.map(p => p.phone_number);
              const newPhones = phones.filter(p => !existingNumbers.includes(p.phone_number));
              if (newPhones.length > 0) {
                updateData.phones = [...existingPhones, ...newPhones];
                phonesFound += newPhones.length;
              }
            }

            if (Object.keys(updateData).length > 0) {
              // Mark as enriched with whitepages prefix
              if (!prospect.whitepagesId?.startsWith('wp_')) {
                updateData.whitepagesId = `wp_${prospect.whitepagesId || prospect.id}`;
              }

              await prisma.prospect.update({
                where: { id: prospect.id },
                data: updateData
              });
            }
          }
        }

        processed++;

        // Rate limit: 500ms between requests
        await new Promise(r => setTimeout(r, 500));

      } catch (err) {
        console.error(`Error enriching prospect ${prospect.id}:`, err.message);
        errors++;
      }
    }

    // Get updated stats
    const enrichedCount = await prisma.prospect.count({
      where: {
        tenant,
        emails: { not: null },
        whitepagesId: { startsWith: 'wp_' }
      }
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        processed,
        emailsFound,
        phonesFound,
        errors,
        enrichedCount
      })
    };

  } catch (error) {
    console.error('WhitePages enrich error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  } finally {
    await prisma.$disconnect();
  }
}
