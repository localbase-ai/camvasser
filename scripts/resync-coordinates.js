/**
 * Re-sync coordinates from CompanyCam for projects that don't have them
 * This pulls the coordinates directly from CompanyCam API (more reliable than geocoding)
 *
 * Usage: COMPANYCAM_API_TOKEN=xxx node scripts/resync-coordinates.js
 */

import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();
const API_TOKEN = process.env.COMPANYCAM_API_TOKEN;

// Rate limit to avoid API throttling
const RATE_LIMIT_MS = 200;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchProjectFromCompanyCam(projectId) {
  try {
    const response = await axios.get(
      `https://api.companycam.com/v2/projects/${projectId}`,
      {
        headers: {
          'Authorization': `Bearer ${API_TOKEN}`,
          'Accept': 'application/json'
        },
        timeout: 10000
      }
    );
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      return null; // Project deleted or not found
    }
    throw error;
  }
}

async function main() {
  if (!API_TOKEN) {
    console.error('Error: COMPANYCAM_API_TOKEN environment variable is required');
    console.error('Usage: COMPANYCAM_API_TOKEN=xxx node scripts/resync-coordinates.js');
    process.exit(1);
  }

  console.log('Fetching projects without coordinates...\n');

  // Find all projects without coordinates using raw query (JSON null check)
  const projects = await prisma.$queryRaw`
    SELECT id, address, city, state
    FROM "Project"
    WHERE coordinates IS NULL
  `;

  console.log(`Found ${projects.length} projects without coordinates\n`);

  if (projects.length === 0) {
    console.log('All projects already have coordinates!');
    return;
  }

  let updated = 0;
  let notFound = 0;
  let noCoords = 0;
  let errors = 0;

  for (let i = 0; i < projects.length; i++) {
    const project = projects[i];
    const addressStr = [project.address, project.city, project.state].filter(Boolean).join(', ') || project.id;

    console.log(`[${i + 1}/${projects.length}] Fetching: ${addressStr}`);

    try {
      const ccProject = await fetchProjectFromCompanyCam(project.id);

      if (!ccProject) {
        console.log(`  ✗ Project not found in CompanyCam`);
        notFound++;
        continue;
      }

      if (ccProject.coordinates?.lat && ccProject.coordinates?.lon) {
        await prisma.project.update({
          where: { id: project.id },
          data: {
            coordinates: {
              lat: ccProject.coordinates.lat,
              lon: ccProject.coordinates.lon
            }
          }
        });
        console.log(`  ✓ Updated: ${ccProject.coordinates.lat}, ${ccProject.coordinates.lon}`);
        updated++;
      } else {
        console.log(`  - No coordinates in CompanyCam`);
        noCoords++;
      }
    } catch (error) {
      console.log(`  ✗ Error: ${error.message}`);
      errors++;
    }

    // Rate limiting
    if (i < projects.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  console.log('\n========================================');
  console.log('Sync complete!');
  console.log(`  Updated from CompanyCam: ${updated}`);
  console.log(`  Not found in CompanyCam: ${notFound}`);
  console.log(`  No coords in CompanyCam: ${noCoords}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Total processed: ${projects.length}`);

  if (noCoords > 0) {
    console.log(`\nNote: ${noCoords} projects have no coordinates in CompanyCam.`);
    console.log('Run "node scripts/geocode-addresses.js" to geocode those addresses.');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
