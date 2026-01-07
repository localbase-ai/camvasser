import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function dedupeContacts() {
  const dryRun = process.argv.includes('--dry-run');
  const tenant = process.argv.find(arg => arg.startsWith('--tenant='))?.split('=')[1];

  if (!tenant) {
    console.log('Usage: node scripts/dedupe-contacts.js --tenant=budroofing [--dry-run]');
    console.log('  --dry-run: Show duplicates without making changes');
    process.exit(1);
  }

  console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Deduplicating contacts for tenant: ${tenant}\n`);

  // Get all prospects for this tenant
  const prospects = await prisma.prospect.findMany({
    where: { tenant },
    orderBy: { updatedAt: 'desc' } // Most recently updated first
  });

  console.log(`Total contacts: ${prospects.length}\n`);

  // Group by name + phone + address
  const groups = new Map();

  for (const prospect of prospects) {
    // Get primary phone
    const phones = prospect.phones || [];
    const primaryPhone = phones[0]?.phone_number || '';

    // Create a dedupe key: normalized name + phone + address
    const name = (prospect.name || '').toLowerCase().trim();
    const phone = primaryPhone.replace(/\D/g, ''); // Remove non-digits
    const address = (prospect.lookupAddress || '').toLowerCase().trim();

    // Skip if no identifying info
    if (!name && !phone && !address) continue;

    const key = `${name}|${phone}|${address}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(prospect);
  }

  // Find groups with duplicates
  const duplicateGroups = Array.from(groups.entries())
    .filter(([_, prospects]) => prospects.length > 1);

  console.log(`Found ${duplicateGroups.length} groups with duplicates\n`);

  if (duplicateGroups.length === 0) {
    console.log('No duplicates found!');
    await prisma.$disconnect();
    return;
  }

  let totalDupes = 0;
  let totalMerged = 0;

  for (const [key, dupes] of duplicateGroups) {
    // Keep the first one (most recently updated), merge data from others
    const [keep, ...remove] = dupes;
    totalDupes += remove.length;

    // Merge data from all duplicates into the keeper
    const mergedData = mergeProspectData(keep, remove);
    const hasChanges = Object.keys(mergedData).length > 0;

    if (hasChanges) totalMerged++;

    console.log(`--- Duplicate Group ---`);
    console.log(`Key: ${key}`);
    console.log(`KEEP: ${keep.name} (id: ${keep.id})`);

    if (hasChanges) {
      console.log(`  MERGING:`);
      for (const [field, value] of Object.entries(mergedData)) {
        if (field === 'phones' || field === 'emails') {
          console.log(`    ${field}: ${JSON.stringify(value)}`);
        } else {
          console.log(`    ${field}: ${value}`);
        }
      }
    }

    for (const r of remove) {
      console.log(`  DELETE: ${r.name} (id: ${r.id})`);
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
          // Check if keeper already has this org relationship
          const existing = await prisma.organizationContact.findFirst({
            where: {
              prospectId: keep.id,
              organizationId: oc.organizationId
            }
          });

          if (existing) {
            // Delete the duplicate org contact
            await prisma.organizationContact.delete({
              where: { id: oc.id }
            });
          } else {
            // Reassign to keeper
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
  console.log(`Will keep: ${groups.size} unique contacts`);
  console.log(`Final contact count: ${prospects.length - totalDupes}\n`);

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

  // Merge campaign - keep if exists
  if (!keep.campaign) {
    for (const dup of duplicates) {
      if (dup.campaign) {
        merged.campaign = dup.campaign;
        break;
      }
    }
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

  return merged;
}

dedupeContacts().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
