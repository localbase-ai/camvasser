import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_KEY = 'AIzaSyCZ5lvfGnhxr5d5IYAwMcp9a6Gn1rgUxi8';

async function validateAddress(address, city, state, postalCode) {
  const url = `https://addressvalidation.googleapis.com/v1:validateAddress?key=${API_KEY}`;
  const body = {
    address: {
      regionCode: 'US',
      addressLines: [address, `${city}, ${state} ${postalCode}`]
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message);
  }

  if (data.result?.geocode?.location) {
    const loc = data.result.geocode.location;
    return {
      lat: loc.latitude,
      lon: loc.longitude,
      granularity: data.result.verdict?.geocodeGranularity
    };
  }

  return null;
}

async function main() {
  const clayRecords = await prisma.project.findMany({
    where: {
      id: { startsWith: 'clay_' },
      address: { not: null }
    },
    select: {
      id: true,
      address: true,
      city: true,
      state: true,
      postalCode: true,
      coordinates: true
    }
  });

  console.log(`\nUpdating ${clayRecords.length} clay records with Address Validation API\n`);
  console.log('='.repeat(60));

  let updated = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < clayRecords.length; i++) {
    const record = clayRecords[i];
    const fullAddress = [record.address, record.city, record.state, record.postalCode].filter(Boolean).join(', ');

    process.stdout.write(`[${i + 1}/${clayRecords.length}] ${record.address}... `);

    if (!record.address || !record.city) {
      console.log('SKIPPED (missing address/city)');
      skipped++;
      continue;
    }

    try {
      const result = await validateAddress(record.address, record.city, record.state, record.postalCode);

      if (result) {
        await prisma.project.update({
          where: { id: record.id },
          data: {
            coordinates: { lat: result.lat, lon: result.lon }
          }
        });

        console.log(`OK (${result.granularity})`);
        updated++;
      } else {
        console.log('NOT FOUND');
        failed++;
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      failed++;
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 50));
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\nDone!`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Failed:  ${failed}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Total:   ${clayRecords.length}`);

  await prisma.$disconnect();
}

main().catch(console.error);
