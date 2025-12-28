import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';

const prisma = new PrismaClient();

const BATCH_SIZE = 100; // Process 100 at a time to stay under timeout

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

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'GOOGLE_MAPS_API_KEY not configured' })
    };
  }

  try {
    const { tenant, offset, prefix } = event.queryStringParameters || {};
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
        // Geocode using Google
        const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${apiKey}`;
        const response = await fetch(geocodeUrl);
        const data = await response.json();

        if (data.status === 'OK' && data.results[0]) {
          // Prefer ROOFTOP precision, fall back to others
          const rooftopResult = data.results.find(r => r.geometry.location_type === 'ROOFTOP');
          const result = rooftopResult || data.results[0];
          const location = result.geometry.location;

          await prisma.project.update({
            where: { id: project.id },
            data: {
              coordinates: {
                lat: location.lat,
                lon: location.lng
              }
            }
          });

          updated++;
        } else {
          console.warn(`[regeocode] Could not geocode: ${fullAddress} - ${data.status}`);
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
        total: totalCount,
        batchSize: projects.length,
        offset: offsetNum,
        nextOffset: hasMore ? nextOffset : null,
        hasMore,
        updated,
        failed,
        skipped,
        message: hasMore
          ? `Processed ${offsetNum + projects.length} of ${totalCount}. Run again with offset=${nextOffset}`
          : `Complete! Processed all ${totalCount} projects.`
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
