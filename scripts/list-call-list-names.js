import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const list = await prisma.callList.findFirst({ include: { items: true } });
const contactIds = list.items.filter(i => i.contactId).map(i => i.contactId);
const contacts = await prisma.prospect.findMany({
  where: { id: { in: contactIds } },
  select: { id: true, name: true }
});

// Sort by name and print
contacts.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
console.log(`All ${contacts.length} contacts in call list "${list.name}" (sorted by name):\n`);
contacts.forEach(c => console.log(c.name));
await prisma.$disconnect();
