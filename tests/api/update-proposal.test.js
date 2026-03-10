import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPrisma, factories } from '../helpers/mock-prisma.js';
import { createMockEvent, createAuthenticatedEvent } from '../helpers/auth.js';

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

const { handler } = await import('../../netlify/functions/update-proposal.js');

describe('update-proposal API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.proposal.findUnique.mockResolvedValue({ tenant: 'acme' });
    mockPrisma.proposal.update.mockResolvedValue(factories.proposal());
  });

  describe('authentication', () => {
    it('should return 401 when no auth header provided', async () => {
      const event = createMockEvent({ httpMethod: 'POST', body: JSON.stringify({ proposalId: 'qb-est-100' }) });
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

    it('should return 400 when proposalId is missing', async () => {
      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ pdfUrl: 'https://example.com/file.pdf' })
      });
      const response = await handler(event);
      expect(response.statusCode).toBe(400);
    });

    it('should return 404 when proposal not found', async () => {
      mockPrisma.proposal.findUnique.mockResolvedValue(null);
      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ proposalId: 'nonexistent' })
      });
      const response = await handler(event);
      expect(response.statusCode).toBe(404);
    });
  });

  describe('pdfUrl updates', () => {
    it('should set pdfUrl on a proposal', async () => {
      const url = 'https://drive.google.com/file/d/abc123/view';
      const updated = factories.proposal({ pdfUrl: url });
      mockPrisma.proposal.update.mockResolvedValue(updated);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ proposalId: 'qb-est-100', pdfUrl: url })
      });
      const response = await handler(event);
      expect(response.statusCode).toBe(200);
      expect(mockPrisma.proposal.update).toHaveBeenCalledWith({
        where: { proposalId: 'qb-est-100' },
        data: { pdfUrl: url }
      });
    });

    it('should clear pdfUrl when empty string passed', async () => {
      const updated = factories.proposal({ pdfUrl: null });
      mockPrisma.proposal.update.mockResolvedValue(updated);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ proposalId: 'qb-est-100', pdfUrl: '' })
      });
      const response = await handler(event);
      expect(response.statusCode).toBe(200);
      expect(mockPrisma.proposal.update).toHaveBeenCalledWith({
        where: { proposalId: 'qb-est-100' },
        data: { pdfUrl: null }
      });
    });

    it('should return 500 when database fails', async () => {
      mockPrisma.proposal.update.mockRejectedValue(new Error('Database error'));

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ proposalId: 'qb-est-100', pdfUrl: 'https://example.com' })
      });
      const response = await handler(event);
      expect(response.statusCode).toBe(500);
    });
  });
});
