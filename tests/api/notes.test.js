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
const { handler } = await import('../../netlify/functions/notes.js');

describe('notes API', () => {
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
    it('should return 405 for PUT requests', async () => {
      const event = createAuthenticatedEvent({ httpMethod: 'PUT' });
      const response = await handler(event);

      expect(response.statusCode).toBe(405);
    });

    it('should return 405 for PATCH requests', async () => {
      const event = createAuthenticatedEvent({ httpMethod: 'PATCH' });
      const response = await handler(event);

      expect(response.statusCode).toBe(405);
    });
  });

  describe('GET - fetch notes', () => {
    it('should return 400 when entityType is missing', async () => {
      const event = createAuthenticatedEvent({
        queryStringParameters: { entityId: 'lead_123' }
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toContain('entityType');
    });

    it('should return 400 when entityId is missing', async () => {
      const event = createAuthenticatedEvent({
        queryStringParameters: { entityType: 'lead' }
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toContain('entityId');
    });

    it('should return 400 for invalid entityType', async () => {
      const event = createAuthenticatedEvent({
        queryStringParameters: { entityType: 'invalid', entityId: 'test_123' }
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toContain('Invalid entityType');
    });

    it('should fetch notes for a lead', async () => {
      const notes = [
        factories.note({ id: 'note_1', content: 'First note' }),
        factories.note({ id: 'note_2', content: 'Second note' })
      ];
      mockPrisma.note.findMany.mockResolvedValue(notes);

      const event = createAuthenticatedEvent({
        queryStringParameters: { entityType: 'lead', entityId: 'lead_123', tenant: 'acme' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.count).toBe(2);
      expect(body.notes).toHaveLength(2);
    });

    it('should fetch notes for a prospect', async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);

      const event = createAuthenticatedEvent({
        queryStringParameters: { entityType: 'prospect', entityId: 'prosp_123' }
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(mockPrisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entityType: 'prospect',
            entityId: 'prosp_123'
          })
        })
      );
    });

    it('should fetch notes for a project', async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);

      const event = createAuthenticatedEvent({
        queryStringParameters: { entityType: 'project', entityId: 'proj_123' }
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(mockPrisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entityType: 'project',
            entityId: 'proj_123'
          })
        })
      );
    });

    it('should order notes by createdAt desc', async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);

      const event = createAuthenticatedEvent({
        queryStringParameters: { entityType: 'lead', entityId: 'lead_123' }
      });
      await handler(event);

      expect(mockPrisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' }
        })
      );
    });

    it('should filter by tenant when provided', async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);

      const event = createAuthenticatedEvent({
        queryStringParameters: { entityType: 'lead', entityId: 'lead_123', tenant: 'custom-tenant' }
      });
      await handler(event);

      expect(mockPrisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenant: 'custom-tenant' })
        })
      );
    });
  });

  describe('POST - create note', () => {
    it('should return 400 when content is missing', async () => {
      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ entityType: 'lead', entityId: 'lead_123', tenant: 'acme' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toContain('content');
    });

    it('should return 400 when tenant is missing', async () => {
      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ entityType: 'lead', entityId: 'lead_123', content: 'Test note' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toContain('tenant');
    });

    it('should return 400 for invalid entityType', async () => {
      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ entityType: 'invalid', entityId: 'test_123', content: 'Test', tenant: 'acme' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toContain('Invalid entityType');
    });

    it('should create a note successfully', async () => {
      const newNote = factories.note({ content: 'My new note' });
      mockPrisma.note.create.mockResolvedValue(newNote);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          entityType: 'lead',
          entityId: 'lead_123',
          content: 'My new note',
          tenant: 'acme'
        })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(201);
      expect(body.success).toBe(true);
      expect(body.note).toBeDefined();
    });

    it('should trim content before saving', async () => {
      mockPrisma.note.create.mockResolvedValue(factories.note());

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          entityType: 'lead',
          entityId: 'lead_123',
          content: '  Trimmed content  ',
          tenant: 'acme'
        })
      });
      await handler(event);

      expect(mockPrisma.note.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ content: 'Trimmed content' })
        })
      );
    });

    it('should include author info from token', async () => {
      mockPrisma.note.create.mockResolvedValue(factories.note());

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        tokenPayload: { userId: 'user_456', email: 'author@example.com' },
        body: JSON.stringify({
          entityType: 'lead',
          entityId: 'lead_123',
          content: 'Note with author',
          tenant: 'acme'
        })
      });
      await handler(event);

      expect(mockPrisma.note.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            authorId: 'user_456',
            authorName: 'author@example.com'
          })
        })
      );
    });
  });

  describe('DELETE - delete note', () => {
    it('should return 400 when note id is missing', async () => {
      const event = createAuthenticatedEvent({
        httpMethod: 'DELETE',
        queryStringParameters: {}
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toContain('id');
    });

    it('should delete a note successfully', async () => {
      mockPrisma.note.delete.mockResolvedValue(factories.note());

      const event = createAuthenticatedEvent({
        httpMethod: 'DELETE',
        queryStringParameters: { id: 'note_123' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(mockPrisma.note.delete).toHaveBeenCalledWith({
        where: { id: 'note_123' }
      });
    });
  });

  describe('error handling', () => {
    it('should return 500 when database query fails on GET', async () => {
      mockPrisma.note.findMany.mockRejectedValue(new Error('Database error'));

      const event = createAuthenticatedEvent({
        queryStringParameters: { entityType: 'lead', entityId: 'lead_123' }
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toContain('Failed to fetch notes');
    });

    it('should return 500 when database query fails on POST', async () => {
      mockPrisma.note.create.mockRejectedValue(new Error('Database error'));

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          entityType: 'lead',
          entityId: 'lead_123',
          content: 'Test note',
          tenant: 'acme'
        })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toContain('Failed to add note');
    });

    it('should return 500 when database query fails on DELETE', async () => {
      mockPrisma.note.delete.mockRejectedValue(new Error('Database error'));

      const event = createAuthenticatedEvent({
        httpMethod: 'DELETE',
        queryStringParameters: { id: 'note_123' }
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toContain('Failed to delete note');
    });
  });

  describe('response format', () => {
    it('should return correct response shape for GET', async () => {
      mockPrisma.note.findMany.mockResolvedValue([factories.note()]);

      const event = createAuthenticatedEvent({
        queryStringParameters: { entityType: 'lead', entityId: 'lead_123' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.headers['Content-Type']).toBe('application/json');
      expect(body).toHaveProperty('count');
      expect(body).toHaveProperty('notes');
      expect(Array.isArray(body.notes)).toBe(true);
    });

    it('should return correct response shape for POST', async () => {
      mockPrisma.note.create.mockResolvedValue(factories.note());

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          entityType: 'lead',
          entityId: 'lead_123',
          content: 'Test note',
          tenant: 'acme'
        })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.headers['Content-Type']).toBe('application/json');
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('note');
    });
  });
});
