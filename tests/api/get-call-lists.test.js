import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPrisma, factories } from '../helpers/mock-prisma.js';
import { createMockEvent, createAuthenticatedEvent, generateExpiredToken } from '../helpers/auth.js';

const mockPrisma = createMockPrisma();

vi.mock('@prisma/client', () => {
  return {
    PrismaClient: class {
      constructor() {
        return mockPrisma;
      }
    }
  };
});

const { handler } = await import('../../netlify/functions/get-call-lists.js');

describe('get-call-lists API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('authentication', () => {
    it('should return 401 when no auth header provided', async () => {
      const event = createMockEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).error).toContain('Unauthorized');
    });

    it('should return 401 when token is expired', async () => {
      const event = createMockEvent({
        headers: { Authorization: `Bearer ${generateExpiredToken()}` }
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(401);
    });
  });

  describe('method validation', () => {
    it('should return 405 for POST requests', async () => {
      const event = createAuthenticatedEvent({ httpMethod: 'POST' });
      const response = await handler(event);

      expect(response.statusCode).toBe(405);
    });
  });

  describe('parameter validation', () => {
    it('should return 400 when tenant is missing', async () => {
      const event = createAuthenticatedEvent({
        queryStringParameters: {}
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toContain('Tenant is required');
    });
  });

  describe('fetching call lists', () => {
    it('should return empty array when no lists exist', async () => {
      mockPrisma.callList.findMany.mockResolvedValue([]);
      mockPrisma.businessUser.findMany.mockResolvedValue([]);

      const event = createAuthenticatedEvent({
        queryStringParameters: { tenant: 'acme' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.callLists).toEqual([]);
    });

    it('should return call lists for tenant', async () => {
      const lists = [
        factories.callList({ id: 'list_1', name: 'List 1' }),
        factories.callList({ id: 'list_2', name: 'List 2' })
      ];
      mockPrisma.callList.findMany.mockResolvedValue(lists);
      mockPrisma.businessUser.findMany.mockResolvedValue([]);

      const event = createAuthenticatedEvent({
        queryStringParameters: { tenant: 'acme' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.callLists).toHaveLength(2);
    });

    it('should filter by assignedTo when provided', async () => {
      mockPrisma.callList.findMany.mockResolvedValue([]);
      mockPrisma.businessUser.findMany.mockResolvedValue([]);

      const event = createAuthenticatedEvent({
        queryStringParameters: { tenant: 'acme', assignedTo: 'user_456' }
      });
      await handler(event);

      expect(mockPrisma.callList.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'acme',
            assignedToUserId: 'user_456'
          })
        })
      );
    });

    it('should return all lists when all=true', async () => {
      mockPrisma.callList.findMany.mockResolvedValue([]);
      mockPrisma.businessUser.findMany.mockResolvedValue([]);

      const event = createAuthenticatedEvent({
        queryStringParameters: { tenant: 'acme', all: 'true' }
      });
      await handler(event);

      expect(mockPrisma.callList.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'acme' }
        })
      );
    });

    it('should include assignee names in response', async () => {
      const lists = [
        factories.callList({ id: 'list_1', assignedToUserId: 'user_456' })
      ];
      const users = [{ id: 'user_456', name: 'John Doe' }];

      mockPrisma.callList.findMany.mockResolvedValue(lists);
      mockPrisma.businessUser.findMany.mockResolvedValue(users);

      const event = createAuthenticatedEvent({
        queryStringParameters: { tenant: 'acme', all: 'true' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.callLists[0].assigneeName).toBe('John Doe');
    });

    it('should order by createdAt desc', async () => {
      mockPrisma.callList.findMany.mockResolvedValue([]);
      mockPrisma.businessUser.findMany.mockResolvedValue([]);

      const event = createAuthenticatedEvent({
        queryStringParameters: { tenant: 'acme' }
      });
      await handler(event);

      expect(mockPrisma.callList.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' }
        })
      );
    });
  });

  describe('error handling', () => {
    it('should return 500 when database query fails', async () => {
      mockPrisma.callList.findMany.mockRejectedValue(new Error('Database error'));

      const event = createAuthenticatedEvent({
        queryStringParameters: { tenant: 'acme' }
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toContain('Failed to fetch call lists');
    });
  });
});
