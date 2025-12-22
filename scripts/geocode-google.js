/**
 * Geocode addresses using Google Maps Geocoding API
 * Faster than Nominatim, uses the project's existing Google Maps API key
 *
 * Usage: node scripts/geocode-google.js [--limit N]
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// Google allows 50 QPS, but let's be conservative
const RATE_LIMIT_MS = 100;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function geocodeAddress(address, city, state, postalCode) {
  const parts = [address, city, state, postalCode].filter(Boolean);
  if (parts.length === 0) return null;

  const query = encodeURIComponent(parts.join(', '));

  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${API_KEY}`
    );

    if (!response.ok) {
      console.error(`  API error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.status === 'OK' && data.results?.[0]?.geometry?.location) {
      const loc = data.results[0].geometry.location;
      return {
        lat: loc.lat,
        lon: loc.lng
      };
    }

    if (data.status === 'ZERO_RESULTS') {
      return null;
    }

    console.error(`  API status: ${data.status}`);
    return null;
  } catch (error) {
    console.error(`  Geocoding error: ${error.message}`);
    return null;
  }
}

async function main() {
  if (!API_KEY) {
    console.error('Error: GOOGLE_MAPS_API_KEY environment variable is required');
    process.exit(1);
  }

  // Check for --limit argument
  const limitArg = process.argv.find(arg => arg.startsWith('--limit'));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] || process.argv[process.argv.indexOf('--limit') + 1]) : null;

  console.log('Fetching addresses without coordinates...\n');

  // Find all projects without coordinates
  let projects;
  if (limit) {
    projects = await prisma.$queryRaw`
      SELECT id, address, city, state, "postalCode"
      FROM "Project"
      WHERE coordinates IS NULL AND address IS NOT NULL
      LIMIT ${limit}
    `;
  } else {
    projects = await prisma.$queryRaw`
      SELECT id, address, city, state, "postalCode"
      FROM "Project"
      WHERE coordinates IS NULL AND address IS NOT NULL
    `;
  }

  console.log(`Found ${projects.length} addresses to geocode\n`);

  if (projects.length === 0) {
    console.log('All addresses already have coordinates!');
    return;
  }

  let geocoded = 0;
  let failed = 0;

  for (let i = 0; i < projects.length; i++) {
    const project = projects[i];
    const addressStr = [project.address, project.city, project.state].filter(Boolean).join(', ');

    console.log(`[${i + 1}/${projects.length}] Geocoding: ${addressStr}`);

    const coords = await geocodeAddress(
      project.address,
      project.city,
      project.state,
      project.postalCode
    );

    if (coords) {
      await prisma.project.update({
        where: { id: project.id },
        data: { coordinates: coords }
      });
      console.log(`  ✓ Found: ${coords.lat}, ${coords.lon}`);
      geocoded++;
    } else {
      console.log(`  ✗ Not found`);
      failed++;
    }

    // Rate limiting
    if (i < projects.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  console.log('\n========================================');
  console.log(`Geocoding complete!`);
  console.log(`  Geocoded: ${geocoded}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total: ${projects.length}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
