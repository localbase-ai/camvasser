// Add a tag to all projects that have another tag
// Usage: node scripts/add-tag-to-tagged.js "Melt Pattern" "Door Hanger"
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

const [sourceTag, tagToAdd] = process.argv.slice(2);

if (!sourceTag || !tagToAdd) {
  console.log('Usage: node scripts/add-tag-to-tagged.js "source tag" "tag to add"');
  process.exit(1);
}

console.log(`Adding "${tagToAdd}" to all projects with "${sourceTag}"...\n`);

const projects = await prisma.project.findMany({
  where: { tags: { not: null } },
  select: { id: true, address: true, tags: true }
});

let updated = 0;
let skipped = 0;

for (const p of projects) {
  if (!p.tags || !Array.isArray(p.tags)) continue;

  const hasSource = p.tags.some(t => t?.value === sourceTag);
  if (!hasSource) continue;

  const hasTarget = p.tags.some(t => t?.value === tagToAdd);
  if (hasTarget) {
    skipped++;
    continue;
  }

  // Add the tag
  const newTags = [...p.tags, { value: tagToAdd }];
  await prisma.project.update({
    where: { id: p.id },
    data: { tags: newTags }
  });

  console.log(`  Added to: ${p.address || p.id}`);
  updated++;
}

console.log(`\nDone: ${updated} updated, ${skipped} already had both tags`);
await prisma.$disconnect();
