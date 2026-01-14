import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma Client
vi.mock('@prisma/client', () => {
  const mockProspectMethods = {
    findUnique: vi.fn(),
    delete: vi.fn()
  };
  const mockLeadMethods = {
    create: vi.fn()
  };

  return {
    PrismaClient: function() {
      this.prospect = mockProspectMethods;
      this.lead = mockLeadMethods;
      this.$disconnect = vi.fn();
      return this;
    },
    __mockMethods: {
      prospect: mockProspectMethods,
      lead: mockLeadMethods
    }
  };
});

// Mock auth
vi.mock('../netlify/functions/lib/auth.js', () => ({
  verifyToken: vi.fn()
}));

import { handler } from '../netlify/functions/convert-contact-to-lead.js';
import { verifyToken } from '../netlify/functions/lib/auth.js';
import { __mockMethods } from '@prisma/client';

const mockProspect = __mockMethods.prospect;
const mockLead = __mockMethods.lead;

describe('convert-contact-to-lead', () => {
  const mockUser = { slug: 'budroofing', id: 'user-123' };

  beforeEach(() => {
    vi.clearAllMocks();
    verifyToken.mockReturnValue(mockUser);
  });

  describe('phone number parsing', () => {
    it('should extract phone_number field from phones array', async () => {
      const mockProspectData = {
        id: 'prospect-123',
        name: 'John Doe',
        phones: [{ phone_number: '555-123-4567', type: 'mobile' }],
        emails: [],
        tenant: 'budroofing',
        projectId: 'proj-123',
        Project: {
          address: '123 Main St',
          city: 'Kansas City',
          state: 'MO',
          postalCode: '64101'
        }
      };

      const mockCreatedLead = {
        id: 'lead-123',
        firstName: 'John',
        lastName: 'Doe',
        phone: '555-123-4567'
      };

      mockProspect.findUnique.mockResolvedValueOnce(mockProspectData);
      mockLead.create.mockResolvedValueOnce(mockCreatedLead);

      const event = {
        httpMethod: 'POST',
        headers: { authorization: 'Bearer token' },
        body: JSON.stringify({ prospectId: 'prospect-123' })
      };

      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(201);
      expect(mockLead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            phone: '555-123-4567'
          })
        })
      );
    });

    it('should fall back to number field if phone_number not present', async () => {
      const mockProspectData = {
        id: 'prospect-123',
        name: 'Jane Smith',
        phones: [{ number: '555-987-6543' }],
        emails: [],
        tenant: 'budroofing',
        projectId: 'proj-123',
        Project: null
      };

      const mockCreatedLead = {
        id: 'lead-456',
        firstName: 'Jane',
        lastName: 'Smith',
        phone: '555-987-6543'
      };

      mockProspect.findUnique.mockResolvedValueOnce(mockProspectData);
      mockLead.create.mockResolvedValueOnce(mockCreatedLead);

      const event = {
        httpMethod: 'POST',
        headers: { authorization: 'Bearer token' },
        body: JSON.stringify({ prospectId: 'prospect-123' })
      };

      await handler(event);

      expect(mockLead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            phone: '555-987-6543'
          })
        })
      );
    });

    it('should handle string phone values', async () => {
      const mockProspectData = {
        id: 'prospect-123',
        name: 'Bob Johnson',
        phones: ['555-111-2222'],
        emails: [],
        tenant: 'budroofing',
        projectId: null,
        Project: null
      };

      const mockCreatedLead = { id: 'lead-789' };

      mockProspect.findUnique.mockResolvedValueOnce(mockProspectData);
      mockLead.create.mockResolvedValueOnce(mockCreatedLead);

      const event = {
        httpMethod: 'POST',
        headers: { authorization: 'Bearer token' },
        body: JSON.stringify({ prospectId: 'prospect-123' })
      };

      await handler(event);

      expect(mockLead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            phone: '555-111-2222'
          })
        })
      );
    });

    it('should filter out placeholder dash values for phone', async () => {
      const mockProspectData = {
        id: 'prospect-123',
        name: 'No Phone Person',
        phones: [{ phone_number: '-' }],
        emails: [],
        tenant: 'budroofing',
        projectId: null,
        Project: null
      };

      const mockCreatedLead = { id: 'lead-999' };

      mockProspect.findUnique.mockResolvedValueOnce(mockProspectData);
      mockLead.create.mockResolvedValueOnce(mockCreatedLead);

      const event = {
        httpMethod: 'POST',
        headers: { authorization: 'Bearer token' },
        body: JSON.stringify({ prospectId: 'prospect-123' })
      };

      await handler(event);

      expect(mockLead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            phone: null
          })
        })
      );
    });

    it('should filter out triple-dash placeholder for phone', async () => {
      const mockProspectData = {
        id: 'prospect-123',
        name: 'Test User',
        phones: [{ phone_number: '---' }],
        emails: [],
        tenant: 'budroofing',
        projectId: null,
        Project: null
      };

      const mockCreatedLead = { id: 'lead-888' };

      mockProspect.findUnique.mockResolvedValueOnce(mockProspectData);
      mockLead.create.mockResolvedValueOnce(mockCreatedLead);

      const event = {
        httpMethod: 'POST',
        headers: { authorization: 'Bearer token' },
        body: JSON.stringify({ prospectId: 'prospect-123' })
      };

      await handler(event);

      expect(mockLead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            phone: null
          })
        })
      );
    });
  });

  describe('email parsing', () => {
    it('should extract email_address field from emails array', async () => {
      const mockProspectData = {
        id: 'prospect-123',
        name: 'Email Test',
        phones: [],
        emails: [{ email_address: 'test@example.com' }],
        tenant: 'budroofing',
        projectId: null,
        Project: null
      };

      const mockCreatedLead = { id: 'lead-email' };

      mockProspect.findUnique.mockResolvedValueOnce(mockProspectData);
      mockLead.create.mockResolvedValueOnce(mockCreatedLead);

      const event = {
        httpMethod: 'POST',
        headers: { authorization: 'Bearer token' },
        body: JSON.stringify({ prospectId: 'prospect-123' })
      };

      await handler(event);

      expect(mockLead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'test@example.com'
          })
        })
      );
    });

    it('should fall back to address field if email_address not present', async () => {
      const mockProspectData = {
        id: 'prospect-123',
        name: 'Email Test 2',
        phones: [],
        emails: [{ address: 'fallback@example.com' }],
        tenant: 'budroofing',
        projectId: null,
        Project: null
      };

      const mockCreatedLead = { id: 'lead-email-2' };

      mockProspect.findUnique.mockResolvedValueOnce(mockProspectData);
      mockLead.create.mockResolvedValueOnce(mockCreatedLead);

      const event = {
        httpMethod: 'POST',
        headers: { authorization: 'Bearer token' },
        body: JSON.stringify({ prospectId: 'prospect-123' })
      };

      await handler(event);

      expect(mockLead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'fallback@example.com'
          })
        })
      );
    });

    it('should handle string email values', async () => {
      const mockProspectData = {
        id: 'prospect-123',
        name: 'String Email',
        phones: [],
        emails: ['string@example.com'],
        tenant: 'budroofing',
        projectId: null,
        Project: null
      };

      const mockCreatedLead = { id: 'lead-string-email' };

      mockProspect.findUnique.mockResolvedValueOnce(mockProspectData);
      mockLead.create.mockResolvedValueOnce(mockCreatedLead);

      const event = {
        httpMethod: 'POST',
        headers: { authorization: 'Bearer token' },
        body: JSON.stringify({ prospectId: 'prospect-123' })
      };

      await handler(event);

      expect(mockLead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'string@example.com'
          })
        })
      );
    });

    it('should filter out placeholder dash values for email', async () => {
      const mockProspectData = {
        id: 'prospect-123',
        name: 'No Email',
        phones: [],
        emails: [{ email_address: '-' }],
        tenant: 'budroofing',
        projectId: null,
        Project: null
      };

      const mockCreatedLead = { id: 'lead-no-email' };

      mockProspect.findUnique.mockResolvedValueOnce(mockProspectData);
      mockLead.create.mockResolvedValueOnce(mockCreatedLead);

      const event = {
        httpMethod: 'POST',
        headers: { authorization: 'Bearer token' },
        body: JSON.stringify({ prospectId: 'prospect-123' })
      };

      await handler(event);

      expect(mockLead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: null
          })
        })
      );
    });
  });

  describe('name parsing', () => {
    it('should split full name into firstName and lastName', async () => {
      const mockProspectData = {
        id: 'prospect-123',
        name: 'John Michael Doe',
        phones: [],
        emails: [],
        tenant: 'budroofing',
        projectId: null,
        Project: null
      };

      const mockCreatedLead = { id: 'lead-name' };

      mockProspect.findUnique.mockResolvedValueOnce(mockProspectData);
      mockLead.create.mockResolvedValueOnce(mockCreatedLead);

      const event = {
        httpMethod: 'POST',
        headers: { authorization: 'Bearer token' },
        body: JSON.stringify({ prospectId: 'prospect-123' })
      };

      await handler(event);

      expect(mockLead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            firstName: 'John',
            lastName: 'Michael Doe'
          })
        })
      );
    });

    it('should handle single name', async () => {
      const mockProspectData = {
        id: 'prospect-123',
        name: 'Madonna',
        phones: [],
        emails: [],
        tenant: 'budroofing',
        projectId: null,
        Project: null
      };

      const mockCreatedLead = { id: 'lead-single' };

      mockProspect.findUnique.mockResolvedValueOnce(mockProspectData);
      mockLead.create.mockResolvedValueOnce(mockCreatedLead);

      const event = {
        httpMethod: 'POST',
        headers: { authorization: 'Bearer token' },
        body: JSON.stringify({ prospectId: 'prospect-123' })
      };

      await handler(event);

      expect(mockLead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            firstName: 'Madonna',
            lastName: ''
          })
        })
      );
    });
  });

  describe('address building', () => {
    it('should build full address from Project data', async () => {
      const mockProspectData = {
        id: 'prospect-123',
        name: 'Address Test',
        phones: [],
        emails: [],
        tenant: 'budroofing',
        projectId: 'proj-123',
        Project: {
          address: '123 Main St',
          city: 'Kansas City',
          state: 'MO',
          postalCode: '64101'
        }
      };

      const mockCreatedLead = { id: 'lead-address' };

      mockProspect.findUnique.mockResolvedValueOnce(mockProspectData);
      mockLead.create.mockResolvedValueOnce(mockCreatedLead);

      const event = {
        httpMethod: 'POST',
        headers: { authorization: 'Bearer token' },
        body: JSON.stringify({ prospectId: 'prospect-123' })
      };

      await handler(event);

      expect(mockLead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            address: '123 Main St, Kansas City, MO, 64101'
          })
        })
      );
    });

    it('should use lookupAddress as fallback', async () => {
      const mockProspectData = {
        id: 'prospect-123',
        name: 'Lookup Test',
        phones: [],
        emails: [],
        tenant: 'budroofing',
        projectId: null,
        lookupAddress: '456 Oak Ave, Overland Park, KS',
        Project: null
      };

      const mockCreatedLead = { id: 'lead-lookup' };

      mockProspect.findUnique.mockResolvedValueOnce(mockProspectData);
      mockLead.create.mockResolvedValueOnce(mockCreatedLead);

      const event = {
        httpMethod: 'POST',
        headers: { authorization: 'Bearer token' },
        body: JSON.stringify({ prospectId: 'prospect-123' })
      };

      await handler(event);

      expect(mockLead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            address: '456 Oak Ave, Overland Park, KS'
          })
        })
      );
    });
  });

  describe('error handling', () => {
    it('should return 401 if not authenticated', async () => {
      verifyToken.mockReturnValue(null);

      const event = {
        httpMethod: 'POST',
        headers: { authorization: 'Bearer invalid' },
        body: JSON.stringify({ prospectId: 'prospect-123' })
      };

      const response = await handler(event);

      expect(response.statusCode).toBe(401);
    });

    it('should return 400 if prospectId missing', async () => {
      const event = {
        httpMethod: 'POST',
        headers: { authorization: 'Bearer token' },
        body: JSON.stringify({})
      };

      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toBe('prospectId is required');
    });

    it('should return 404 if prospect not found', async () => {
      mockProspect.findUnique.mockResolvedValueOnce(null);

      const event = {
        httpMethod: 'POST',
        headers: { authorization: 'Bearer token' },
        body: JSON.stringify({ prospectId: 'nonexistent' })
      };

      const response = await handler(event);

      expect(response.statusCode).toBe(404);
    });

    it('should return 405 for non-POST methods', async () => {
      const event = {
        httpMethod: 'GET',
        headers: {},
        body: ''
      };

      const response = await handler(event);

      expect(response.statusCode).toBe(405);
    });
  });

  describe('prospect deletion', () => {
    it('should delete prospect when deleteProspect is true', async () => {
      const mockProspectData = {
        id: 'prospect-123',
        name: 'Delete Test',
        phones: [],
        emails: [],
        tenant: 'budroofing',
        projectId: null,
        Project: null
      };

      const mockCreatedLead = { id: 'lead-delete' };

      mockProspect.findUnique.mockResolvedValueOnce(mockProspectData);
      mockLead.create.mockResolvedValueOnce(mockCreatedLead);
      mockProspect.delete.mockResolvedValueOnce({});

      const event = {
        httpMethod: 'POST',
        headers: { authorization: 'Bearer token' },
        body: JSON.stringify({ prospectId: 'prospect-123', deleteProspect: true })
      };

      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(201);
      expect(mockProspect.delete).toHaveBeenCalledWith({
        where: { id: 'prospect-123' }
      });
      expect(body.prospectDeleted).toBe(true);
    });

    it('should not delete prospect by default', async () => {
      const mockProspectData = {
        id: 'prospect-123',
        name: 'Keep Test',
        phones: [],
        emails: [],
        tenant: 'budroofing',
        projectId: null,
        Project: null
      };

      const mockCreatedLead = { id: 'lead-keep' };

      mockProspect.findUnique.mockResolvedValueOnce(mockProspectData);
      mockLead.create.mockResolvedValueOnce(mockCreatedLead);

      const event = {
        httpMethod: 'POST',
        headers: { authorization: 'Bearer token' },
        body: JSON.stringify({ prospectId: 'prospect-123' })
      };

      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(mockProspect.delete).not.toHaveBeenCalled();
      expect(body.prospectDeleted).toBe(false);
    });
  });
});
