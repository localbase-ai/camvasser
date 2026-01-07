import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Normalize name - extract first and last name only, lowercase
function normalizeName(name) {
  if (!name) return null;
  const parts = name.toLowerCase().trim().split(/\s+/);
  if (parts.length < 2) return null;

  // Get first name (first part) and last name (last part)
  const firstName = parts[0];
  const lastName = parts[parts.length - 1];

  return `${firstName} ${lastName}`;
}

async function findSimilarNames() {
  const list = await prisma.callList.findFirst({ include: { items: true } });
  console.log('List:', list.name, '- Items:', list.items.length);

  const contactIds = list.items.filter(i => i.contactId).map(i => i.contactId);
  const contacts = await prisma.prospect.findMany({
    where: { id: { in: contactIds } },
    select: { id: true, name: true, phones: true, lookupAddress: true }
  });

  const contactMap = new Map(contacts.map(c => [c.id, c]));

  // Group by normalized name (first + last only)
  const byNormalizedName = new Map();
  for (const item of list.items) {
    const contact = contactMap.get(item.contactId);
    const normalizedName = normalizeName(contact?.name);
    if (!normalizedName) continue;

    if (!byNormalizedName.has(normalizedName)) {
      byNormalizedName.set(normalizedName, []);
    }
    byNormalizedName.get(normalizedName).push({ item, contact });
  }

  // Find normalized names with multiple entries
  const similarGroups = Array.from(byNormalizedName.entries())
    .filter(([_, list]) => list.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  console.log(`\nFound ${similarGroups.length} groups with similar names (first + last name match)\n`);

  const dupeItemIds = [];

  for (const [normalizedName, entries] of similarGroups) {
    console.log(`\n${normalizedName}:`);

    // Keep first, mark rest as potential dupes
    entries.forEach((entry, idx) => {
      const phone = entry.contact?.phones?.[0]?.phone_number || '-';
      const addr = entry.contact?.lookupAddress || '-';
      const isDupe = idx > 0;
      if (isDupe) dupeItemIds.push(entry.item.id);

      console.log(`  ${isDupe ? '[DUPE] ' : '[KEEP] '} "${entry.contact?.name}"`);
      console.log(`          Contact: ${entry.contact?.id} | Phone: ${phone}`);
      console.log(`          Address: ${addr}`);
    });
  }

  console.log(`\n========== SUMMARY ==========`);
  console.log(`Similar name groups: ${similarGroups.length}`);
  console.log(`Call list items to remove: ${dupeItemIds.length}`);

  if (dupeItemIds.length > 0 && process.argv.includes('--fix')) {
    console.log('\nRemoving duplicate call list items...');
    await prisma.callListItem.deleteMany({
      where: { id: { in: dupeItemIds } }
    });
    console.log(`Done! Removed ${dupeItemIds.length} items`);

    const newCount = await prisma.callListItem.count({
      where: { callListId: list.id }
    });
    console.log(`New item count: ${newCount}`);
  } else if (dupeItemIds.length > 0) {
    console.log('\nRun with --fix to remove duplicate items from the call list');
  }

  await prisma.$disconnect();
}

findSimilarNames().catch(console.error);
