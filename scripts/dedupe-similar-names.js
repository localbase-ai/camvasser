import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Normalize name - extract first and last name only, lowercase
function normalizeName(name) {
  if (!name) return null;
  const parts = name.toLowerCase().trim().split(/\s+/);
  if (parts.length < 2) return null;

  const firstName = parts[0];
  const lastName = parts[parts.length - 1];

  return `${firstName} ${lastName}`;
}

// Score a contact based on data richness
function scoreContact(contact) {
  let score = 0;

  // Phone numbers (most valuable)
  const phones = contact.phones || [];
  score += phones.length * 10;

  // Email addresses
  const emails = contact.emails || [];
  score += emails.length * 8;

  // Address
  if (contact.lookupAddress) score += 7;

  // Status (non-new is more valuable)
  if (contact.status && contact.status !== 'new') score += 5;

  // Notes
  if (contact.notes) score += 4;

  // Company info
  if (contact.companyName) score += 3;
  if (contact.jobTitle) score += 3;

  // LinkedIn
  if (contact.linkedinUrl) score += 3;

  // Full name (longer name with middle name/initial is more complete)
  const nameParts = (contact.name || '').split(/\s+/);
  if (nameParts.length > 2) score += 2; // Has middle name
  else if (nameParts.length === 2) score += 1;

  // Project association
  if (contact.projectId) score += 2;

  // Campaign
  if (contact.campaign) score += 1;

  return score;
}

