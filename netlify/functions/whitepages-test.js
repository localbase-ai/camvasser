// Test WhitePages API connection
// GET /.netlify/functions/whitepages-test

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_KEY = process.env.WHITEPAGES_API_KEY;

export async function handler(event) {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (!API_KEY) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        connected: false,
        error: 'API key not configured'
      })
    };
  }

  try {
    // Test the API with a simple property lookup
    const params = new URLSearchParams({
      street: '1600 Pennsylvania Ave NW',
      city: 'Washington',
      state_code: 'DC',
      zipcode: '20500'
    });

    const response = await fetch(`https://api.whitepages.com/v2/property/?${params}`, {
      headers: { 'X-Api-Key': API_KEY }
    });

    const data = await response.json();

    if (data.message === 'Forbidden' || data.message === 'Limit Exceeded') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          connected: false,
          error: data.message
        })
      };
    }

    // Get stats on enriched contacts
    const enrichedCount = await prisma.prospect.count({
      where: {
        emails: { not: null },
        whitepagesId: { startsWith: 'wp_' }
      }
    });

    // Count emails found via WhitePages (rough estimate based on whitepagesId prefix)
    const prospectsWithWPEmails = await prisma.prospect.findMany({
      where: {
        whitepagesId: { startsWith: 'wp_' },
        emails: { not: null }
      },
      select: { emails: true }
    });

    let emailsFound = 0;
    prospectsWithWPEmails.forEach(p => {
      if (Array.isArray(p.emails)) {
        emailsFound += p.emails.length;
      }
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        connected: true,
        hasResult: !!data.result,
        enrichedCount,
        emailsFound
      })
    };
  } catch (error) {
    console.error('WhitePages test error:', error);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        connected: false,
        error: error.message
      })
    };
  } finally {
    await prisma.$disconnect();
  }
}
