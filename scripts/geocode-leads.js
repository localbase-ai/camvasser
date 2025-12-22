/**
 * Geocode lead addresses using Mapbox
 *
 * Usage: node scripts/geocode-leads.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN;

// Mapbox allows 600 requests/minute
const RATE_LIMIT_MS = 100;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function geocodeAddress(address) {
  if (!address) return null;

  const query = encodeURIComponent(address);

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

  console.log('Fetching leads without coordinates...\n');

  // Find all leads without coordinates
  const leads = await prisma.$queryRaw`
    SELECT id, address
    FROM "User"
    WHERE coordinates IS NULL AND address IS NOT NULL
  `;

  console.log(`Found ${leads.length} leads to geocode\n`);

  if (leads.length === 0) {
    console.log('All leads already have coordinates!');
    return;
  }

  let geocoded = 0;
  let failed = 0;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];

    console.log(`[${i + 1}/${leads.length}] Geocoding: ${lead.address}`);

    const coords = await geocodeAddress(lead.address);

    if (coords) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { coordinates: coords }
      });
      console.log(`  ✓ Found: ${coords.lat}, ${coords.lon}`);
      geocoded++;
    } else {
      console.log(`  ✗ Not found`);
      failed++;
    }

    // Rate limiting
    if (i < leads.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  console.log('\n========================================');
  console.log(`Geocoding complete!`);
  console.log(`  Geocoded: ${geocoded}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total: ${leads.length}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
