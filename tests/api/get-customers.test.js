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

const { handler } = await import('../../netlify/functions/get-customers.js');

describe('get-customers API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('authentication', () => {
    it('should return 401 when no auth header provided', async () => {
      const event = createMockEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).error).toContain('Unauthorized');
    });
  });

  describe('method validation', () => {
    it('should return 405 for POST requests', async () => {
      const event = createAuthenticatedEvent({ httpMethod: 'POST' });
      const response = await handler(event);

      expect(response.statusCode).toBe(405);
    });
  });

  describe('customer fetching', () => {
    it('should return paginated customers with counts, totalValue, and totalRevenue', async () => {
      const customers = [
        {
          ...factories.customer(),
          _count: { leads: 3, proposals: 2 },
          proposals: [{ proposalAmount: 5000 }, { proposalAmount: 3000 }],
          invoices: [{ invoiceAmount: 7500 }, { invoiceAmount: 2500 }]
        },
        {
          ...factories.customer({ id: 'cust_456', firstName: 'Bob', lastName: 'Jones' }),
          _count: { leads: 1, proposals: 0 },
          proposals: [],
          invoices: []
        }
      ];
      mockPrisma.customer.findMany.mockResolvedValue(customers);
      mockPrisma.customer.count.mockResolvedValue(2);

      const event = createAuthenticatedEvent();
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.customers).toHaveLength(2);
      expect(body.total).toBe(2);
      expect(body.page).toBe(1);
      expect(body.totalPages).toBe(1);
      expect(body.customers[0].totalValue).toBe(8000);
      expect(body.customers[0].totalRevenue).toBe(10000);
      expect(body.customers[1].totalValue).toBe(0);
      expect(body.customers[1].totalRevenue).toBe(0);
      // Raw proposals and invoices should be stripped
      expect(body.customers[0].proposals).toBeUndefined();
      expect(body.customers[0].invoices).toBeUndefined();
    });

    it('should search by name', async () => {
      mockPrisma.customer.findMany.mockResolvedValue([]);
      mockPrisma.customer.count.mockResolvedValue(0);

      const event = createAuthenticatedEvent({
        queryStringParameters: { search: 'jane' }
      });
      await handler(event);

      expect(mockPrisma.customer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ firstName: { contains: 'jane', mode: 'insensitive' } }),
              expect.objectContaining({ lastName: { contains: 'jane', mode: 'insensitive' } })
            ])
          })
        })
      );
    });
  });

  describe('error handling', () => {
    it('should return 500 when database query fails', async () => {
      mockPrisma.customer.findMany.mockRejectedValue(new Error('Database error'));

      const event = createAuthenticatedEvent();
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toBe('Failed to fetch customers');
    });
  });
});
