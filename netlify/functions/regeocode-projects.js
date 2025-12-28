import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';

const prisma = new PrismaClient();

const BATCH_SIZE = 100; // Process 100 at a time to stay under timeout

/**
 * Geocode using Google Maps API
 */
async function geocodeWithGoogle(fullAddress, apiKey) {
  const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${apiKey}`;
  const response = await fetch(geocodeUrl);
  const data = await response.json();

  if (data.status === 'OK' && data.results[0]) {
    const rooftopResult = data.results.find(r => r.geometry.location_type === 'ROOFTOP');
    const result = rooftopResult || data.results[0];
    const location = result.geometry.location;
    return { lat: location.lat, lon: location.lng };
  }
  return null;
}

/**
 * Geocode using Mapbox API (often better address-level precision)
 */
async function geocodeWithMapbox(fullAddress, apiKey) {
  const query = encodeURIComponent(fullAddress);
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${apiKey}&country=US&limit=1&types=address`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.features && data.features.length > 0) {
    const [lon, lat] = data.features[0].center;
    return { lat, lon };
  }
  return null;
}

/**
 * Re-geocode projects using Google Maps API (in batches)
 * This fixes coordinates that were originally from CompanyCam (often inaccurate)
 * Use ?offset=0 to start, then ?offset=100, ?offset=200, etc.
 */
export async function handler(event) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Verify authentication
  const authHeader = event.headers.authorization || event.headers.Authorization;
  const user = verifyToken(authHeader);

  if (!user) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized' })
    };
  }

  try {
    const { tenant, offset, prefix, geocoder } = event.queryStringParameters || {};
    const useMapbox = geocoder === 'mapbox';

    // Get the appropriate API key
    const apiKey = useMapbox ? process.env.MAPBOX_TOKEN : process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: useMapbox ? 'MAPBOX_TOKEN not configured' : 'GOOGLE_MAPS_API_KEY not configured' })
      };
    }
    const offsetNum = parseInt(offset) || 0;

    if (!tenant) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'tenant parameter required' })
      };
    }

    // Build where clause
    const whereClause = {
      tenant,
      address: { not: null }
    };

    // Optional prefix filter (e.g., 'clay_')
    if (prefix) {
      whereClause.id = { startsWith: prefix };
    }

    // Get total count first
    const totalCount = await prisma.project.count({
      where: whereClause
    });

    // Get batch of projects
    const projects = await prisma.project.findMany({
      where: whereClause,
      select: {
        id: true,
        address: true,
        city: true,
        state: true,
        postalCode: true,
        coordinates: true
      },
      skip: offsetNum,
      take: BATCH_SIZE,
      orderBy: { id: 'asc' }
    });

    console.log(`[regeocode] Processing batch: offset=${offsetNum}, count=${projects.length}, total=${totalCount}`);

    let updated = 0;
    let failed = 0;
    let skipped = 0;

    for (const project of projects) {
      // Build full address
      const fullAddress = [
        project.address,
        project.city,
        project.state,
        project.postalCode
      ].filter(Boolean).join(', ');

      if (!fullAddress || fullAddress.trim().length < 5) {
        skipped++;
        continue;
      }

      try {
        // Geocode using selected provider
        const coords = useMapbox
          ? await geocodeWithMapbox(fullAddress, apiKey)
          : await geocodeWithGoogle(fullAddress, apiKey);

        if (coords) {
          await prisma.project.update({
            where: { id: project.id },
            data: { coordinates: coords }
          });

          updated++;
        } else {
          console.warn(`[regeocode] Could not geocode: ${fullAddress}`);
          failed++;
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 30));

      } catch (err) {
        console.error(`[regeocode] Error geocoding ${project.id}:`, err.message);
        failed++;
      }
    }

    const nextOffset = offsetNum + BATCH_SIZE;
    const hasMore = nextOffset < totalCount;

    console.log(`[regeocode] Batch complete: ${updated} updated, ${failed} failed, ${skipped} skipped. hasMore=${hasMore}`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        geocoder: useMapbox ? 'mapbox' : 'google',
        total: totalCount,
        batchSize: projects.length,
        offset: offsetNum,
        nextOffset: hasMore ? nextOffset : null,
        hasMore,
        updated,
        failed,
        skipped,
        message: hasMore
          ? `Processed ${offsetNum + projects.length} of ${totalCount} with ${useMapbox ? 'Mapbox' : 'Google'}. Run again with offset=${nextOffset}`
          : `Complete! Processed all ${totalCount} projects with ${useMapbox ? 'Mapbox' : 'Google'}.`
      })
    };

  } catch (error) {
    console.error('[regeocode] Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
}
