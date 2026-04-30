#!/usr/bin/env node
// Register a proposal into Camvasser, tied to a Lead. Stores the rendered HTML
// content in the Proposal row so the shareable URL is hosted by camvasser
// itself (https://camvasser.com/p/{proposalId}). Falls back to legacy mode
// if --url is given instead of --html-file.
//
// Usage:
//   node scripts/register-proposal.js \
//     --lead-id <id> \
//     --html-file <path-to-rendered-proposal.html> \
//     --customer-name "Customer Name" \
//     [--customer-email <email>] \
//     [--amount <dollars>] \
//     [--service "TPO Roof Replacement"] \
//     [--status pending|sent|signed|won|lost]
//
// Legacy (externally hosted):
//   node scripts/register-proposal.js --lead-id <id> --url <hosted-url> ...

import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { readFileSync } from 'node:fs';
import 'dotenv/config';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, val, i, arr) => {
    if (val.startsWith('--')) acc.push([val.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);

if (!args['lead-id'] || (!args['html-file'] && !args['url'])) {
  console.error('Usage: node scripts/register-proposal.js --lead-id <id> --html-file <path> [--customer-name <name>] [--amount $X] [--service "Service Name"] [--customer-email <email>] [--status sent|pending|...]');
  console.error('   or: node scripts/register-proposal.js --lead-id <id> --url <hosted-url> ...   (legacy)');
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

  let html = null;
  let pdfUrl = args['url'] || null;
  if (args['html-file']) {
    html = readFileSync(args['html-file'], 'utf8');
  }

  const proposalId = `cmv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const camvasserUrl = `https://camvasser.com/p/${proposalId}`;
  // Always set pdfUrl so the lead detail panel has a link to render. Use the
  // camvasser URL if we stored html, otherwise the externally-hosted one.
  if (!pdfUrl && html) pdfUrl = camvasserUrl;

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
      pdfUrl,
      html,
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
  console.log('  HTML stored:', html ? `${html.length} bytes` : 'no (external URL)');
  console.log('  Public URL:', proposal.pdfUrl);
  console.log('  Amount:', proposal.proposalAmount ? `$${proposal.proposalAmount}` : '—');
  console.log('  Status:', proposal.status);
  console.log();
  console.log(`Lead detail: https://camvasser.com/admin.html?expand=1#lead/${lead.id}`);
} finally {
  await prisma.$disconnect();
}
