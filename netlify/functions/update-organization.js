import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';

const prisma = new PrismaClient();

const VALID_TYPES = ['hoa', 'property_management', 'real_estate', 'church', 'apartment_complex', 'other'];

export async function handler(event) {
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'PATCH') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const user = verifyToken(authHeader);

  if (!user) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized - Please log in' })
    };
  }

  try {
    const { id, name, type, address, city, state, postalCode, phone, email, website, notes } = JSON.parse(event.body);

    if (!id) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'id is required' })
      };
    }

    // Verify the org exists
    const org = await prisma.organization.findUnique({
      where: { id },
      select: { tenant: true }
    });

    if (!org) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Organization not found' })
      };
    }

    // Check tenant access
    const hasAccess = org.tenant === user.slug || await prisma.userTenant.findFirst({
      where: {
        userId: user.userId,
        tenant: { slug: org.tenant }
      }
    });

    if (!hasAccess) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Access denied' })
      };
    }

    // Validate type if provided
    if (type && !VALID_TYPES.includes(type)) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid type', validTypes: VALID_TYPES })
      };
    }

    // Build update data - only include fields that were provided
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (type !== undefined) updateData.type = type;
    if (address !== undefined) updateData.address = address || null;
    if (city !== undefined) updateData.city = city || null;
    if (state !== undefined) updateData.state = state || null;
    if (postalCode !== undefined) updateData.postalCode = postalCode || null;
    if (phone !== undefined) updateData.phone = phone || null;
    if (email !== undefined) updateData.email = email || null;
    if (website !== undefined) updateData.website = website || null;
    if (notes !== undefined) updateData.notes = notes || null;

    const updated = await prisma.organization.update({
      where: { id },
      data: updateData,
      include: {
        _count: {
          select: { contacts: true, properties: true }
        }
      }
    });

    console.log(`Updated organization ${id}:`, updateData);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, organization: updated })
    };

  } catch (error) {
    console.error('Error updating organization:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to update organization',
        details: error.message
      })
    };
  }
}
