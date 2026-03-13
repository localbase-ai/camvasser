import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';

const prisma = new PrismaClient();

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

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
    const body = JSON.parse(event.body);
    const { name, date, source, geojson } = body;

    if (!name || !date || !geojson) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'name, date, and geojson are required' })
      };
    }

    // Extract metadata from GeoJSON
    const metadata = geojson.metadata || {};
    const corridorFeature = geojson.features?.find(f => f.properties?.type === 'corridor');

    const report = await prisma.stormReport.create({
      data: {
        name,
        date: new Date(date),
        source: source || metadata.source || 'NOAA SPC',
        totalHouseholds: metadata.totalHouseholds || null,
        areas: metadata.areas || null,
        corridor: corridorFeature?.geometry || null,
        data: geojson,
        tenant: user.tenant || null
      }
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report)
    };
  } catch (error) {
    console.error('Error saving storm report:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to save storm report' })
    };
  }
}
