import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// SECURITY NOTE: This endpoint is intentionally unauthenticated.
// It's used by public lead capture forms embedded on tenant websites.
// Validation is done via tenant slug (must exist) and basic input validation.
// Rate limiting should be handled at the CDN/WAF level.

// Allowed origins for CORS - tenant domains
const ALLOWED_ORIGINS = [
  'https://budroofing.com',
  'https://www.budroofing.com',
  'https://kcroofrestoration.com',
  'https://www.kcroofrestoration.com',
  'http://localhost:8888',
  'http://localhost:3000'
];

function getCorsOrigin(requestOrigin) {
  if (ALLOWED_ORIGINS.includes(requestOrigin)) {
    return requestOrigin;
  }
  // In development, allow any origin
  if (process.env.NODE_ENV === 'development') {
    return requestOrigin || '*';
  }
  return ALLOWED_ORIGINS[0]; // Default to first allowed origin
}

export async function handler(event) {
  const headers = event.headers || {};
  const origin = headers.origin || headers.Origin || '';
  const corsOrigin = getCorsOrigin(origin);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': corsOrigin },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const data = JSON.parse(event.body);

    // Required fields
    const { tenant, flowType, flowSlug, name, email, phone } = data;

    if (!tenant || !flowType || !flowSlug || !name || !email || !phone) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': corsOrigin },
        body: JSON.stringify({
          error: 'Missing required fields',
          required: ['tenant', 'flowType', 'flowSlug', 'name', 'email', 'phone']
        })
      };
    }

    // Validate tenant exists (prevents spam to arbitrary tenant slugs)
    const tenantExists = await prisma.tenant.findUnique({
      where: { slug: tenant },
      select: { id: true }
    });

    if (!tenantExists) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': corsOrigin },
        body: JSON.stringify({ error: 'Invalid tenant' })
      };
    }

    // Split name into first/last (Lead table expects separate fields)
    const nameParts = name.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Create the lead
    const lead = await prisma.lead.create({
      data: {
        firstName,
        lastName,
        email,
        phone,
        address: data.address || null,
        tenant,
        source: 'flow',
        flowType,
        flowSlug,
        flowData: data.flowData || null,
        urgencyLevel: data.urgencyLevel || null,
        qualifyScore: data.qualifyScore || null,
        utmSource: data.utmSource || null,
        utmMedium: data.utmMedium || null,
        utmCampaign: data.utmCampaign || null
      }
    });

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': corsOrigin,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        id: lead.id,
        qualifyScore: lead.qualifyScore,
        urgencyLevel: lead.urgencyLevel
      })
    };

  } catch (error) {
    console.error('Error saving flow lead:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': corsOrigin },
      body: JSON.stringify({ error: 'Failed to save lead' })
    };
  }
}
