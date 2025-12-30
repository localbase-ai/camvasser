// Remove specific tags from projects
// Usage: node scripts/remove-tags.js after before
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

const tagsToRemove = process.argv.slice(2);
if (tagsToRemove.length === 0) {
  console.log('Usage: node scripts/remove-tags.js <tag1> <tag2> ...');
  process.exit(1);
}

console.log('Removing tags:', tagsToRemove.join(', '));

const projects = await prisma.project.findMany({
  where: { tags: { not: null } },
  select: { id: true, address: true, tags: true }
});

let updated = 0;
for (const p of projects) {
  if (!p.tags || !Array.isArray(p.tags)) continue;
  const filtered = p.tags.filter(t => !tagsToRemove.includes(t?.value));
  if (filtered.length !== p.tags.length) {
    console.log('  ' + (p.address || p.id));
    await prisma.project.update({
      where: { id: p.id },
      data: { tags: filtered }
    });
    updated++;
  }
}

console.log(`\nRemoved from ${updated} project(s)`);
await prisma.$disconnect();
