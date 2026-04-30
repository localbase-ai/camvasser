#!/usr/bin/env node
// Push an existing Camvasser Proposal (registered via register-proposal.js)
// to QuickBooks as an Estimate. Updates the Proposal row with qbEstimateId
// and qbDocNumber.
//
// Usage:
//   node scripts/push-proposal-to-qb.js \
//     --proposal-id <camvasser-proposal-id> \
//     --qb-item-id <id>            (e.g. 235 for "Siding Replacement", 1010000161 for "Exterior Painting") \
//     --qb-item-name "Siding Replacement" \
//     [--description "Custom line description (defaults to item name + URL)"]

import { PrismaClient } from '@prisma/client';
import { createEstimate, getCustomer } from '../netlify/functions/lib/quickbooks.js';
import 'dotenv/config';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, val, i, arr) => {
    if (val.startsWith('--')) acc.push([val.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);

if (!args['proposal-id'] || !args['qb-item-id']) {
  console.error('Usage: node scripts/push-proposal-to-qb.js --proposal-id <id> --qb-item-id <id> [--qb-item-name <name>] [--description <text>]');
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const proposal = await prisma.proposal.findUnique({
    where: { id: args['proposal-id'] }
  });
  if (!proposal) {
    console.error('Proposal not found:', args['proposal-id']);
    process.exit(1);
  }

  // Pull QB customer ID — prefer the proposal's, fall back to lookup
  let qbCustomerId = proposal.qbCustomerId;
  if (!qbCustomerId && proposal.customerId) {
    const cust = await prisma.customer.findUnique({ where: { id: proposal.customerId } });
    qbCustomerId = cust?.qbCustomerId;
  }
  if (!qbCustomerId) {
    console.error('No QB customer ID found on proposal or customer. Sync the customer to QB first.');
    process.exit(1);
  }

  const amount = proposal.proposalAmount || 0;
  if (amount <= 0) {
    console.warn('Proposal amount is 0 or missing — QB estimate will be created at $0. Customer can adjust line item after.');
  }

  const description = args['description'] ||
    `${args['qb-item-name'] || 'Service'}\n\nProposal: ${proposal.pdfUrl || ''}`.trim();

  console.log('Pushing to QB:');
  console.log('  Customer:', qbCustomerId);
  console.log('  Item:', args['qb-item-id'], args['qb-item-name'] || '');
  console.log('  Amount:', amount);
  console.log('  Description:', description.slice(0, 80) + (description.length > 80 ? '…' : ''));

  const est = await createEstimate({
    customerId: qbCustomerId,
    itemId: args['qb-item-id'],
    itemName: args['qb-item-name'] || 'Service',
    amount,
    description
  });

  // Persist back to Camvasser Proposal row
  await prisma.proposal.update({
    where: { id: proposal.id },
    data: {
      qbEstimateId: est.Id,
      qbDocNumber: est.DocNumber,
      qbCustomerId,
      qbSyncedAt: new Date(),
      updatedAt: new Date(),
    }
  });

  console.log();
  console.log('QB Estimate created:');
  console.log('  ID:', est.Id);
  console.log('  DocNumber:', est.DocNumber);
  console.log('  Total:', est.TotalAmt);
  console.log('  Status:', est.TxnStatus);
  console.log('  QB URL: https://app.qbo.intuit.com/app/estimate?txnId=' + est.Id);
} finally {
  await prisma.$disconnect();
}
