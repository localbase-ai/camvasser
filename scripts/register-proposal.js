#!/usr/bin/env node
// Register an externally-hosted proposal (HTML/PDF/etc.) into Camvasser as a
// Proposal row tied to a Lead. The proposal's URL becomes shareable + visible
// on the Lead detail panel. Use with AI-generated proposals hosted on
// Netlify, GitHub Pages, S3, etc.
//
// Usage:
//   node scripts/register-proposal.js \
//     --lead-id <id> \
//     --url <hosted-proposal-url> \
//     --customer-name "Customer Name" \
//     [--customer-email <email>] \
//     [--amount <dollars>] \
//     [--service "Siding Replacement"] \
//     [--status pending|sent|signed|won|lost]

import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import 'dotenv/config';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, val, i, arr) => {
    if (val.startsWith('--')) acc.push([val.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);

if (!args['lead-id'] || !args['url']) {
  console.error('Usage: node scripts/register-proposal.js --lead-id <id> --url <url> --customer-name <name> [--amount $X] [--service "Service Name"] [--customer-email <email>] [--status sent|pending|...]');
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const lead = await prisma.lead.findUnique({
    where: { id: args['lead-id'] },
    include: { customer: true }
  });
  if (!lead) {
    console.error('Lead not found:', args['lead-id']);
    process.exit(1);
  }

  const customerName = args['customer-name'] || `${lead.firstName} ${lead.lastName}`.trim();
  const customerEmail = args['customer-email'] || lead.email || null;
  const amount = args['amount'] ? parseFloat(args['amount'].replace(/[$,]/g, '')) : null;
  const status = args['status'] || 'sent';
  const service = args['service'] || 'Service';

  const proposalId = `cmv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const proposal = await prisma.proposal.create({
    data: {
      id: createId(),
      proposalId,
      customerName,
      customerEmail,
      proposalAmount: amount,
      sentDate: new Date(),
      status,
      tenant: lead.tenant,
      pdfUrl: args['url'],
      leadId: lead.id,
      customerId: lead.customerId || null,
      qbCustomerId: lead.customer?.qbCustomerId || null,
      updatedAt: new Date(),
    }
  });

  console.log('Registered proposal:');
  console.log('  Camvasser ID:', proposal.id);
  console.log('  Proposal ID:', proposal.proposalId);
  console.log('  Lead:', lead.firstName, lead.lastName, `(${lead.id})`);
  console.log('  Service:', service);
  console.log('  URL:', proposal.pdfUrl);
  console.log('  Amount:', proposal.proposalAmount ? `$${proposal.proposalAmount}` : '—');
  console.log('  Status:', proposal.status);
  console.log();
  console.log(`Lead detail URL: https://camvasser.com/admin.html?expand=1#lead/${lead.id}`);
} finally {
  await prisma.$disconnect();
}