async function dedupeSimilarNames() {
  const dryRun = process.argv.includes('--dry-run');
  const tenant = process.argv.find(arg => arg.startsWith('--tenant='))?.split('=')[1];

  if (!tenant) {
    console.log('Usage: node scripts/dedupe-similar-names.js --tenant=budroofing [--dry-run]');
    console.log('  --dry-run: Show duplicates without making changes');
    process.exit(1);
  }

  console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Deduplicating contacts by similar names for tenant: ${tenant}\n`);

  // Get all prospects for this tenant
  const prospects = await prisma.prospect.findMany({
    where: { tenant }
  });

  console.log(`Total contacts: ${prospects.length}\n`);

  // Group by normalized name (first + last only)
  const groups = new Map();

  for (const prospect of prospects) {
    const normalizedName = normalizeName(prospect.name);
    if (!normalizedName) continue;

    if (!groups.has(normalizedName)) {
      groups.set(normalizedName, []);
    }
    groups.get(normalizedName).push(prospect);
  }

  // Find groups with duplicates
  const duplicateGroups = Array.from(groups.entries())
    .filter(([_, prospects]) => prospects.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  console.log(`Found ${duplicateGroups.length} groups with similar names\n`);

  if (duplicateGroups.length === 0) {
    console.log('No duplicates found!');
    await prisma.$disconnect();
    return;
  }

  let totalDupes = 0;
  let totalMerged = 0;

  for (const [normalizedName, dupes] of duplicateGroups) {
    // Score each contact and sort by score (highest first)
    const scored = dupes.map(d => ({ contact: d, score: scoreContact(d) }));
    scored.sort((a, b) => b.score - a.score);

    const keep = scored[0].contact;
    const remove = scored.slice(1).map(s => s.contact);
    totalDupes += remove.length;

    // Merge data from all duplicates into the keeper
    const mergedData = mergeProspectData(keep, remove);
    const hasChanges = Object.keys(mergedData).length > 0;

    if (hasChanges) totalMerged++;

    console.log(`--- ${normalizedName} (${dupes.length} entries) ---`);
    console.log(`KEEP: "${keep.name}" (score: ${scored[0].score}, id: ${keep.id})`);
    console.log(`  Phone: ${keep.phones?.[0]?.phone_number || '-'}`);
    console.log(`  Address: ${keep.lookupAddress || '-'}`);
    console.log(`  Status: ${keep.status || '-'}`);

    if (hasChanges) {
      console.log(`  MERGING:`);
      for (const [field, value] of Object.entries(mergedData)) {
        if (field === 'phones' || field === 'emails') {
          console.log(`    ${field}: +${Array.isArray(value) ? value.length - (keep[field]?.length || 0) : 0} new`);
        } else {
          console.log(`    ${field}: ${typeof value === 'string' ? value.substring(0, 50) : value}`);
        }
      }
    }

    for (const r of remove) {
      const rScore = scored.find(s => s.contact.id === r.id)?.score || 0;
      console.log(`  DELETE: "${r.name}" (score: ${rScore}, id: ${r.id})`);
      console.log(`    Phone: ${r.phones?.[0]?.phone_number || '-'} | Addr: ${(r.lookupAddress || '-').substring(0, 30)}`);
    }
    console.log('');

    if (!dryRun) {
      // Update the keeper with merged data
      if (hasChanges) {
        await prisma.prospect.update({
          where: { id: keep.id },
          data: mergedData
        });
      }

      // Handle call list items - reassign to keeper
      const toDeleteIds = remove.map(r => r.id);
      await prisma.callListItem.updateMany({
        where: { contactId: { in: toDeleteIds } },
        data: { contactId: keep.id }
      });

      // Handle organization contacts - reassign to keeper (delete if would create dupe)
      for (const removeId of toDeleteIds) {
        const orgContacts = await prisma.organizationContact.findMany({
          where: { prospectId: removeId }
        });

        for (const oc of orgContacts) {
          const existing = await prisma.organizationContact.findFirst({
            where: {
              prospectId: keep.id,
              organizationId: oc.organizationId
            }
          });

          if (existing) {
            await prisma.organizationContact.delete({
              where: { id: oc.id }
            });
          } else {
            await prisma.organizationContact.update({
              where: { id: oc.id },
              data: { prospectId: keep.id }
            });
          }
        }
      }

      // Delete the duplicates
      await prisma.prospect.deleteMany({
        where: { id: { in: toDeleteIds } }
      });
    }
  }

  console.log(`\n========== SUMMARY ==========`);
  console.log(`Total duplicates to remove: ${totalDupes}`);
  console.log(`Records with merged data: ${totalMerged}`);
  console.log(`Unique contacts remaining: ${prospects.length - totalDupes}\n`);

  if (dryRun) {
    console.log('[DRY RUN] No changes made. Run without --dry-run to apply changes.');
  } else {
    console.log('Deduplication complete!');
  }

  await prisma.$disconnect();
}

// Merge data from duplicates into the keeper
function mergeProspectData(keep, duplicates) {
  const merged = {};

  // Merge phones - combine unique phone numbers
  const allPhones = [...(keep.phones || [])];
  const existingNumbers = new Set(allPhones.map(p => p.phone_number?.replace(/\D/g, '')));

  for (const dup of duplicates) {
    for (const phone of (dup.phones || [])) {
      const normalized = phone.phone_number?.replace(/\D/g, '');
      if (normalized && !existingNumbers.has(normalized)) {
        allPhones.push(phone);
        existingNumbers.add(normalized);
      }
    }
  }

  if (allPhones.length > (keep.phones || []).length) {
    merged.phones = allPhones;
  }

  // Merge emails - combine unique emails
  const allEmails = [...(keep.emails || [])];
  const existingEmails = new Set(allEmails.map(e => e.email?.toLowerCase()));

  for (const dup of duplicates) {
    for (const email of (dup.emails || [])) {
      const normalized = email.email?.toLowerCase();
      if (normalized && !existingEmails.has(normalized)) {
        allEmails.push(email);
        existingEmails.add(normalized);
      }
    }
  }

  if (allEmails.length > (keep.emails || []).length) {
    merged.emails = allEmails;
  }

  // Merge status - prefer non-'new' status
  if (!keep.status || keep.status === 'new') {
    for (const dup of duplicates) {
      if (dup.status && dup.status !== 'new') {
        merged.status = dup.status;
        break;
      }
    }
  }

  // Merge notes - concatenate if different
  const allNotes = [keep.notes];
  for (const dup of duplicates) {
    if (dup.notes && !allNotes.includes(dup.notes)) {
      allNotes.push(dup.notes);
    }
  }
  const combinedNotes = allNotes.filter(Boolean).join('\n---\n');
  if (combinedNotes && combinedNotes !== keep.notes) {
    merged.notes = combinedNotes;
  }

  // Merge lookupAddress - keep if exists
  if (!keep.lookupAddress) {
    for (const dup of duplicates) {
      if (dup.lookupAddress) {
        merged.lookupAddress = dup.lookupAddress;
        break;
      }
    }
  }

  // Merge linkedinUrl - keep if exists
  if (!keep.linkedinUrl) {
    for (const dup of duplicates) {
      if (dup.linkedinUrl) {
        merged.linkedinUrl = dup.linkedinUrl;
        break;
      }
    }
  }

  // Merge companyName - keep if exists
  if (!keep.companyName) {
    for (const dup of duplicates) {
      if (dup.companyName) {
        merged.companyName = dup.companyName;
        break;
      }
    }
  }

  // Merge jobTitle - keep if exists
  if (!keep.jobTitle) {
    for (const dup of duplicates) {
      if (dup.jobTitle) {
        merged.jobTitle = dup.jobTitle;
        break;
      }
    }
  }

  // Merge projectId - keep if exists
  if (!keep.projectId) {
    for (const dup of duplicates) {
      if (dup.projectId) {
        merged.projectId = dup.projectId;
        break;
      }
    }
  }

  // Merge campaign - keep if exists
  if (!keep.campaign) {
    for (const dup of duplicates) {
      if (dup.campaign) {
        merged.campaign = dup.campaign;
        break;
      }
    }
  }

  return merged;
}

dedupeSimilarNames().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
