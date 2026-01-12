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

const { handler } = await import('../../netlify/functions/update-call-list.js');

describe('update-call-list API', () => {
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
    it('should return 400 when id is missing', async () => {
      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ tenant: 'acme', name: 'Updated List' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toContain('List ID and tenant are required');
    });

    it('should return 400 when tenant is missing', async () => {
      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ id: 'list_123', name: 'Updated List' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toContain('List ID and tenant are required');
    });
  });

  describe('list lookup', () => {
    it('should return 404 when list not found', async () => {
      mockPrisma.callList.findFirst.mockResolvedValue(null);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ id: 'nonexistent', tenant: 'acme' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body).error).toContain('Call list not found');
    });
  });

  describe('updating call lists', () => {
    it('should update list name', async () => {
      const existingList = factories.callList({ id: 'list_123', CallListAssignment: [] });
      mockPrisma.callList.findFirst.mockResolvedValue(existingList);
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.callList.update.mockResolvedValue({ ...existingList, name: 'New Name' });
      mockPrisma.callList.findUnique.mockResolvedValue({ ...existingList, name: 'New Name', CallListAssignment: [] });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          id: 'list_123',
          tenant: 'acme',
          name: 'New Name'
        })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
    });

    it('should update assignees', async () => {
      const existingList = factories.callList({
        id: 'list_123',
        CallListAssignment: [{ userId: 'user_old' }]
      });
      mockPrisma.callList.findFirst.mockResolvedValue(existingList);
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.callList.update.mockResolvedValue(existingList);
      mockPrisma.callListAssignment.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.callListAssignment.createMany.mockResolvedValue({ count: 2 });
      mockPrisma.callList.findUnique.mockResolvedValue({
        ...existingList,
        CallListAssignment: [
          { userId: 'user_1', BusinessUser: { id: 'user_1', name: 'User 1' } },
          { userId: 'user_2', BusinessUser: { id: 'user_2', name: 'User 2' } }
        ]
      });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          id: 'list_123',
          tenant: 'acme',
          assignedUserIds: ['user_1', 'user_2']
        })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
    });

    it('should update script', async () => {
      const existingList = factories.callList({ id: 'list_123', CallListAssignment: [] });
      mockPrisma.callList.findFirst.mockResolvedValue(existingList);
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.callList.update.mockResolvedValue({ ...existingList, scriptId: 'script_456' });
      mockPrisma.callList.findUnique.mockResolvedValue({ ...existingList, scriptId: 'script_456', CallListAssignment: [] });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          id: 'list_123',
          tenant: 'acme',
          scriptId: 'script_456'
        })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
    });

    it('should clear script when scriptId is empty string', async () => {
      const existingList = factories.callList({ id: 'list_123', scriptId: 'script_old', CallListAssignment: [] });
      mockPrisma.callList.findFirst.mockResolvedValue(existingList);
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.callList.update.mockResolvedValue({ ...existingList, scriptId: null });
      mockPrisma.callList.findUnique.mockResolvedValue({ ...existingList, scriptId: null, CallListAssignment: [] });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          id: 'list_123',
          tenant: 'acme',
          scriptId: ''
        })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });

    it('should remove assignees when empty array provided', async () => {
      const existingList = factories.callList({
        id: 'list_123',
        CallListAssignment: [{ userId: 'user_1' }, { userId: 'user_2' }]
      });
      mockPrisma.callList.findFirst.mockResolvedValue(existingList);
      mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
      mockPrisma.callListAssignment.deleteMany.mockResolvedValue({ count: 2 });
      mockPrisma.callList.findUnique.mockResolvedValue({ ...existingList, CallListAssignment: [] });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          id: 'list_123',
          tenant: 'acme',
          assignedUserIds: []
        })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });
  });

  describe('error handling', () => {
    it('should return 500 when database update fails', async () => {
      const existingList = factories.callList({ id: 'list_123', CallListAssignment: [] });
      mockPrisma.callList.findFirst.mockResolvedValue(existingList);
      mockPrisma.$transaction.mockRejectedValue(new Error('Database error'));

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          id: 'list_123',
          tenant: 'acme',
          name: 'Updated Name'
        })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toContain('Failed to update call list');
    });
  });
});
