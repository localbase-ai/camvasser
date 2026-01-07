import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkCallListNameDupes() {
  const list = await prisma.callList.findFirst({
    include: { items: true }
  });

  console.log('List:', list.name, '- Items:', list.items.length);

  // Get all contact IDs
  const contactIds = list.items.filter(i => i.contactId).map(i => i.contactId);

  // Fetch the contacts
  const contacts = await prisma.prospect.findMany({
    where: { id: { in: contactIds } },
    select: { id: true, name: true, phones: true, lookupAddress: true }
  });

  const contactMap = new Map(contacts.map(c => [c.id, c]));

  // Group by name
  const byName = new Map();
  for (const item of list.items) {
    const contact = contactMap.get(item.contactId);
    const name = (contact?.name || '').toLowerCase().trim();
    if (!name || name === '---') continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push({ item, contact });
  }

  // Find names with multiple entries
  const dupeNames = Array.from(byName.entries())
    .filter(([_, list]) => list.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  console.log(`\nFound ${dupeNames.length} names appearing multiple times in the call list\n`);

  // Show all
  for (const [name, entries] of dupeNames) {
    console.log(`\n${name} (${entries.length} entries):`);
    const contactIdsSet = new Set();
    for (const entry of entries) {
      const isDupeContactId = contactIdsSet.has(entry.contact?.id);
      contactIdsSet.add(entry.contact?.id);
      const phone = entry.contact?.phones?.[0]?.phone_number || '-';
      console.log(`  ${isDupeContactId ? '[SAME CONTACT] ' : ''}Item: ${entry.item.id} | Contact: ${entry.contact?.id} | Phone: ${phone}`);
    }
  }

  // Summary
  const totalDupeItems = dupeNames.reduce((sum, [_, list]) => sum + list.length - 1, 0);
  console.log(`\n========== SUMMARY ==========`);
  console.log(`Names with multiple entries: ${dupeNames.length}`);
  console.log(`Extra items by name: ${totalDupeItems}`);

  await prisma.$disconnect();
}

checkCallListNameDupes().catch(console.error);
