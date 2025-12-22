// Test setup file
// This runs before all tests

import { beforeAll, afterAll, vi } from 'vitest';

// Set environment variables BEFORE any modules load
process.env.NODE_ENV = 'test';
process.env.BUDROOFING_COMPANYCAM_TOKEN = 'test-token-123';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing';

// Mock environment variables for tests
beforeAll(() => {
  // Env vars already set above
});

afterAll(() => {
  // Cleanup if needed
});

// Reset all mocks between tests
afterEach(() => {
  vi.clearAllMocks();
});
