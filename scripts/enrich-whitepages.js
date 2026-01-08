import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const WHITEPAGES_API_KEY = process.env.WHITEPAGES_API_KEY;
const BASE_URL = 'https://api.whitepages.com';

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

// Statuses that trigger REPLACE (old data was bad)
const REPLACE_STATUSES = ['bad_number', 'wrong_number'];
// Statuses that trigger MERGE (add new, keep existing)
const MERGE_STATUSES = [null, 'no_answer'];

async function lookupProperty(street, city, state) {
  const params = new URLSearchParams();
  if (street) params.append('street', street);
  if (city) params.append('city', city);
  if (state) params.append('state_code', state);

  const url = `${BASE_URL}/v2/property/?${params}`;

  const response = await fetch(url, {
    headers: { 'X-Api-Key': WHITEPAGES_API_KEY }
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error ${response.status}: ${err}`);
  }

  return response.json();
}

function normalizePhone(phone) {
  return (phone || '').replace(/\D/g, '').slice(-10);
}

function mergePhones(existing, newPhones, mode) {
  if (mode === 'replace') {
    return newPhones;
  }

  // Merge mode - add new phones, keep existing
  const existingNormalized = new Set(existing.map(p => normalizePhone(p.phone_number || p.number)));
  const merged = [...existing];

  for (const phone of newPhones) {
    const norm = normalizePhone(phone.number);
    if (!existingNormalized.has(norm)) {
      merged.push({
        phone_number: phone.number.replace(/^1/, '').replace(/(\d{3})(\d{3})(\d{4})/, '$1$2$3'),
        line_type: phone.type?.toLowerCase() || 'unknown',
        source: 'whitepages'
      });
    }
  }

  return merged;
}

function mergeEmails(existing, newEmails, mode) {
  if (mode === 'replace') {
    return newEmails.map(e => e.email);
  }

  const existingSet = new Set((existing || []).map(e => (e.email || e).toLowerCase()));
  const merged = [...(existing || [])];

  for (const email of newEmails) {
    if (!existingSet.has(email.email.toLowerCase())) {
      merged.push(email.email);
    }
  }

  return merged;
}

async function main() {
  console.log('='.repeat(70));
  console.log('Whitepages Enrichment Script');
  console.log('='.repeat(70));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`);
  console.log('');

  // Get prospects with eligible statuses and door-hanger/melt-pattern labels
  const prospects = await prisma.prospect.findMany({
    where: {
      OR: [
        { status: null },
        { status: { in: ['no_answer', 'bad_number', 'wrong_number'] } }
      ],
      project: { isNot: null }
    },
    include: {
      project: { include: { labels: true } }
    }
  });

  // Filter to door-hanger/melt-pattern
  const filtered = prospects.filter(p => {
    const labels = p.project?.labels || [];
    return labels.some(l =>
      (l.value || l.label || '').toLowerCase().includes('door') ||
      (l.value || l.label || '').toLowerCase().includes('melt')
    );
  });

  console.log(`Found ${filtered.length} prospects with door-hanger/melt-pattern tags`);

  // Group by address
  const byAddress = new Map();
  for (const p of filtered) {
    const key = [p.project?.address, p.project?.city, p.project?.state]
      .filter(Boolean).join('|').toLowerCase();
    if (!byAddress.has(key)) {
      byAddress.set(key, { address: p.project, prospects: [] });
    }
    byAddress.get(key).prospects.push(p);
  }

  console.log(`Unique addresses: ${byAddress.size}`);
  console.log(`API calls needed: ${byAddress.size}`);
  console.log('');

  const results = [];
  let apiCalls = 0;

  for (const [key, { address, prospects }] of byAddress) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`📍 ${address.address}, ${address.city}, ${address.state}`);
    console.log(`   ${prospects.length} prospect(s) at this address`);

    // Call Whitepages
    let wpData;
    try {
      wpData = await lookupProperty(address.address, address.city, address.state);
      apiCalls++;
      console.log(`   ✓ Whitepages lookup successful`);
    } catch (err) {
      console.log(`   ✗ Whitepages error: ${err.message}`);
      continue;
    }

    const owner = wpData.result?.ownership_info?.person_owners?.[0];
    const residents = wpData.result?.residents || [];

    if (!owner && residents.length === 0) {
      console.log(`   ⚠ No owner/resident data found`);
      continue;
    }

    // Show what Whitepages returned
    console.log(`\n   WHITEPAGES DATA:`);
    if (owner) {
      console.log(`   Owner: ${owner.name}`);
      console.log(`   Phones: ${(owner.phones || []).map(p => p.number).join(', ') || 'none'}`);
      console.log(`   Emails: ${(owner.emails || []).map(e => e.email).join(', ') || 'none'}`);
    }

    // Process each prospect at this address
    for (const prospect of prospects) {
      const existingPhones = typeof prospect.phones === 'string'
        ? JSON.parse(prospect.phones || '[]')
        : (prospect.phones || []);
      const existingEmails = typeof prospect.emails === 'string'
        ? JSON.parse(prospect.emails || '[]')
        : (prospect.emails || []);

      const mode = REPLACE_STATUSES.includes(prospect.status) ? 'replace' : 'merge';

      // Find best match - try to match by name, otherwise use owner
      let wpPerson = owner;
      if (prospect.name && prospect.name !== '---') {
        const nameLower = prospect.name.toLowerCase();
        const match = residents.find(r =>
          r.name?.toLowerCase().includes(nameLower.split(' ')[0])
        );
        if (match) wpPerson = match;
      }

      if (!wpPerson) {
        console.log(`\n   [${prospect.id}] ${prospect.name || '(no name)'} - No WP match`);
        continue;
      }

      const newPhones = mergePhones(existingPhones, wpPerson.phones || [], mode);
      const newEmails = mergeEmails(existingEmails, wpPerson.emails || [], mode);
      const newName = (!prospect.name || prospect.name === '---') ? wpPerson.name : prospect.name;

      // Build diff
      const diff = {
        id: prospect.id,
        address: `${address.address}, ${address.city}`,
        status: prospect.status,
        mode,
        before: {
          name: prospect.name || '(empty)',
          phones: existingPhones.map(p => p.phone_number || p.number).join(', ') || '(none)',
          emails: (existingEmails || []).map(e => e.email || e).join(', ') || '(none)'
        },
        after: {
          name: newName,
          phones: newPhones.map(p => p.phone_number || p.number).join(', ') || '(none)',
          emails: newEmails.map(e => e.email || e).join(', ') || '(none)'
        },
        changes: []
      };

      if (diff.before.name !== diff.after.name) diff.changes.push('name');
      if (diff.before.phones !== diff.after.phones) diff.changes.push('phones');
      if (diff.before.emails !== diff.after.emails) diff.changes.push('emails');

      results.push(diff);

      // Print diff
      console.log(`\n   [${prospect.id.slice(0,8)}...] ${prospect.name || '(no name)'}`);
      console.log(`   Status: ${prospect.status || 'null'} → Mode: ${mode.toUpperCase()}`);

      if (diff.changes.length === 0) {
        console.log(`   No changes needed`);
      } else {
        console.log(`   Changes: ${diff.changes.join(', ')}`);
        if (diff.changes.includes('name')) {
          console.log(`     Name:   "${diff.before.name}" → "${diff.after.name}"`);
        }
        if (diff.changes.includes('phones')) {
          console.log(`     Phones: "${diff.before.phones}"`);
          console.log(`           → "${diff.after.phones}"`);
        }
        if (diff.changes.includes('emails')) {
          console.log(`     Emails: "${diff.before.emails}"`);
          console.log(`           → "${diff.after.emails}"`);
        }
      }

      // Actually update if not dry run
      if (!DRY_RUN && diff.changes.length > 0) {
        await prisma.prospect.update({
          where: { id: prospect.id },
          data: {
            name: newName,
            phones: newPhones,
            emails: newEmails,
            enrichedAt: new Date()
          }
        });
        console.log(`   ✓ Updated`);
      }
    }
  }

  // Summary
  console.log(`\n${'='.repeat(70)}`);
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`API calls made: ${apiCalls}`);
  console.log(`Prospects processed: ${results.length}`);
  console.log(`With changes: ${results.filter(r => r.changes.length > 0).length}`);
  console.log(`No changes: ${results.filter(r => r.changes.length === 0).length}`);

  if (DRY_RUN) {
    console.log(`\nThis was a DRY RUN. No data was modified.`);
    console.log(`Run without --dry-run to apply changes.`);
  }

  await prisma.$disconnect();
  return results;
}

main().catch(console.error);
