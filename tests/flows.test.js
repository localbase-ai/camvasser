import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma Client
vi.mock('@prisma/client', () => {
  const mockLeadMethods = {
    create: vi.fn()
  };

  return {
    PrismaClient: function() {
      this.lead = mockLeadMethods;
      this.$disconnect = vi.fn();
      return this;
    },
    __mockMethods: {
      lead: mockLeadMethods
    }
  };
});

// Import handlers
import { handler as flowDirtyRoofHandler } from '../netlify/functions/flow-dirty-roof-costs.js';
import { handler as flowClaimDenialHandler } from '../netlify/functions/flow-roof-claim-denial.js';
import { handler as flowSprayOptionsHandler } from '../netlify/functions/flow-roof-spray-options.js';
import { handler as flowCloggedGuttersHandler } from '../netlify/functions/flow-clogged-gutters.js';
import { handler as flowIceDamHandler } from '../netlify/functions/flow-ice-dam.js';
import { handler as flowRoofLeakEmergencyHandler } from '../netlify/functions/flow-roof-leak-emergency.js';
import { handler as saveFlowLeadHandler } from '../netlify/functions/save-flow-lead.js';
import { __mockMethods } from '@prisma/client';

const mockLead = __mockMethods.lead;

const TENANTS = ['budroofing', 'kcroofrestoration'];

const FLOWS = [
  { name: 'dirty-roof-costs', handler: flowDirtyRoofHandler, slug: 'dirty-roof-costs' },
  { name: 'roof-claim-denial', handler: flowClaimDenialHandler, slug: 'roof-claim-denial' },
  { name: 'roof-spray-options', handler: flowSprayOptionsHandler, slug: 'roof-spray-vs-sealant-options' },
  { name: 'clogged-gutters', handler: flowCloggedGuttersHandler, slug: 'clogged-gutters-damage' },
  { name: 'ice-dam', handler: flowIceDamHandler, slug: 'ice-dam-prevention' },
  { name: 'roof-leak-emergency', handler: flowRoofLeakEmergencyHandler, slug: 'roof-leak-emergency' }
];

describe('Flow Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set required env vars
    process.env.MAPBOX_TOKEN = 'test-mapbox-token';
  });

  FLOWS.forEach(flow => {
    describe(`${flow.name} flow`, () => {
      TENANTS.forEach(tenant => {
        it(`should return valid HTML for ${tenant}`, async () => {
          const event = {
            queryStringParameters: { tenant }
          };

          const response = await flow.handler(event);

          expect(response.statusCode).toBe(200);
          expect(response.headers['Content-Type']).toBe('text/html');
          expect(response.body).toContain('<!DOCTYPE html>');
          expect(response.body).toContain('</html>');
        });

        it(`should include tenant branding for ${tenant}`, async () => {
          const event = {
            queryStringParameters: { tenant }
          };

          const response = await flow.handler(event);
          const body = response.body;

          // Should include tenant logo
          expect(body).toContain('/logos/');
          // Should include CSS variables for colors
          expect(body).toContain('--primary:');
        });

        it(`should include lead capture form for ${tenant}`, async () => {
          const event = {
            queryStringParameters: { tenant }
          };

          const response = await flow.handler(event);
          const body = response.body;

          // Should have name, email, phone input fields (by id)
          expect(body).toContain('id="name"');
          expect(body).toContain('id="email"');
          expect(body).toContain('id="phone"');
        });
      });

      it('should return 400 for missing tenant', async () => {
        const event = {
          queryStringParameters: {}
        };

        const response = await flow.handler(event);

        expect(response.statusCode).toBe(400);
      });

      it('should return 404 for invalid tenant', async () => {
        const event = {
          queryStringParameters: { tenant: 'nonexistent' }
        };

        const response = await flow.handler(event);

        expect(response.statusCode).toBe(404);
      });
    });
  });
});

