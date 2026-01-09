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
const { handler } = await import('../../netlify/functions/convert-contact-to-lead.js');

describe('convert-contact-to-lead API', () => {
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
  });

  describe('input validation', () => {
    it('should return 400 when prospectId is missing', async () => {
      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({})
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toBe('prospectId is required');
    });

    it('should return 404 when prospect does not exist', async () => {
      mockPrisma.prospect.findUnique.mockResolvedValue(null);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ prospectId: 'prosp_nonexistent' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body).error).toBe('Prospect not found');
    });
  });

  describe('conversion logic', () => {
    const mockProspect = {
      id: 'prosp_123',
      name: 'John Doe',
      phones: [{ number: '555-1234', type: 'mobile' }],
      emails: ['john@example.com'],
      projectId: 'proj_123',
      tenant: 'acme',
      notes: 'Test notes',
      Project: {
        address: '123 Main St',
        city: 'Denver',
        state: 'CO',
        postalCode: '80202',
        coordinates: { lat: 39.7392, lon: -104.9903 }
      }
    };

    const mockCreatedLead = {
      id: 'lead_new',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      phone: '555-1234',
      address: '123 Main St, Denver, CO, 80202',
      projectId: 'proj_123',
      tenant: 'acme',
      status: 'new',
      source: 'converted_from_contact'
    };

    it('should convert prospect to lead successfully', async () => {
      mockPrisma.prospect.findUnique.mockResolvedValue(mockProspect);
      mockPrisma.lead.create.mockResolvedValue(mockCreatedLead);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ prospectId: 'prosp_123' })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(201);
      expect(body.success).toBe(true);
      expect(body.lead.id).toBe('lead_new');
      expect(body.prospectDeleted).toBe(false);

      expect(mockPrisma.lead.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          phone: '555-1234',
          status: 'new',
          source: 'converted_from_contact'
        })
      });
    });

    it('should parse single-word names correctly', async () => {
      const singleNameProspect = { ...mockProspect, name: 'Madonna' };
      mockPrisma.prospect.findUnique.mockResolvedValue(singleNameProspect);
      mockPrisma.lead.create.mockResolvedValue(mockCreatedLead);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ prospectId: 'prosp_123' })
      });
      await handler(event);

      expect(mockPrisma.lead.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          firstName: 'Madonna',
          lastName: ''
        })
      });
    });

    it('should parse multi-word last names correctly', async () => {
      const multiNameProspect = { ...mockProspect, name: 'John Van Der Berg' };
      mockPrisma.prospect.findUnique.mockResolvedValue(multiNameProspect);
      mockPrisma.lead.create.mockResolvedValue(mockCreatedLead);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ prospectId: 'prosp_123' })
      });
      await handler(event);

      expect(mockPrisma.lead.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          firstName: 'John',
          lastName: 'Van Der Berg'
        })
      });
    });

    it('should handle missing phone numbers', async () => {
      const noPhoneProspect = { ...mockProspect, phones: [] };
      mockPrisma.prospect.findUnique.mockResolvedValue(noPhoneProspect);
      mockPrisma.lead.create.mockResolvedValue(mockCreatedLead);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ prospectId: 'prosp_123' })
      });
      await handler(event);

      expect(mockPrisma.lead.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          phone: null
        })
      });
    });

    it('should handle missing emails', async () => {
      const noEmailProspect = { ...mockProspect, emails: [] };
      mockPrisma.prospect.findUnique.mockResolvedValue(noEmailProspect);
      mockPrisma.lead.create.mockResolvedValue(mockCreatedLead);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ prospectId: 'prosp_123' })
      });
      await handler(event);

      expect(mockPrisma.lead.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: null
        })
      });
    });

    it('should build full address from project', async () => {
      mockPrisma.prospect.findUnique.mockResolvedValue(mockProspect);
      mockPrisma.lead.create.mockResolvedValue(mockCreatedLead);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ prospectId: 'prosp_123' })
      });
      await handler(event);

      expect(mockPrisma.lead.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          address: '123 Main St, Denver, CO, 80202'
        })
      });
    });

    it('should use lookupAddress as fallback when project has no address', async () => {
      const noProjectAddressProspect = {
        ...mockProspect,
        lookupAddress: '789 Fallback Rd',
        Project: { address: null, city: null, state: null, postalCode: null, coordinates: null }
      };
      mockPrisma.prospect.findUnique.mockResolvedValue(noProjectAddressProspect);
      mockPrisma.lead.create.mockResolvedValue(mockCreatedLead);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ prospectId: 'prosp_123' })
      });
      await handler(event);

      expect(mockPrisma.lead.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          address: '789 Fallback Rd'
        })
      });
    });
  });

  describe('delete prospect option', () => {
    const mockProspect = {
      id: 'prosp_123',
      name: 'John Doe',
      phones: [],
      emails: [],
      projectId: 'proj_123',
      tenant: 'acme',
      Project: { address: '123 Main St', city: null, state: null, postalCode: null, coordinates: null }
    };

    it('should not delete prospect when deleteProspect is false', async () => {
      mockPrisma.prospect.findUnique.mockResolvedValue(mockProspect);
      mockPrisma.lead.create.mockResolvedValue({ id: 'lead_new' });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ prospectId: 'prosp_123', deleteProspect: false })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.prospectDeleted).toBe(false);
      expect(mockPrisma.prospect.delete).not.toHaveBeenCalled();
    });

    it('should delete prospect when deleteProspect is true', async () => {
      mockPrisma.prospect.findUnique.mockResolvedValue(mockProspect);
      mockPrisma.lead.create.mockResolvedValue({ id: 'lead_new' });
      mockPrisma.prospect.delete.mockResolvedValue(mockProspect);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ prospectId: 'prosp_123', deleteProspect: true })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.prospectDeleted).toBe(true);
      expect(mockPrisma.prospect.delete).toHaveBeenCalledWith({
        where: { id: 'prosp_123' }
      });
    });
  });

  describe('error handling', () => {
    it('should return 500 when database create fails', async () => {
      mockPrisma.prospect.findUnique.mockResolvedValue({
        id: 'prosp_123',
        name: 'John Doe',
        phones: [],
        emails: [],
        Project: null
      });
      mockPrisma.lead.create.mockRejectedValue(new Error('Database error'));

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ prospectId: 'prosp_123' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toBe('Failed to convert contact to lead');
    });
  });
});
