import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';

const prisma = new PrismaClient();
const WHITEPAGES_API_KEY = process.env.WHITEPAGES_API_KEY;

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
    // Check if API key is configured
    if (!WHITEPAGES_API_KEY) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connected: false,
          error: 'API key not configured'
        })
      };
    }

    // Test the API with a simple person search
    const testUrl = 'https://api.whitepages.com/v1/person?name=Test&city=Seattle&state_code=WA';
    const response = await fetch(testUrl, {
      headers: { 'X-Api-Key': WHITEPAGES_API_KEY }
    });

    if (!response.ok) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connected: false,
          error: `API error: ${response.status}`
        })
      };
    }

    // Get enrichment stats
    const enrichedCount = await prisma.prospect.count({
      where: { enrichedAt: { not: null } }
    });

    // Count emails from enriched prospects
    const enrichedWithEmails = await prisma.prospect.findMany({
      where: {
        enrichedAt: { not: null },
        emails: { not: null }
      },
      select: { emails: true }
    });

    let emailsFound = 0;
    for (const p of enrichedWithEmails) {
      const emails = typeof p.emails === 'string' ? JSON.parse(p.emails || '[]') : (p.emails || []);
      emailsFound += emails.length;
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connected: true,
        enrichedCount,
        emailsFound
      })
    };

  } catch (error) {
    console.error('WhitePages test error:', error);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connected: false,
        error: error.message
      })
    };
  }
}
