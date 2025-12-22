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
const { handler } = await import('../../netlify/functions/revert-lead-to-project.js');

describe('revert-lead-to-project API', () => {
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
    it('should return 400 when leadId is missing', async () => {
      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({})
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toBe('leadId is required');
    });

    it('should return 404 when lead does not exist', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue(null);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_nonexistent' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body).error).toBe('Lead not found');
    });

    it('should return 400 when lead has no address', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue({
        id: 'lead_123',
        address: null,
        tenant: 'acme'
      });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toBe('Lead has no address to convert to project');
    });
  });

  describe('project creation', () => {
    const mockLead = {
      id: 'lead_123',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      phone: '555-1234',
      address: '123 Main St, Denver, CO 80202',
      tenant: 'acme',
      notes: 'Test notes',
      coordinates: { lat: 39.7392, lon: -104.9903 }
    };

    const mockCreatedProject = {
      id: 'proj_local_abc123',
      address: '123 Main St',
      city: 'Denver',
      state: 'CO',
      postalCode: '80202',
      tenant: 'acme',
      status: 'active'
    };

    it('should create new project when none exists', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue(mockLead);
      mockPrisma.project.findFirst.mockResolvedValue(null);
      mockPrisma.project.create.mockResolvedValue(mockCreatedProject);
      mockPrisma.lead.delete.mockResolvedValue(mockLead);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123' })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.projectCreated).toBe(true);
      expect(body.project.id).toBe('proj_local_abc123');

      expect(mockPrisma.project.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          address: '123 Main St',
          city: 'Denver',
          state: 'CO',
          tenant: 'acme',
          status: 'active',
          public: true
        })
      });
    });

    it('should use existing project when address matches', async () => {
      const existingProject = { ...mockCreatedProject, id: 'proj_existing' };
      mockPrisma.lead.findUnique.mockResolvedValue(mockLead);
      mockPrisma.project.findFirst.mockResolvedValue(existingProject);
      mockPrisma.lead.delete.mockResolvedValue(mockLead);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123' })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.projectCreated).toBe(false);
      expect(body.project.id).toBe('proj_existing');
      expect(mockPrisma.project.create).not.toHaveBeenCalled();
    });

    it('should parse address with only street and city', async () => {
      const simpleAddressLead = {
        ...mockLead,
        address: '456 Oak Ave, Boulder'
      };
      mockPrisma.lead.findUnique.mockResolvedValue(simpleAddressLead);
      mockPrisma.project.findFirst.mockResolvedValue(null);
      mockPrisma.project.create.mockResolvedValue(mockCreatedProject);
      mockPrisma.lead.delete.mockResolvedValue(mockLead);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123' })
      });
      await handler(event);

      expect(mockPrisma.project.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          address: '456 Oak Ave',
          city: 'Boulder'
        })
      });
    });

    it('should parse address with separate postal code', async () => {
      const fullAddressLead = {
        ...mockLead,
        address: '789 Pine St, Aspen, CO, 81611'
      };
      mockPrisma.lead.findUnique.mockResolvedValue(fullAddressLead);
      mockPrisma.project.findFirst.mockResolvedValue(null);
      mockPrisma.project.create.mockResolvedValue(mockCreatedProject);
      mockPrisma.lead.delete.mockResolvedValue(mockLead);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123' })
      });
      await handler(event);

      expect(mockPrisma.project.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          address: '789 Pine St',
          city: 'Aspen',
          state: 'CO',
          postalCode: '81611'
        })
      });
    });
  });

  describe('prospect creation', () => {
    const mockLead = {
      id: 'lead_123',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      phone: '555-1234',
      address: '123 Main St, Denver, CO 80202',
      tenant: 'acme',
      notes: 'Test notes',
      coordinates: null
    };

    const mockProject = {
      id: 'proj_123',
      address: '123 Main St',
      tenant: 'acme'
    };

    it('should not create prospect when createProspect is false', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue(mockLead);
      mockPrisma.project.findFirst.mockResolvedValue(mockProject);
      mockPrisma.lead.delete.mockResolvedValue(mockLead);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123', createProspect: false })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.prospectCreated).toBe(false);
      expect(body.prospect).toBe(null);
      expect(mockPrisma.prospect.create).not.toHaveBeenCalled();
    });

    it('should create prospect when createProspect is true', async () => {
      const mockProspect = {
        id: 'prosp_new',
        name: 'John Doe',
        projectId: 'proj_123',
        tenant: 'acme'
      };
      mockPrisma.lead.findUnique.mockResolvedValue(mockLead);
      mockPrisma.project.findFirst.mockResolvedValue(mockProject);
      mockPrisma.prospect.create.mockResolvedValue(mockProspect);
      mockPrisma.lead.delete.mockResolvedValue(mockLead);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123', createProspect: true })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.prospectCreated).toBe(true);
      expect(body.prospect.id).toBe('prosp_new');

      expect(mockPrisma.prospect.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'John Doe',
          projectId: 'proj_123',
          tenant: 'acme',
          phones: [{ number: '555-1234', type: 'unknown' }],
          emails: ['john@example.com'],
          notes: 'Test notes',
          isCurrentResident: true
        })
      });
    });

    it('should skip prospect creation when lead has no name', async () => {
      const noNameLead = { ...mockLead, firstName: '', lastName: '' };
      mockPrisma.lead.findUnique.mockResolvedValue(noNameLead);
      mockPrisma.project.findFirst.mockResolvedValue(mockProject);
      mockPrisma.lead.delete.mockResolvedValue(noNameLead);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123', createProspect: true })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.prospectCreated).toBe(false);
      expect(mockPrisma.prospect.create).not.toHaveBeenCalled();
    });

    it('should handle missing phone in prospect creation', async () => {
      const noPhoneLead = { ...mockLead, phone: null };
      mockPrisma.lead.findUnique.mockResolvedValue(noPhoneLead);
      mockPrisma.project.findFirst.mockResolvedValue(mockProject);
      mockPrisma.prospect.create.mockResolvedValue({ id: 'prosp_new' });
      mockPrisma.lead.delete.mockResolvedValue(noPhoneLead);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123', createProspect: true })
      });
      await handler(event);

      expect(mockPrisma.prospect.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          phones: []
        })
      });
    });

    it('should handle missing email in prospect creation', async () => {
      const noEmailLead = { ...mockLead, email: null };
      mockPrisma.lead.findUnique.mockResolvedValue(noEmailLead);
      mockPrisma.project.findFirst.mockResolvedValue(mockProject);
      mockPrisma.prospect.create.mockResolvedValue({ id: 'prosp_new' });
      mockPrisma.lead.delete.mockResolvedValue(noEmailLead);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123', createProspect: true })
      });
      await handler(event);

      expect(mockPrisma.prospect.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          emails: []
        })
      });
    });
  });

  describe('lead deletion', () => {
    const mockLead = {
      id: 'lead_123',
      firstName: 'John',
      lastName: 'Doe',
      address: '123 Main St, Denver, CO',
      tenant: 'acme'
    };

    const mockProject = { id: 'proj_123', address: '123 Main St' };

    it('should delete lead when deleteLead is true (default)', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue(mockLead);
      mockPrisma.project.findFirst.mockResolvedValue(mockProject);
      mockPrisma.lead.delete.mockResolvedValue(mockLead);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123' })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.leadDeleted).toBe(true);
      expect(mockPrisma.lead.delete).toHaveBeenCalledWith({
        where: { id: 'lead_123' }
      });
    });

    it('should not delete lead when deleteLead is false', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue(mockLead);
      mockPrisma.project.findFirst.mockResolvedValue(mockProject);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123', deleteLead: false })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.leadDeleted).toBe(false);
      expect(mockPrisma.lead.delete).not.toHaveBeenCalled();
    });
  });

  describe('response format', () => {
    it('should return correct response shape', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue({
        id: 'lead_123',
        firstName: 'John',
        lastName: 'Doe',
        address: '123 Main St, Denver, CO',
        tenant: 'acme'
      });
      mockPrisma.project.findFirst.mockResolvedValue(null);
      mockPrisma.project.create.mockResolvedValue({ id: 'proj_new', address: '123 Main St' });
      mockPrisma.lead.delete.mockResolvedValue({});

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123' })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.headers['Content-Type']).toBe('application/json');
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('project');
      expect(body).toHaveProperty('projectCreated');
      expect(body).toHaveProperty('prospect');
      expect(body).toHaveProperty('prospectCreated');
      expect(body).toHaveProperty('leadDeleted');
    });
  });

  describe('error handling', () => {
    it('should return 500 when database operation fails', async () => {
      mockPrisma.lead.findUnique.mockResolvedValue({
        id: 'lead_123',
        address: '123 Main St',
        tenant: 'acme'
      });
      mockPrisma.project.findFirst.mockRejectedValue(new Error('Database error'));

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ leadId: 'lead_123' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toBe('Failed to revert lead to project');
    });
  });
});
