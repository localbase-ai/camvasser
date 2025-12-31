// Test WhitePages API with a few records
// Usage: node scripts/test-whitepages.js
// Docs: https://api.whitepages.com/docs/llms.txt

import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();
const API_KEY = process.env.WHITEPAGES_API_KEY;
const TENANT = 'budroofing';

async function testPropertyLookup(address, city, state, zip) {
  const params = new URLSearchParams({
    street: address,
    city: city,
    state_code: state,
    zipcode: zip
  });

  const url = `https://api.whitepages.com/v2/property/?${params}`;
  console.log(`\nTesting: ${address}, ${city}, ${state}`);

  try {
    const response = await fetch(url, {
      headers: { 'X-Api-Key': API_KEY }
    });
    const data = await response.json();

    if (data.message) {
      console.log('  API Error:', data.message);
      return null;
    }

    if (data.result) {
      const result = data.result;
      console.log('  Property ID:', result.property_id);

      // Check residents
      const residents = result.residents || [];
      console.log('  Residents:', residents.length);

      residents.slice(0, 2).forEach((r, i) => {
        console.log(`  [${i}] Name: ${r.name}`);
        console.log(`      Phones: ${r.phones?.length || 0}`, r.phones?.map(p => p.number) || []);
        console.log(`      Emails: ${r.emails?.length || 0}`, r.emails?.map(e => e.email) || []);
      });

      // Check owners
      const owners = result.ownership_info?.person_owners || [];
      if (owners.length > 0) {
        console.log('  Owners:', owners.length);
        owners.slice(0, 2).forEach((o, i) => {
          console.log(`  [owner ${i}] Name: ${o.name}`);
          console.log(`      Emails: ${o.emails?.length || 0}`, o.emails?.map(e => e.email) || []);
        });
      }
    } else {
      console.log('  No result found');
    }

    return data;
  } catch (err) {
    console.log('  Fetch error:', err.message, err.cause || '');
    return null;
  }
}

async function main() {
  console.log('WhitePages Pro API Test');
  console.log('=======================');
  console.log('API Key:', API_KEY ? `${API_KEY.substring(0, 8)}...` : 'NOT SET');

  if (!API_KEY) {
    console.error('No API key found. Set WHITEPAGES_API_KEY in .env');
    process.exit(1);
  }

  // Get 10 prospects from the Clay import that have phones but no emails
  const prospects = await prisma.prospect.findMany({
    where: {
      tenant: TENANT,
      campaign: '66206 List'
    },
    include: {
      project: true
    },
    take: 10
  });

  console.log(`\nFound ${prospects.length} prospects to test\n`);

  let successCount = 0;
  let emailsFound = 0;

  for (const prospect of prospects) {
    if (!prospect.project?.address) {
      console.log(`Skipping ${prospect.name}: no address`);
      continue;
    }

    const result = await testPropertyLookup(
      prospect.project.address,
      prospect.project.city || 'Leawood',
      prospect.project.state || 'KS',
      prospect.project.postalCode || '66206'
    );

    if (result && result.result) {
      successCount++;
      const residents = result.result.residents || [];
      const owners = result.result.ownership_info?.person_owners || [];
      const allEmails = [...residents, ...owners].flatMap(p => p.emails || []);
      emailsFound += allEmails.length;
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n=======================');
  console.log('Test Summary');
  console.log(`  Successful lookups: ${successCount}/${prospects.length}`);
  console.log(`  Emails found: ${emailsFound}`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
