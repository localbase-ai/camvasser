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
const { handler } = await import('../../netlify/functions/get-tags.js');

describe('get-tags API', () => {
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

    it('should return 401 when auth header is malformed', async () => {
      const event = createMockEvent({
        headers: { Authorization: 'InvalidToken' }
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(401);
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
      expect(JSON.parse(response.body).error).toBe('Method not allowed');
    });

    it('should return 405 for DELETE requests', async () => {
      const event = createAuthenticatedEvent({ httpMethod: 'DELETE' });
      const response = await handler(event);

      expect(response.statusCode).toBe(405);
    });
  });

  describe('tenant filtering', () => {
    it('should fetch all tags when no tenant specified', async () => {
      const projects = [
        factories.project({ tags: [factories.tag({ value: 'tag1', display_value: 'Tag 1' })] }),
        factories.project({ tags: [factories.tag({ value: 'tag2', display_value: 'Tag 2' })] })
      ];
      mockPrisma.project.findMany.mockResolvedValue(projects);

      const event = createAuthenticatedEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(mockPrisma.project.findMany).toHaveBeenCalledWith({
        where: { tags: { not: null } },
        select: { tags: true }
      });
    });

    it('should filter by tenant when tenant param provided', async () => {
      mockPrisma.project.findMany.mockResolvedValue([]);

      const event = createAuthenticatedEvent({
        queryStringParameters: { tenant: 'acme' }
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
      expect(mockPrisma.project.findMany).toHaveBeenCalledWith({
        where: { tags: { not: null }, tenant: 'acme' },
        select: { tags: true }
      });
    });
  });

  describe('tag extraction and deduplication', () => {
    it('should extract unique tags from projects', async () => {
      const tag1 = factories.tag({ id: '1', value: 'storm-damage', display_value: 'Storm Damage' });
      const tag2 = factories.tag({ id: '2', value: 'hail', display_value: 'Hail' });

      const projects = [
        factories.project({ tags: [tag1, tag2] }),
        factories.project({ tags: [tag1] }), // Duplicate tag1
        factories.project({ tags: [tag2] })
      ];
      mockPrisma.project.findMany.mockResolvedValue(projects);

      const event = createAuthenticatedEvent();
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.count).toBe(2); // Only 2 unique tags
      expect(body.tags).toHaveLength(2);
    });

    it('should sort tags alphabetically by display_value', async () => {
      const tagZ = factories.tag({ value: 'z-tag', display_value: 'Zebra Tag' });
      const tagA = factories.tag({ value: 'a-tag', display_value: 'Alpha Tag' });
      const tagM = factories.tag({ value: 'm-tag', display_value: 'Middle Tag' });

      const projects = [
        factories.project({ tags: [tagZ, tagA, tagM] })
      ];
      mockPrisma.project.findMany.mockResolvedValue(projects);

      const event = createAuthenticatedEvent();
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.tags[0].display_value).toBe('Alpha Tag');
      expect(body.tags[1].display_value).toBe('Middle Tag');
      expect(body.tags[2].display_value).toBe('Zebra Tag');
    });

    it('should handle projects with no tags array', async () => {
      const projects = [
        factories.project({ tags: null }),
        factories.project({ tags: [factories.tag()] })
      ];
      mockPrisma.project.findMany.mockResolvedValue(projects);

      const event = createAuthenticatedEvent();
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.count).toBe(1);
    });

    it('should handle projects with empty tags array', async () => {
      const projects = [
        factories.project({ tags: [] }),
        factories.project({ tags: [factories.tag()] })
      ];
      mockPrisma.project.findMany.mockResolvedValue(projects);

      const event = createAuthenticatedEvent();
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.count).toBe(1);
    });

    it('should skip tags without value property', async () => {
      const validTag = factories.tag({ value: 'valid', display_value: 'Valid' });
      const invalidTag = { id: '2', display_value: 'No Value' }; // Missing value

      const projects = [
        factories.project({ tags: [validTag, invalidTag] })
      ];
      mockPrisma.project.findMany.mockResolvedValue(projects);

      const event = createAuthenticatedEvent();
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.count).toBe(1);
      expect(body.tags[0].value).toBe('valid');
    });
  });

  describe('response format', () => {
    it('should return correct response shape', async () => {
      const tag = factories.tag({
        id: 'tag_123',
        value: 'test-tag',
        display_value: 'Test Tag',
        tag_type: 'label'
      });
      mockPrisma.project.findMany.mockResolvedValue([
        factories.project({ tags: [tag] })
      ]);

      const event = createAuthenticatedEvent();
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.headers['Content-Type']).toBe('application/json');
      expect(body).toHaveProperty('count');
      expect(body).toHaveProperty('tags');
      expect(body.tags[0]).toHaveProperty('id');
      expect(body.tags[0]).toHaveProperty('value');
      expect(body.tags[0]).toHaveProperty('display_value');
      expect(body.tags[0]).toHaveProperty('tag_type');
    });

    it('should return empty array when no projects have tags', async () => {
      mockPrisma.project.findMany.mockResolvedValue([]);

      const event = createAuthenticatedEvent();
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.count).toBe(0);
      expect(body.tags).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should return 500 when database query fails', async () => {
      mockPrisma.project.findMany.mockRejectedValue(new Error('Database connection failed'));

      const event = createAuthenticatedEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toBe('Failed to fetch tags');
    });
  });
});
