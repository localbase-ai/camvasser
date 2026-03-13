import { PrismaClient } from '@prisma/client';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point, polygon } from '@turf/helpers';

const prisma = new PrismaClient();

async function main() {
  const storm = await prisma.stormReport.findUnique({ where: { id: 'kc-hail-2026-03-10' } });
  const corridorFeature = storm.data.features.find(f => f.properties?.type === 'corridor');
  const corridorPoly = polygon(corridorFeature.geometry.coordinates);

  const projects = await prisma.project.findMany({
    where: { coordinates: { not: null } },
    select: {
      id: true, address: true, city: true, state: true, coordinates: true,
      Prospect: { select: { id: true, name: true, phones: true, emails: true } }
    }
  });

  const matches = [];
  for (const p of projects) {
    if (!p.coordinates?.lat || !p.coordinates?.lon) continue;
    const pt = point([p.coordinates.lon, p.coordinates.lat]);
    if (booleanPointInPolygon(pt, corridorPoly)) matches.push(p);
  }

  const withContacts = matches.filter(m => m.Prospect.length > 0);
  const without = matches.filter(m => m.Prospect.length === 0);

  console.log(`Total in corridor: ${matches.length}`);
  console.log(`With contacts: ${withContacts.length}`);
  console.log(`Without contacts: ${without.length}`);
  console.log();
  console.log('== WITH CONTACTS ==');
  withContacts.forEach(p => {
    const names = p.Prospect.map(c => c.name).join(', ');
    console.log(`  ${p.address || '(no address)'}, ${p.city || ''} — ${names}`);
  });
  console.log();
  console.log('== NO CONTACTS ==');
  without.forEach(p => {
    console.log(`  ${p.address || '(no address)'}, ${p.city || ''}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
