/**
 * One-time script to sync existing notes to QuickBooks customers
 * Run with: node scripts/sync-notes-to-quickbooks.js
 */

import { PrismaClient } from '@prisma/client';
import { updateCustomerNotes } from '../netlify/functions/lib/quickbooks.js';
import dotenv from 'dotenv';

// Load .env.local first, then .env
dotenv.config({ path: '.env.local' });
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  // Find all leads with QB customer IDs
  const leadsWithQB = await prisma.lead.findMany({
    where: {
      flowData: {
        path: ['quickbooks_customer_id'],
        not: null
      }
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      flowData: true
    }
  });

  console.log(`Found ${leadsWithQB.length} leads linked to QuickBooks`);

  let synced = 0;
  let skipped = 0;
  let errors = 0;

  for (const lead of leadsWithQB) {
    const qbCustomerId = lead.flowData?.quickbooks_customer_id;
    if (!qbCustomerId) {
      skipped++;
      continue;
    }

    // Get all notes for this lead
    const notes = await prisma.note.findMany({
      where: { entityType: 'lead', entityId: lead.id },
      orderBy: { createdAt: 'asc' }
    });

    if (notes.length === 0) {
      console.log(`  [${lead.firstName} ${lead.lastName}] No notes to sync`);
      skipped++;
      continue;
    }

    // Format notes for QB
    const notesText = notes.map(n => {
      const date = new Date(n.createdAt).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      });
      const author = n.authorName || 'Unknown';
      return `[${date} - ${author}]\n${n.content}`;
    }).join('\n\n---\n\n');

    try {
      await updateCustomerNotes(qbCustomerId, notesText);
      console.log(`  [${lead.firstName} ${lead.lastName}] Synced ${notes.length} notes to QB customer ${qbCustomerId}`);
      synced++;
    } catch (error) {
      console.error(`  [${lead.firstName} ${lead.lastName}] Error: ${error.message}`);
      errors++;
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('\n--- Summary ---');
  console.log(`Synced: ${synced}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
