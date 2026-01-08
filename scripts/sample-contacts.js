import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Get prospects with phone numbers
const prospects = await prisma.prospect.findMany({
  where: {
    phones: { not: '[]' },
    tenant: 'budroofing'
  },
  include: {
    project: true
  },
  take: 5
});

console.log('Sample prospects with phones:\n');
prospects.forEach(p => {
  // phones might already be parsed as JSON
  const phones = typeof p.phones === 'string' ? JSON.parse(p.phones || '[]') : (p.phones || []);
  console.log('ID:', p.id);
  console.log('Name:', p.name);
  console.log('Phones:', JSON.stringify(phones.slice(0,2), null, 2));
  console.log('Address:', p.project?.address, p.project?.city, p.project?.state);
  console.log('isHomeowner:', p.isHomeowner);
  console.log('---');
});

await prisma.$disconnect();
