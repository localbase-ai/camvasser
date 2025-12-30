// Full sync of CompanyCam projects to Camvasser database
// Usage: node scripts/sync-companycam.js [--dry-run] [--since=2024-12-30]
//
// This script:
// 1. Fetches all projects from CompanyCam API
// 2. Syncs each project (upsert) with labels and geocoding
// 3. Optionally filter by updated_at date

import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import 'dotenv/config';

const prisma = new PrismaClient();

const API_TOKEN = process.env.COMPANYCAM_API_TOKEN || process.env.BUDROOFING_COMPANYCAM_TOKEN;
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const TENANT = 'budroofing';

if (!API_TOKEN) {
  console.error('Error: No CompanyCam API token found.');
  process.exit(1);
}

async function fetchAllProjects(sinceDate = null) {
  const projects = [];
  let page = 1;
  const perPage = 100;

  console.log('Fetching projects from CompanyCam...');

  while (true) {
    try {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(perPage),
        sort: 'updated_at',
        direction: 'desc'
      });

      const response = await axios.get(
        `https://api.companycam.com/v2/projects?${params}`,
        {
          headers: {
            'Authorization': `Bearer ${API_TOKEN}`,
            'Accept': 'application/json'
          },
          timeout: 30000
        }
      );

      const pageProjects = response.data || [];

      if (pageProjects.length === 0) break;

      // If filtering by date, stop when we hit older projects
      if (sinceDate) {
        const filteredProjects = pageProjects.filter(p =>
          new Date(p.updated_at) >= sinceDate
        );
        projects.push(...filteredProjects);

        // If we got fewer than requested, we've passed the date threshold
        if (filteredProjects.length < pageProjects.length) {
          break;
        }
      } else {
        projects.push(...pageProjects);
      }

      console.log(`  Page ${page}: ${pageProjects.length} projects (total: ${projects.length})`);

      if (pageProjects.length < perPage) break;

      page++;

      // Rate limit
      await new Promise(r => setTimeout(r, 500));

    } catch (error) {
      if (error.response?.status === 429) {
        console.log('  Rate limited, waiting 30s...');
        await new Promise(r => setTimeout(r, 30000));
        continue;
      }
      throw error;
    }
  }

  return projects;
}

async function fetchProjectLabels(projectId, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(
        `https://api.companycam.com/v2/projects/${projectId}/labels`,
        {
          headers: {
            'Authorization': `Bearer ${API_TOKEN}`,
            'Accept': 'application/json'
          },
          timeout: 10000
        }
      );
      return response.data || [];
    } catch (error) {
      if (error.response?.status === 404) return [];
      if (error.response?.status === 429 && attempt < retries) {
        await new Promise(r => setTimeout(r, 10000 * attempt));
        continue;
      }
      throw error;
    }
  }
  return [];
}

async function geocodeAddress(address) {
  if (!GOOGLE_MAPS_API_KEY) return null;

  const fullAddress = [
    address?.street_address_1,
    address?.city,
    address?.state,
    address?.postal_code
  ].filter(Boolean).join(', ');

  if (!fullAddress) return null;

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${GOOGLE_MAPS_API_KEY}`;
    const response = await axios.get(url, { timeout: 5000 });

    if (response.data.status === 'OK' && response.data.results[0]) {
      const location = response.data.results[0].geometry.location;
      return { lat: location.lat, lon: location.lng };
    }
  } catch (error) {
    console.error('  Geocoding error:', error.message);
  }
  return null;
}

async function syncProject(projectData, dryRun = false) {
  const labels = await fetchProjectLabels(projectData.id);

  // Check if project exists and needs geocoding
  const existing = await prisma.project.findUnique({
    where: { id: projectData.id },
    select: { coordinates: true }
  });

  // Only geocode if no existing coordinates
  let coordinates = existing?.coordinates;
  if (!coordinates && projectData.address?.street_address_1) {
    coordinates = await geocodeAddress(projectData.address);
  }

  // Don't overwrite local tags - we manage those separately
  const projectRecord = {
    tenant: TENANT,
    address: projectData.address?.street_address_1 || null,
    city: projectData.address?.city || null,
    state: projectData.address?.state || null,
    postalCode: projectData.address?.postal_code || null,
    name: projectData.name || null,
    status: projectData.status || null,
    photoCount: projectData.photo_count || 0,
    publicUrl: projectData.public_url || null,
    coordinates,
    ccCreatedAt: projectData.created_at ? new Date(projectData.created_at) : null,
    ccUpdatedAt: projectData.updated_at ? new Date(projectData.updated_at) : null,
    lastSyncedAt: new Date()
    // NOTE: tags are managed locally, not synced from CompanyCam
  };

  if (!dryRun) {
    await prisma.project.upsert({
      where: { id: projectData.id },
      update: projectRecord,
      create: {
        id: projectData.id,
        ...projectRecord,
        createdAt: new Date()
      }
    });
  }

  return { labels: labels.length, geocoded: !!coordinates };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const sinceArg = args.find(a => a.startsWith('--since='));
  const sinceDate = sinceArg ? new Date(sinceArg.split('=')[1]) : null;

  console.log('CompanyCam Full Sync');
  console.log('====================');
  if (dryRun) console.log('DRY RUN - no changes will be made');
  if (sinceDate) console.log(`Syncing projects updated since: ${sinceDate.toISOString()}`);
  console.log('');

  const projects = await fetchAllProjects(sinceDate);
  console.log(`\nFound ${projects.length} projects to sync\n`);

  let synced = 0;
  let errors = 0;
  let newProjects = 0;

  for (let i = 0; i < projects.length; i++) {
    const project = projects[i];
    const progress = `[${i + 1}/${projects.length}]`;

    try {
      // Check if new
      const existing = await prisma.project.findUnique({
        where: { id: project.id },
        select: { id: true }
      });

      const result = await syncProject(project, dryRun);
      const status = existing ? 'updated' : 'created';
      if (!existing) newProjects++;

      const addr = project.address?.street_address_1 || project.name || project.id;
      console.log(`${progress} ${status}: ${addr} (${result.labels} tags)`);
      synced++;

      // Rate limit
      await new Promise(r => setTimeout(r, 300));

    } catch (error) {
      console.error(`${progress} Error:`, error.message);
      errors++;
    }
  }

  console.log('\n====================');
  console.log(`Sync complete!`);
  console.log(`  Total synced: ${synced}`);
  console.log(`  New projects: ${newProjects}`);
  console.log(`  Errors: ${errors}`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
