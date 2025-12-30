import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const completed = await prisma.lead.findMany({
    where: { status: 'completed' },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, address: true, flowData: true }
  });

  const withValue = completed.filter(l => l.flowData && l.flowData.job_value);
  const withoutValue = completed.filter(l => !(l.flowData && l.flowData.job_value));

  console.log('Completed leads total:', completed.length);
  console.log('With job_value:', withValue.length);
  console.log('Without job_value:', withoutValue.length);
  console.log('\nLeads without value:');
  withoutValue.forEach(l => console.log(' ', l.firstName, l.lastName, '|', l.email || l.phone || l.address));

  await prisma.$disconnect();
}

main().catch(console.error);
