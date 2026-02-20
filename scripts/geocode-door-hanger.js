/**
 * Geocode proj_local_ projects using Mapbox Geocoding API
 * Overwrites any bad coordinates from previous attempts
 */

import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();
const TOKEN = process.env.MAPBOX_TOKEN;

if (!TOKEN) {
  console.error('Missing MAPBOX_TOKEN');
  process.exit(1);
}

async function geocode(address, city, state, postalCode) {
  const query = encodeURIComponent([address, city, state, postalCode].filter(Boolean).join(', '));
  try {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${TOKEN}&limit=1&country=US`
    );
    const data = await res.json();
    if (data.features?.length > 0) {
      const [lon, lat] = data.features[0].center;
      return { lat, lon };
    }
    console.log(`  ✗ No results`);
    return null;
  } catch (e) {
    console.error(`  Error: ${e.message}`);
    return null;
  }
}

async function main() {
  const projects = await prisma.$queryRaw`
    SELECT id, address, city, state, "postalCode"
    FROM "Project"
    WHERE id LIKE 'proj_local_%'
      AND address IS NOT NULL
  `;

  console.log(`Found ${projects.length} projects to geocode\n`);

  let geocoded = 0, failed = 0;

  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    console.log(`[${i + 1}/${projects.length}] ${p.address}, ${p.city}, ${p.state}`);

    const coords = await geocode(p.address, p.city, p.state, p.postalCode);

    if (coords) {
      await prisma.project.update({ where: { id: p.id }, data: { coordinates: coords } });
      console.log(`  → ${coords.lat}, ${coords.lon}`);
      geocoded++;
    } else {
      failed++;
    }
  }

  console.log(`\nDone: ${geocoded} geocoded, ${failed} failed out of ${projects.length}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
