/**
 * Geocode addresses using Mapbox Geocoding API
 * Fallback for addresses that Nominatim couldn't find
 *
 * Usage: node scripts/geocode-mapbox.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;

// Mapbox allows 600 requests/minute, so 100ms between requests is safe
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
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${MAPBOX_TOKEN}&country=US&limit=1`
    );

    if (!response.ok) {
      console.error(`  API error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.features && data.features.length > 0) {
      const [lon, lat] = data.features[0].center;
      return { lat, lon };
    }

    return null;
  } catch (error) {
    console.error(`  Geocoding error: ${error.message}`);
    return null;
  }
}

async function main() {
  if (!MAPBOX_TOKEN) {
    console.error('Error: MAPBOX_TOKEN environment variable is required');
    process.exit(1);
  }

  console.log('Fetching addresses without coordinates...\n');

  // Find all projects still without coordinates
  const projects = await prisma.$queryRaw`
    SELECT id, address, city, state, "postalCode"
    FROM "Project"
    WHERE coordinates IS NULL AND address IS NOT NULL
  `;

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
