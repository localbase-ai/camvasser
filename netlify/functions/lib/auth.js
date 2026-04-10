import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Fail hard if JWT_SECRET is not set - this is a critical security requirement
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV !== 'test') {
  console.error('CRITICAL: JWT_SECRET environment variable is not set');
}

// Refuse to run with obvious placeholder values. Historical context: production
// shipped for a while with the literal .env.example default as the live secret,
// which gitleaks cannot catch (placeholder strings have low entropy by design).
// This guard makes that failure mode impossible going forward.
if (JWT_SECRET && process.env.NODE_ENV !== 'test') {
  const looksLikePlaceholder =
    /your[-_]?(super[-_]?)?(secret|jwt)/i.test(JWT_SECRET) ||
    /change[-_]?(this|me)/i.test(JWT_SECRET) ||
    /placeholder|example|default|replace[-_]?me/i.test(JWT_SECRET) ||
    JWT_SECRET.length < 32;
  if (looksLikePlaceholder) {
    console.error(
      'CRITICAL: JWT_SECRET looks like a placeholder or is too short (<32 chars). ' +
      'Generate a fresh random value: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'base64url\'))"'
    );
    // Throw so the function cold-start fails loudly instead of silently accepting
    // tokens signed with a known-bad secret.
    throw new Error('JWT_SECRET is a placeholder or too short; refusing to start.');
  }
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
