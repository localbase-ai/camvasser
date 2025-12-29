import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

/**
 * Normalize email for comparison
 */
function normalizeEmail(email) {
  if (!email) return null;
  return email.toLowerCase().trim();
}

/**
 * Normalize phone for comparison (last 10 digits)
 */
function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/**
 * Find existing prospect by email or phone
 */
function findMatchingProspect(lead, prospects) {
  const leadEmail = normalizeEmail(lead.email);
  const leadPhone = normalizePhone(lead.phone);

  for (const prospect of prospects) {
    // Check email match
    if (leadEmail && prospect.emails) {
      const prospectEmails = Array.isArray(prospect.emails)
        ? prospect.emails.map(e => normalizeEmail(typeof e === 'string' ? e : e.email_address || e.email))
        : [];
      if (prospectEmails.some(e => e === leadEmail)) {
        return prospect;
      }
    }

    // Check phone match
    if (leadPhone && prospect.phones) {
      const prospectPhones = Array.isArray(prospect.phones)
        ? prospect.phones.map(p => normalizePhone(typeof p === 'string' ? p : p.phone_number || p.phone))
        : [];
      if (prospectPhones.some(p => p === leadPhone)) {
        return prospect;
      }
    }
  }

  return null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (dryRun) {
    console.log('=== DRY RUN MODE - No changes will be made ===\n');
  }

  // Get all leads without a prospect link
  const leads = await prisma.lead.findMany({
    where: {
      prospectId: null
    }
  });

  // Get all existing prospects
  const prospects = await prisma.prospect.findMany();

  console.log(`Leads without prospect: ${leads.length}`);
  console.log(`Existing prospects: ${prospects.length}`);
  console.log('\n' + '='.repeat(60) + '\n');

  let created = 0;
  let linked = 0;
  let skipped = 0;

  for (const lead of leads) {
    // Skip leads with no name
    if (!lead.firstName && !lead.lastName) {
      skipped++;
      continue;
    }

    // Check if matching prospect already exists
    const existingProspect = findMatchingProspect(lead, prospects);

    if (existingProspect) {
      // Link to existing prospect
      console.log(`LINK: ${lead.firstName} ${lead.lastName} -> ${existingProspect.name} [${existingProspect.id}]`);

      if (!dryRun) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { prospectId: existingProspect.id }
        });
      }
      linked++;
    } else {
      // Create new prospect from lead
      const name = `${lead.firstName || ''} ${lead.lastName || ''}`.trim();
      const whitepagesId = `lead_${crypto.randomBytes(8).toString('hex')}`;

      console.log(`CREATE: ${name} (${lead.email || lead.phone || 'no contact'})`);

      if (!dryRun) {
        const newProspect = await prisma.prospect.create({
          data: {
            whitepagesId,
            projectId: lead.projectId || null,
            name,
            emails: lead.email ? [lead.email] : [],
            phones: lead.phone ? [{ type: 'unknown', number: lead.phone }] : [],
            isHomeowner: false,
            isCurrentResident: false,
            tenant: lead.tenant,
            status: lead.status || 'lead',
            notes: lead.notes || null
          }
        });

        // Link the lead to the new prospect
        await prisma.lead.update({
          where: { id: lead.id },
          data: { prospectId: newProspect.id }
        });

        // Add to our list for future matching
        prospects.push(newProspect);
      }
      created++;
    }
  }

  // Final counts
  const finalProspectCount = await prisma.prospect.count();

  console.log('\n' + '='.repeat(60));
  console.log('\nSummary:');
  console.log(`  Leads processed: ${leads.length}`);
  console.log(`  New prospects created: ${created}`);
  console.log(`  Linked to existing: ${linked}`);
  console.log(`  Skipped (no name): ${skipped}`);
  console.log(`  Total prospects now: ${dryRun ? prospects.length + created : finalProspectCount}`);

  if (dryRun) {
    console.log('\n=== This was a DRY RUN - run without --dry-run to apply changes ===');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
