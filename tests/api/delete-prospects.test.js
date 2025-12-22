import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPrisma, factories } from '../helpers/mock-prisma.js';
import { createMockEvent, createAuthenticatedEvent, generateExpiredToken } from '../helpers/auth.js';

// Create mock instance
const mockPrisma = createMockPrisma();

// Mock Prisma before importing handler
vi.mock('@prisma/client', () => {
  return {
    PrismaClient: class {
      constructor() {
        return mockPrisma;
      }
    }
  };
});

// Import handler after mocking
const { handler } = await import('../../netlify/functions/delete-prospects.js');

describe('delete-prospects API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('authentication', () => {
    it('should return 401 when no auth header provided', async () => {
      const event = createMockEvent({ httpMethod: 'DELETE' });
      const response = await handler(event);

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).error).toContain('Unauthorized');
    });

    it('should return 401 when token is expired', async () => {
      const event = createMockEvent({
        httpMethod: 'DELETE',
        headers: { Authorization: `Bearer ${generateExpiredToken()}` }
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(401);
    });
  });

  describe('method validation', () => {
    it('should return 405 for GET requests', async () => {
      const event = createAuthenticatedEvent({ httpMethod: 'GET' });
      const response = await handler(event);

      expect(response.statusCode).toBe(405);
      expect(JSON.parse(response.body).error).toBe('Method not allowed');
    });

    it('should allow DELETE requests', async () => {
      mockPrisma.prospect.deleteMany.mockResolvedValue({ count: 1 });

      const event = createAuthenticatedEvent({
        httpMethod: 'DELETE',
        queryStringParameters: { id: 'prosp_123' }
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });

    it('should allow POST requests for bulk delete', async () => {
      mockPrisma.prospect.deleteMany.mockResolvedValue({ count: 2 });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ ids: ['prosp_1', 'prosp_2'] })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });
  });

  describe('single delete (DELETE method)', () => {
    it('should return 400 when id is missing', async () => {
      const event = createAuthenticatedEvent({
        httpMethod: 'DELETE',
        queryStringParameters: {}
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toBe('Missing id parameter');
    });

    it('should delete single prospect by id', async () => {
      mockPrisma.prospect.deleteMany.mockResolvedValue({ count: 1 });

      const event = createAuthenticatedEvent({
        httpMethod: 'DELETE',
        queryStringParameters: { id: 'prosp_123' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.deleted).toBe(1);
      expect(body.ids).toEqual(['prosp_123']);

      expect(mockPrisma.prospect.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['prosp_123'] } }
      });
    });
  });

  describe('bulk delete (POST method)', () => {
    it('should return 400 when ids array is missing', async () => {
      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({})
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toBe('Missing or empty ids array');
    });

    it('should return 400 when ids array is empty', async () => {
      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ ids: [] })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
    });

    it('should delete multiple prospects', async () => {
      mockPrisma.prospect.deleteMany.mockResolvedValue({ count: 3 });

      const ids = ['prosp_1', 'prosp_2', 'prosp_3'];
      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ ids })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.deleted).toBe(3);
      expect(body.ids).toEqual(ids);

      expect(mockPrisma.prospect.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ids } }
      });
    });
  });

  describe('response format', () => {
    it('should return correct response shape', async () => {
      mockPrisma.prospect.deleteMany.mockResolvedValue({ count: 1 });

      const event = createAuthenticatedEvent({
        httpMethod: 'DELETE',
        queryStringParameters: { id: 'prosp_123' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.headers['Content-Type']).toBe('application/json');
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('deleted');
      expect(body).toHaveProperty('ids');
    });
  });

  describe('error handling', () => {
    it('should return 500 when database delete fails', async () => {
      mockPrisma.prospect.deleteMany.mockRejectedValue(new Error('Database error'));

      const event = createAuthenticatedEvent({
        httpMethod: 'DELETE',
        queryStringParameters: { id: 'prosp_123' }
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toBe('Failed to delete prospects');
    });
  });
});
