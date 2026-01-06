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

const { handler } = await import('../../netlify/functions/get-tenant-users.js');

describe('get-tenant-users API', () => {
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

  describe('fetching users', () => {
    it('should return 404 when tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      const event = createAuthenticatedEvent({
        queryStringParameters: { tenant: 'nonexistent' }
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body).error).toContain('Tenant not found');
    });

    it('should return empty array when tenant has no users', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        ...factories.tenant(),
        users: []
      });

      const event = createAuthenticatedEvent({
        queryStringParameters: { tenant: 'acme' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.users).toEqual([]);
    });

    it('should return users with correct fields', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        ...factories.tenant(),
        users: [
          {
            role: 'admin',
            user: { id: 'user_1', name: 'John Doe', email: 'john@example.com' }
          },
          {
            role: 'member',
            user: { id: 'user_2', name: 'Jane Smith', email: 'jane@example.com' }
          }
        ]
      });

      const event = createAuthenticatedEvent({
        queryStringParameters: { tenant: 'acme' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.users).toHaveLength(2);
      expect(body.users[0]).toEqual({
        id: 'user_1',
        name: 'John Doe',
        email: 'john@example.com',
        role: 'admin'
      });
      expect(body.users[1]).toEqual({
        id: 'user_2',
        name: 'Jane Smith',
        email: 'jane@example.com',
        role: 'member'
      });
    });

    it('should query tenant by slug', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        ...factories.tenant(),
        users: []
      });

      const event = createAuthenticatedEvent({
        queryStringParameters: { tenant: 'test-tenant' }
      });
      await handler(event);

      expect(mockPrisma.tenant.findUnique).toHaveBeenCalledWith({
        where: { slug: 'test-tenant' },
        include: {
          users: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          }
        }
      });
    });
  });

  describe('error handling', () => {
    it('should return 500 when database query fails', async () => {
      mockPrisma.tenant.findUnique.mockRejectedValue(new Error('Database error'));

      const event = createAuthenticatedEvent({
        queryStringParameters: { tenant: 'acme' }
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toContain('Failed to fetch users');
    });
  });
});
