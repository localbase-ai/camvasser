import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const list = await prisma.callList.findFirst({ include: { items: true } });
console.log('Call list:', list.name);
console.log('Items:', list.items.length);

// Check for any orphaned items (contactId pointing to deleted contacts)
const contactIds = list.items.filter(i => i.contactId).map(i => i.contactId);
const contacts = await prisma.prospect.findMany({ where: { id: { in: contactIds } } });
const orphaned = contactIds.filter(id => !contacts.find(c => c.id === id));
console.log('Orphaned items:', orphaned.length);

if (orphaned.length > 0) {
  console.log('Orphaned contact IDs:', orphaned);
}

await prisma.$disconnect();
