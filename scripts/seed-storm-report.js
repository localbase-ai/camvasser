import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const prisma = new PrismaClient();

async function main() {
  const geojsonPath = resolve('public/data/storms/kc-hail-2026-03-10.geojson');
  const geojson = JSON.parse(readFileSync(geojsonPath, 'utf-8'));
  const metadata = geojson.metadata || {};
  const corridorFeature = geojson.features?.find(f => f.properties?.type === 'corridor');

  const report = await prisma.stormReport.upsert({
    where: { id: 'kc-hail-2026-03-10' },
    update: {
      data: geojson,
      areas: metadata.areas || null,
      totalHouseholds: metadata.totalHouseholds || null,
      corridor: corridorFeature?.geometry || null
    },
    create: {
      id: 'kc-hail-2026-03-10',
      name: metadata.name || 'KC Metro Hail Storm — March 10, 2026',
      date: new Date('2026-03-10'),
      source: metadata.source || 'NOAA SPC',
      totalHouseholds: metadata.totalHouseholds || null,
      areas: metadata.areas || null,
      corridor: corridorFeature?.geometry || null,
      data: geojson
    }
  });

  console.log(`Seeded storm report: ${report.id} — ${report.name}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
