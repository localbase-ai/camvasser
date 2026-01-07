import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkCallListDupes() {
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
    const name = contact?.name || 'Unknown';
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push({ item, contact });
  }

  // Find names with multiple entries
  console.log('\nPotential duplicates by name:');
  let dupeCount = 0;
  const dupeItemIds = [];

  for (const [name, entries] of byName) {
    if (entries.length > 1) {
      dupeCount += entries.length - 1;
      console.log('\n' + name + ' (' + entries.length + ' entries):');

      // Keep first, mark rest as dupes
      entries.forEach((entry, idx) => {
        const phone = entry.contact?.phones?.[0]?.phone_number || '-';
        const addr = entry.contact?.lookupAddress || '-';
        const isDupe = idx > 0;
        if (isDupe) dupeItemIds.push(entry.item.id);
        console.log('  ' + (isDupe ? '[DUPE] ' : '[KEEP] ') + 'Contact ID:', entry.contact?.id);
        console.log('    Phone:', phone);
        console.log('    Address:', addr);
      });
    }
  }

  console.log('\nTotal duplicate entries to remove:', dupeCount);

  if (dupeItemIds.length > 0 && process.argv.includes('--fix')) {
    console.log('\nRemoving duplicates...');
    await prisma.callListItem.deleteMany({
      where: { id: { in: dupeItemIds } }
    });
    console.log('Done! Removed', dupeItemIds.length, 'items');

    const newCount = await prisma.callListItem.count({
      where: { callListId: list.id }
    });
    console.log('New item count:', newCount);
  } else if (dupeItemIds.length > 0) {
    console.log('\nRun with --fix to remove duplicates');
  }

  await prisma.$disconnect();
}

checkCallListDupes().catch(console.error);
