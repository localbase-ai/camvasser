import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function showAll() {
  const proposals = await prisma.proposal.findMany({
    where: { qbEstimateId: { not: null } },
    orderBy: { proposalAmount: 'desc' }
  });

  const active = proposals.filter(p => p.status !== 'won');
  const won = proposals.filter(p => p.status === 'won');

  const activeTotal = active.reduce((sum, p) => sum + (p.proposalAmount || 0), 0);
  const wonTotal = won.reduce((sum, p) => sum + (p.proposalAmount || 0), 0);

  console.log('=== CAMVASSER QB ESTIMATES ===');
  console.log('Active Pipeline:', active.length, 'estimates, $' + activeTotal.toLocaleString());
  console.log('Won/Completed:', won.length, 'estimates, $' + wonTotal.toLocaleString());
  console.log('');

  console.log('| Status | Customer | Amount |');
  console.log('|--------|----------|--------|');

  for (const p of proposals) {
    const status = p.status === 'won' ? 'WON' : 'ACTIVE';
    console.log('| ' + status + ' | ' + p.customerName + ' | $' + p.proposalAmount?.toLocaleString() + ' |');
  }

  await prisma.$disconnect();
}

showAll().catch(console.error);
