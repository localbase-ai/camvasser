import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Generate a valid JWT token for testing
export function generateTestToken(payload = {}) {
  const defaultPayload = {
    userId: 'user_123',
    email: 'test@example.com',
    slug: 'acme',
    companyName: 'Acme Roofing'
  };

  return jwt.sign({ ...defaultPayload, ...payload }, JWT_SECRET, { expiresIn: '1h' });
}

// Generate an expired token
export function generateExpiredToken(payload = {}) {
  const defaultPayload = {
    userId: 'user_123',
    email: 'test@example.com',
    slug: 'acme',
    companyName: 'Acme Roofing'
  };

  return jwt.sign({ ...defaultPayload, ...payload }, JWT_SECRET, { expiresIn: '-1h' });
}

// Create auth header
export function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

// Create a mock event object for Netlify functions
export function createMockEvent(overrides = {}) {
  return {
    httpMethod: 'GET',
    headers: {},
    queryStringParameters: {},
    body: null,
    ...overrides
  };
}

// Create authenticated mock event
export function createAuthenticatedEvent(overrides = {}) {
  const token = generateTestToken(overrides.tokenPayload);
  delete overrides.tokenPayload;

  return createMockEvent({
    headers: authHeader(token),
    ...overrides
  });
}
