import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPrisma, factories } from '../helpers/mock-prisma.js';
import { createMockEvent, createAuthenticatedEvent, generateExpiredToken } from '../helpers/auth.js';

// Create mock instance
const mockPrisma = createMockPrisma();

// Mock QuickBooks lib
const mockQB = {
  findCustomer: vi.fn(),
  createCustomer: vi.fn()
};

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

// Mock QuickBooks lib
vi.mock('../../netlify/functions/lib/quickbooks.js', () => mockQB);

// Import handler after mocking
const { handler } = await import('../../netlify/functions/create-quickbooks-customer.js');

describe('create-quickbooks-customer API', () => {
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
      expect(JSON.parse(response.body).error).toBe('Method not allowed');
    });

    it('should return 405 for DELETE requests', async () => {
      const event = createAuthenticatedEvent({ httpMethod: 'DELETE' });
      const response = await handler(event);

      expect(response.statusCode).toBe(405);
    });
  });

  describe('request validation', () => {
    it('should return 400 when leadId is missing', async () => {
      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({})
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toBe('leadId is required');
    });

    it('should return 404 when lead not found', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue(null);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'nonexistent' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body).error).toBe('Lead not found');
    });

    it('should return 403 when lead belongs to different tenant', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue({
        id: 'lead_123',
        tenant: 'other-tenant',
        firstName: 'John',
        lastName: 'Doe'
      });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.body).error).toBe('Access denied');
    });

    it('should return 400 when lead is already linked to QB', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue({
        id: 'lead_123',
        tenant: 'acme',
        firstName: 'John',
        lastName: 'Doe',
        flowData: { quickbooks_customer_id: '1001' }
      });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toContain('already linked');
      expect(JSON.parse(response.body).quickbooks_customer_id).toBe('1001');
    });
  });

  describe('create new customer', () => {
    it('should create new QB customer when none exists', async () => {
      const lead = {
        id: 'lead_123',
        tenant: 'acme',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '555-1234',
        address: '123 Main St',
        flowData: {}
      };

      mockPrisma.lead.findUnique.mockResolvedValue(lead);
      mockQB.findCustomer.mockResolvedValue([]);
      mockQB.createCustomer.mockResolvedValue({
        Id: '1002',
        DisplayName: 'John Doe',
        PrimaryEmailAddr: { Address: 'john@example.com' }
      });
      mockPrisma.lead.update.mockResolvedValue({ ...lead, flowData: { quickbooks_customer_id: '1002' } });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123' })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.action).toBe('created');
      expect(body.customer.id).toBe('1002');
      expect(body.customer.displayName).toBe('John Doe');
      expect(body.customer.wasExisting).toBe(false);

      expect(mockQB.createCustomer).toHaveBeenCalledWith({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '555-1234',
        address: '123 Main St'
      });

      expect(mockPrisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead_123' },
        data: {
          flowData: expect.objectContaining({
            quickbooks_customer_id: '1002',
            quickbooks_display_name: 'John Doe',
            quickbooks_was_existing: false
          })
        }
      });
    });
  });

  describe('link to existing customer', () => {
    it('should link to existing QB customer when found', async () => {
      const lead = {
        id: 'lead_123',
        tenant: 'acme',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        flowData: {}
      };

      mockPrisma.lead.findUnique.mockResolvedValue(lead);
      mockQB.findCustomer.mockResolvedValue([{
        Id: '1001',
        DisplayName: 'John Doe',
        PrimaryEmailAddr: { Address: 'john@example.com' }
      }]);
      mockPrisma.lead.update.mockResolvedValue({ ...lead, flowData: { quickbooks_customer_id: '1001' } });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123' })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.action).toBe('linked');
      expect(body.customer.id).toBe('1001');
      expect(body.customer.wasExisting).toBe(true);

      // Should not call createCustomer when linking
      expect(mockQB.createCustomer).not.toHaveBeenCalled();

      expect(mockPrisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead_123' },
        data: {
          flowData: expect.objectContaining({
            quickbooks_customer_id: '1001',
            quickbooks_was_existing: true
          })
        }
      });
    });
  });

  describe('error handling', () => {
    it('should return 500 when QB API fails', async () => {
      const lead = {
        id: 'lead_123',
        tenant: 'acme',
        firstName: 'John',
        lastName: 'Doe',
        flowData: {}
      };

      mockPrisma.lead.findUnique.mockResolvedValue(lead);
      mockQB.findCustomer.mockRejectedValue(new Error('QB API error'));

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toBe('Failed to create QuickBooks customer');
      expect(JSON.parse(response.body).details).toBe('QB API error');
    });

    it('should return 500 when database update fails', async () => {
      const lead = {
        id: 'lead_123',
        tenant: 'acme',
        firstName: 'John',
        lastName: 'Doe',
        flowData: {}
      };

      mockPrisma.lead.findUnique.mockResolvedValue(lead);
      mockQB.findCustomer.mockResolvedValue([]);
      mockQB.createCustomer.mockResolvedValue({ Id: '1002', DisplayName: 'John Doe' });
      mockPrisma.lead.update.mockRejectedValue(new Error('Database error'));

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toBe('Failed to create QuickBooks customer');
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

  describe('response format', () => {
    it('should return correct response shape for created customer', async () => {
      const lead = {
        id: 'lead_123',
        tenant: 'acme',
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com',
        flowData: null
      };

      mockPrisma.lead.findUnique.mockResolvedValue(lead);
      mockQB.findCustomer.mockResolvedValue([]);
      mockQB.createCustomer.mockResolvedValue({
        Id: '1003',
        DisplayName: 'Jane Smith',
        PrimaryEmailAddr: { Address: 'jane@example.com' }
      });
      mockPrisma.lead.update.mockResolvedValue(lead);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123' })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.headers['Content-Type']).toBe('application/json');
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('action');
      expect(body).toHaveProperty('message');
      expect(body).toHaveProperty('customer');
      expect(body.customer).toHaveProperty('id');
      expect(body.customer).toHaveProperty('displayName');
      expect(body.customer).toHaveProperty('wasExisting');
    });
  });
});
