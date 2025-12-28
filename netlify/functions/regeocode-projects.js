import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';

const prisma = new PrismaClient();

/**
 * Re-geocode all projects using Google Maps API
 * This fixes coordinates that were originally from CompanyCam (often inaccurate)
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
    const { tenant } = event.queryStringParameters || {};

    if (!tenant) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'tenant parameter required' })
      };
    }

    // Get all projects with addresses for this tenant
    const projects = await prisma.project.findMany({
      where: {
        tenant,
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

    console.log(`[regeocode] Found ${projects.length} projects for tenant ${tenant}`);

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
          const location = data.results[0].geometry.location;

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

          // Log progress every 50 projects
          if (updated % 50 === 0) {
            console.log(`[regeocode] Progress: ${updated} updated`);
          }
        } else {
          console.warn(`[regeocode] Could not geocode: ${fullAddress} - ${data.status}`);
          failed++;
        }

        // Small delay to avoid rate limiting (50ms between requests)
        await new Promise(resolve => setTimeout(resolve, 50));

      } catch (err) {
        console.error(`[regeocode] Error geocoding ${project.id}:`, err.message);
        failed++;
      }
    }

    console.log(`[regeocode] Complete: ${updated} updated, ${failed} failed, ${skipped} skipped`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        total: projects.length,
        updated,
        failed,
        skipped,
        message: `Re-geocoded ${updated} projects`
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
