import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findOrgProspects() {
  const prospects = await prisma.prospect.findMany({
    select: { id: true, name: true, projectId: true },
    take: 5000
  });

  const orgKeywords = ['LLC', 'INC', 'CORP', 'L.L.C', 'TRUST', 'HOA', 'ASSOCIATION', 'PROPERTIES', 'INVESTMENTS', 'MANAGEMENT', 'PARTNERS', 'HOLDINGS', 'REALTY', 'DEVELOPMENT', 'ARCHBISHOP', 'DIOCESE'];

  const likelyOrgs = prospects.filter(p => {
    if (!p.name || p.name === '---') return false;
    const name = p.name.trim();
    const upperName = name.toUpperCase();

    // Check for org keywords
    if (orgKeywords.some(kw => upperName.includes(kw))) return true;

    // All caps and long = likely org
    if (name === name.toUpperCase() && name.length > 20) return true;

    return false;
  });

  console.log('Likely organization prospects:');
  likelyOrgs.forEach(p => console.log('  -', p.name));
  console.log('\nTotal:', likelyOrgs.length);

  await prisma.$disconnect();
}

findOrgProspects();
