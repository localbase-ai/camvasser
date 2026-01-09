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
const { handler } = await import('../../netlify/functions/get-leads.js');

describe('get-leads API', () => {
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

    it('should return 405 for DELETE requests', async () => {
      const event = createAuthenticatedEvent({ httpMethod: 'DELETE' });
      const response = await handler(event);

      expect(response.statusCode).toBe(405);
    });
  });

  describe('lead fetching', () => {
    it('should fetch leads with default pagination', async () => {
      const leads = [factories.lead(), factories.lead({ id: 'lead_456' })];
      mockPrisma.lead.findMany.mockResolvedValue(leads);
      mockPrisma.lead.count.mockResolvedValue(2);

      const event = createAuthenticatedEvent();
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.type).toBe('lead');
      expect(body.count).toBe(2);
      expect(body.total).toBe(2);
      expect(body.page).toBe(1);
      expect(body.leads).toHaveLength(2);
    });

    it('should apply tenant filter from query param', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([]);
      mockPrisma.lead.count.mockResolvedValue(0);

      const event = createAuthenticatedEvent({
        queryStringParameters: { tenant: 'custom-tenant' }
      });
      await handler(event);

      expect(mockPrisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenant: 'custom-tenant' })
        })
      );
    });

    it('should fall back to user slug when no tenant param', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([]);
      mockPrisma.lead.count.mockResolvedValue(0);

      const event = createAuthenticatedEvent({
        tokenPayload: { slug: 'user-tenant' }
      });
      await handler(event);

      expect(mockPrisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenant: 'user-tenant' })
        })
      );
    });
  });

  describe('pagination', () => {
    it('should apply custom limit and page', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([]);
      mockPrisma.lead.count.mockResolvedValue(100);

      const event = createAuthenticatedEvent({
        queryStringParameters: { limit: '10', page: '3' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(mockPrisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 20 // (page 3 - 1) * 10
        })
      );
      expect(body.page).toBe(3);
      expect(body.totalPages).toBe(10); // 100 / 10
    });

    it('should default to page 1 and limit 25', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([]);
      mockPrisma.lead.count.mockResolvedValue(0);

      const event = createAuthenticatedEvent();
      await handler(event);

      expect(mockPrisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 25,
          skip: 0
        })
      );
    });
  });

  describe('sorting', () => {
    it('should sort by createdAt desc by default', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([]);
      mockPrisma.lead.count.mockResolvedValue(0);

      const event = createAuthenticatedEvent();
      await handler(event);

      expect(mockPrisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' }
        })
      );
    });

    it('should apply custom sort field and direction', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([]);
      mockPrisma.lead.count.mockResolvedValue(0);

      const event = createAuthenticatedEvent({
        queryStringParameters: { sortBy: 'firstName', sortDir: 'asc' }
      });
      await handler(event);

      expect(mockPrisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { firstName: 'asc' }
        })
      );
    });

    it('should ignore invalid sort fields', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([]);
      mockPrisma.lead.count.mockResolvedValue(0);

      const event = createAuthenticatedEvent({
        queryStringParameters: { sortBy: 'invalidField' }
      });
      await handler(event);

      expect(mockPrisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' }
        })
      );
    });
  });

  describe('status filtering', () => {
    it('should filter by status when provided', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([]);
      mockPrisma.lead.count.mockResolvedValue(0);

      const event = createAuthenticatedEvent({
        queryStringParameters: { status: 'new' }
      });
      await handler(event);

      expect(mockPrisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'new' })
        })
      );
    });
  });

  describe('search', () => {
    it('should apply search filter', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([]);
      mockPrisma.lead.count.mockResolvedValue(0);

      const event = createAuthenticatedEvent({
        queryStringParameters: { search: 'john' }
      });
      await handler(event);

      // buildLeadsWhereClause adds OR conditions for search
      expect(mockPrisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ firstName: expect.any(Object) })
            ])
          })
        })
      );
    });
  });

  describe('business users type', () => {
    it('should fetch business users when type=business', async () => {
      const businessUsers = [factories.businessUser()];
      mockPrisma.businessUser.findMany.mockResolvedValue(businessUsers);
      mockPrisma.businessUser.count.mockResolvedValue(1);

      const event = createAuthenticatedEvent({
        queryStringParameters: { type: 'business' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.type).toBe('business');
      expect(mockPrisma.businessUser.findMany).toHaveBeenCalled();
      expect(mockPrisma.lead.findMany).not.toHaveBeenCalled();
    });
  });

  describe('response format', () => {
    it('should return correct response shape for leads', async () => {
      const lead = factories.lead();
      mockPrisma.lead.findMany.mockResolvedValue([lead]);
      mockPrisma.lead.count.mockResolvedValue(1);

      const event = createAuthenticatedEvent();
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.headers['Content-Type']).toBe('application/json');
      expect(body).toHaveProperty('type', 'lead');
      expect(body).toHaveProperty('tenant');
      expect(body).toHaveProperty('count');
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('page');
      expect(body).toHaveProperty('totalPages');
      expect(body).toHaveProperty('leads');
    });

    it('should return distinctOwners and distinctStatuses', async () => {
      const lead = factories.lead();
      // First two calls are main query + count, next two are distinct queries
      mockPrisma.lead.findMany
        .mockResolvedValueOnce([lead])  // main query
        .mockResolvedValueOnce([{ ownerName: 'John' }, { ownerName: 'Jane' }])  // owners
        .mockResolvedValueOnce([{ status: 'new' }, { status: 'contacted' }]);   // statuses
      mockPrisma.lead.count.mockResolvedValue(1);

      const event = createAuthenticatedEvent();
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body).toHaveProperty('distinctOwners');
      expect(body).toHaveProperty('distinctStatuses');
      expect(body.distinctOwners).toContain('John');
      expect(body.distinctStatuses).toContain('new');
    });
  });

  describe('distinct filter queries', () => {
    it('should query for distinct owners filtering out empty strings', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([]);
      mockPrisma.lead.count.mockResolvedValue(0);

      const event = createAuthenticatedEvent({
        queryStringParameters: { tenant: 'test-tenant' }
      });
      await handler(event);

      // Check that one of the findMany calls was for distinct owners
      const calls = mockPrisma.lead.findMany.mock.calls;
      const ownersCall = calls.find(call =>
        call[0]?.distinct?.includes('ownerName')
      );
      expect(ownersCall).toBeDefined();
      expect(ownersCall[0].where).toHaveProperty('ownerName');
      expect(ownersCall[0].where.ownerName).toEqual({ not: '' });
    });

    it('should query for distinct statuses filtering out empty strings', async () => {
      mockPrisma.lead.findMany.mockResolvedValue([]);
      mockPrisma.lead.count.mockResolvedValue(0);

      const event = createAuthenticatedEvent({
        queryStringParameters: { tenant: 'test-tenant' }
      });
      await handler(event);

      // Check that one of the findMany calls was for distinct statuses
      const calls = mockPrisma.lead.findMany.mock.calls;
      const statusCall = calls.find(call =>
        call[0]?.distinct?.includes('status')
      );
      expect(statusCall).toBeDefined();
      expect(statusCall[0].where).toHaveProperty('status');
      expect(statusCall[0].where.status).toEqual({ not: '' });
    });
  });

  describe('error handling', () => {
    it('should return 500 when database query fails', async () => {
      mockPrisma.lead.findMany.mockRejectedValue(new Error('Database error'));

      const event = createAuthenticatedEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toBe('Failed to fetch leads');
    });
  });
});
