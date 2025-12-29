import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();
const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

/**
 * Use Google Address Validation API to get coordinates
 * This is designed for precise address-level geocoding
 */
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
      placeId: data.result.geocode.placeId,
      granularity: data.result.verdict?.geocodeGranularity
    };
  }

  return null;
}

async function main() {
  if (!API_KEY) {
    console.error('GOOGLE_MAPS_API_KEY not set');
    process.exit(1);
  }

  // Get clay records that have addresses
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

  console.log(`Found ${clayRecords.length} clay records`);

  // Test with first 5 to see if it works
  const testBatch = clayRecords.slice(0, 5);

  console.log('\n--- Testing Address Validation API with first 5 records ---\n');

  for (const record of testBatch) {
    const fullAddress = [record.address, record.city, record.state, record.postalCode].filter(Boolean).join(', ');

    console.log(`Address: ${fullAddress}`);
    console.log(`  Current coords: ${record.coordinates?.lat?.toFixed(6)}, ${record.coordinates?.lon?.toFixed(6)}`);

    try {
      const result = await validateAddress(record.address, record.city, record.state, record.postalCode);
      if (result) {
        console.log(`  Validation API: ${result.lat.toFixed(6)}, ${result.lon.toFixed(6)}`);
        console.log(`  Granularity:    ${result.granularity}`);

        // Calculate distance between current and new coords
        if (record.coordinates?.lat) {
          const latDiff = Math.abs(result.lat - record.coordinates.lat);
          const lonDiff = Math.abs(result.lon - record.coordinates.lon);
          const distMeters = Math.sqrt(latDiff**2 + lonDiff**2) * 111000;
          console.log(`  Difference:     ~${distMeters.toFixed(0)} meters`);
        }
      } else {
        console.log(`  Validation API: NOT FOUND`);
      }
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }

    console.log('');

    await new Promise(r => setTimeout(r, 100));
  }

  await prisma.$disconnect();
}

main().catch(console.error);
