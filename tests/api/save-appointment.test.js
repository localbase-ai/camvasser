import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPrisma, factories } from '../helpers/mock-prisma.js';
import { createMockEvent } from '../helpers/auth.js';

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
const { handler } = await import('../../netlify/functions/save-appointment.js');

describe('save-appointment API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('method validation', () => {
    it('should return 405 for GET requests', async () => {
      const event = createMockEvent({ httpMethod: 'GET' });
      const response = await handler(event);

      expect(response.statusCode).toBe(405);
      expect(JSON.parse(response.body).error).toBe('Method not allowed');
    });

    it('should return 405 for PUT requests', async () => {
      const event = createMockEvent({ httpMethod: 'PUT' });
      const response = await handler(event);

      expect(response.statusCode).toBe(405);
    });

    it('should return 405 for DELETE requests', async () => {
      const event = createMockEvent({ httpMethod: 'DELETE' });
      const response = await handler(event);

      expect(response.statusCode).toBe(405);
    });
  });

  describe('input validation', () => {
    it('should return 400 when tenant is missing', async () => {
      const event = createMockEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          summary: 'Test Appointment',
          startTime: '2025-12-25T10:00:00Z',
          endTime: '2025-12-25T11:00:00Z'
        })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toContain('Missing required fields');
    });

    it('should return 400 when summary is missing', async () => {
      const event = createMockEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          tenant: 'acme',
          startTime: '2025-12-25T10:00:00Z',
          endTime: '2025-12-25T11:00:00Z'
        })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toContain('Missing required fields');
    });

    it('should return 400 when startTime is missing', async () => {
      const event = createMockEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          tenant: 'acme',
          summary: 'Test Appointment',
          endTime: '2025-12-25T11:00:00Z'
        })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toContain('Missing required fields');
    });

    it('should return 400 when endTime is missing', async () => {
      const event = createMockEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          tenant: 'acme',
          summary: 'Test Appointment',
          startTime: '2025-12-25T10:00:00Z'
        })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toContain('Missing required fields');
    });
  });

  describe('POST - create appointment', () => {
    it('should create an appointment with all fields', async () => {
      const newAppointment = factories.appointment();
      mockPrisma.appointment.create.mockResolvedValue(newAppointment);

      const event = createMockEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          leadId: 'lead_123',
          tenant: 'acme',
          googleEventId: 'google_event_abc123',
          summary: 'Appointment: John Doe',
          startTime: '2025-12-25T10:00:00Z',
          endTime: '2025-12-25T11:00:00Z',
          durationMinutes: 60,
          location: '123 Main St, Denver, CO',
          notes: 'Test notes'
        })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.appointmentId).toBe('appt_123');
    });

    it('should create an appointment with only required fields', async () => {
      const newAppointment = factories.appointment({ leadId: null, googleEventId: null, location: null, notes: null });
      mockPrisma.appointment.create.mockResolvedValue(newAppointment);

      const event = createMockEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          tenant: 'acme',
          summary: 'Appointment: Jane Doe',
          startTime: '2025-12-25T10:00:00Z',
          endTime: '2025-12-25T11:00:00Z'
        })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
    });

    it('should pass leadId as null when not provided', async () => {
      mockPrisma.appointment.create.mockResolvedValue(factories.appointment());

      const event = createMockEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          tenant: 'acme',
          summary: 'Test Appointment',
          startTime: '2025-12-25T10:00:00Z',
          endTime: '2025-12-25T11:00:00Z'
        })
      });
      await handler(event);

      expect(mockPrisma.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            leadId: null
          })
        })
      );
    });

    it('should pass googleEventId when provided', async () => {
      mockPrisma.appointment.create.mockResolvedValue(factories.appointment());

      const event = createMockEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          tenant: 'acme',
          summary: 'Test Appointment',
          startTime: '2025-12-25T10:00:00Z',
          endTime: '2025-12-25T11:00:00Z',
          googleEventId: 'gcal_123'
        })
      });
      await handler(event);

      expect(mockPrisma.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            googleEventId: 'gcal_123'
          })
        })
      );
    });

    it('should default durationMinutes to 60', async () => {
      mockPrisma.appointment.create.mockResolvedValue(factories.appointment());

      const event = createMockEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          tenant: 'acme',
          summary: 'Test Appointment',
          startTime: '2025-12-25T10:00:00Z',
          endTime: '2025-12-25T11:00:00Z'
        })
      });
      await handler(event);

      expect(mockPrisma.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            durationMinutes: 60
          })
        })
      );
    });

    it('should default status to scheduled', async () => {
      mockPrisma.appointment.create.mockResolvedValue(factories.appointment());

      const event = createMockEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          tenant: 'acme',
          summary: 'Test Appointment',
          startTime: '2025-12-25T10:00:00Z',
          endTime: '2025-12-25T11:00:00Z'
        })
      });
      await handler(event);

      expect(mockPrisma.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'scheduled'
          })
        })
      );
    });

    it('should default eventType to sales', async () => {
      mockPrisma.appointment.create.mockResolvedValue(factories.appointment());

      const event = createMockEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          tenant: 'acme',
          summary: 'Test Appointment',
          startTime: '2025-12-25T10:00:00Z',
          endTime: '2025-12-25T11:00:00Z'
        })
      });
      await handler(event);

      expect(mockPrisma.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'sales'
          })
        })
      );
    });

    it('should save eventType when provided', async () => {
      mockPrisma.appointment.create.mockResolvedValue(factories.appointment({ eventType: 'job' }));

      const event = createMockEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          tenant: 'acme',
          summary: 'Test Appointment',
          startTime: '2025-12-25T10:00:00Z',
          endTime: '2025-12-25T11:00:00Z',
          eventType: 'job'
        })
      });
      await handler(event);

      expect(mockPrisma.appointment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'job'
          })
        })
      );
    });

    it('should convert startTime string to Date', async () => {
      mockPrisma.appointment.create.mockResolvedValue(factories.appointment());

      const event = createMockEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          tenant: 'acme',
          summary: 'Test Appointment',
          startTime: '2025-12-25T10:00:00Z',
          endTime: '2025-12-25T11:00:00Z'
        })
      });
      await handler(event);

      const createCall = mockPrisma.appointment.create.mock.calls[0][0];
      expect(createCall.data.startTime).toBeInstanceOf(Date);
      expect(createCall.data.endTime).toBeInstanceOf(Date);
    });
  });

  describe('error handling', () => {
    it('should return 500 when database create fails', async () => {
      mockPrisma.appointment.create.mockRejectedValue(new Error('Database error'));

      const event = createMockEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          tenant: 'acme',
          summary: 'Test Appointment',
          startTime: '2025-12-25T10:00:00Z',
          endTime: '2025-12-25T11:00:00Z'
        })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toContain('Failed to save appointment');
    });

    it('should include error details in 500 response', async () => {
      mockPrisma.appointment.create.mockRejectedValue(new Error('Connection timeout'));

      const event = createMockEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          tenant: 'acme',
          summary: 'Test Appointment',
          startTime: '2025-12-25T10:00:00Z',
          endTime: '2025-12-25T11:00:00Z'
        })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(500);
      expect(body.details).toBe('Connection timeout');
    });
  });

  describe('response format', () => {
    it('should return correct content-type header', async () => {
      mockPrisma.appointment.create.mockResolvedValue(factories.appointment());

      const event = createMockEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          tenant: 'acme',
          summary: 'Test Appointment',
          startTime: '2025-12-25T10:00:00Z',
          endTime: '2025-12-25T11:00:00Z'
        })
      });
      const response = await handler(event);

      expect(response.headers['Content-Type']).toBe('application/json');
    });

    it('should return success and appointmentId on success', async () => {
      mockPrisma.appointment.create.mockResolvedValue(factories.appointment({ id: 'custom_appt_id' }));

      const event = createMockEvent({
        httpMethod: 'POST',
        body: JSON.stringify({
          tenant: 'acme',
          summary: 'Test Appointment',
          startTime: '2025-12-25T10:00:00Z',
          endTime: '2025-12-25T11:00:00Z'
        })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('appointmentId', 'custom_appt_id');
    });
  });
});
