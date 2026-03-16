/**
 * Test: ArcGIS parcel centroids → reverse geocode → Whitepages lookup
 *
 * Usage: node scripts/test-parcel-pipeline.js [--whitepages]
 *
 * Without --whitepages: just shows centroids + reverse geocoded addresses
 * With --whitepages: also does Whitepages property lookup for owner/contact info
 */

import 'dotenv/config';

const ARCGIS_URL = 'https://services2.arcgis.com/ji2hJlB9RmHn0um4/arcgis/rest/services/Platte_City_MO_Property_view/FeatureServer/1/query';
const WHITEPAGES_API_KEY = process.env.WHITEPAGES_API_KEY;
const args = process.argv.slice(2);
const DO_WHITEPAGES = args.includes('--whitepages');
const COUNT = parseInt(args.find(a => a.startsWith('--count='))?.split('=')[1] || '5', 10);

function computeCentroid(rings) {
  const coords = rings[0]; // outer ring
  let latSum = 0, lonSum = 0;
  // Exclude last point (same as first in closed polygon)
  const n = coords.length - 1;
  for (let i = 0; i < n; i++) {
    lonSum += coords[i][0];
    latSum += coords[i][1];
  }
  return { lat: latSum / n, lon: lonSum / n };
}

async function fetchParcels(count) {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: '*',
    outSR: '4326',
    f: 'json',
    resultRecordCount: String(count),
    returnGeometry: 'true'
  });

  const res = await fetch(`${ARCGIS_URL}?${params}`);
  if (!res.ok) throw new Error(`ArcGIS error: ${res.status}`);
  const data = await res.json();
  return data.features;
}

async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'camvasser-parcel-test/1.0' }
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data;
}

async function whitepagesLookup(street, city, state) {
  const params = new URLSearchParams();
  if (street) params.append('street', street);
  if (city) params.append('city', city);
  if (state) params.append('state_code', state);

  const res = await fetch(`https://api.whitepages.com/v2/property/?${params}`, {
    headers: { 'X-Api-Key': WHITEPAGES_API_KEY }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Whitepages ${res.status}: ${err}`);
  }
  return res.json();
}

async function main() {
  console.log('='.repeat(70));
  console.log('Parcel Pipeline Test — Platte County, MO');
  console.log(`Parcels: ${COUNT} | Whitepages: ${DO_WHITEPAGES ? 'YES' : 'no (add --whitepages)'}`);
  console.log('='.repeat(70));

  // Step 1: Fetch parcels
  console.log('\n📦 Fetching parcels from ArcGIS...');
  const features = await fetchParcels(COUNT);
  console.log(`   Got ${features.length} parcels`);

  for (const feature of features) {
    const { attributes, geometry } = feature;
    const parcelId = `${attributes.TRC}-${attributes.SUBC}-${attributes.SEC}-${attributes.BNUM}-${attributes.PNUM}`;

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`📍 Parcel: ${parcelId} | Zoning: ${attributes.Zoning?.trim() || 'none'}`);

    // Step 2: Compute centroid
    const centroid = computeCentroid(geometry.rings);
    console.log(`   Centroid: ${centroid.lat.toFixed(6)}, ${centroid.lon.toFixed(6)}`);

    // Step 3: Reverse geocode
    console.log('   🔍 Reverse geocoding...');
    const geo = await reverseGeocode(centroid.lat, centroid.lon);

    if (!geo || geo.error) {
      console.log('   ⚠ No address found');
      continue;
    }

    const addr = geo.address || {};
    const street = `${addr.house_number || ''} ${addr.road || ''}`.trim();
    const city = addr.city || addr.town || addr.village || '';
    const state = addr.state || '';
    const zip = addr.postcode || '';

    console.log(`   📫 ${street}, ${city}, ${state} ${zip}`);
    console.log(`   Display: ${geo.display_name}`);

    if (!DO_WHITEPAGES) continue;

    if (!street) {
      console.log('   ⚠ No street address, skipping Whitepages');
      continue;
    }

    // Step 4: Whitepages
    console.log('   📞 Whitepages lookup...');
    try {
      const wp = await whitepagesLookup(street, city, 'MO');
      const owner = wp.result?.ownership_info?.person_owners?.[0];
      const residents = wp.result?.residents || [];

      if (owner) {
        const phones = (owner.phones || []).map(p => p.number).join(', ');
        console.log(`   👤 Owner: ${owner.name}`);
        console.log(`      Phones: ${phones || 'none'}`);
      } else {
        console.log('   ⚠ No owner data');
      }

      if (residents.length) {
        for (const r of residents.slice(0, 2)) {
          const phones = (r.phones || []).map(p => p.number).join(', ');
          console.log(`   👥 Resident: ${r.name} | Phones: ${phones || 'none'}`);
        }
      }
    } catch (err) {
      console.log(`   ✗ Whitepages error: ${err.message}`);
    }

    // Be polite to Nominatim (1 req/sec policy)
    await new Promise(r => setTimeout(r, 1100));
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); });
