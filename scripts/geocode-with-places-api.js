import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();
const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

/**
 * Use Google Places API "Find Place" to get coordinates for an address
 * This often has better precision than the Geocoding API
 */
async function getPlaceCoordinates(address) {
  const query = encodeURIComponent(address);
  const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${query}&inputtype=textquery&fields=geometry,formatted_address&key=${API_KEY}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.status === 'OK' && data.candidates && data.candidates[0]) {
    const location = data.candidates[0].geometry.location;
    return {
      lat: location.lat,
      lon: location.lng,
      formatted: data.candidates[0].formatted_address
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

  console.log('\n--- Testing with first 5 records ---\n');

  for (const record of testBatch) {
    const fullAddress = [record.address, record.city, record.state, record.postalCode].filter(Boolean).join(', ');

    console.log(`Address: ${fullAddress}`);
    console.log(`  Current coords: ${record.coordinates?.lat?.toFixed(6)}, ${record.coordinates?.lon?.toFixed(6)}`);

    try {
      const result = await getPlaceCoordinates(fullAddress);
      if (result) {
        console.log(`  Places API:     ${result.lat.toFixed(6)}, ${result.lon.toFixed(6)}`);
        console.log(`  Matched:        ${result.formatted}`);

        // Calculate distance between current and new coords
        if (record.coordinates?.lat) {
          const latDiff = Math.abs(result.lat - record.coordinates.lat);
          const lonDiff = Math.abs(result.lon - record.coordinates.lon);
          const distMeters = Math.sqrt(latDiff**2 + lonDiff**2) * 111000; // rough meters
          console.log(`  Difference:     ~${distMeters.toFixed(0)} meters`);
        }
      } else {
        console.log(`  Places API:     NOT FOUND`);
      }
    } catch (err) {
      console.log(`  Error: ${err.message}`);
    }

    console.log('');

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 100));
  }

  await prisma.$disconnect();
}

main().catch(console.error);
