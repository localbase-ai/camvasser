/**
 * Geocode projects missing coordinates using the free US Census geocoder.
 *
 * Usage:
 *   node scripts/geocode-projects.js --tenant budroofing --dry-run
 *   node scripts/geocode-projects.js --tenant budroofing
 *   node scripts/geocode-projects.js --tenant budroofing --limit=100
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const sleep = ms => new Promise(r => setTimeout(r, ms));

const BATCH_SIZE = 50; // Census geocoder is generous but let's be polite

function parseArgs() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') { args.dryRun = true; continue; }
    if (argv[i].startsWith('--')) {
      const [key, val] = argv[i].replace('--', '').split('=');
      args[key] = val || true;
    }
  }
  return args;
}

async function geocode(street, city, state, zip) {
  const params = new URLSearchParams({
    street,
    city: city || '',
    state: state || '',
    zip: zip || '',
    benchmark: 'Public_AR_Current',
    format: 'json'
  });
  const url = `https://geocoding.geo.census.gov/geocoder/locations/address?${params}`;
  const resp = await fetch(url);
  const data = await resp.json();

  const match = data?.result?.addressMatches?.[0];
  if (match) {
    return { lat: parseFloat(match.coordinates.y), lon: parseFloat(match.coordinates.x) };
  }
  return null;
}

async function main() {
  const args = parseArgs();
  const { tenant, dryRun, limit } = args;

  if (!tenant) {
    console.error('Error: --tenant is required');
    process.exit(1);
  }

  if (dryRun) console.log('=== DRY RUN ===\n');

  const where = { tenant, coordinates: { equals: Prisma.DbNull } };
  const total = await prisma.project.count({ where });
  console.log(`${total} projects need geocoding for tenant "${tenant}"`);

  const limitNum = limit ? parseInt(limit) : undefined;
  const projects = await prisma.project.findMany({
    where,
    select: { id: true, address: true, city: true, state: true, postalCode: true },
    take: limitNum
  });

  console.log(`Processing ${projects.length}...\n`);

  let success = 0;
  let failed = 0;
  let noAddress = 0;

  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    if (!p.address) { noAddress++; continue; }

    try {
      const coords = await geocode(p.address, p.city, p.state, p.postalCode);

      if (coords) {
        if (!dryRun) {
          await prisma.project.update({
            where: { id: p.id },
            data: { coordinates: coords }
          });
        }
        success++;
      } else {
        failed++;
        if (failed <= 10) {
          console.log(`  ✗ ${p.address}, ${p.city || ''} ${p.state || ''}`);
        }
      }

      if ((i + 1) % 100 === 0 || i === projects.length - 1) {
        process.stdout.write(`\r  ${i + 1}/${projects.length} — ${success} geocoded, ${failed} failed, ${noAddress} no address`);
      }

      // Rate limit: batch pause every BATCH_SIZE requests
      if ((i + 1) % BATCH_SIZE === 0) await sleep(1100);

    } catch (err) {
      failed++;
      console.error(`\n  ERROR: ${p.address} — ${err.message}`);
    }
  }

  console.log(`\n\n${'='.repeat(40)}`);
  console.log(`Geocoded:    ${success}`);
  console.log(`Failed:      ${failed}`);
  console.log(`No address:  ${noAddress}`);
  if (dryRun) console.log('\n=== DRY RUN — run without --dry-run to apply ===');

  await prisma.$disconnect();
}

main().catch(console.error);
