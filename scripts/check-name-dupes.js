import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkNameDupes() {
  const tenant = process.argv.find(arg => arg.startsWith('--tenant='))?.split('=')[1] || 'budroofing';
  const searchName = process.argv.find(arg => arg.startsWith('--name='))?.split('=')[1];

  // Get all prospects for this tenant
  const prospects = await prisma.prospect.findMany({
    where: { tenant },
    select: { id: true, name: true, phones: true, lookupAddress: true, status: true }
  });

  console.log(`Total contacts: ${prospects.length}\n`);

  // Group by normalized name only
  const byName = new Map();
  for (const p of prospects) {
    const name = (p.name || '').toLowerCase().trim();
    if (!name || name === '---') continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(p);
  }

  // Find names with duplicates
  const dupeNames = Array.from(byName.entries())
    .filter(([_, list]) => list.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  console.log(`Found ${dupeNames.length} names with multiple contacts\n`);

  // If searching for specific name
  if (searchName) {
    const searchLower = searchName.toLowerCase();
    const matches = dupeNames.filter(([name]) => name.includes(searchLower));
    console.log(`Matches for "${searchName}":\n`);
    for (const [name, contacts] of matches) {
      console.log(`\n${name} (${contacts.length} entries):`);
      for (const c of contacts) {
        const phone = c.phones?.[0]?.phone_number || '-';
        console.log(`  ID: ${c.id}`);
        console.log(`    Phone: ${phone}`);
        console.log(`    Address: ${c.lookupAddress || '-'}`);
        console.log(`    Status: ${c.status || '-'}`);
      }
    }
    await prisma.$disconnect();
    return;
  }

  // Show top 20 duplicate names
  console.log('Top duplicate names:');
  for (const [name, contacts] of dupeNames.slice(0, 20)) {
    console.log(`\n${name} (${contacts.length} entries):`);
    for (const c of contacts) {
      const phone = c.phones?.[0]?.phone_number || '-';
      console.log(`  ID: ${c.id} | Phone: ${phone} | Addr: ${(c.lookupAddress || '-').substring(0, 40)}`);
    }
  }

  // Summary of how many dupes we'd remove with name-only matching
  const totalDupes = dupeNames.reduce((sum, [_, list]) => sum + list.length - 1, 0);
  console.log(`\n========== SUMMARY ==========`);
  console.log(`Names with duplicates: ${dupeNames.length}`);
  console.log(`Total duplicate entries (name-only): ${totalDupes}`);

  await prisma.$disconnect();
}

checkNameDupes().catch(console.error);
