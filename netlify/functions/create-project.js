import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';
import crypto from 'crypto';

const prisma = new PrismaClient();

/**
 * Validate address and get precise coordinates using Google Address Validation API
 */
async function validateAndGeocode(address, city, state, postalCode) {
  // Use the address validation key - this one has Address Validation API enabled
  const apiKey = process.env.GOOGLE_ADDRESS_VALIDATION_KEY || 'AIzaSyCZ5lvfGnhxr5d5IYAwMcp9a6Gn1rgUxi8';
  if (!apiKey) {
    console.warn('No Google API key configured for address validation');
    return null;
  }

  const url = `https://addressvalidation.googleapis.com/v1:validateAddress?key=${apiKey}`;
  const body = {
    address: {
      regionCode: 'US',
      addressLines: [address, `${city}, ${state} ${postalCode}`].filter(Boolean)
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (data.error) {
      console.error('Address validation error:', data.error.message);
      return null;
    }

    if (data.result?.geocode?.location) {
      const loc = data.result.geocode.location;
      const addr = data.result.address;

      // Extract standardized address components
      const components = {};
      if (addr?.addressComponents) {
        addr.addressComponents.forEach(c => {
          if (c.componentType === 'street_number') components.streetNumber = c.componentName?.text;
          if (c.componentType === 'route') components.route = c.componentName?.text;
          if (c.componentType === 'locality') components.city = c.componentName?.text;
          if (c.componentType === 'administrative_area_level_1') components.state = c.componentName?.text;
          if (c.componentType === 'postal_code') components.postalCode = c.componentName?.text;
        });
      }

      return {
        lat: loc.latitude,
        lon: loc.longitude,
        formattedAddress: addr?.formattedAddress,
        streetAddress: components.streetNumber && components.route
          ? `${components.streetNumber} ${components.route}`
          : address,
        city: components.city || city,
        state: components.state || state,
        postalCode: components.postalCode || postalCode,
        granularity: data.result.verdict?.geocodeGranularity
      };
    }

    return null;
  } catch (error) {
    console.error('Address validation fetch error:', error);
    return null;
  }
}

/**
 * Create a new project from an address
 * POST /api/create-project
 * Body: { address, city, state, postalCode, tag?, tenant }
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
    const body = JSON.parse(event.body);
    const { address, city, state, postalCode, tag, tenant, lat, lon } = body;

    if (!address || !tenant) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'address and tenant are required' })
      };
    }

    // Check for existing project at this address
    const existing = await prisma.project.findFirst({
      where: {
        tenant,
        address: { contains: address, mode: 'insensitive' },
        city: city ? { contains: city, mode: 'insensitive' } : undefined
      }
    });

    if (existing) {
      return {
        statusCode: 409,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Project already exists at this address',
          existingId: existing.id
        })
      };
    }

    // Get validated address and coordinates
    let coordinates = null;
    let finalAddress = address;
    let finalCity = city;
    let finalState = state;
    let finalPostalCode = postalCode;

    // If lat/lon provided (from click-to-add), use those and reverse geocode
    if (lat && lon) {
      coordinates = { lat, lon };
      // Could reverse geocode here if needed
    } else {
      // Validate and geocode the address
      const validated = await validateAndGeocode(address, city, state, postalCode);
      if (validated) {
        coordinates = { lat: validated.lat, lon: validated.lon };
        finalAddress = validated.streetAddress || address;
        finalCity = validated.city || city;
        finalState = validated.state || state;
        finalPostalCode = validated.postalCode || postalCode;
      }
    }

    // Generate a unique ID
    const id = `local_${crypto.randomBytes(6).toString('hex')}`;

    // Create the project
    const project = await prisma.project.create({
      data: {
        id,
        tenant,
        address: finalAddress,
        city: finalCity,
        state: finalState,
        postalCode: finalPostalCode,
        coordinates,
        status: 'active',
        name: tag ? `Target: ${tag}` : 'Target Address',
        createdAt: new Date(),
        lastSyncedAt: new Date()
      }
    });

    // Add tag as a label if provided
    if (tag) {
      await prisma.projectLabel.create({
        data: {
          projectId: id,
          labelId: `tag_${tag.toLowerCase().replace(/\s+/g, '_')}`,
          displayValue: tag,
          value: tag.toLowerCase(),
          tagType: 'target'
        }
      });
    }

    // Fetch the complete project with labels
    const completeProject = await prisma.project.findUnique({
      where: { id },
      include: { labels: true }
    });

    console.log(`[create-project] Created project ${id} at ${finalAddress}, ${finalCity}`);

    return {
      statusCode: 201,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        project: completeProject
      })
    };

  } catch (error) {
    console.error('[create-project] Error:', error);
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
