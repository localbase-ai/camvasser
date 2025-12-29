import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function normalizeAddress(addr, city) {
  let s = (addr || '').toLowerCase()
    .replace(/\bsouthwest\b/g, 'sw')
    .replace(/\bnorthwest\b/g, 'nw')
    .replace(/\bsoutheast\b/g, 'se')
    .replace(/\bnortheast\b/g, 'ne')
    .replace(/\bstreet\b/g, 'st')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\bterrace\b/g, 'ter')
    .replace(/\bcourt\b/g, 'ct')
    .replace(/\bcircle\b/g, 'cir')
    .replace(/\blane\b/g, 'ln')
    .replace(/\bplace\b/g, 'pl')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\broad\b/g, 'rd')
    .replace(/[^a-z0-9]/g, '');

  const c = (city || '').toLowerCase().replace(/[^a-z]/g, '');
  return s + '|' + c;
}

/**
 * Score a record - higher is better
 */
function scoreRecord(record) {
  let score = 0;

  // Photos are most important - each photo adds 10 points
  score += (record.photoCount || 0) * 10;

  // Having a name is valuable
  if (record.name && !record.name.includes('Clay Import') && !record.name.includes('Door Hanger')) {
    score += 50;
  }

  // Having labels is valuable
  if (record.labels && record.labels.length > 0) {
    score += 30 * record.labels.length;
  }

  // Having prospects is very valuable - don't lose contact data!
  if (record.prospects && record.prospects.length > 0) {
    score += 100 * record.prospects.length;
  }

  // Active status is better than deleted
  if (record.status === 'active') {
    score += 20;
  }

  // Clay records get a small penalty (targets vs actual jobs)
  if (record.id.startsWith('clay_')) {
    score -= 5;
  }

  // Door hanger records get a penalty
  if (record.id.startsWith('dh_')) {
    score -= 5;
  }

  return score;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (dryRun) {
    console.log('=== DRY RUN MODE - No changes will be made ===\n');
  }

  const projects = await prisma.project.findMany({
    where: { address: { not: null } },
    include: { labels: true, prospects: true }
  });

  const groups = {};
  projects.forEach(p => {
    const key = normalizeAddress(p.address, p.city);
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  });

  const dupes = Object.entries(groups).filter(([k, v]) => v.length > 1);

  console.log('Total projects:', projects.length);
  console.log('Duplicate groups:', dupes.length);
  console.log('Records to process:', dupes.reduce((sum, [k, v]) => sum + v.length, 0));
  console.log('\n' + '='.repeat(60) + '\n');

  let kept = 0;
  let deleted = 0;

  for (const [key, records] of dupes) {
    // Score each record
    const scored = records.map(r => ({
      record: r,
      score: scoreRecord(r)
    })).sort((a, b) => b.score - a.score);

    const winner = scored[0];
    const losers = scored.slice(1);

    console.log(`${records[0].address}, ${records[0].city}`);
    console.log(`  KEEP: [${winner.record.id}] score=${winner.score} photos=${winner.record.photoCount} name="${winner.record.name || ''}"`);

    for (const loser of losers) {
      const prospectCount = loser.record.prospects?.length || 0;
      console.log(`  DEL:  [${loser.record.id}] score=${loser.score} photos=${loser.record.photoCount} prospects=${prospectCount} name="${loser.record.name || ''}"`);

      if (!dryRun) {
        // Migrate any prospects to the winning record before deleting
        if (prospectCount > 0) {
          console.log(`        -> Migrating ${prospectCount} prospects to ${winner.record.id}`);
          await prisma.prospect.updateMany({
            where: { projectId: loser.record.id },
            data: { projectId: winner.record.id }
          });
        }

        // Delete labels first (foreign key constraint)
        await prisma.projectLabel.deleteMany({
          where: { projectId: loser.record.id }
        });
        // Delete the project
        await prisma.project.delete({
          where: { id: loser.record.id }
        });
      }
      deleted++;
    }
    kept++;
    console.log('');
  }

  console.log('='.repeat(60));
  console.log(`\nDone!`);
  console.log(`  Duplicate groups processed: ${kept}`);
  console.log(`  Records deleted: ${deleted}`);
  console.log(`  Records remaining: ${projects.length - deleted}`);

  if (dryRun) {
    console.log('\n=== This was a DRY RUN - run without --dry-run to apply changes ===');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
