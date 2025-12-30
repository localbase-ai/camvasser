// Quick check of tag distribution
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();

const projects = await prisma.project.findMany({
  where: { tags: { not: null } },
  select: { tags: true }
});

const counts = {};
projects.forEach(p => {
  if (!p.tags || !Array.isArray(p.tags)) return;
  p.tags.forEach(t => {
    if (t?.value) {
      counts[t.value] = (counts[t.value] || 0) + 1;
    }
  });
});

const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
console.log('Tag Distribution:');
sorted.forEach(([tag, count]) => console.log(`  ${tag}: ${count}`));

await prisma.$disconnect();
