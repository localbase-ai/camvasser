#!/usr/bin/env node

/**
 * Backfill Customer records from existing Lead + Proposal data.
 *
 * Usage:
 *   node scripts/backfill-customers.js              # dry-run (default)
 *   node scripts/backfill-customers.js --apply       # actually write to DB
 *   node scripts/backfill-customers.js --tenant budroofing  # filter by tenant
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');
const tenantArg = args.includes('--tenant') ? args[args.indexOf('--tenant') + 1] : null;

function normalizeName(firstName, lastName) {
  return `${(firstName || '').trim()} ${(lastName || '').trim()}`.toLowerCase().replace(/\s+/g, ' ').trim();
}

async function main() {
  console.log(`\n=== Backfill Customers ${dryRun ? '(DRY RUN)' : '(APPLYING)'} ===\n`);

  const tenantFilter = tenantArg ? { tenant: tenantArg } : {};

  // Fetch all leads
  const leads = await prisma.lead.findMany({
    where: { ...tenantFilter, customerId: null },
    orderBy: { createdAt: 'asc' }
  });
  console.log(`Found ${leads.length} leads without a customer`);

  // Fetch all proposals
  const proposals = await prisma.proposal.findMany({
    where: { ...tenantFilter, customerId: null }
  });
  console.log(`Found ${proposals.length} proposals without a customer\n`);

  // --- Pass 1: Group leads by QB customer ID (highest confidence) ---
  const byQbId = new Map(); // key: "tenant:qbCustomerId"
  const leadsWithoutQb = [];

  for (const lead of leads) {
    const qbId = lead.flowData?.quickbooks_customer_id || lead.flowData?.qb_customer_id;
    if (qbId) {
      const key = `${lead.tenant}:${qbId}`;
      if (!byQbId.has(key)) {
        byQbId.set(key, { tenant: lead.tenant, qbId, qbName: lead.flowData?.quickbooks_display_name || lead.flowData?.qb_customer_name, leads: [] });
      }
      byQbId.get(key).leads.push(lead);
    } else {
      leadsWithoutQb.push(lead);
    }
  }

  console.log(`QB-linked groups: ${byQbId.size}`);
  console.log(`Leads without QB ID: ${leadsWithoutQb.length}\n`);

  let customersCreated = 0;
  let leadsLinked = 0;
  let proposalsLinked = 0;
  const customerMap = new Map(); // key: "tenant:qbId" or "tenant:normalizedName" → customerId

  // --- Create customers from QB groups ---
  for (const [key, group] of byQbId) {
    const firstLead = group.leads[0];
    const displayName = group.qbName || `${firstLead.firstName} ${firstLead.lastName}`.trim();

    console.log(`[QB] ${displayName} (QB ${group.qbId}) — ${group.leads.length} lead(s)`);

    let customerId;
    if (!dryRun) {
      const customer = await prisma.customer.create({
        data: {
          firstName: firstLead.firstName || '',
          lastName: firstLead.lastName || '',
          email: firstLead.email,
          phone: firstLead.phone,
          tenant: group.tenant,
          qbCustomerId: group.qbId,
          qbDisplayName: displayName
        }
      });
      customerId = customer.id;

      // Link all leads in this group
      for (const lead of group.leads) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { customerId }
        });
      }
    }

    leadsLinked += group.leads.length;
    customersCreated++;
    customerMap.set(key, customerId);

    // Also index by normalized name for proposal matching
    const normalizedKey = `${group.tenant}:${normalizeName(firstLead.firstName, firstLead.lastName)}`;
    if (!customerMap.has(normalizedKey)) {
      customerMap.set(normalizedKey, customerId);
    }
  }

  // --- Pass 2: Group remaining leads by normalized name + tenant ---
  const byName = new Map();
  for (const lead of leadsWithoutQb) {
    const name = normalizeName(lead.firstName, lead.lastName);
    if (!name) continue;
    const key = `${lead.tenant}:${name}`;
    if (!byName.has(key)) {
      byName.set(key, { tenant: lead.tenant, name, leads: [] });
    }
    byName.get(key).leads.push(lead);
  }

  for (const [key, group] of byName) {
    // Skip if already handled by QB pass (same name)
    if (customerMap.has(key)) {
      if (!dryRun) {
        const customerId = customerMap.get(key);
        for (const lead of group.leads) {
          await prisma.lead.update({
            where: { id: lead.id },
            data: { customerId }
          });
        }
      }
      leadsLinked += group.leads.length;
      console.log(`[Name→QB] ${group.name} — ${group.leads.length} lead(s) linked to existing QB customer`);
      continue;
    }

    const firstLead = group.leads[0];
    console.log(`[Name] ${group.name} — ${group.leads.length} lead(s)`);

    let customerId;
    if (!dryRun) {
      const customer = await prisma.customer.create({
        data: {
          firstName: firstLead.firstName || '',
          lastName: firstLead.lastName || '',
          email: firstLead.email,
          phone: firstLead.phone,
          tenant: group.tenant
        }
      });
      customerId = customer.id;

      for (const lead of group.leads) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { customerId }
        });
      }
    }

    leadsLinked += group.leads.length;
    customersCreated++;
    customerMap.set(key, customerId);
  }

  // --- Pass 3: Link proposals to customers ---
  for (const proposal of proposals) {
    let customerId = null;

    // Try by QB customer ID first
    if (proposal.qbCustomerId) {
      const qbKey = `${proposal.tenant}:${proposal.qbCustomerId}`;
      customerId = customerMap.get(qbKey);
    }

    // Fall back to name matching
    if (!customerId && proposal.customerName) {
      const nameKey = `${proposal.tenant}:${proposal.customerName.toLowerCase().trim()}`;
      customerId = customerMap.get(nameKey);
    }

    if (customerId) {
      if (!dryRun) {
        await prisma.proposal.update({
          where: { id: proposal.id },
          data: { customerId }
        });
      }
      proposalsLinked++;
    }
  }

  // --- Summary ---
  console.log(`\n=== Summary ${dryRun ? '(DRY RUN — no changes made)' : ''} ===`);
  console.log(`Customers created:  ${customersCreated}`);
  console.log(`Leads linked:       ${leadsLinked} / ${leads.length}`);
  console.log(`Proposals linked:   ${proposalsLinked} / ${proposals.length}`);
  console.log(`Unmatched leads:    ${leads.length - leadsLinked}`);
  console.log(`Unmatched proposals: ${proposals.length - proposalsLinked}\n`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
