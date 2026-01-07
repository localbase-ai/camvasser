import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testCallListItems() {
  // Get first call list
  const list = await prisma.callList.findFirst({
    include: { script: true }
  });

  console.log('List:', list?.id, list?.name);
  console.log('Has script:', !!list?.script);

  if (!list) {
    console.log('No call list found');
    await prisma.$disconnect();
    return;
  }

  // Fetch items
  const items = await prisma.callListItem.findMany({
    where: { callListId: list.id },
    orderBy: { position: 'asc' }
  });

  console.log('Items count:', items.length);

  // Fetch contacts
  const contactIds = items.filter(i => i.contactId).map(i => i.contactId);
  console.log('Contact IDs:', contactIds.length);

  try {
    const contacts = await prisma.prospect.findMany({
      where: { id: { in: contactIds } },
      select: {
        id: true,
        name: true,
        phones: true,
        emails: true,
        status: true,
        lookupAddress: true,
        updatedAt: true,
        project: { select: { tags: true } }
      }
    });
    console.log('Contacts fetched:', contacts.length);
    console.log('First contact:', JSON.stringify(contacts[0], null, 2));
  } catch (e) {
    console.error('Error fetching contacts:', e.message);
  }

  await prisma.$disconnect();
}

testCallListItems().catch(console.error);
