/**
 * Import parcels from ArcGIS that fall inside a storm corridor.
 * Creates Projects, enriches via Whitepages, creates Prospects, adds to call list.
 *
 * Usage: node scripts/import-parcel-corridor.js <storm-report-id> <call-list-id> [--dry-run] [--limit=N]
 * Example: node scripts/import-parcel-corridor.js kc-hail-2026-03-10 hprgzse44fj3ykvmzkct1ayg --limit=100
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { randomUUID } from 'crypto';

const dbUrl = new URL(process.env.DATABASE_URL);
dbUrl.searchParams.set('connection_limit', '5');
dbUrl.searchParams.set('pool_timeout', '30');
const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl.toString() } }
});
const WHITEPAGES_API_KEY = process.env.WHITEPAGES_API_KEY;
const ARCGIS_URL = 'https://services2.arcgis.com/ji2hJlB9RmHn0um4/arcgis/rest/services/Platte_City_MO_Property_view/FeatureServer/1/query';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '0', 10);
const positional = args.filter(a => !a.startsWith('--'));
const stormId = positional[0];
const callListId = positional[1];

function computeCentroid(rings) {
  const coords = rings[0];
  let latSum = 0, lonSum = 0;
  const n = coords.length - 1;
  for (let i = 0; i < n; i++) {
    lonSum += coords[i][0];
    latSum += coords[i][1];
  }
  return { lat: latSum / n, lon: lonSum / n };
}

async function fetchParcelsInCorridor(corridorCoords, limit) {
  const geometry = JSON.stringify({ rings: [corridorCoords] });
  const params = new URLSearchParams({
    geometry,
    geometryType: 'esriGeometryPolygon',
    spatialRel: 'esriSpatialRelIntersects',
    inSR: '4326',
    outSR: '4326',
    outFields: '*',
    returnGeometry: 'true',
    resultRecordCount: String(limit || 2000),
    f: 'json'
  });

  const res = await fetch(`${ARCGIS_URL}?${params}`);
  if (!res.ok) throw new Error(`ArcGIS error: ${res.status}`);
  const data = await res.json();
  return data.features || [];
}

async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'camvasser-parcel-import/1.0' }
  });
  if (!res.ok) return null;
  return res.json();
}

async function whitepagesLookup(street, city, state) {
  const params = new URLSearchParams();
  if (street) params.append('street', street);
  if (city) params.append('city', city);
  if (state) params.append('state_code', state);

  const res = await fetch(`https://api.whitepages.com/v2/property/?${params}`, {
    headers: { 'X-Api-Key': WHITEPAGES_API_KEY }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whitepages ${res.status}: ${err}`);
  }
  return res.json();
}

async function main() {
  if (!stormId || !callListId) {
    console.error('Usage: node scripts/import-parcel-corridor.js <storm-report-id> <call-list-id> [--dry-run] [--limit=N]');
    process.exit(1);
  }

  if (!WHITEPAGES_API_KEY) {
    console.error('WHITEPAGES_API_KEY not set in .env');
    process.exit(1);
  }

  // Load storm report
  const storm = await prisma.stormReport.findUnique({ where: { id: stormId } });
  if (!storm) { console.error(`Storm not found: ${stormId}`); process.exit(1); }

  // Verify call list
  const callList = await prisma.callList.findUnique({ where: { id: callListId } });
  if (!callList) { console.error(`Call list not found: ${callListId}`); process.exit(1); }

  // Get existing call list item count for position
  const existingItems = await prisma.callListItem.count({ where: { callListId } });

  // Extract corridor polygon
  const corridorFeature = storm.data.features.find(f => f.properties?.type === 'corridor');
  if (!corridorFeature) { console.error('No corridor polygon in storm report'); process.exit(1); }

  const tagValue = storm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  const stormTag = {
    id: `storm_${stormId}`,
    value: tagValue,
    tagType: 'storm',
    display_value: storm.name.replace(/—/g, '-').replace(/KC Metro /i, '')
  };

  // Match existing tag format if already in use
  const existingTagged = await prisma.$queryRaw`
    SELECT tags FROM "Project" WHERE tags::text ILIKE ${'%' + stormTag.id + '%'} LIMIT 1
  `;
  if (existingTagged?.[0]?.tags?.[0]) {
    stormTag.display_value = existingTagged[0].tags[0].display_value;
    stormTag.value = existingTagged[0].tags[0].value;
  }

  console.log('='.repeat(70));
  console.log(`Parcel Corridor Import`);
  console.log(`Storm: ${storm.name}`);
  console.log(`Call list: ${callList.name} (${existingItems} existing items)`);
  console.log(`Tag: ${stormTag.display_value} (${stormTag.value})`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  if (LIMIT) console.log(`Limit: ${LIMIT}`);
  console.log('='.repeat(70));

  // Fetch parcels from ArcGIS
  console.log('\n📦 Fetching parcels from ArcGIS corridor...');
  const features = await fetchParcelsInCorridor(
    corridorFeature.geometry.coordinates[0],
    LIMIT || 2000
  );
  console.log(`   Got ${features.length} parcels`);

  // Get existing project addresses to skip duplicates
  const existingProjects = await prisma.project.findMany({
    where: { tenant: callList.tenantId },
    select: { address: true, city: true }
  });
  const existingAddresses = new Set(
    existingProjects.map(p => `${p.address}|${p.city}`.toLowerCase())
  );

  let projectsCreated = 0;
  let prospectsCreated = 0;
  let callListItemsAdded = 0;
  let skippedDupes = 0;
  let noAddress = 0;
  let wpFailed = 0;
  let position = existingItems;

  for (let i = 0; i < features.length; i++) {
    const feature = features[i];
    const centroid = computeCentroid(feature.geometry.rings);
    const parcelId = `${feature.attributes.TRC}-${feature.attributes.SUBC}-${feature.attributes.SEC}-${feature.attributes.BNUM}-${feature.attributes.PNUM}`;

    // Reverse geocode
    const geo = await reverseGeocode(centroid.lat, centroid.lon);
    // Rate limit Nominatim
    await new Promise(r => setTimeout(r, 1100));

    if (!geo || geo.error) {
      noAddress++;
      continue;
    }

    const addr = geo.address || {};
    const street = `${addr.house_number || ''} ${addr.road || ''}`.trim();
    const city = addr.city || addr.town || addr.village || '';
    const state = 'MO';
    const zip = addr.postcode || '';

    if (!street) {
      noAddress++;
      continue;
    }

    // Check for duplicate
    const key = `${street}|${city}`.toLowerCase();
    if (existingAddresses.has(key)) {
      skippedDupes++;
      continue;
    }
    existingAddresses.add(key);

    console.log(`\n[${i + 1}/${features.length}] 📍 ${street}, ${city}, ${state} ${zip}`);

    // Whitepages lookup
    let owner = null;
    let residents = [];
    try {
      const wp = await whitepagesLookup(street, city, state);
      owner = wp.result?.ownership_info?.person_owners?.[0] || null;
      residents = wp.result?.residents || [];
    } catch (err) {
      console.log(`   ✗ Whitepages: ${err.message}`);
      wpFailed++;
    }

    const people = owner ? [owner, ...residents.filter(r => r.name !== owner.name)] : residents;

    if (!people.length) {
      console.log(`   ⚠ No contacts found, creating project only`);
    }

    if (DRY_RUN) {
      people.forEach(p => console.log(`   ${p === owner ? '👤' : '👥'} ${p.name}`));
      projectsCreated++;
      prospectsCreated += people.length;
      callListItemsAdded += people.length;
      continue;
    }

    // Create Project
    const projectId = `parcel_${parcelId}`;
    await prisma.project.upsert({
      where: { id: projectId },
      create: {
        id: projectId,
        tenant: callList.tenantId,
        address: street,
        city,
        state,
        postalCode: zip,
        coordinates: { lat: centroid.lat, lon: centroid.lon },
        tags: [stormTag],
        status: 'active',
        name: street,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      update: {}
    });
    projectsCreated++;

    // Create Prospects + CallListItems
    for (const person of people) {
      const phones = (person.phones || []).map(p => ({
        phone_number: p.number?.replace(/^1/, '').replace(/(\d{3})(\d{3})(\d{4})/, '$1$2$3'),
        line_type: p.type?.toLowerCase() || 'unknown',
        source: 'whitepages'
      }));

      const emails = (person.emails || []).map(e => e.email || e);
      const isOwner = person === owner;

      const prospectId = randomUUID();
      await prisma.prospect.create({
        data: {
          id: prospectId,
          name: person.name || '---',
          whitepagesId: person.id || null,
          projectId,
          phones,
          emails,
          currentAddresses: (person.current_addresses || []).map(a => ({ id: a.id, address: a.address })),
          isHomeowner: isOwner,
          isCurrentResident: true,
          lookupAddress: `${street}, ${city}, ${state}`,
          tenant: callList.tenantId,
          enrichedAt: new Date(),
          campaign: `storm:${stormId}`
        }
      });
      prospectsCreated++;

      // Add to call list
      position++;
      await prisma.callListItem.create({
        data: {
          id: createId(),
          callListId,
          contactId: prospectId,
          position
        }
      });
      callListItemsAdded++;

      console.log(`   ${isOwner ? '👤' : '👥'} ${person.name} — ${phones.map(p => p.phone_number).join(', ') || 'no phone'}`);
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`Projects created: ${projectsCreated}`);
  console.log(`Prospects created: ${prospectsCreated}`);
  console.log(`Call list items added: ${callListItemsAdded}`);
  console.log(`Skipped (already existed): ${skippedDupes}`);
  console.log(`No address resolved: ${noAddress}`);
  console.log(`Whitepages failures: ${wpFailed}`);
  if (DRY_RUN) console.log('\nDRY RUN — no changes made.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
