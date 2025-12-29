import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function normalizeAddress(addr, city) {
  let s = (addr || '').toLowerCase()
    .replace(/\bsouthwest\b/g, 'sw')
    .replace(/\bnorthwest\b/g, 'nw')
    .replace(/\bsoutheast\b/g, 'se')
    .replace(/\bnortheast\b/g, 'ne')
    .replace(/\bstreet\b/g, 'st')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\bterrace\b/g, 'ter')
    .replace(/\bcourt\b/g, 'ct')
    .replace(/\bcircle\b/g, 'cir')
    .replace(/\blane\b/g, 'ln')
    .replace(/\bplace\b/g, 'pl')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\broad\b/g, 'rd')
    .replace(/[^a-z0-9]/g, '');

  const c = (city || '').toLowerCase().replace(/[^a-z]/g, '');
  return s + '|' + c;
}

async function main() {
  const projects = await prisma.project.findMany({
    where: { address: { not: null } },
    select: {
      id: true,
      address: true,
      city: true,
      state: true,
      postalCode: true,
      name: true,
      photoCount: true,
      publicUrl: true,
      status: true,
      lastSyncedAt: true,
      labels: true
    }
  });

  const groups = {};
  projects.forEach(p => {
    const key = normalizeAddress(p.address, p.city);
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  });

  const dupes = Object.entries(groups).filter(([k, v]) => v.length > 1);

  console.log('Total projects:', projects.length);
  console.log('Unique addresses:', Object.keys(groups).length);
  console.log('Duplicate groups:', dupes.length);
  console.log('Total records in dupe groups:', dupes.reduce((sum, [k, v]) => sum + v.length, 0));

  console.log('\n=== All duplicate groups ===\n');
  dupes.forEach(([key, records]) => {
    console.log('---', records[0].address, records[0].city, '---');
    records.forEach(r => {
      const isClay = r.id.startsWith('clay_');
      const hasLabels = r.labels && r.labels.length > 0;
      console.log(`  [${isClay ? 'CLAY' : 'CCAM'}] ${r.id}`);
      console.log(`    address: ${r.address}, ${r.city}`);
      console.log(`    photos: ${r.photoCount}, status: ${r.status}, name: ${r.name || '(none)'}, labels: ${hasLabels ? r.labels.length : 0}`);
    });
    console.log('');
  });

  await prisma.$disconnect();
}

main().catch(console.error);
