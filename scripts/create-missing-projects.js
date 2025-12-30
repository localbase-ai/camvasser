import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Get all leads with addresses
  const leads = await prisma.lead.findMany({
    where: { address: { not: null } },
    select: { id: true, firstName: true, lastName: true, address: true, tenant: true, projectId: true }
  });

  // Get all project addresses for matching
  const projects = await prisma.project.findMany({
    select: { id: true, address: true }
  });

  const projectAddresses = new Map();
  projects.forEach(p => {
    if (p.address) {
      projectAddresses.set(p.address.toLowerCase().trim(), p.id);
    }
  });

  // Find leads without matching projects
  const missingProjects = [];
  for (const lead of leads) {
    const streetAddress = lead.address.split(',')[0].trim().toLowerCase();

    let found = false;
    for (const [addr, projId] of projectAddresses) {
      if (addr.includes(streetAddress) || streetAddress.includes(addr)) {
        found = true;
        break;
      }
    }

    if (!found) {
      missingProjects.push(lead);
    }
  }

  console.log('Creating projects for', missingProjects.length, 'leads...');

  let created = 0;
  for (const lead of missingProjects) {
    // Parse address
    const parts = lead.address.split(',').map(p => p.trim());
    const street = parts[0] || lead.address;
    const city = parts[1] || '';
    const stateZip = parts[2] || '';
    const state = stateZip.split(' ')[0] || '';
    const zip = stateZip.split(' ').slice(1).join(' ') || '';

    // Create project
    const project = await prisma.project.create({
      data: {
        id: 'proj_lead_' + lead.id.slice(-8),
        address: street,
        city: city,
        state: state,
        postalCode: zip,
        tenant: lead.tenant || 'budroofing',
        status: 'active'
      }
    });

    // Link lead to project
    await prisma.lead.update({
      where: { id: lead.id },
      data: { projectId: project.id }
    });

    created++;
    if (created % 50 === 0) {
      console.log('Created', created, 'projects...');
    }
  }

  console.log('Done! Created', created, 'projects');
  await prisma.$disconnect();
}

main().catch(console.error);
