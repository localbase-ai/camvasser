// Test setup file
// This runs before all tests

import { beforeAll, afterAll, vi } from 'vitest';

// Mock environment variables for tests
beforeAll(() => {
  process.env.BUDROOFING_COMPANYCAM_TOKEN = 'test-token-123';
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET = 'test-jwt-secret-for-testing';
});

afterAll(() => {
  // Cleanup if needed
});

// Reset all mocks between tests
afterEach(() => {
  vi.clearAllMocks();
});
