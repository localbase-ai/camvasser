import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

function normalizeAddress(addr) {
  if (!addr) return '';
  return addr
    .toUpperCase()
    .replace(/[.,#]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\bSTREET\b/g, 'ST')
    .replace(/\bAVENUE\b/g, 'AVE')
    .replace(/\bDRIVE\b/g, 'DR')
    .replace(/\bROAD\b/g, 'RD')
    .replace(/\bLANE\b/g, 'LN')
    .replace(/\bTERRACE\b/g, 'TER')
    .replace(/\bCOURT\b/g, 'CT')
    .replace(/\bBOULEVARD\b/g, 'BLVD')
    .replace(/\bCIRCLE\b/g, 'CIR')
    .replace(/\bPLACE\b/g, 'PL')
    .trim();
}

async function main() {
  console.log('='.repeat(70));
  console.log('Link Organizations to Properties');
  console.log('='.repeat(70));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}\n`);

  // Get all organizations with addresses
  const orgs = await prisma.organization.findMany({
    where: {
      address: { not: null },
      OrganizationProperty: { none: {} } // Only orgs without existing links
    },
    select: { id: true, name: true, address: true, city: true, state: true }
  });

  console.log(`Organizations with addresses (no existing links): ${orgs.length}\n`);

  // Get all projects and build lookup map
  const projects = await prisma.project.findMany({
    select: { id: true, address: true, city: true, state: true }
  });

  // Build normalized address -> project map
  const projectMap = new Map();
  for (const p of projects) {
    const normalized = normalizeAddress(p.address);
    if (normalized) {
      projectMap.set(normalized, p);
    }
  }
  console.log(`Projects indexed: ${projectMap.size}\n`);

  let matched = 0;
  let notFound = 0;
  let created = 0;

  for (const org of orgs) {
    const normalizedOrgAddr = normalizeAddress(org.address);

    // Skip if address looks like notes/instructions (contains multiple sentences)
    if (org.address.includes('.') && org.address.length > 50) {
      if (VERBOSE) console.log(`SKIP (notes): ${org.name}`);
      continue;
    }

    const project = projectMap.get(normalizedOrgAddr);

    if (project) {
      matched++;
      if (VERBOSE || DRY_RUN) {
        console.log(`MATCH: ${org.name}`);
        console.log(`  Org addr: ${org.address}`);
        console.log(`  Project:  ${project.address}, ${project.city}`);
      }

      if (!DRY_RUN) {
        await prisma.organizationProperty.create({
          data: {
            id: randomUUID().replace(/-/g, '').slice(0, 24),
            organizationId: org.id,
            projectId: project.id,
            relationship: 'owns'
          }
        });
        created++;
      }
    } else {
      notFound++;
      if (VERBOSE) {
        console.log(`NO MATCH: ${org.name}`);
        console.log(`  Address: ${org.address}`);
      }
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('Summary');
  console.log('='.repeat(70));
  console.log(`Organizations checked: ${orgs.length}`);
  console.log(`Matched to projects: ${matched}`);
  console.log(`No match found: ${notFound}`);
  if (!DRY_RUN) {
    console.log(`OrganizationProperty links created: ${created}`);
  }

  if (DRY_RUN) {
    console.log('\nThis was a DRY RUN. No changes were made.');
    console.log('Run without --dry-run to create the links.');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
