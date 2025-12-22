import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

function verifyToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.substring(7);
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
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
      body: JSON.stringify({ error: 'Unauthorized' })
    };
  }

  try {
    // Get the full user with their tenant memberships
    const businessUser = await prisma.businessUser.findUnique({
      where: { id: user.userId },
      include: {
        tenants: {
          include: {
            tenant: true
          }
        }
      }
    });

    if (!businessUser) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    // Format the response
    const tenants = businessUser.tenants.map(ut => ({
      id: ut.tenant.id,
      slug: ut.tenant.slug,
      name: ut.tenant.name,
      domain: ut.tenant.domain,
      logoUrl: ut.tenant.logoUrl,
      role: ut.role
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: {
          id: businessUser.id,
          name: businessUser.name,
          email: businessUser.email,
          isAdmin: businessUser.isAdmin
        },
        tenants,
        // Default to first tenant if user has no default slug set
        defaultTenant: businessUser.slug || (tenants.length > 0 ? tenants[0].slug : null)
      })
    };

  } catch (error) {
    console.error('Error fetching user tenants:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to fetch tenants' })
    };
  }
}
