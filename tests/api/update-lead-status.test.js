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

const { handler } = await import('../../netlify/functions/update-lead-status.js');

describe('update-lead-status API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: lead exists and user has access
    mockPrisma.lead.findUnique.mockResolvedValue({ tenant: 'acme' });
    mockPrisma.lead.update.mockResolvedValue(factories.lead());
  });

  describe('authentication', () => {
    it('should return 401 when no auth header provided', async () => {
      const event = createMockEvent({ httpMethod: 'POST', body: JSON.stringify({ leadId: 'lead_123' }) });
      const response = await handler(event);
      expect(response.statusCode).toBe(401);
    });

    it('should return 401 when token is expired', async () => {
      const event = createMockEvent({
        httpMethod: 'POST',
        headers: { Authorization: `Bearer ${generateExpiredToken()}` },
        body: JSON.stringify({ leadId: 'lead_123' })
      });
      const response = await handler(event);
      expect(response.statusCode).toBe(401);
    });
  });

  describe('validation', () => {
    it('should return 405 for GET requests', async () => {
      const event = createAuthenticatedEvent({ httpMethod: 'GET' });
      const response = await handler(event);
      expect(response.statusCode).toBe(405);
    });

    it('should return 400 when leadId is missing', async () => {
      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ status: 'completed' })
      });
      const response = await handler(event);
      expect(response.statusCode).toBe(400);
    });

    it('should return 400 for invalid status', async () => {
      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123', status: 'bogus' })
      });
      const response = await handler(event);
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).validStatuses).toBeDefined();
    });

    it('should return 404 when lead not found', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue(null);
      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'nonexistent' })
      });
      const response = await handler(event);
      expect(response.statusCode).toBe(404);
    });
  });

  describe('status updates', () => {
    it('should update lead status', async () => {
      const updated = factories.lead({ status: 'completed', ownerName: 'Tom' });
      mockPrisma.lead.update.mockResolvedValue(updated);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123', status: 'completed' })
      });
      const response = await handler(event);
      expect(response.statusCode).toBe(200);
      expect(mockPrisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead_123' },
        data: { status: 'completed' }
      });
    });

    it('should update owner name', async () => {
      const updated = factories.lead({ ownerName: 'Tom Wisnasky' });
      mockPrisma.lead.update.mockResolvedValue(updated);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123', ownerName: 'Tom Wisnasky' })
      });
      const response = await handler(event);
      expect(response.statusCode).toBe(200);
      expect(mockPrisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead_123' },
        data: { ownerName: 'Tom Wisnasky' }
      });
    });

    it('should clear owner when empty string passed', async () => {
      const updated = factories.lead({ ownerName: null });
      mockPrisma.lead.update.mockResolvedValue(updated);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123', ownerName: '' })
      });
      const response = await handler(event);
      expect(response.statusCode).toBe(200);
      expect(mockPrisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead_123' },
        data: { ownerName: null }
      });
    });
  });

  describe('name updates', () => {
    it('should update firstName', async () => {
      const updated = factories.lead({ firstName: 'Robert' });
      mockPrisma.lead.update.mockResolvedValue(updated);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123', firstName: 'Robert' })
      });
      const response = await handler(event);
      expect(response.statusCode).toBe(200);
      expect(mockPrisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead_123' },
        data: { firstName: 'Robert' }
      });
    });

    it('should update lastName', async () => {
      const updated = factories.lead({ lastName: 'Johnson' });
      mockPrisma.lead.update.mockResolvedValue(updated);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123', lastName: 'Johnson' })
      });
      const response = await handler(event);
      expect(response.statusCode).toBe(200);
      expect(mockPrisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead_123' },
        data: { lastName: 'Johnson' }
      });
    });

    it('should update both firstName and lastName together', async () => {
      const updated = factories.lead({ firstName: 'Dee', lastName: 'Simmons' });
      mockPrisma.lead.update.mockResolvedValue(updated);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123', firstName: 'Dee', lastName: 'Simmons' })
      });
      const response = await handler(event);
      expect(response.statusCode).toBe(200);
      expect(mockPrisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead_123' },
        data: { firstName: 'Dee', lastName: 'Simmons' }
      });
    });

    it('should update name and status in same request', async () => {
      const updated = factories.lead({ firstName: 'Dee', status: 'completed' });
      mockPrisma.lead.update.mockResolvedValue(updated);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123', firstName: 'Dee', status: 'completed' })
      });
      const response = await handler(event);
      expect(response.statusCode).toBe(200);
      expect(mockPrisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead_123' },
        data: { firstName: 'Dee', status: 'completed' }
      });
    });
  });

  describe('access control', () => {
    it('should return 403 when user has no access to tenant', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue({ tenant: 'other-company' });
      mockPrisma.userTenant.findFirst.mockResolvedValue(null);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123', status: 'completed' })
      });
      const response = await handler(event);
      expect(response.statusCode).toBe(403);
    });
  });
});
