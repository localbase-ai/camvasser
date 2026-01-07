import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkActive() {
  const active = await prisma.proposal.findMany({
    where: {
      qbEstimateId: { not: null },
      status: { not: 'won' }
    },
    orderBy: { proposalAmount: 'desc' }
  });

  console.log('=== CHECKING 5 ACTIVE ESTIMATES ===\n');

  for (const p of active) {
    console.log('---');
    console.log('ESTIMATE:', p.customerName, '| $' + p.proposalAmount?.toLocaleString());
    console.log('Email:', p.customerEmail);

    // Search for matching lead by email
    let lead = null;
    if (p.customerEmail) {
      lead = await prisma.lead.findFirst({
        where: { email: { equals: p.customerEmail, mode: 'insensitive' } }
      });
    }

    // If no email match, try name match
    if (!lead && p.customerName) {
      const nameParts = p.customerName.split(' ');
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ');

      lead = await prisma.lead.findFirst({
        where: {
          firstName: { contains: firstName, mode: 'insensitive' },
          lastName: { contains: lastName, mode: 'insensitive' }
        }
      });
    }

    if (lead) {
      console.log('MATCH FOUND:');
      console.log('  Lead:', lead.firstName, lead.lastName);
      console.log('  Email:', lead.email);
      console.log('  Address:', lead.address);
      console.log('  Status:', lead.status);
      console.log('  Phone:', lead.phone);
    } else {
      console.log('NO MATCHING LEAD FOUND');
    }
  }

  await prisma.$disconnect();
}

checkActive().catch(console.error);
