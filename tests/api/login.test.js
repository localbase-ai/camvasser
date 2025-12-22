import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
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
const { handler } = await import('../../netlify/functions/login.js');

describe('login API', () => {
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

    it('should return 405 for DELETE requests', async () => {
      const event = createMockEvent({ httpMethod: 'DELETE' });
      const response = await handler(event);

      expect(response.statusCode).toBe(405);
    });
  });

  describe('input validation', () => {
    it('should return 400 when email is missing', async () => {
      const event = createMockEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ password: 'test123' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toBe('Email and password required');
    });

    it('should return 400 when password is missing', async () => {
      const event = createMockEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ email: 'test@example.com' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toBe('Email and password required');
    });

    it('should return 400 when both email and password are missing', async () => {
      const event = createMockEvent({
        httpMethod: 'POST',
        body: JSON.stringify({})
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
    });
  });

  describe('user lookup', () => {
    it('should return 401 when user not found', async () => {
      mockPrisma.businessUser.findUnique.mockResolvedValue(null);

      const event = createMockEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ email: 'notfound@example.com', password: 'test123' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).error).toBe('Invalid credentials');
    });

    it('should lowercase email when looking up user', async () => {
      mockPrisma.businessUser.findUnique.mockResolvedValue(null);

      const event = createMockEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ email: 'TEST@EXAMPLE.COM', password: 'test123' })
      });
      await handler(event);

      expect(mockPrisma.businessUser.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' }
      });
    });
  });

  describe('account status', () => {
    it('should return 403 when account is pending', async () => {
      const user = factories.businessUser({ status: 'pending' });
      mockPrisma.businessUser.findUnique.mockResolvedValue(user);

      const event = createMockEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ email: 'test@example.com', password: 'test123' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.body).error).toBe('Account pending approval');
    });

    it('should return 403 when account is rejected', async () => {
      const user = factories.businessUser({ status: 'rejected' });
      mockPrisma.businessUser.findUnique.mockResolvedValue(user);

      const event = createMockEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ email: 'test@example.com', password: 'test123' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(403);
    });
  });

  describe('password verification', () => {
    it('should return 401 when password hash is not set', async () => {
      const user = factories.businessUser({
        status: 'approved',
        passwordHash: null
      });
      mockPrisma.businessUser.findUnique.mockResolvedValue(user);

      const event = createMockEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ email: 'test@example.com', password: 'test123' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).error).toBe('Password not set. Please contact support.');
    });

    it('should return 401 when password is incorrect', async () => {
      const passwordHash = await bcrypt.hash('correctpassword', 10);
      const user = factories.businessUser({
        status: 'approved',
        passwordHash
      });
      mockPrisma.businessUser.findUnique.mockResolvedValue(user);

      const event = createMockEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ email: 'test@example.com', password: 'wrongpassword' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.body).error).toBe('Invalid credentials');
    });
  });

  describe('successful login', () => {
    it('should return 200 with token and user data on successful login', async () => {
      const passwordHash = await bcrypt.hash('correctpassword', 10);
      const user = factories.businessUser({
        id: 'user_123',
        name: 'Test User',
        email: 'test@example.com',
        companyName: 'Test Company',
        slug: 'test-slug',
        status: 'approved',
        passwordHash
      });
      mockPrisma.businessUser.findUnique.mockResolvedValue(user);

      const event = createMockEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ email: 'test@example.com', password: 'correctpassword' })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(body.token).toBeDefined();
      expect(typeof body.token).toBe('string');
      expect(body.token.split('.')).toHaveLength(3); // JWT format
      expect(body.user).toEqual({
        id: 'user_123',
        name: 'Test User',
        email: 'test@example.com',
        companyName: 'Test Company',
        slug: 'test-slug'
      });
    });

    it('should return valid JWT token', async () => {
      const passwordHash = await bcrypt.hash('test123', 10);
      const user = factories.businessUser({
        status: 'approved',
        passwordHash
      });
      mockPrisma.businessUser.findUnique.mockResolvedValue(user);

      const event = createMockEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ email: 'test@example.com', password: 'test123' })
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      // Verify token structure (header.payload.signature)
      const parts = body.token.split('.');
      expect(parts).toHaveLength(3);

      // Decode payload (base64)
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      expect(payload).toHaveProperty('userId');
      expect(payload).toHaveProperty('email');
      expect(payload).toHaveProperty('exp'); // Expiration
    });
  });

  describe('error handling', () => {
    it('should return 500 when database query fails', async () => {
      mockPrisma.businessUser.findUnique.mockRejectedValue(new Error('Database error'));

      const event = createMockEvent({
        httpMethod: 'POST',
        body: JSON.stringify({ email: 'test@example.com', password: 'test123' })
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body).error).toBe('Login failed');
    });

    it('should return 500 when JSON body is invalid', async () => {
      const event = createMockEvent({
        httpMethod: 'POST',
        body: 'not valid json'
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(500);
    });
  });
});
