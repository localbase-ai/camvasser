import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';

const prisma = new PrismaClient();

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
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
    const { id } = event.queryStringParameters || {};

    // Single report by ID (includes full GeoJSON data)
    if (id) {
      const report = await prisma.stormReport.findUnique({ where: { id } });
      if (!report) {
        return {
          statusCode: 404,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Storm report not found' })
        };
      }
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report)
      };
    }

    // List all reports (metadata only — no full GeoJSON data field)
    const reports = await prisma.stormReport.findMany({
      orderBy: { date: 'desc' },
      select: {
        id: true,
        name: true,
        date: true,
        source: true,
        totalHouseholds: true,
        areas: true,
        createdAt: true
      }
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reports)
    };
  } catch (error) {
    console.error('Error fetching storm reports:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to fetch storm reports' })
    };
  }
}
