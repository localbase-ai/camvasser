import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'fs';

const prisma = new PrismaClient();

function guessType(name) {
  if (!name) return 'delete';
  const upper = name.toUpperCase();

  // Mixed case = person (names like "John Church" are people)
  if (upper !== name) {
    // Exception: "Vinelife Church" - mixed case, ends with org word, and first word is NOT a common first name
    const firstWord = name.split(' ')[0];
    const commonFirstNames = ['John', 'Bob', 'Mike', 'David', 'James', 'Robert', 'William', 'Mary', 'Sarah', 'Lisa'];
    if ((upper.endsWith(' CHURCH') || upper.endsWith(' HOA')) && !commonFirstNames.includes(firstWord)) {
      return 'org';
    }
    return 'person';
  }

  // All caps with & usually means "LASTNAME FIRST & SPOUSE" - person/couple
  if (name.includes(' & ')) return 'person';

  // Likely trusts (property ownership) - check before orgs
  const trustPatterns = ['TRUST', 'REVOCABLE', 'L/TR', 'JOINT TRU', 'TERMINABLE', 'DYNASTY', 'TREE', 'DEATH LAW', 'LIV RTUST'];
  if (trustPatterns.some(p => upper.includes(p))) return 'trust';

  // Likely organizations (all caps, no &)
  const orgPatterns = ['ARCHBISHOP', 'DIOCESE', 'BUDDHIST', 'RESTORATION', 'MONTESSORI', 'ASSOCIATION', 'CHURCH', 'MINISTRY', 'FOUNDATION', 'INTERNATIONAL'];
  if (orgPatterns.some(p => upper.includes(p))) return 'org';

  // Default to person
  return 'person';
}

async function exportForReview() {
  const prospects = await prisma.prospect.findMany({
    select: {
      id: true,
      name: true,
      phones: true,
      emails: true,
      companyName: true,
      projectId: true,
      Project: {
        select: { address: true, city: true, state: true }
      }
    }
  });

  const orgKeywords = ['LLC', 'INC', 'CORP', 'L.L.C', 'TRUST', 'HOA', 'ASSOCIATION', 'PROPERTIES', 'INVESTMENTS', 'MANAGEMENT', 'PARTNERS', 'HOLDINGS', 'REALTY', 'DEVELOPMENT', 'ARCHBISHOP', 'DIOCESE', 'CHURCH', 'BUDDHIST', 'RESTORATION', 'BUILDING', 'REVOCABLE', 'TERMINABLE', 'DYNASTY', 'LIVING', 'JOINT TRU'];

  const likelyOrgs = prospects.filter(p => {
    if (!p.name || p.name === '---') return false;
    const name = p.name.trim();
    const upperName = name.toUpperCase();

    if (orgKeywords.some(kw => upperName.includes(kw))) return true;
    if (name === name.toUpperCase() && name.length > 20) return true;

    return false;
  });

  likelyOrgs.sort((a, b) => a.name.localeCompare(b.name));

  const headers = ['id', 'name', 'address', 'city', 'state', 'phones', 'emails', 'type'];
  const rows = likelyOrgs.map(p => {
    const phones = Array.isArray(p.phones) ? p.phones.map(ph => ph.phone_number || ph.number).join('; ') : '';
    const emails = Array.isArray(p.emails) ? p.emails.map(e => e.email || e.email_address || e).join('; ') : '';
    const type = guessType(p.name);

    return [
      p.id,
      `"${(p.name || '').replace(/"/g, '""')}"`,
      `"${(p.Project?.address || '').replace(/"/g, '""')}"`,
      p.Project?.city || '',
      p.Project?.state || '',
      `"${phones}"`,
      `"${emails}"`,
      type
    ].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  const filename = 'org-review.csv';
  writeFileSync(filename, csv);

  // Print summary
  const types = likelyOrgs.reduce((acc, p) => {
    const t = guessType(p.name);
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  console.log(`Exported ${likelyOrgs.length} prospects to ${filename}`);
  console.log('\nPre-filled breakdown:');
  console.log(`  org: ${types.org || 0}`);
  console.log(`  person: ${types.person || 0}`);
  console.log(`  trust: ${types.trust || 0}`);
  console.log(`  delete: ${types.delete || 0}`);
  console.log('\nReview the CSV and adjust as needed, then run:');
  console.log('  node scripts/process-org-review.js --dry-run');

  await prisma.$disconnect();
}

exportForReview();
