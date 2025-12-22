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
const { handler } = await import('../../netlify/functions/delete-leads.js');

describe('delete-leads API', () => {
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

    it('should return 405 for PATCH requests', async () => {
      const event = createAuthenticatedEvent({ httpMethod: 'PATCH' });
      const response = await handler(event);

      expect(response.statusCode).toBe(405);
    });

    it('should allow DELETE requests', async () => {
      mockPrisma.lead.deleteMany.mockResolvedValue({ count: 1 });

      const event = createAuthenticatedEvent({
        httpMethod: 'DELETE',
        queryStringParameters: { id: 'lead_123' }
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });

    it('should allow POST requests for bulk delete', async () => {
      mockPrisma.lead.deleteMany.mockResolvedValue({ count: 2 });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ ids: ['lead_1', 'lead_2'] })
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

    it('should delete single lead by id', async () => {
      mockPrisma.lead.deleteMany.mockResolvedValue({ count: 1 });

      const event = createAuthenticatedEvent({
        httpMethod: 'DELETE',
        queryStringParameters: { id: 'lead_123' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.deleted).toBe(1);
      expect(body.ids).toEqual(['lead_123']);

      expect(mockPrisma.lead.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['lead_123'] } }
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
      expect(JSON.parse(response.body).error).toBe('Missing or empty ids array');
    });

    it('should return 400 when ids is not an array', async () => {
      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ ids: 'not-an-array' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
    });

    it('should delete multiple leads', async () => {
      mockPrisma.lead.deleteMany.mockResolvedValue({ count: 3 });

      const ids = ['lead_1', 'lead_2', 'lead_3'];
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

      expect(mockPrisma.lead.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ids } }
      });
    });
  });

  describe('response format', () => {
    it('should return correct response shape', async () => {
      mockPrisma.lead.deleteMany.mockResolvedValue({ count: 1 });

      const event = createAuthenticatedEvent({
        httpMethod: 'DELETE',
        queryStringParameters: { id: 'lead_123' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.headers['Content-Type']).toBe('application/json');
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('deleted');
      expect(body).toHaveProperty('ids');
    });

    it('should return 0 deleted when no leads match', async () => {
      mockPrisma.lead.deleteMany.mockResolvedValue({ count: 0 });

      const event = createAuthenticatedEvent({
        httpMethod: 'DELETE',
        queryStringParameters: { id: 'nonexistent_id' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.deleted).toBe(0);
    });
  });

  describe('filter-based delete (select all matching)', () => {
    it('should delete leads matching filters', async () => {
      mockPrisma.lead.count.mockResolvedValue(15);
      mockPrisma.lead.deleteMany.mockResolvedValue({ count: 15 });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          filters: {
            tenant: 'acme',
            status: 'new'
          }
        })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.deleted).toBe(15);
      expect(body.usedFilters).toBe(true);
      expect(body.ids).toBe(null);

      expect(mockPrisma.lead.deleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          tenant: 'acme',
          status: 'new'
        })
      });
    });

    it('should delete leads matching search filter', async () => {
      mockPrisma.lead.count.mockResolvedValue(5);
      mockPrisma.lead.deleteMany.mockResolvedValue({ count: 5 });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          filters: {
            tenant: 'acme',
            search: 'john'
          }
        })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.deleted).toBe(5);
      expect(body.usedFilters).toBe(true);

      expect(mockPrisma.lead.deleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          tenant: 'acme',
          OR: expect.any(Array)
        })
      });
    });

    it('should prefer filters over ids when both provided', async () => {
      mockPrisma.lead.count.mockResolvedValue(10);
      mockPrisma.lead.deleteMany.mockResolvedValue({ count: 10 });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          ids: ['lead_1', 'lead_2'],
          filters: {
            tenant: 'acme'
          }
        })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.usedFilters).toBe(true);
      expect(body.ids).toBe(null);
    });
  });

  describe('error handling', () => {
    it('should return 500 when database delete fails', async () => {
      mockPrisma.lead.deleteMany.mockRejectedValue(new Error('Database error'));

      const event = createAuthenticatedEvent({
        httpMethod: 'DELETE',
        queryStringParameters: { id: 'lead_123' }
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toBe('Failed to delete leads');
    });

    it('should return 500 when JSON body is invalid', async () => {
      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: 'invalid json'
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
    });
  });
});
