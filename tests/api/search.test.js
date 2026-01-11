import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock tenant config
vi.mock('../../netlify/functions/lib/tenant-config.js', () => ({
  loadTenantConfig: () => ({
    tenants: {
      budroofing: {
        slug: 'budroofing',
        companycam_api_token_env: 'COMPANYCAM_API_TOKEN_BUDROOFING'
      }
    }
  })
}));

// Mock project sync
vi.mock('../../netlify/functions/lib/project-sync.js', () => ({
  syncProject: vi.fn().mockResolvedValue({ labels: [] })
}));

// Set env var for test
process.env.COMPANYCAM_API_TOKEN_BUDROOFING = 'test-token';

// Import after mocking
const { handler } = await import('../../netlify/functions/search.js');

// Helper to create mock event
function createMockEvent(params = {}) {
  return {
    httpMethod: params.httpMethod || 'GET',
    queryStringParameters: params.queryStringParameters || {}
  };
}

// Helper to create mock CompanyCam project
function createMockProject(overrides = {}) {
  return {
    id: overrides.id || '12345',
    status: overrides.status || 'active',
    address: {
      street_address_1: overrides.address || '123 Main Street',
      city: overrides.city || 'Kansas City',
      state: overrides.state || 'MO'
    },
    photo_count: overrides.photo_count ?? 10,
    public_url: overrides.public_url || 'https://app.companycam.com/projects/12345'
  };
}

// Helper to create mock fetch response
function createMockResponse(data, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(data)
  });
}

describe('search API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parameter validation', () => {
    it('should return 405 for non-GET requests', async () => {
      const event = createMockEvent({ httpMethod: 'POST' });
      const response = await handler(event);

      expect(response.statusCode).toBe(405);
      expect(JSON.parse(response.body).error).toBe('Method not allowed');
    });

    it('should return 400 when address is missing', async () => {
      const event = createMockEvent({
        queryStringParameters: { tenant: 'budroofing' }
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toBe('Address parameter required');
    });

    it('should return 400 when tenant is missing', async () => {
      const event = createMockEvent({
        queryStringParameters: { address: '123 Main St' }
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body).error).toBe('Tenant parameter required');
    });

    it('should return 404 for unknown tenant', async () => {
      const event = createMockEvent({
        queryStringParameters: { address: '123 Main St', tenant: 'unknowntenant' }
      });
      const response = await handler(event);

      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body).error).toBe('Tenant not found');
    });
  });

  describe('address normalization matching', () => {
    it('should match SW to Southwest', async () => {
      // Mock first call for projects, second for photos
      mockFetch
        .mockResolvedValueOnce(createMockResponse([createMockProject({ address: '1002 Southwest Fiord Drive' })]))
        .mockResolvedValueOnce(createMockResponse([]));

      const event = createMockEvent({
        queryStringParameters: { address: '1002 SW Fiord Dr', tenant: 'budroofing' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.found).toBe(true);
      expect(body.project.address).toBe('1002 Southwest Fiord Drive');
    });

    it('should match Dr to Drive', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse([createMockProject({ address: '456 Oak Drive' })]))
        .mockResolvedValueOnce(createMockResponse([]));

      const event = createMockEvent({
        queryStringParameters: { address: '456 Oak Dr', tenant: 'budroofing' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.found).toBe(true);
    });

    it('should match St to Street', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse([createMockProject({ address: '789 Elm Street' })]))
        .mockResolvedValueOnce(createMockResponse([]));

      const event = createMockEvent({
        queryStringParameters: { address: '789 Elm St', tenant: 'budroofing' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.found).toBe(true);
    });

    it('should match NE to Northeast', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse([createMockProject({ address: '200 Northeast 5th Street' })]))
        .mockResolvedValueOnce(createMockResponse([]));

      const event = createMockEvent({
        queryStringParameters: { address: '200 NE 5th St', tenant: 'budroofing' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.found).toBe(true);
    });
  });

  describe('search matching', () => {
    it('should find exact address match', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse([createMockProject({ address: '123 Main Street' })]))
        .mockResolvedValueOnce(createMockResponse([]));

      const event = createMockEvent({
        queryStringParameters: { address: '123 Main Street', tenant: 'budroofing' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.found).toBe(true);
    });

    it('should return not found when no match exists', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse([createMockProject({ address: '999 Different Road' })]));

      const event = createMockEvent({
        queryStringParameters: { address: '123 Main St', tenant: 'budroofing' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.found).toBe(false);
    });

    it('should skip deleted projects', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse([
          createMockProject({ id: 'deleted1', address: '123 Main Street', status: 'deleted' }),
          createMockProject({ id: 'active1', address: '123 Main Street', status: 'active' })
        ]))
        .mockResolvedValueOnce(createMockResponse([]));

      const event = createMockEvent({
        queryStringParameters: { address: '123 Main Street', tenant: 'budroofing' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.found).toBe(true);
      expect(body.project.id).toBe('active1');
    });

    it('should handle case-insensitive matching', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse([createMockProject({ address: '123 MAIN STREET' })]))
        .mockResolvedValueOnce(createMockResponse([]));

      const event = createMockEvent({
        queryStringParameters: { address: '123 main street', tenant: 'budroofing' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.found).toBe(true);
    });
  });

  describe('response format', () => {
    it('should return project details when found', async () => {
      mockFetch
        .mockResolvedValueOnce(createMockResponse([createMockProject({
          id: 'proj123',
          address: '123 Main Street',
          city: 'Kansas City',
          state: 'MO',
          photo_count: 15
        })]))
        .mockResolvedValueOnce(createMockResponse([{ uris: [{ type: 'thumbnail', uri: 'https://example.com/thumb.jpg' }] }]));

      const event = createMockEvent({
        queryStringParameters: { address: '123 Main Street', tenant: 'budroofing' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(body.found).toBe(true);
      expect(body.project.id).toBe('proj123');
      expect(body.project.address).toBe('123 Main Street');
      expect(body.project.photo_count).toBe(15);
    });

    it('should include CORS headers', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse([]));

      const event = createMockEvent({
        queryStringParameters: { address: '123 Main St', tenant: 'budroofing' }
      });
      const response = await handler(event);

      expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
    });
  });

  describe('error handling', () => {
    it('should handle CompanyCam API errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('API timeout'));

      const event = createMockEvent({
        queryStringParameters: { address: '123 Main St', tenant: 'budroofing' }
      });
      const response = await handler(event);
      const body = JSON.parse(response.body);

      expect(response.statusCode).toBe(500);
      expect(body.error).toBe('Search failed');
    });
  });
});
