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

const { handler } = await import('../../netlify/functions/get-call-list-items.js');

describe('get-call-list-items API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for callList.findUnique (script lookup)
    mockPrisma.callList.findUnique.mockResolvedValue({ id: 'list_123', script: null });
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
    it('should return 400 when listId is missing', async () => {
      const event = createAuthenticatedEvent({
        queryStringParameters: {}
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toContain('List ID is required');
    });
  });

  describe('fetching items', () => {
    it('should return empty array when list has no items', async () => {
      mockPrisma.callListItem.findMany.mockResolvedValue([]);
      mockPrisma.prospect.findMany.mockResolvedValue([]);
      mockPrisma.lead.findMany.mockResolvedValue([]);

      const event = createAuthenticatedEvent({
        queryStringParameters: { listId: 'list_123' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.items).toEqual([]);
    });

    it('should return items with contact data including address, status, updatedAt, and tags', async () => {
      const items = [
        factories.callListItem({ id: 'item_1', contactId: 'contact_1' })
      ];
      const contacts = [
        {
          id: 'contact_1',
          name: 'John Doe',
          phones: [{ phone_number: '555-1234' }],
          emails: [{ email: 'john@example.com' }],
          status: 'contacted',
          lookupAddress: '123 Main St, City, ST 12345',
          updatedAt: new Date('2024-01-15'),
          projectId: 'proj_1'
        }
      ];
      const projects = [
        { id: 'proj_1', tags: [{ display_value: 'VIP', color: '#ff0000' }] }
      ];

      mockPrisma.callListItem.findMany.mockResolvedValue(items);
      mockPrisma.prospect.findMany.mockResolvedValue(contacts);
      mockPrisma.lead.findMany.mockResolvedValue([]);
      mockPrisma.project.findMany.mockResolvedValue(projects);

      const event = createAuthenticatedEvent({
        queryStringParameters: { listId: 'list_123' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].contact.name).toBe('John Doe');
      expect(body.items[0].contact.lookupAddress).toBe('123 Main St, City, ST 12345');
      expect(body.items[0].contact.status).toBe('contacted');
      expect(body.items[0].contact.updatedAt).toBeDefined();
      expect(body.items[0].contact.project.tags).toHaveLength(1);
      expect(body.items[0].contact.project.tags[0].display_value).toBe('VIP');
    });

    it('should return items with lead data', async () => {
      const items = [
        factories.callListItem({ id: 'item_1', leadId: 'lead_1' })
      ];
      const leads = [
        { id: 'lead_1', firstName: 'Jane', lastName: 'Smith', phone: '555-5678' }
      ];

      mockPrisma.callListItem.findMany.mockResolvedValue(items);
      mockPrisma.prospect.findMany.mockResolvedValue([]);
      mockPrisma.lead.findMany.mockResolvedValue(leads);

      const event = createAuthenticatedEvent({
        queryStringParameters: { listId: 'list_123' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].lead.firstName).toBe('Jane');
    });

    it('should order items by position', async () => {
      mockPrisma.callListItem.findMany.mockResolvedValue([]);
      mockPrisma.prospect.findMany.mockResolvedValue([]);
      mockPrisma.lead.findMany.mockResolvedValue([]);

      const event = createAuthenticatedEvent({
        queryStringParameters: { listId: 'list_123' }
      });
      await handler(event);

      expect(mockPrisma.callListItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { position: 'asc' }
        })
      );
    });

    // TODO: Re-enable these tests once CallScript model is added to schema
    it('should return null script (scripts not yet implemented)', async () => {
      mockPrisma.callList.findUnique.mockResolvedValue({
        id: 'list_123'
      });
      mockPrisma.callListItem.findMany.mockResolvedValue([]);
      mockPrisma.prospect.findMany.mockResolvedValue([]);
      mockPrisma.lead.findMany.mockResolvedValue([]);

      const event = createAuthenticatedEvent({
        queryStringParameters: { listId: 'list_123' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.script).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should return 500 when database query fails', async () => {
      mockPrisma.callListItem.findMany.mockRejectedValue(new Error('Database error'));

      const event = createAuthenticatedEvent({
        queryStringParameters: { listId: 'list_123' }
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toContain('Failed to fetch call list items');
    });
  });
});
