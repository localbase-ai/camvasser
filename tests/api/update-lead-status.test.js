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

  describe('measurementUrl updates', () => {
    it('should set measurementUrl on a lead', async () => {
      const url = 'https://drive.google.com/file/d/abc123/view';
      const updated = factories.lead({ measurementUrl: url });
      mockPrisma.lead.update.mockResolvedValue(updated);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123', measurementUrl: url })
      });
      const response = await handler(event);
      expect(response.statusCode).toBe(200);
      expect(mockPrisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead_123' },
        data: { measurementUrl: url }
      });
    });

    it('should clear measurementUrl when empty string passed', async () => {
      const updated = factories.lead({ measurementUrl: null });
      mockPrisma.lead.update.mockResolvedValue(updated);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123', measurementUrl: '' })
      });
      const response = await handler(event);
      expect(response.statusCode).toBe(200);
      expect(mockPrisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead_123' },
        data: { measurementUrl: null }
      });
    });
  });

  describe('contact info updates', () => {
    it('should update email', async () => {
      const updated = factories.lead({ email: 'new@example.com' });
      mockPrisma.lead.update.mockResolvedValue(updated);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123', email: 'new@example.com' })
      });
      const response = await handler(event);
      expect(response.statusCode).toBe(200);
      expect(mockPrisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead_123' },
        data: { email: 'new@example.com' }
      });
      expect(JSON.parse(response.body).lead.email).toBe('new@example.com');
    });

    it('should clear email when empty string passed', async () => {
      const updated = factories.lead({ email: null });
      mockPrisma.lead.update.mockResolvedValue(updated);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123', email: '' })
      });
      const response = await handler(event);
      expect(response.statusCode).toBe(200);
      expect(mockPrisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead_123' },
        data: { email: null }
      });
    });

    it('should update phone', async () => {
      const updated = factories.lead({ phone: '555-1234' });
      mockPrisma.lead.update.mockResolvedValue(updated);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123', phone: '555-1234' })
      });
      const response = await handler(event);
      expect(response.statusCode).toBe(200);
      expect(mockPrisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead_123' },
        data: { phone: '555-1234' }
      });
      expect(JSON.parse(response.body).lead.phone).toBe('555-1234');
    });
  });

  describe('address updates', () => {
    it('should update all address fields', async () => {
      const updated = factories.lead({ address: '123 Main St', city: 'Overland Park', state: 'KS', postalCode: '66210' });
      mockPrisma.lead.update.mockResolvedValue(updated);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123', address: '123 Main St', city: 'Overland Park', state: 'KS', postalCode: '66210' })
      });
      const response = await handler(event);
      expect(response.statusCode).toBe(200);
      expect(mockPrisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead_123' },
        data: { address: '123 Main St', city: 'Overland Park', state: 'KS', postalCode: '66210' }
      });
      const body = JSON.parse(response.body);
      expect(body.lead.address).toBe('123 Main St');
      expect(body.lead.city).toBe('Overland Park');
    });

    it('should clear address fields when empty strings passed', async () => {
      const updated = factories.lead({ address: null, city: null, state: null, postalCode: null });
      mockPrisma.lead.update.mockResolvedValue(updated);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123', address: '', city: '', state: '', postalCode: '' })
      });
      const response = await handler(event);
      expect(response.statusCode).toBe(200);
      expect(mockPrisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead_123' },
        data: { address: null, city: null, state: null, postalCode: null }
      });
    });

    it('should update projectId', async () => {
      const updated = factories.lead({ projectId: 'proj_456' });
      mockPrisma.lead.update.mockResolvedValue(updated);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123', projectId: 'proj_456' })
      });
      const response = await handler(event);
      expect(response.statusCode).toBe(200);
      expect(mockPrisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead_123' },
        data: { projectId: 'proj_456' }
      });
      expect(JSON.parse(response.body).lead.projectId).toBe('proj_456');
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
