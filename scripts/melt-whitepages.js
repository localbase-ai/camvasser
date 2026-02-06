import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();
const WHITEPAGES_API_KEY = process.env.WHITEPAGES_API_KEY;
const BASE_URL = 'https://api.whitepages.com';
const TENANT = 'budroofing';

const DRY_RUN = process.argv.includes('--dry-run');

async function lookupProperty(street, city, state) {
  const params = new URLSearchParams();
  if (street) params.append('street', street);
  if (city) params.append('city', city);
  if (state) params.append('state_code', state);

  const url = BASE_URL + '/v2/property/?' + params;
  const response = await fetch(url, {
    headers: { 'X-Api-Key': WHITEPAGES_API_KEY }
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error('API error ' + response.status + ': ' + err);
  }
  return response.json();
}

async function main() {
  console.log('='.repeat(70));
  console.log('Melt Tag - White Pages Lookup');
  console.log('='.repeat(70));
  if (DRY_RUN) console.log('DRY RUN - no changes will be made\n');

  // Find projects with 'melt' tag that have no prospects
  const projects = await prisma.$queryRaw`
    SELECT p.id, p.address, p.city, p.state
    FROM "Project" p
    WHERE p.tags::text ILIKE '%melt%'
      AND NOT EXISTS (
        SELECT 1 FROM "Prospect" pr WHERE pr."projectId" = p.id
      )
  `;

  console.log('Found ' + projects.length + ' projects without contacts\n');

  let created = 0;
  let errors = 0;
  let noData = 0;

  for (let i = 0; i < projects.length; i++) {
    const proj = projects[i];
    const progress = '[' + (i + 1) + '/' + projects.length + ']';

    console.log(progress + ' ' + proj.address + ', ' + proj.city);

    try {
      const wpData = await lookupProperty(proj.address, proj.city, proj.state || 'KS');

      const owner = wpData.result?.ownership_info?.person_owners?.[0];
      const residents = wpData.result?.residents || [];

      if (!owner && residents.length === 0) {
        console.log('   No owner/resident data');
        noData++;
        continue;
      }

      // Use owner, or first resident if no owner
      const person = owner || residents[0];

      const phones = (person.phones || []).map(p => ({
        phone_number: p.number?.replace(/^1/, '').replace(/(\d{3})(\d{3})(\d{4})/, '$1$2$3'),
        line_type: p.type?.toLowerCase() || 'unknown',
        source: 'whitepages'
      }));

      const emails = (person.emails || []).map(e => e.email);

      console.log('   ' + person.name + ' | ' + phones.length + ' phones | ' + emails.length + ' emails');

      if (!DRY_RUN) {
        await prisma.prospect.create({
          data: {
            id: randomUUID(),
            projectId: proj.id,
            name: person.name || '---',
            phones: phones,
            emails: emails,
            isHomeowner: !!owner,
            isCurrentResident: residents.some(r => r.name === person.name),
            lookupAddress: proj.address + ', ' + proj.city + ', ' + (proj.state || 'KS'),
            tenant: TENANT,
            enrichedAt: new Date(),
            campaign: 'melt-2025'
          }
        });
      }
      created++;

      // Rate limit
      await new Promise(r => setTimeout(r, 300));

    } catch (err) {
      console.log('   Error: ' + err.message);
      errors++;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log('Prospects created: ' + created);
  console.log('No data found: ' + noData);
  console.log('Errors: ' + errors);

  if (DRY_RUN) {
    console.log('\nThis was a DRY RUN. Run without --dry-run to create prospects.');
  }

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
