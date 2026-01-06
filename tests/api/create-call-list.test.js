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

const { handler } = await import('../../netlify/functions/create-call-list.js');

describe('create-call-list API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('authentication', () => {
    it('should return 401 when no auth header provided', async () => {
      const event = createMockEvent({ httpMethod: 'POST' });
      const response = await handler(event);

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).error).toContain('Unauthorized');
    });

    it('should return 401 when token is expired', async () => {
      const event = createMockEvent({
        httpMethod: 'POST',
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
    });
  });

  describe('parameter validation', () => {
    it('should return 400 when name is missing', async () => {
      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ tenant: 'acme' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toContain('Name and tenant are required');
    });

    it('should return 400 when tenant is missing', async () => {
      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ name: 'Test List' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toContain('Name and tenant are required');
    });
  });

  describe('creating call lists', () => {
    it('should create a call list with contacts', async () => {
      const newList = factories.callList({ name: 'My List', _count: { items: 2 } });
      mockPrisma.callList.create.mockResolvedValue(newList);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          name: 'My List',
          tenant: 'acme',
          contactIds: ['contact_1', 'contact_2']
        })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.callList).toBeDefined();
    });

    it('should create a call list with leads', async () => {
      const newList = factories.callList({ name: 'Lead List', _count: { items: 3 } });
      mockPrisma.callList.create.mockResolvedValue(newList);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          name: 'Lead List',
          tenant: 'acme',
          leadIds: ['lead_1', 'lead_2', 'lead_3']
        })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
    });

    it('should assign to current user when no assignee specified', async () => {
      mockPrisma.callList.create.mockResolvedValue(factories.callList());

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        tokenPayload: { userId: 'user_456' },
        body: JSON.stringify({
          name: 'My List',
          tenant: 'acme',
          contactIds: []
        })
      });
      await handler(event);

      expect(mockPrisma.callList.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            assignedToUserId: 'user_456'
          })
        })
      );
    });

    it('should assign to specified user when assignedToUserId provided', async () => {
      mockPrisma.callList.create.mockResolvedValue(factories.callList());

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          name: 'Assigned List',
          tenant: 'acme',
          contactIds: [],
          assignedToUserId: 'user_789'
        })
      });
      await handler(event);

      expect(mockPrisma.callList.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            assignedToUserId: 'user_789'
          })
        })
      );
    });

    it('should create items with correct positions', async () => {
      mockPrisma.callList.create.mockResolvedValue(factories.callList());

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          name: 'Positioned List',
          tenant: 'acme',
          contactIds: ['contact_1', 'contact_2'],
          leadIds: ['lead_1']
        })
      });
      await handler(event);

      expect(mockPrisma.callList.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            items: {
              create: [
                { contactId: 'contact_1', position: 0 },
                { contactId: 'contact_2', position: 1 },
                { leadId: 'lead_1', position: 2 }
              ]
            }
          })
        })
      );
    });
  });

  describe('error handling', () => {
    it('should return 500 when database create fails', async () => {
      mockPrisma.callList.create.mockRejectedValue(new Error('Database error'));

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          name: 'Test List',
          tenant: 'acme',
          contactIds: []
        })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toContain('Failed to create call list');
    });
  });
});
