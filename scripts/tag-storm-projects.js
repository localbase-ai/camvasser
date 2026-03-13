/**
 * Find projects within a storm report's corridor and tag them.
 *
 * Usage: node scripts/tag-storm-projects.js <storm-report-id>
 * Example: node scripts/tag-storm-projects.js kc-hail-2026-03-10
 *
 * Add --dry-run to preview without tagging.
 */

import { PrismaClient } from '@prisma/client';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point, polygon } from '@turf/helpers';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const stormId = args.find(a => !a.startsWith('--'));

  if (!stormId) {
    console.error('Usage: node scripts/tag-storm-projects.js <storm-report-id> [--dry-run]');
    process.exit(1);
  }

  // Load storm report
  const storm = await prisma.stormReport.findUnique({ where: { id: stormId } });
  if (!storm) {
    console.error(`Storm report not found: ${stormId}`);
    process.exit(1);
  }

  // Extract corridor polygon from GeoJSON
  const geojson = storm.data;
  const corridorFeature = geojson.features.find(f => f.properties?.type === 'corridor');
  if (!corridorFeature) {
    console.error('No corridor polygon found in storm report');
    process.exit(1);
  }

  const corridorPoly = polygon(corridorFeature.geometry.coordinates);
  console.log(`Storm: ${storm.name}`);
  console.log(`Corridor: ${corridorFeature.geometry.coordinates[0].length} vertices`);

  // Load all projects with coordinates
  const projects = await prisma.project.findMany({
    where: { coordinates: { not: null } },
    select: {
      id: true,
      address: true,
      city: true,
      state: true,
      coordinates: true,
      ProjectLabel: { select: { value: true } }
    }
  });

  console.log(`Projects with coordinates: ${projects.length}`);

  // Find projects inside the corridor
  const tagValue = storm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  const tagDisplay = storm.name;
  const tagId = `storm_${stormId}`;

  const matches = [];
  for (const project of projects) {
    const coords = project.coordinates;
    if (!coords?.lat || !coords?.lon) continue;

    // Turf uses [lng, lat]
    const pt = point([coords.lon, coords.lat]);
    if (booleanPointInPolygon(pt, corridorPoly)) {
      const alreadyTagged = project.ProjectLabel.some(l => l.value === tagValue);
      matches.push({ ...project, alreadyTagged });
    }
  }

  console.log(`\nMatches inside corridor: ${matches.length}`);
  const newTags = matches.filter(m => !m.alreadyTagged);
  const existing = matches.filter(m => m.alreadyTagged);

  if (existing.length) {
    console.log(`Already tagged: ${existing.length}`);
  }

  if (!newTags.length) {
    console.log('No new projects to tag.');
    return;
  }

  console.log(`\nProjects to tag: ${newTags.length}`);
  newTags.forEach(p => {
    console.log(`  ${p.address}, ${p.city}, ${p.state} (${p.id})`);
  });

  if (dryRun) {
    console.log('\n[DRY RUN] No changes made.');
    return;
  }

  // Tag them
  const labels = newTags.map(p => ({
    id: `${tagId}_${p.id}`,
    projectId: p.id,
    labelId: tagId,
    displayValue: tagDisplay,
    value: tagValue,
    tagType: 'storm'
  }));

  await prisma.projectLabel.createMany({
    data: labels,
    skipDuplicates: true
  });

  console.log(`\nTagged ${newTags.length} projects with "${tagDisplay}"`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
