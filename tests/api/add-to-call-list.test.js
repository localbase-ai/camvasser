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

const { handler } = await import('../../netlify/functions/add-to-call-list.js');

describe('add-to-call-list API', () => {
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
    it('should return 400 when callListId is missing', async () => {
      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ contactIds: ['contact_1'] })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toContain('Call list ID is required');
    });
  });

  describe('adding items to list', () => {
    it('should add contacts to list', async () => {
      mockPrisma.callListItem.findFirst.mockResolvedValue(null);
      mockPrisma.callListItem.findMany.mockResolvedValue([]);
      mockPrisma.callListItem.createMany.mockResolvedValue({ count: 2 });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          callListId: 'list_123',
          contactIds: ['contact_1', 'contact_2']
        })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.added).toBe(2);
    });

    it('should add leads to list', async () => {
      mockPrisma.callListItem.findFirst.mockResolvedValue(null);
      mockPrisma.callListItem.findMany.mockResolvedValue([]);
      mockPrisma.callListItem.createMany.mockResolvedValue({ count: 3 });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          callListId: 'list_123',
          leadIds: ['lead_1', 'lead_2', 'lead_3']
        })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.added).toBe(3);
    });

    it('should skip duplicate contacts', async () => {
      mockPrisma.callListItem.findFirst.mockResolvedValue(null);
      mockPrisma.callListItem.findMany.mockResolvedValue([
        { contactId: 'contact_1', leadId: null }
      ]);
      mockPrisma.callListItem.createMany.mockResolvedValue({ count: 1 });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          callListId: 'list_123',
          contactIds: ['contact_1', 'contact_2']
        })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.added).toBe(1);
      expect(body.skipped).toBe(1);
    });

    it('should continue position from existing items', async () => {
      mockPrisma.callListItem.findFirst.mockResolvedValue({ position: 5 });
      mockPrisma.callListItem.findMany.mockResolvedValue([]);
      mockPrisma.callListItem.createMany.mockResolvedValue({ count: 2 });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          callListId: 'list_123',
          contactIds: ['contact_1', 'contact_2']
        })
      });
      await handler(event);

      expect(mockPrisma.callListItem.createMany).toHaveBeenCalledWith({
        data: [
          { callListId: 'list_123', contactId: 'contact_1', position: 6 },
          { callListId: 'list_123', contactId: 'contact_2', position: 7 }
        ]
      });
    });
  });

  describe('error handling', () => {
    it('should return 500 when database query fails', async () => {
      mockPrisma.callListItem.findFirst.mockRejectedValue(new Error('Database error'));

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          callListId: 'list_123',
          contactIds: ['contact_1']
        })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toContain('Failed to add to call list');
    });
  });
});
