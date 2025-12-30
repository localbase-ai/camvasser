// Normalize tag case in Project records
// Usage: node scripts/normalize-tags.js [--dry-run]

import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

// Canonical tag names (lowercase -> proper case)
const CANONICAL = {
  'door hanger': 'Door Hanger',
  'softwash': 'Softwash',
  'melt pattern': 'Melt Pattern',
  'roofmaxx treatment': 'RoofMaxx Treatment',
  'gutter cleaning': 'Gutter Cleaning',
  'complete': 'Complete',
  'no soliciting': 'No Soliciting',
  'cedar shake': 'Cedar Shake',
  'repair': 'Repair',
  'rip & replace': 'Rip & Replace'
};

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('Tag Normalization Script');
  console.log('========================');
  if (dryRun) console.log('DRY RUN - no changes will be made\n');

  // Get all projects with tags
  const projects = await prisma.project.findMany({
    where: {
      tags: { not: null }
    },
    select: { id: true, address: true, tags: true }
  });

  console.log(`Found ${projects.length} projects with tags\n`);

  let updated = 0;
  let unchanged = 0;

  for (const project of projects) {
    if (!project.tags || !Array.isArray(project.tags)) {
      unchanged++;
      continue;
    }

    let changed = false;
    const newTags = project.tags.map(tag => {
      if (!tag || typeof tag !== 'object') return tag;

      const currentValue = tag.value;
      if (!currentValue) return tag;

      const canonical = CANONICAL[currentValue.toLowerCase()];
      if (canonical && canonical !== currentValue) {
        changed = true;
        return { ...tag, value: canonical };
      }
      return tag;
    });

    if (changed) {
      const addr = project.address || project.id;
      const oldValues = project.tags.map(t => t?.value).join(', ');
      const newValues = newTags.map(t => t?.value).join(', ');
      console.log(`${addr}`);
      console.log(`  Before: ${oldValues}`);
      console.log(`  After:  ${newValues}`);

      if (!dryRun) {
        await prisma.project.update({
          where: { id: project.id },
          data: { tags: newTags }
        });
      }
      updated++;
    } else {
      unchanged++;
    }
  }

  console.log('\n========================');
  console.log(`Updated: ${updated}`);
  console.log(`Unchanged: ${unchanged}`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
