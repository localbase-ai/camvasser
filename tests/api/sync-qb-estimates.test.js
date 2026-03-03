import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockPrisma } from '../helpers/mock-prisma.js';
import { createMockEvent, createAuthenticatedEvent, generateExpiredToken } from '../helpers/auth.js';

// Create mock instance
const mockPrisma = createMockPrisma();

// Mock SQLite database
const mockDbAll = vi.fn();
const mockDbClose = vi.fn();
const mockPrepare = vi.fn(() => ({ all: mockDbAll }));

// Mock getUserTenants
const mockGetUserTenants = vi.fn();

// Mock better-sqlite3 before importing handler
vi.mock('better-sqlite3', () => {
  return {
    default: class MockDatabase {
      constructor() {
        this.prepare = mockPrepare;
        this.close = mockDbClose;
      }
    }
  };
});

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

// Mock auth lib
vi.mock('../../netlify/functions/lib/auth.js', async () => {
  const actual = await vi.importActual('../../netlify/functions/lib/auth.js');
  return {
    ...actual,
    getUserTenants: mockGetUserTenants
  };
});

// Import handler after mocking
const { handler } = await import('../../netlify/functions/sync-qb-estimates.js');

describe('sync-qb-estimates API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementations
    mockDbAll.mockReturnValue([]);
    mockGetUserTenants.mockResolvedValue(['budroofing']);

    // Setup default proposal mocks
    mockPrisma.proposal = {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'new_prop' }),
      update: vi.fn().mockResolvedValue({ id: 'updated_prop' })
    };

    // Setup default customer mocks (auto-create stubs for unknown QB customers)
    mockPrisma.customer.findFirst.mockResolvedValue(null);
    mockPrisma.customer.create.mockResolvedValue({ id: 'auto_cust_123' });
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

    it('should return 405 for PUT requests', async () => {
      const event = createAuthenticatedEvent({ httpMethod: 'PUT' });
      const response = await handler(event);

      expect(response.statusCode).toBe(405);
    });
  });

  describe('tenant access', () => {
    it('should return 403 when user does not have access to tenant', async () => {
      mockGetUserTenants.mockResolvedValue(['other-tenant']);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        queryStringParameters: { tenant: 'unauthorized-tenant' }
      });

      const response = await handler(event);

      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.body).error).toBe('Access denied to tenant');
    });
  });

  describe('sync functionality', () => {
    it('should sync new estimates from QB database', async () => {
      // Mock SQLite returning estimates
      mockDbAll.mockReturnValue([
        {
          id: 'est_001',
          doc_number: '1001',
          txn_date: '2024-01-15',
          customer_id: 'cust_001',
          customer_name: 'John Doe',
          customer_email: 'john@example.com',
          total_amt: 5000,
          txn_status: 'Pending',
          accepted_date: null,
          created_time: '2024-01-15T10:00:00Z',
          last_updated_time: '2024-01-15T10:00:00Z'
        }
      ]);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        queryStringParameters: { tenant: 'budroofing' }
      });

      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.created).toBe(1);
      expect(body.updated).toBe(0);
      expect(mockPrisma.proposal.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          proposalId: 'qb-est-est_001',
          customerName: 'John Doe',
          customerEmail: 'john@example.com',
          proposalAmount: 5000,
          status: 'pending',
          tenant: 'budroofing',
          qbEstimateId: 'est_001',
          qbCustomerId: 'cust_001',
          qbDocNumber: '1001'
        })
      });
    });

    it('should update existing estimates', async () => {
      mockDbAll.mockReturnValue([
        {
          id: 'est_001',
          doc_number: '1001',
          txn_date: '2024-01-15',
          customer_id: 'cust_001',
          customer_name: 'John Doe',
          customer_email: 'john@example.com',
          total_amt: 6000, // Updated amount
          txn_status: 'Accepted',
          accepted_date: '2024-01-20',
          created_time: '2024-01-15T10:00:00Z',
          last_updated_time: '2024-01-20T10:00:00Z'
        }
      ]);

      // Mock existing proposal
      mockPrisma.proposal.findFirst.mockResolvedValue({ id: 'prop_existing' });

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        queryStringParameters: { tenant: 'budroofing' }
      });

      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.created).toBe(0);
      expect(body.updated).toBe(1);
      expect(mockPrisma.proposal.update).toHaveBeenCalledWith({
        where: { id: 'prop_existing' },
        data: expect.objectContaining({
          proposalAmount: 6000,
          status: 'signed' // Accepted maps to signed
        })
      });
    });

    it('should skip estimates with zero amount', async () => {
      mockDbAll.mockReturnValue([
        {
          id: 'est_001',
          doc_number: '1001',
          customer_name: 'John Doe',
          total_amt: 0,
          txn_status: 'Pending'
        },
        {
          id: 'est_002',
          doc_number: '1002',
          customer_name: 'Jane Doe',
          total_amt: null,
          txn_status: 'Pending'
        }
      ]);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        queryStringParameters: { tenant: 'budroofing' }
      });

      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.skipped).toBe(2);
      expect(body.created).toBe(0);
      expect(mockPrisma.proposal.create).not.toHaveBeenCalled();
    });

    it('should map QB status correctly', async () => {
      mockDbAll.mockReturnValue([
        { id: 'est_1', total_amt: 1000, txn_status: 'Pending' },
        { id: 'est_2', total_amt: 2000, txn_status: 'Accepted' },
        { id: 'est_3', total_amt: 3000, txn_status: 'Closed' },
        { id: 'est_4', total_amt: 4000, txn_status: 'Rejected' }
      ]);

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        queryStringParameters: { tenant: 'budroofing' }
      });

      await handler(event);

      const createCalls = mockPrisma.proposal.create.mock.calls;
      expect(createCalls[0][0].data.status).toBe('pending');
      expect(createCalls[1][0].data.status).toBe('signed');
      expect(createCalls[2][0].data.status).toBe('closed');
      expect(createCalls[3][0].data.status).toBe('rejected');
    });

    it('should return correct totals', async () => {
      mockDbAll.mockReturnValue([
        { id: 'est_1', total_amt: 1000, txn_status: 'Pending' },
        { id: 'est_2', total_amt: 2000, txn_status: 'Pending' },
        { id: 'est_3', total_amt: 0, txn_status: 'Pending' } // Will be skipped
      ]);

      mockPrisma.proposal.findFirst
        .mockResolvedValueOnce(null) // First is new
        .mockResolvedValueOnce({ id: 'existing' }); // Second exists

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        queryStringParameters: { tenant: 'budroofing' }
      });

      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.total).toBe(3);
      expect(body.created).toBe(1);
      expect(body.updated).toBe(1);
      expect(body.skipped).toBe(1);
      expect(body.synced).toBe(2); // created + updated
    });
  });

  describe('error handling', () => {
    it('should return 500 when database operation fails', async () => {
      mockDbAll.mockReturnValue([
        { id: 'est_1', total_amt: 1000, txn_status: 'Pending' }
      ]);
      mockPrisma.proposal.findFirst.mockRejectedValue(new Error('Database error'));

      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        queryStringParameters: { tenant: 'budroofing' }
      });

      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toBe('Database error');
    });
  });

  describe('response format', () => {
    it('should return correct content-type header', async () => {
      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        queryStringParameters: { tenant: 'budroofing' }
      });

      const response = await handler(event);

      expect(response.headers['Content-Type']).toBe('application/json');
    });

    it('should return success message with counts', async () => {
      const event = createAuthenticatedEvent({
        httpMethod: 'POST',
        queryStringParameters: { tenant: 'budroofing' }
      });

      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.success).toBe(true);
      expect(body.message).toContain('Synced');
      expect(typeof body.created).toBe('number');
      expect(typeof body.updated).toBe('number');
      expect(typeof body.skipped).toBe('number');
      expect(typeof body.total).toBe('number');
    });
  });
});
