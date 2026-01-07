import Database from 'better-sqlite3';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const qbDb = new Database('/Users/ryanriggin/Work/renu/data/quickbooks/quickbooks.db', { readonly: true });

const completedEstimateIds = [
  '2151', '2028', '1905', '1910', '1970', '1525', '2002', '1987', '1906', '2126',
  '1155', '1981', '1875', '2127', '1810', '1166', '2774', '1335', '2776', '2128',
  '1569', '1157', '3266', '1160', '1815'
];

async function resyncCompleted() {
  let created = 0;

  for (const estId of completedEstimateIds) {
    const est = qbDb.prepare('SELECT * FROM estimates WHERE id = ?').get(estId);
    if (!est) {
      console.log('Not found in SQLite:', estId);
      continue;
    }

    await prisma.proposal.create({
      data: {
        proposalId: 'qb-est-' + est.id,
        customerName: est.customer_name || null,
        customerEmail: est.customer_email || null,
        proposalAmount: est.total_amt,
        sentDate: est.txn_date ? new Date(est.txn_date) : null,
        signedDate: est.accepted_date ? new Date(est.accepted_date) : new Date(),
        status: 'won',
        tenant: 'budroofing',
        qbEstimateId: est.id,
        qbCustomerId: est.customer_id || null,
        qbDocNumber: est.doc_number || null,
        qbSyncedAt: new Date()
      }
    });
    console.log('Re-synced as WON:', est.customer_name, '- $' + est.total_amt?.toLocaleString());
    created++;
  }

  console.log('\nDone: Re-synced', created, 'completed estimates as WON');

  qbDb.close();
  await prisma.$disconnect();
}

resyncCompleted().catch(console.error);
