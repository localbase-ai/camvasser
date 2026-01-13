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
const { handler } = await import('../../netlify/functions/update-prospect-status.js');

// Valid statuses from the handler
const VALID_STATUSES = [
  'left_voicemail',
  'hung_up',
  'wrong_number',
  'callback',
  'appointment_set',
  'follow_up_email_sent',
  'roof_replaced',
  'not_interested',
  'no_need',
  'no_answer',
  'wants_quote_phone',
  'follow_up_sms_sent'
];

describe('update-prospect-status API', () => {
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

    it('should allow POST requests', async () => {
      const prospect = factories.prospect({ tenant: 'acme' });
      mockPrisma.prospect.findUnique.mockResolvedValue(prospect);
      mockPrisma.prospect.update.mockResolvedValue({ ...prospect, status: 'callback' });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ prospectId: 'prosp_123', status: 'callback' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });

    it('should allow PATCH requests', async () => {
      const prospect = factories.prospect({ tenant: 'acme' });
      mockPrisma.prospect.findUnique.mockResolvedValue(prospect);
      mockPrisma.prospect.update.mockResolvedValue({ ...prospect, status: 'callback' });

      const event = createAuthenticatedEvent({
        httpMethod: 'PATCH',
        body: JSON.stringify({ prospectId: 'prosp_123', status: 'callback' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });
  });

  describe('input validation', () => {
    it('should return 400 when prospectId is missing', async () => {
      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ status: 'callback' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toBe('prospectId is required');
    });

    it('should return 400 for invalid status value', async () => {
      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ prospectId: 'prosp_123', status: 'invalid_status' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toBe('Invalid status value');
      expect(JSON.parse(response.body).validStatuses).toEqual(VALID_STATUSES);
    });

    it('should allow null status to clear', async () => {
      const prospect = factories.prospect({ tenant: 'acme', status: 'callback' });
      mockPrisma.prospect.findUnique.mockResolvedValue(prospect);
      mockPrisma.prospect.update.mockResolvedValue({ ...prospect, status: null });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ prospectId: 'prosp_123', status: null })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });

    it('should allow empty string status to clear', async () => {
      const prospect = factories.prospect({ tenant: 'acme' });
      mockPrisma.prospect.findUnique.mockResolvedValue(prospect);
      mockPrisma.prospect.update.mockResolvedValue({ ...prospect, status: null });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ prospectId: 'prosp_123', status: '' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });
  });

  describe('prospect lookup and tenant validation', () => {
    it('should return 404 when prospect not found', async () => {
      mockPrisma.prospect.findUnique.mockResolvedValue(null);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ prospectId: 'nonexistent', status: 'callback' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body).error).toBe('Prospect not found');
    });

    it('should return 403 when prospect belongs to different tenant', async () => {
      const prospect = factories.prospect({ tenant: 'other-tenant' });
      mockPrisma.prospect.findUnique.mockResolvedValue(prospect);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        tokenPayload: { slug: 'acme' },
        body: JSON.stringify({ prospectId: 'prosp_123', status: 'callback' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.body).error).toBe('Access denied');
    });

    it('should allow access when prospect belongs to user tenant', async () => {
      const prospect = factories.prospect({ tenant: 'acme' });
      mockPrisma.prospect.findUnique.mockResolvedValue(prospect);
      mockPrisma.prospect.update.mockResolvedValue({ ...prospect, status: 'callback' });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        tokenPayload: { slug: 'acme' },
        body: JSON.stringify({ prospectId: 'prosp_123', status: 'callback' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });
  });

  describe('status update', () => {
    it('should update prospect status', async () => {
      const prospect = factories.prospect({ id: 'prosp_123', tenant: 'acme' });
      mockPrisma.prospect.findUnique.mockResolvedValue(prospect);
      mockPrisma.prospect.update.mockResolvedValue({ ...prospect, status: 'appointment_set' });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ prospectId: 'prosp_123', status: 'appointment_set' })
      });
      const response = await handler(event);

      expect(mockPrisma.prospect.update).toHaveBeenCalledWith({
        where: { id: 'prosp_123' },
        data: {
          status: 'appointment_set',
          updatedAt: expect.any(Date)
        }
      });
    });

    it.each(VALID_STATUSES)('should accept valid status: %s', async (status) => {
      const prospect = factories.prospect({ tenant: 'acme' });
      mockPrisma.prospect.findUnique.mockResolvedValue(prospect);
      mockPrisma.prospect.update.mockResolvedValue({ ...prospect, status });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ prospectId: 'prosp_123', status })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(200);
    });
  });

  describe('response format', () => {
    it('should return correct response shape', async () => {
      const prospect = factories.prospect({ id: 'prosp_123', tenant: 'acme' });
      mockPrisma.prospect.findUnique.mockResolvedValue(prospect);
      mockPrisma.prospect.update.mockResolvedValue({ ...prospect, status: 'callback' });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ prospectId: 'prosp_123', status: 'callback' })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.headers['Content-Type']).toBe('application/json');
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('prospect');
      expect(body.prospect).toHaveProperty('id');
      expect(body.prospect).toHaveProperty('status');
    });
  });

  describe('error handling', () => {
    it('should return 500 when database lookup fails', async () => {
      mockPrisma.prospect.findUnique.mockRejectedValue(new Error('Database error'));

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ prospectId: 'prosp_123', status: 'callback' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toBe('Failed to update prospect status');
    });

    it('should return 500 when database update fails', async () => {
      const prospect = factories.prospect({ tenant: 'acme' });
      mockPrisma.prospect.findUnique.mockResolvedValue(prospect);
      mockPrisma.prospect.update.mockRejectedValue(new Error('Update failed'));

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ prospectId: 'prosp_123', status: 'callback' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
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
});
