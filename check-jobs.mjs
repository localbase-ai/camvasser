import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const jobs = await prisma.backgroundJob.findMany({
    where: { type: 'push-to-smartlead' },
    orderBy: { createdAt: 'desc' },
    take: 3
  });
  
  for (const job of jobs) {
    console.log('\n=== Job:', job.id, '===');
    console.log('Created:', job.createdAt);
    console.log('Updated:', job.updatedAt);
    console.log('Status:', job.status);
    console.log('Progress:', job.progress, '/', job.total);
    console.log('Error:', job.error);
    if (job.result) {
      console.log('Result:', JSON.stringify(job.result, null, 2));
    }
  }
  
  await prisma.$disconnect();
}

main();
