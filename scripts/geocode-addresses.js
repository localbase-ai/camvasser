/**
 * Geocode addresses that don't have coordinates
 * Uses Nominatim (OpenStreetMap) - free, no API key required
 * Rate limited to 1 request per second to respect Nominatim usage policy
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Nominatim rate limit: 1 request per second
const RATE_LIMIT_MS = 1100;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function geocodeAddress(address, city, state, postalCode) {
  const parts = [address, city, state, postalCode].filter(Boolean);
  if (parts.length === 0) return null;

  const query = encodeURIComponent(parts.join(', '));

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`,
      {
        headers: {
          'User-Agent': 'Camvasser Admin (geocoding script)'
        }
      }
    );

    if (!response.ok) {
      console.error(`  Geocoding failed: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon)
      };
    }

    return null;
  } catch (error) {
    console.error(`  Geocoding error: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('Fetching addresses without coordinates...\n');

  // Find all projects without coordinates using raw query (JSON null check)
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

    // Rate limiting - wait before next request
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
