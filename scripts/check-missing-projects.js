import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get all leads with addresses
  const leads = await prisma.lead.findMany({
    where: { address: { not: null } },
    select: { id: true, firstName: true, lastName: true, address: true }
  });

  console.log('Total leads with addresses:', leads.length);

  // Get all project addresses for matching
  const projects = await prisma.project.findMany({
    select: { address: true }
  });

  const projectAddresses = new Set(
    projects.map(p => p.address?.toLowerCase().trim()).filter(Boolean)
  );

  console.log('Total projects:', projects.length);

  // Find leads without matching projects
  const missingProjects = [];
  for (const lead of leads) {
    const streetAddress = lead.address.split(',')[0].trim().toLowerCase();

    // Check if any project contains this street address
    let found = false;
    for (const addr of projectAddresses) {
      if (addr.includes(streetAddress) || streetAddress.includes(addr)) {
        found = true;
        break;
      }
    }

    if (!found) {
      missingProjects.push(lead);
    }
  }

  console.log('\nLeads WITHOUT matching project:', missingProjects.length);
  console.log('\nAll missing:');
  missingProjects.forEach(l => {
    console.log(`  - ${l.firstName} ${l.lastName}: ${l.address}`);
  });

  await prisma.$disconnect();
}

main().catch(console.error);
