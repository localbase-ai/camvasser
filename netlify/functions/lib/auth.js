import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Fail hard if JWT_SECRET is not set - this is a critical security requirement
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV !== 'test') {
  console.error('CRITICAL: JWT_SECRET environment variable is not set');
}

/**
 * Verify a JWT token from the Authorization header
 * @param {string} authHeader - The Authorization header value
 * @returns {object|null} - The decoded token payload or null if invalid
 */
export function verifyToken(authHeader) {
  if (!JWT_SECRET) {
    console.error('JWT_SECRET is not configured');
    return null;
  }

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

/**
 * Sign a new JWT token
 * @param {object} payload - The payload to sign
 * @param {string} expiresIn - Token expiration (default: '24h')
 * @returns {string|null} - The signed token or null if JWT_SECRET not set
 */
export function signToken(payload, expiresIn = '24h') {
  if (!JWT_SECRET) {
    console.error('JWT_SECRET is not configured');
    return null;
  }

  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

/**
 * Get all tenants a user belongs to
 * @param {string} userId - The user's ID
 * @returns {Promise<Array>} - Array of tenant objects with slug and role
 */
export async function getUserTenants(userId) {
  const userTenants = await prisma.userTenant.findMany({
    where: { userId },
    include: { Tenant: true }
  });

  return userTenants.map(ut => ({
    id: ut.Tenant.id,
    slug: ut.Tenant.slug,
    name: ut.Tenant.name,
    role: ut.role
  }));
}

export { JWT_SECRET };
