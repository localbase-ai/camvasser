import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

function parseCSV(content) {
  const lines = content.split('\n').filter(l => l.trim());
  const headers = lines[0].split(',').map(h => h.trim());

  return lines.slice(1).map(line => {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    const obj = {};
    headers.forEach((h, i) => obj[h] = values[i] || '');
    return obj;
  });
}

async function processReview() {
  console.log('='.repeat(70));
  console.log('Process Organization Review');
  console.log('='.repeat(70));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

  const csv = readFileSync('org-review.csv', 'utf-8');
  const rows = parseCSV(csv);

  // Get the type column (might have different names)
  const typeKey = Object.keys(rows[0]).find(k => k.toLowerCase().includes('type')) || 'type';

  const stats = { org: 0, person: 0, trust: 0, delete: 0, skipped: 0 };
  const orgsToCreate = [];
  const prospectsToDelete = [];

  for (const row of rows) {
    const type = (row[typeKey] || '').toLowerCase().trim();
    const prospectId = row.id;
    const name = row.name?.replace(/^"|"$/g, '') || '';

    if (!type) {
      stats.skipped++;
      continue;
    }

    if (type === 'org') {
      stats.org++;
      orgsToCreate.push({
        prospectId,
        name,
        address: row.address?.replace(/^"|"$/g, '') || null,
        city: row.city || null,
        state: row.state || null,
        phones: row.phones?.replace(/^"|"$/g, '') || null,
        emails: row.emails?.replace(/^"|"$/g, '') || null
      });
    } else if (type === 'person') {
      stats.person++;
      // Keep as-is
    } else if (type === 'trust') {
      stats.trust++;
      // Keep as-is (could flag later)
    } else if (type === 'delete') {
      stats.delete++;
      prospectsToDelete.push(prospectId);
    }
  }

  console.log('Summary:');
  console.log(`  Organizations to create: ${stats.org}`);
  console.log(`  People (keep as prospect): ${stats.person}`);
  console.log(`  Trusts (keep as prospect): ${stats.trust}`);
  console.log(`  To delete: ${stats.delete}`);
  console.log(`  Skipped (no type): ${stats.skipped}`);
  console.log('');

  if (orgsToCreate.length > 0) {
    console.log('\nOrganizations to create:');
    for (const org of orgsToCreate) {
      console.log(`  - ${org.name}`);

      if (!DRY_RUN) {
        // Check if org already exists by name
        const existing = await prisma.organization.findFirst({
          where: { name: { equals: org.name, mode: 'insensitive' } }
        });

        if (existing) {
          console.log(`    (already exists as ${existing.id})`);
        } else {
          // Create organization
          const newOrg = await prisma.organization.create({
            data: {
              id: randomUUID().replace(/-/g, '').slice(0, 24),
              name: org.name,
              type: 'other',
              address: org.address,
              city: org.city,
              state: org.state,
              phone: org.phones?.split(';')[0]?.trim() || null,
              email: org.emails?.split(';')[0]?.trim() || null,
              tenant: 'acme',
              updatedAt: new Date()
            }
          });
          console.log(`    Created: ${newOrg.id}`);
        }

        // Delete the prospect
        await prisma.prospect.delete({ where: { id: org.prospectId } });
        console.log(`    Deleted prospect: ${org.prospectId}`);
      }
    }
  }

  if (prospectsToDelete.length > 0) {
    console.log('\nProspects to delete:');
    for (const id of prospectsToDelete) {
      const prospect = await prisma.prospect.findUnique({ where: { id }, select: { name: true } });
      console.log(`  - ${prospect?.name || id}`);

      if (!DRY_RUN) {
        await prisma.prospect.delete({ where: { id } });
        console.log(`    Deleted`);
      }
    }
  }

  if (DRY_RUN) {
    console.log('\nThis was a DRY RUN. No changes were made.');
    console.log('Run without --dry-run to apply changes.');
  }

  await prisma.$disconnect();
}

processReview().catch(console.error);
