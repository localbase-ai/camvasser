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
const { handler } = await import('../../netlify/functions/get-user-tenants.js');

describe('get-user-tenants API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('authentication', () => {
    it('should return 401 when no auth header provided', async () => {
      const event = createMockEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).error).toBe('Unauthorized');
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

  describe('user lookup', () => {
    it('should return 404 when user not found', async () => {
      mockPrisma.businessUser.findUnique.mockResolvedValue(null);

      const event = createAuthenticatedEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body).error).toBe('User not found');
    });

    it('should look up user by userId from token', async () => {
      const user = factories.businessUser({
        id: 'user_123',
        UserTenant: []
      });
      mockPrisma.businessUser.findUnique.mockResolvedValue(user);

      const event = createAuthenticatedEvent({
        tokenPayload: { userId: 'user_123' }
      });
      await handler(event);

      expect(mockPrisma.businessUser.findUnique).toHaveBeenCalledWith({
        where: { id: 'user_123' },
        include: {
          UserTenant: {
            include: { tenant: true }
          }
        }
      });
    });
  });

  describe('tenant response', () => {
    it('should return user with their tenants', async () => {
      const tenant = factories.tenant({
        id: 'tenant_1',
        slug: 'acme',
        name: 'Acme Roofing',
        domain: 'acme.com',
        logoUrl: 'https://example.com/logo.png'
      });

      const user = factories.businessUser({
        id: 'user_123',
        name: 'Test User',
        email: 'test@example.com',
        isAdmin: false,
        slug: 'acme',
        UserTenant: [
          {
            role: 'owner',
            tenant: tenant
          }
        ]
      });

      mockPrisma.businessUser.findUnique.mockResolvedValue(user);

      const event = createAuthenticatedEvent();
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.user).toEqual({
        id: 'user_123',
        name: 'Test User',
        email: 'test@example.com',
        isAdmin: false
      });
      expect(body.tenants).toHaveLength(1);
      expect(body.tenants[0]).toEqual({
        id: 'tenant_1',
        slug: 'acme',
        name: 'Acme Roofing',
        domain: 'acme.com',
        logoUrl: 'https://example.com/logo.png',
        role: 'owner'
      });
    });

    it('should return defaultTenant from user slug', async () => {
      const user = factories.businessUser({
        slug: 'user-default-tenant',
        UserTenant: []
      });
      mockPrisma.businessUser.findUnique.mockResolvedValue(user);

      const event = createAuthenticatedEvent();
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.defaultTenant).toBe('user-default-tenant');
    });

    it('should fall back to first tenant when user has no slug', async () => {
      const tenant = factories.tenant({ slug: 'first-tenant' });
      const user = factories.businessUser({
        slug: null,
        UserTenant: [{ role: 'member', tenant }]
      });
      mockPrisma.businessUser.findUnique.mockResolvedValue(user);

      const event = createAuthenticatedEvent();
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.defaultTenant).toBe('first-tenant');
    });

    it('should return null defaultTenant when user has no slug and no tenants', async () => {
      const user = factories.businessUser({
        slug: null,
        UserTenant: []
      });
      mockPrisma.businessUser.findUnique.mockResolvedValue(user);

      const event = createAuthenticatedEvent();
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.defaultTenant).toBeNull();
    });

    it('should return multiple tenants', async () => {
      const UserTenant = [
        { role: 'owner', tenant: factories.tenant({ slug: 'tenant-1', name: 'Tenant 1' }) },
        { role: 'member', tenant: factories.tenant({ slug: 'tenant-2', name: 'Tenant 2' }) }
      ];
      const user = factories.businessUser({ UserTenant });
      mockPrisma.businessUser.findUnique.mockResolvedValue(user);

      const event = createAuthenticatedEvent();
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.tenants).toHaveLength(2);
      expect(body.tenants[0].slug).toBe('tenant-1');
      expect(body.tenants[1].slug).toBe('tenant-2');
    });
  });

  describe('error handling', () => {
    it('should return 500 when database query fails', async () => {
      mockPrisma.businessUser.findUnique.mockRejectedValue(new Error('Database error'));

      const event = createAuthenticatedEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toBe('Failed to fetch tenants');
    });
  });
});
