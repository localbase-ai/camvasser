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
const { handler } = await import('../../netlify/functions/get-appointments.js');

describe('get-appointments API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default to returning empty array
    mockPrisma.appointment.findMany.mockResolvedValue([]);
  });

  describe('authentication', () => {
    it('should return 401 when no auth header provided', async () => {
      const event = createMockEvent({
        queryStringParameters: { leadId: 'lead_123' }
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).error).toContain('Unauthorized');
    });

    it('should return 401 when token is expired', async () => {
      const event = createMockEvent({
        headers: { Authorization: `Bearer ${generateExpiredToken()}` },
        queryStringParameters: { leadId: 'lead_123' }
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

    it('should return 405 for PUT requests', async () => {
      const event = createAuthenticatedEvent({ httpMethod: 'PUT' });
      const response = await handler(event);

      expect(response.statusCode).toBe(405);
    });

    it('should return 405 for DELETE requests', async () => {
      const event = createAuthenticatedEvent({ httpMethod: 'DELETE' });
      const response = await handler(event);

      expect(response.statusCode).toBe(405);
    });
  });

  describe('input validation', () => {
    it('should return 400 when leadId is missing', async () => {
      const event = createAuthenticatedEvent({
        queryStringParameters: {}
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toContain('leadId is required');
    });

    it('should return 400 when queryStringParameters is null', async () => {
      const event = createAuthenticatedEvent({
        queryStringParameters: null
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toContain('leadId is required');
    });
  });

  describe('GET - fetch appointments', () => {
    it('should return appointments for a lead', async () => {
      const appointments = [
        factories.appointment({ id: 'appt_1', summary: 'First appointment' }),
        factories.appointment({ id: 'appt_2', summary: 'Second appointment' })
      ];
      mockPrisma.appointment.findMany.mockResolvedValue(appointments);

      const event = createAuthenticatedEvent({
        queryStringParameters: { leadId: 'lead_123' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.appointments).toHaveLength(2);
    });

    it('should return empty array when no appointments found', async () => {
      const event = createAuthenticatedEvent({
        queryStringParameters: { leadId: 'lead_no_appts' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.appointments).toHaveLength(0);
    });

    it('should query by leadId', async () => {
      const event = createAuthenticatedEvent({
        queryStringParameters: { leadId: 'specific_lead_123' }
      });
      await handler(event);

      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { leadId: 'specific_lead_123' }
        })
      );
    });

    it('should order appointments by startTime desc', async () => {
      const event = createAuthenticatedEvent({
        queryStringParameters: { leadId: 'lead_123' }
      });
      await handler(event);

      expect(mockPrisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { startTime: 'desc' }
        })
      );
    });

    it('should return all appointment fields', async () => {
      const appointment = factories.appointment();
      mockPrisma.appointment.findMany.mockResolvedValue([appointment]);

      const event = createAuthenticatedEvent({
        queryStringParameters: { leadId: 'lead_123' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.appointments).toHaveLength(1);
      expect(body.appointments[0]).toHaveProperty('id');
      expect(body.appointments[0]).toHaveProperty('summary');
      expect(body.appointments[0]).toHaveProperty('startTime');
      expect(body.appointments[0]).toHaveProperty('endTime');
      expect(body.appointments[0]).toHaveProperty('status');
    });
  });

  describe('error handling', () => {
    it('should return 500 when database query fails', async () => {
      mockPrisma.appointment.findMany.mockRejectedValue(new Error('Database error'));

      const event = createAuthenticatedEvent({
        queryStringParameters: { leadId: 'lead_123' }
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toContain('Failed to fetch appointments');
    });

    it('should include error details in 500 response', async () => {
      mockPrisma.appointment.findMany.mockRejectedValue(new Error('Connection refused'));

      const event = createAuthenticatedEvent({
        queryStringParameters: { leadId: 'lead_123' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(500);
      expect(body.details).toBe('Connection refused');
    });
  });

  describe('response format', () => {
    it('should return correct content-type header', async () => {
      const event = createAuthenticatedEvent({
        queryStringParameters: { leadId: 'lead_123' }
      });
      const response = await handler(event);

      expect(response.headers['Content-Type']).toBe('application/json');
    });

    it('should return success and appointments array', async () => {
      mockPrisma.appointment.findMany.mockResolvedValue([factories.appointment()]);

      const event = createAuthenticatedEvent({
        queryStringParameters: { leadId: 'lead_123' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('appointments');
      expect(Array.isArray(body.appointments)).toBe(true);
    });
  });
});
