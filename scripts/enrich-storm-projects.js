/**
 * Enrich storm-tagged projects that have no contacts.
 * Looks up each address in Whitepages, creates Prospect records.
 *
 * Usage: node scripts/enrich-storm-projects.js <storm-report-id> [--dry-run] [--limit=N]
 * Example: node scripts/enrich-storm-projects.js kc-hail-2026-03-10 --dry-run
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();
const WHITEPAGES_API_KEY = process.env.WHITEPAGES_API_KEY;
const BASE_URL = 'https://api.whitepages.com';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '0', 10);
const stormId = args.find(a => !a.startsWith('--'));

const STATE_ABBREVS = {
  'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
  'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
  'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA','kansas':'KS',
  'kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD','massachusetts':'MA',
  'michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO','montana':'MT',
  'nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ','new mexico':'NM',
  'new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH','oklahoma':'OK',
  'oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
  'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT',
  'virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY'
};

function normalizeState(state) {
  if (!state) return null;
  const s = state.trim();
  if (s.length === 2) return s.toUpperCase();
  return STATE_ABBREVS[s.toLowerCase()] || s;
}

function normalizeCity(city) {
  if (!city) return null;
  // KCMO → Kansas City
  const aliases = { 'kcmo': 'Kansas City' };
  return aliases[city.trim().toLowerCase()] || city.trim();
}

async function lookupProperty(street, city, state) {
  const params = new URLSearchParams();
  if (street) params.append('street', street);
  if (city) params.append('city', normalizeCity(city));
  if (state) params.append('state_code', normalizeState(state));

  const url = `${BASE_URL}/v2/property/?${params}`;
  const response = await fetch(url, {
    headers: { 'X-Api-Key': WHITEPAGES_API_KEY }
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error ${response.status}: ${err}`);
  }
  return response.json();
}

async function main() {
  if (!stormId) {
    console.error('Usage: node scripts/enrich-storm-projects.js <storm-report-id> [--dry-run] [--limit=N]');
    process.exit(1);
  }

  if (!WHITEPAGES_API_KEY) {
    console.error('WHITEPAGES_API_KEY not set in .env');
    process.exit(1);
  }

  // Find the storm tag value
  const storm = await prisma.stormReport.findUnique({ where: { id: stormId } });
  if (!storm) {
    console.error(`Storm report not found: ${stormId}`);
    process.exit(1);
  }

  const tagValue = storm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');

  console.log('='.repeat(70));
  console.log(`Storm Enrichment: ${storm.name}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  if (LIMIT) console.log(`Limit: ${LIMIT}`);
  console.log('='.repeat(70));

  // Get storm-tagged projects that have NO prospects
  const projects = await prisma.project.findMany({
    where: {
      ProjectLabel: { some: { value: tagValue } },
      Prospect: { none: {} }
    },
    select: {
      id: true,
      address: true,
      city: true,
      state: true,
      postalCode: true,
      tenant: true
    }
  });

  console.log(`\nProjects tagged "${tagValue}" with no contacts: ${projects.length}`);

  if (!projects.length) {
    console.log('Nothing to enrich.');
    return;
  }

  let apiCalls = 0;
  let created = 0;
  let failed = 0;

  for (const project of projects) {
    if (LIMIT && apiCalls >= LIMIT) {
      console.log(`\nReached limit of ${LIMIT}, stopping.`);
      break;
    }

    if (!project.address) {
      console.log(`\n  [${project.id}] No address, skipping.`);
      continue;
    }

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`📍 ${project.address}, ${project.city}, ${project.state}`);

    let wpData;
    try {
      wpData = await lookupProperty(project.address, project.city, project.state);
      apiCalls++;
    } catch (err) {
      apiCalls++;
      console.log(`  ✗ Whitepages error: ${err.message}`);
      failed++;
      continue;
    }

    const owner = wpData.result?.ownership_info?.person_owners?.[0];
    const residents = wpData.result?.residents || [];
    const people = owner ? [owner, ...residents.filter(r => r.name !== owner.name)] : residents;

    if (!people.length) {
      console.log(`  ⚠ No owner/resident data found`);
      continue;
    }

    for (const person of people) {
      const phones = (person.phones || []).map(p => ({
        phone_number: p.number?.replace(/^1/, '').replace(/(\d{3})(\d{3})(\d{4})/, '$1$2$3'),
        line_type: p.type?.toLowerCase() || 'unknown',
        source: 'whitepages'
      }));

      const emails = (person.emails || []).map(e => e.email || e);

      const isOwner = person === owner;
      const addresses = (person.current_addresses || []).map(a => ({
        id: a.id,
        address: a.address
      }));

      console.log(`  ${isOwner ? '👤 Owner' : '👥 Resident'}: ${person.name}`);
      console.log(`    Phones: ${phones.map(p => p.phone_number).join(', ') || 'none'}`);
      console.log(`    Emails: ${emails.join(', ') || 'none'}`);

      if (DRY_RUN) continue;

      await prisma.prospect.create({
        data: {
          id: randomUUID(),
          name: person.name || '---',
          whitepagesId: person.id || null,
          projectId: project.id,
          phones,
          emails,
          currentAddresses: addresses,
          isHomeowner: isOwner,
          isCurrentResident: true,
          lookupAddress: `${project.address}, ${project.city}, ${project.state}`,
          tenant: project.tenant,
          enrichedAt: new Date(),
          campaign: `storm:${stormId}`
        }
      });
      created++;
      console.log(`    ✓ Created prospect`);
    }
  }

  // Update project enrichment timestamp
  if (!DRY_RUN && created > 0) {
    const taggedIds = projects.slice(0, LIMIT || projects.length).map(p => p.id);
    await prisma.project.updateMany({
      where: { id: { in: taggedIds } },
      data: { whitepagesEnrichedAt: new Date() }
    });
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`API calls: ${apiCalls}`);
  console.log(`Prospects created: ${created}`);
  console.log(`Failed lookups: ${failed}`);
  if (DRY_RUN) console.log('\nDRY RUN — no changes made.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
