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

const { handler } = await import('../../netlify/functions/remove-from-call-list.js');

describe('remove-from-call-list API', () => {
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
    it('should return 400 when itemId is missing', async () => {
      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({})
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toContain('Item ID is required');
    });
  });

  describe('removing items', () => {
    it('should delete item successfully', async () => {
      mockPrisma.callListItem.delete.mockResolvedValue(factories.callListItem());

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ itemId: 'item_123' })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
    });

    it('should call delete with correct itemId', async () => {
      mockPrisma.callListItem.delete.mockResolvedValue(factories.callListItem());

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ itemId: 'specific_item_456' })
      });
      await handler(event);

      expect(mockPrisma.callListItem.delete).toHaveBeenCalledWith({
        where: { id: 'specific_item_456' }
      });
    });
  });

  describe('error handling', () => {
    it('should return 500 when database delete fails', async () => {
      mockPrisma.callListItem.delete.mockRejectedValue(new Error('Database error'));

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ itemId: 'item_123' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toContain('Failed to remove from call list');
    });
  });
});
