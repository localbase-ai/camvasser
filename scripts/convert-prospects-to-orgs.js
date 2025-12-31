import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Keywords that indicate a business/organization
const BUSINESS_KEYWORDS = [
  // Legal entities
  'LLC', 'L.L.C.', 'Inc', 'Inc.', 'Incorporated', 'Corp', 'Corp.', 'Corporation',
  'Company', 'Co.', 'Ltd', 'Ltd.', 'Limited', 'LP', 'L.P.', 'LLP', 'L.L.P.',
  // Property/Real estate
  'Property', 'Properties', 'Management', 'Realty', 'Real Estate', 'Rentals',
  'Investments', 'Investment', 'Holdings', 'Holding', 'Capital',
  // HOA/Community
  'HOA', 'H.O.A.', 'Association', 'Homeowners', 'Homeowner', 'Community',
  // Trust/Estate
  'Trust', 'Estate', 'Estates', 'Living Trust', 'Family Trust', 'Revocable Trust',
  // Religious
  'Church', 'Ministry', 'Ministries', 'Temple', 'Mosque', 'Synagogue',
  // Other business indicators
  'Group', 'Partners', 'Partnership', 'Enterprises', 'Services', 'Solutions',
  'Apartments', 'Apartment', 'Complex'
];

// Infer organization type from name
function inferOrgType(name) {
  if (/\b(HOA|H\.O\.A\.|ASSOCIATION|HOMEOWNERS?)\b/i.test(name)) {
    return 'hoa';
  }
  if (/\b(PROPERTY|PROPERTIES|MANAGEMENT|REALTY|REAL ESTATE|RENTALS)\b/i.test(name)) {
    return 'property_management';
  }
  if (/\b(CHURCH|MINISTRY|MINISTRIES|TEMPLE|MOSQUE|SYNAGOGUE)\b/i.test(name)) {
    return 'church';
  }
  if (/\b(APARTMENTS?|COMPLEX)\b/i.test(name)) {
    return 'apartment_complex';
  }

  return 'other';
}

// Check if name looks like a business
function isBusinessName(name) {
  if (!name) return false;

  // Check for keyword matches (case insensitive, word boundary)
  for (const keyword of BUSINESS_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword.replace(/\./g, '\\.')}\\b`, 'i');
    if (regex.test(name)) {
      return true;
    }
  }

  return false;
}

// Extract first phone number from phones JSON
function getFirstPhone(phones) {
  if (!phones || !Array.isArray(phones) || phones.length === 0) return null;
  return phones[0]?.phone_number || phones[0]?.number || null;
}

// Extract first email from emails JSON
function getFirstEmail(emails) {
  if (!emails || !Array.isArray(emails) || emails.length === 0) return null;
  return emails[0]?.email_address || emails[0]?.email || null;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const campaignArg = args.find(a => a.startsWith('--campaign='));
  const campaign = campaignArg ? campaignArg.split('=')[1] : null;

  if (!campaign) {
    console.log('Usage: node convert-prospects-to-orgs.js --campaign=66206 [--dry-run]');
    console.log('');
    console.log('Options:');
    console.log('  --campaign=ID   Campaign ID to process (required)');
    console.log('  --dry-run       Preview changes without making them');
    process.exit(1);
  }

  console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Converting business prospects to organizations`);
  console.log(`Campaign: ${campaign}`);
  console.log('');

  // Find prospects in this campaign
  const prospects = await prisma.prospect.findMany({
    where: { campaign },
    include: {
      project: {
        select: { address: true, city: true, state: true, postalCode: true }
      }
    }
  });

  console.log(`Found ${prospects.length} total prospects in campaign ${campaign}`);

  // Filter to business names
  const businessProspects = prospects.filter(p => isBusinessName(p.name));
  console.log(`Found ${businessProspects.length} prospects with business-like names\n`);

  if (businessProspects.length === 0) {
    console.log('No business prospects found to convert.');
    await prisma.$disconnect();
    return;
  }

  // Group by inferred type for preview
  const byType = {};
  for (const p of businessProspects) {
    const type = inferOrgType(p.name);
    if (!byType[type]) byType[type] = [];
    byType[type].push(p);
  }

  console.log('--- Preview by type ---');
  for (const [type, prospects] of Object.entries(byType)) {
    console.log(`\n${type.toUpperCase()} (${prospects.length}):`);
    for (const p of prospects.slice(0, 10)) {
      console.log(`  - ${p.name}`);
    }
    if (prospects.length > 10) {
      console.log(`  ... and ${prospects.length - 10} more`);
    }
  }

  if (dryRun) {
    console.log('\n[DRY RUN] No changes made. Run without --dry-run to convert.');
    await prisma.$disconnect();
    return;
  }

  console.log('\n--- Converting ---');

  let orgsCreated = 0;
  let contactsLinked = 0;
  let skipped = 0;

  for (const prospect of businessProspects) {
    const orgType = inferOrgType(prospect.name);

    // Check if org already exists with this name
    const existingOrg = await prisma.organization.findFirst({
      where: {
        name: prospect.name,
        tenant: prospect.tenant
      }
    });

    if (existingOrg) {
      // Check if prospect is already linked
      const existingLink = await prisma.organizationContact.findFirst({
        where: {
          organizationId: existingOrg.id,
          prospectId: prospect.id
        }
      });

      if (existingLink) {
        console.log(`  Skipped (already linked): ${prospect.name}`);
        skipped++;
        continue;
      }

      // Link prospect to existing org
      await prisma.organizationContact.create({
        data: {
          organizationId: existingOrg.id,
          prospectId: prospect.id,
          name: '---',
          phone: getFirstPhone(prospect.phones),
          email: getFirstEmail(prospect.emails),
          isPrimary: true,
          notes: `Converted from prospect (campaign ${campaign})`
        }
      });

      // Update prospect name to --- since it's an org, not a person
      await prisma.prospect.update({
        where: { id: prospect.id },
        data: { name: '---' }
      });
      contactsLinked++;
      console.log(`  Linked to existing org: ${prospect.name}`);
      continue;
    }

    // Create new organization
    const org = await prisma.organization.create({
      data: {
        name: prospect.name,
        type: orgType,
        address: prospect.project?.address || null,
        city: prospect.project?.city || null,
        state: prospect.project?.state || null,
        postalCode: prospect.project?.postalCode || null,
        phone: getFirstPhone(prospect.phones),
        email: getFirstEmail(prospect.emails),
        notes: `Converted from prospect (campaign ${campaign})`,
        tenant: prospect.tenant
      }
    });
    orgsCreated++;

    // Link prospect as organization contact
    await prisma.organizationContact.create({
      data: {
        organizationId: org.id,
        prospectId: prospect.id,
        name: '---',
        phone: getFirstPhone(prospect.phones),
        email: getFirstEmail(prospect.emails),
        isPrimary: true
      }
    });

    // Update prospect name to --- since it's an org, not a person
    await prisma.prospect.update({
      where: { id: prospect.id },
      data: { name: '---' }
    });
    contactsLinked++;

    console.log(`  Created ${orgType}: ${prospect.name}`);
  }

  console.log('\n--- Summary ---');
  console.log(`Organizations created: ${orgsCreated}`);
  console.log(`Contacts linked: ${contactsLinked}`);
  console.log(`Skipped (already exists): ${skipped}`);

  await prisma.$disconnect();
}

main().catch(console.error);
