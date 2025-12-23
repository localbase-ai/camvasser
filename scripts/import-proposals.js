#!/usr/bin/env node
/**
 * One-time import of proposals from local SQLite to Prisma/Postgres
 * Usage: node scripts/import-proposals.js
 */

import Database from 'better-sqlite3';
import { PrismaClient } from '@prisma/client';
import path from 'path';

const PROPOSALS_DB_PATH = process.env.PROPOSALS_DB_PATH ||
  path.join(process.env.HOME || '/Users/ryanriggin', 'Work/renu/data/roofr/roofr_proposals.db');

const TENANT = process.env.TENANT || 'budroofing';

async function importProposals() {
  const prisma = new PrismaClient();

  try {
    console.log(`Reading proposals from: ${PROPOSALS_DB_PATH}`);
    const db = new Database(PROPOSALS_DB_PATH, { readonly: true });

    const proposals = db.prepare(`
      SELECT
        proposal_id,
        customer_name,
        customer_email,
        proposal_amount,
        sent_date,
        signed_date,
        status
      FROM proposals
    `).all();

    db.close();

    console.log(`Found ${proposals.length} proposals to import`);

    let imported = 0;
    let skipped = 0;

    for (const p of proposals) {
      try {
        await prisma.proposal.upsert({
          where: { proposalId: p.proposal_id },
          update: {
            customerName: p.customer_name,
            customerEmail: p.customer_email,
            proposalAmount: p.proposal_amount,
            sentDate: p.sent_date ? new Date(p.sent_date) : null,
            signedDate: p.signed_date ? new Date(p.signed_date) : null,
            status: p.status,
            tenant: TENANT
          },
          create: {
            proposalId: p.proposal_id,
            customerName: p.customer_name,
            customerEmail: p.customer_email,
            proposalAmount: p.proposal_amount,
            sentDate: p.sent_date ? new Date(p.sent_date) : null,
            signedDate: p.signed_date ? new Date(p.signed_date) : null,
            status: p.status,
            tenant: TENANT
          }
        });
        imported++;
        process.stdout.write(`\rImported: ${imported}/${proposals.length}`);
      } catch (err) {
        console.error(`\nError importing ${p.proposal_id}:`, err.message);
        skipped++;
      }
    }

    console.log(`\n\nDone! Imported: ${imported}, Skipped: ${skipped}`);

  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

importProposals();
