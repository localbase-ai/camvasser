import jwt from 'jsonwebtoken';

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
 * @param {string} expiresIn - Token expiration (default: '7d')
 * @returns {string|null} - The signed token or null if JWT_SECRET not set
 */
export function signToken(payload, expiresIn = '7d') {
  if (!JWT_SECRET) {
    console.error('JWT_SECRET is not configured');
    return null;
  }

  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

export { JWT_SECRET };
