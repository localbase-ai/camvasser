import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Normalize address for comparison
 * Standardize directionals, street types, remove punctuation
 */
function normalizeAddress(addr) {
  if (!addr) return null;

  let s = addr.toLowerCase()
    // Standardize directionals
    .replace(/\bsouthwest\b/g, 'sw')
    .replace(/\bnorthwest\b/g, 'nw')
    .replace(/\bsoutheast\b/g, 'se')
    .replace(/\bnortheast\b/g, 'ne')
    .replace(/\bsouth\b/g, 's')
    .replace(/\bnorth\b/g, 'n')
    .replace(/\beast\b/g, 'e')
    .replace(/\bwest\b/g, 'w')
    // Standardize street types
    .replace(/\bstreet\b/g, 'st')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\bterrace\b/g, 'ter')
    .replace(/\bcourt\b/g, 'ct')
    .replace(/\bcircle\b/g, 'cir')
    .replace(/\blane\b/g, 'ln')
    .replace(/\bplace\b/g, 'pl')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\broad\b/g, 'rd')
    .replace(/\bboulevard\b/g, 'blvd')
    .replace(/\bparkway\b/g, 'pkwy')
    .replace(/\bhighway\b/g, 'hwy')
    // Remove all non-alphanumeric
    .replace(/[^a-z0-9]/g, '');

  return s;
}

/**
 * Extract just the street address part (before city)
 */
function extractStreetAddress(fullAddress) {
  if (!fullAddress) return null;
  // Most addresses are like "123 Main St, City, ST 12345"
  const parts = fullAddress.split(',');
  return parts[0]?.trim() || fullAddress;
}

/**
 * Extract city from full address
 */
function extractCity(fullAddress) {
  if (!fullAddress) return null;
  const parts = fullAddress.split(',');
  if (parts.length >= 2) {
    // City is usually the second part
    return parts[1]?.trim().toLowerCase().replace(/[^a-z]/g, '');
  }
  return null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (dryRun) {
    console.log('=== DRY RUN MODE - No changes will be made ===\n');
  }

  // Get all leads with addresses but no prospect link
  const leads = await prisma.lead.findMany({
    where: {
      prospectId: null,
      address: { not: null }
    }
  });

  // Get all projects with their prospects
  const projects = await prisma.project.findMany({
    where: {
      address: { not: null }
    },
    include: {
      prospects: true
    }
  });

  // Build address lookup map for projects
  const projectsByAddress = new Map();
  for (const project of projects) {
    const normalizedAddr = normalizeAddress(project.address);
    const normalizedCity = (project.city || '').toLowerCase().replace(/[^a-z]/g, '');
    const key = `${normalizedAddr}|${normalizedCity}`;

    if (!projectsByAddress.has(key)) {
      projectsByAddress.set(key, []);
    }
    projectsByAddress.get(key).push(project);
  }

  console.log(`Leads with addresses (no prospect link): ${leads.length}`);
  console.log(`Projects with addresses: ${projects.length}`);
  console.log(`Projects with prospects: ${projects.filter(p => p.prospects.length > 0).length}`);
  console.log('\n' + '='.repeat(60) + '\n');

  let matched = 0;
  let matchedToProject = 0;
  let unmatched = 0;
  const matches = [];

  for (const lead of leads) {
    const leadStreet = extractStreetAddress(lead.address);
    const leadCity = extractCity(lead.address);
    const normalizedLeadAddr = normalizeAddress(leadStreet);
    const normalizedLeadCity = leadCity || '';
    const key = `${normalizedLeadAddr}|${normalizedLeadCity}`;

    // Find matching project
    let matchingProjects = projectsByAddress.get(key) || [];

    // If no exact match, try fuzzy match on street only
    if (matchingProjects.length === 0 && normalizedLeadAddr) {
      for (const [projKey, projs] of projectsByAddress.entries()) {
        const [projAddr] = projKey.split('|');
        if (projAddr === normalizedLeadAddr) {
          matchingProjects = projs;
          break;
        }
      }
    }

    if (matchingProjects.length > 0) {
      const project = matchingProjects[0]; // Take first match
      matchedToProject++;

      if (project.prospects.length > 0) {
        // Link to the first prospect (usually the homeowner)
        // Prefer homeowner, then current resident
        const sortedProspects = [...project.prospects].sort((a, b) => {
          if (a.isHomeowner && !b.isHomeowner) return -1;
          if (!a.isHomeowner && b.isHomeowner) return 1;
          if (a.isCurrentResident && !b.isCurrentResident) return -1;
          if (!a.isCurrentResident && b.isCurrentResident) return 1;
          return 0;
        });

        const prospect = sortedProspects[0];

        matches.push({
          lead,
          project,
          prospect
        });

        console.log(`MATCH: ${lead.firstName} ${lead.lastName}`);
        console.log(`  Lead addr: ${lead.address}`);
        console.log(`  Project:   ${project.address}, ${project.city} [${project.id}]`);
        console.log(`  Prospect:  ${prospect.name} (homeowner: ${prospect.isHomeowner}, resident: ${prospect.isCurrentResident})`);

        if (!dryRun) {
          await prisma.lead.update({
            where: { id: lead.id },
            data: {
              prospectId: prospect.id,
              projectId: project.id
            }
          });
        }

        matched++;
      } else {
        console.log(`PROJECT (no prospects): ${lead.firstName} ${lead.lastName}`);
        console.log(`  Lead addr: ${lead.address}`);
        console.log(`  Project:   ${project.address}, ${project.city} [${project.id}]`);

        // Still link to project even without prospect
        if (!dryRun) {
          await prisma.lead.update({
            where: { id: lead.id },
            data: { projectId: project.id }
          });
        }
      }
    } else {
      unmatched++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('\nSummary:');
  console.log(`  Total leads with addresses: ${leads.length}`);
  console.log(`  Matched to projects: ${matchedToProject}`);
  console.log(`  Matched to prospects: ${matched}`);
  console.log(`  No matching project: ${unmatched}`);
  console.log(`  Match rate: ${((matchedToProject / leads.length) * 100).toFixed(1)}%`);

  if (unmatched > 0 && unmatched <= 30) {
    console.log('\nUnmatched leads:');
    const unmatchedLeads = leads.filter(l =>
      !matches.find(m => m.lead.id === l.id) &&
      !projectsByAddress.has(`${normalizeAddress(extractStreetAddress(l.address))}|${extractCity(l.address) || ''}`)
    ).slice(0, 30);
    for (const lead of unmatchedLeads) {
      console.log(`  - ${lead.firstName} ${lead.lastName}: ${lead.address}`);
    }
  }

  if (dryRun) {
    console.log('\n=== This was a DRY RUN - run without --dry-run to apply changes ===');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
