// Syncs production Prisma db to local SQLite for viewing
// Usage: node scripts/sync-local-db.js

import { PrismaClient } from '@prisma/client';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();
const dbPath = path.join(__dirname, '..', 'prisma', 'camvasser_local.db');
const db = new Database(dbPath);

async function exportTable(tableName, query, columns = null) {
  const data = await query;
  db.exec(`DROP TABLE IF EXISTS "${tableName}"`);

  if (data.length === 0) {
    // Create empty table with provided columns or skip
    if (columns) {
      const colDefs = columns.map(c => `"${c}" TEXT`).join(', ');
      db.exec(`CREATE TABLE "${tableName}" (${colDefs})`);
    }
    console.log(`${tableName}: 0 rows`);
    return;
  }

  const cols = Object.keys(data[0]);
  const colDefs = cols.map(c => `"${c}" TEXT`).join(', ');
  db.exec(`CREATE TABLE "${tableName}" (${colDefs})`);

  const placeholders = cols.map(() => '?').join(', ');
  const insert = db.prepare(`INSERT INTO "${tableName}" VALUES (${placeholders})`);

  for (const row of data) {
    const values = cols.map(c => {
      const v = row[c];
      if (v === null || v === undefined) return null;
      if (v instanceof Date) return v.toISOString();
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    });
    insert.run(values);
  }
  console.log(`${tableName}: ${data.length} rows`);
}

(async () => {
  console.log('Syncing from production...');
  await exportTable('leads', prisma.lead.findMany());
  await exportTable('prospects', prisma.prospect.findMany());
  await exportTable('projects', prisma.project.findMany());
  await exportTable('business_users', prisma.businessUser.findMany());
  await exportTable('project_labels', prisma.projectLabel.findMany());
  await exportTable('tenants', prisma.tenant.findMany());
  await exportTable('user_tenants', prisma.userTenant.findMany());
  await exportTable('notes', prisma.note.findMany());
  await exportTable('proposals', prisma.proposal.findMany());
  await exportTable('appointments', prisma.appointment.findMany(), [
    'id', 'leadId', 'tenant', 'googleEventId', 'summary', 'startTime', 'endTime',
    'durationMinutes', 'location', 'notes', 'status', 'eventType', 'createdAt', 'updatedAt'
  ]);
  db.close();
  await prisma.$disconnect();
  console.log('Done!');
})();