describe('Save Flow Lead', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle CORS preflight', async () => {
    const event = {
      httpMethod: 'OPTIONS'
    };

    const response = await saveFlowLeadHandler(event);

    expect(response.statusCode).toBe(200);
    expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(response.headers['Access-Control-Allow-Methods']).toContain('POST');
  });

  it('should reject non-POST requests', async () => {
    const event = {
      httpMethod: 'GET'
    };

    const response = await saveFlowLeadHandler(event);

    expect(response.statusCode).toBe(405);
  });

  it('should require all mandatory fields', async () => {
    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({
        tenant: 'budroofing',
        flowType: 'educate'
        // Missing: flowSlug, name, email, phone
      })
    };

    const response = await saveFlowLeadHandler(event);

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('Missing required fields');
  });

  FLOWS.forEach(flow => {
    it(`should save lead for ${flow.name} flow`, async () => {
      const mockCreatedLead = {
        id: 'lead-123',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '555-1234',
        tenant: 'budroofing',
        flowType: 'educate',
        flowSlug: flow.slug,
        qualifyScore: 75,
        urgencyLevel: 'medium'
      };

      mockLead.create.mockResolvedValueOnce(mockCreatedLead);

      const event = {
        httpMethod: 'POST',
        body: JSON.stringify({
          tenant: 'budroofing',
          flowType: 'educate',
          flowSlug: flow.slug,
          name: 'John Doe',
          email: 'john@example.com',
          phone: '555-1234',
          address: '123 Main St, Kansas City, MO',
          flowData: {
            symptoms: ['icicles', 'ice_buildup'],
            roofConditions: ['older_home'],
            goals: ['prevent_leaks']
          },
          qualifyScore: 75,
          urgencyLevel: 'medium'
        })
      };

      const response = await saveFlowLeadHandler(event);

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.id).toBe('lead-123');

      // Verify Prisma was called correctly
      expect(mockLead.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          phone: '555-1234',
          tenant: 'budroofing',
          source: 'flow',
          flowType: 'educate',
          flowSlug: flow.slug
        })
      });
    });
  });

  it('should handle single-word names', async () => {
    const mockCreatedLead = {
      id: 'lead-456',
      firstName: 'Madonna',
      lastName: '',
      email: 'madonna@example.com'
    };

    mockLead.create.mockResolvedValueOnce(mockCreatedLead);

    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({
        tenant: 'budroofing',
        flowType: 'qualify',
        flowSlug: 'roof-claim-denial',
        name: 'Madonna',
        email: 'madonna@example.com',
        phone: '555-0000'
      })
    };

    const response = await saveFlowLeadHandler(event);

    expect(response.statusCode).toBe(200);
    expect(mockLead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        firstName: 'Madonna',
        lastName: ''
      })
    });
  });

  it('should handle multi-part last names', async () => {
    const mockCreatedLead = {
      id: 'lead-789',
      firstName: 'Mary',
      lastName: 'Jane Watson Parker'
    };

    mockLead.create.mockResolvedValueOnce(mockCreatedLead);

    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({
        tenant: 'kcroofrestoration',
        flowType: 'educate',
        flowSlug: 'dirty-roof-costs',
        name: 'Mary Jane Watson Parker',
        email: 'mj@example.com',
        phone: '555-9999'
      })
    };

    const response = await saveFlowLeadHandler(event);

    expect(response.statusCode).toBe(200);
    expect(mockLead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        firstName: 'Mary',
        lastName: 'Jane Watson Parker'
      })
    });
  });

  it('should handle database errors gracefully', async () => {
    mockLead.create.mockRejectedValueOnce(new Error('Database connection failed'));

    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({
        tenant: 'budroofing',
        flowType: 'educate',
        flowSlug: 'ice-dam-prevention',
        name: 'Test User',
        email: 'test@example.com',
        phone: '555-1111'
      })
    };

    const response = await saveFlowLeadHandler(event);

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Failed to save lead');
  });

  it('should store UTM parameters', async () => {
    const mockCreatedLead = { id: 'lead-utm' };
    mockLead.create.mockResolvedValueOnce(mockCreatedLead);

    const event = {
      httpMethod: 'POST',
      body: JSON.stringify({
        tenant: 'budroofing',
        flowType: 'educate',
        flowSlug: 'clogged-gutters-damage',
        name: 'UTM Test',
        email: 'utm@example.com',
        phone: '555-2222',
        utmSource: 'facebook',
        utmMedium: 'paid',
        utmCampaign: 'winter2025'
      })
    };

    const response = await saveFlowLeadHandler(event);

    expect(response.statusCode).toBe(200);
    expect(mockLead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        utmSource: 'facebook',
        utmMedium: 'paid',
        utmCampaign: 'winter2025'
      })
    });
  });
});
