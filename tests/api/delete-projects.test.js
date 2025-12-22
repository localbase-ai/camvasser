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
const { handler } = await import('../../netlify/functions/delete-projects.js');

describe('delete-projects API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default mock returns
    mockPrisma.project.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.prospect.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.prospect.updateMany.mockResolvedValue({ count: 0 });
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
      mockPrisma.project.deleteMany.mockResolvedValue({ count: 1 });

      const event = createAuthenticatedEvent({
        httpMethod: 'DELETE',
        queryStringParameters: { id: 'proj_123' }
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });

    it('should allow POST requests for bulk delete', async () => {
      mockPrisma.project.deleteMany.mockResolvedValue({ count: 2 });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ ids: ['proj_1', 'proj_2'] })
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

    it('should delete single project by id', async () => {
      mockPrisma.project.deleteMany.mockResolvedValue({ count: 1 });

      const event = createAuthenticatedEvent({
        httpMethod: 'DELETE',
        queryStringParameters: { id: 'proj_123' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.deleted).toBe(1);
      expect(body.ids).toEqual(['proj_123']);

      expect(mockPrisma.project.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['proj_123'] } }
      });
    });

    it('should unlink prospects by default (not delete them)', async () => {
      mockPrisma.project.deleteMany.mockResolvedValue({ count: 1 });

      const event = createAuthenticatedEvent({
        httpMethod: 'DELETE',
        queryStringParameters: { id: 'proj_123' }
      });
      await handler(event);

      // Should update prospects to unlink them
      expect(mockPrisma.prospect.updateMany).toHaveBeenCalledWith({
        where: { projectId: { in: ['proj_123'] } },
        data: { projectId: null }
      });
      // Should NOT delete prospects
      expect(mockPrisma.prospect.deleteMany).not.toHaveBeenCalled();
    });

    it('should delete associated prospects when deleteContacts=true', async () => {
      mockPrisma.prospect.deleteMany.mockResolvedValue({ count: 3 });
      mockPrisma.project.deleteMany.mockResolvedValue({ count: 1 });

      const event = createAuthenticatedEvent({
        httpMethod: 'DELETE',
        queryStringParameters: { id: 'proj_123', deleteContacts: 'true' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.prospectsDeleted).toBe(3);

      expect(mockPrisma.prospect.deleteMany).toHaveBeenCalledWith({
        where: { projectId: { in: ['proj_123'] } }
      });
      expect(mockPrisma.prospect.updateMany).not.toHaveBeenCalled();
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

    it('should return 400 when ids is not an array', async () => {
      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ ids: 'not-an-array' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
    });

    it('should delete multiple projects', async () => {
      mockPrisma.project.deleteMany.mockResolvedValue({ count: 3 });

      const ids = ['proj_1', 'proj_2', 'proj_3'];
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

      expect(mockPrisma.project.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ids } }
      });
    });

    it('should delete associated prospects when deleteContacts=true in body', async () => {
      mockPrisma.prospect.deleteMany.mockResolvedValue({ count: 5 });
      mockPrisma.project.deleteMany.mockResolvedValue({ count: 2 });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ ids: ['proj_1', 'proj_2'], deleteContacts: true })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.deleted).toBe(2);
      expect(body.prospectsDeleted).toBe(5);

      expect(mockPrisma.prospect.deleteMany).toHaveBeenCalled();
    });

    it('should unlink prospects by default in bulk delete', async () => {
      mockPrisma.project.deleteMany.mockResolvedValue({ count: 2 });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ ids: ['proj_1', 'proj_2'] })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.prospectsDeleted).toBe(0);
      expect(mockPrisma.prospect.updateMany).toHaveBeenCalled();
      expect(mockPrisma.prospect.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('response format', () => {
    it('should return correct response shape', async () => {
      mockPrisma.project.deleteMany.mockResolvedValue({ count: 1 });

      const event = createAuthenticatedEvent({
        httpMethod: 'DELETE',
        queryStringParameters: { id: 'proj_123' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.headers['Content-Type']).toBe('application/json');
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('deleted');
      expect(body).toHaveProperty('prospectsDeleted');
      expect(body).toHaveProperty('ids');
    });

    it('should return 0 deleted when no projects match', async () => {
      mockPrisma.project.deleteMany.mockResolvedValue({ count: 0 });

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

  describe('error handling', () => {
    it('should return 500 when database delete fails', async () => {
      mockPrisma.prospect.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.project.deleteMany.mockRejectedValue(new Error('Database error'));

      const event = createAuthenticatedEvent({
        httpMethod: 'DELETE',
        queryStringParameters: { id: 'proj_123' }
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toBe('Failed to delete projects');
    });

    it('should return 500 when prospect delete fails', async () => {
      mockPrisma.prospect.deleteMany.mockRejectedValue(new Error('Database error'));

      const event = createAuthenticatedEvent({
        httpMethod: 'DELETE',
        queryStringParameters: { id: 'proj_123', deleteContacts: 'true' }
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
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
