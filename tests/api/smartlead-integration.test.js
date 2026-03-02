import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Reset modules before importing so mocks take effect
beforeEach(() => {
  vi.resetModules();
  mockFetch.mockReset();
});

describe('smartlead lib', () => {
  describe('onNewLead', () => {
    beforeEach(() => {
      process.env.SMARTLEAD_API_KEY = 'test-api-key';
    });

    it('should push lead to both Master and Welcome campaigns', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, upload_count: 1 })
      });

      const { onNewLead, CAMPAIGNS } = await import('../../netlify/functions/lib/smartlead.js');

      await onNewLead({
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        phone: '555-1234',
        location: 'Kansas City, MO',
        status: 'new'
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Verify both campaign IDs were called
      const urls = mockFetch.mock.calls.map(c => c[0]);
      expect(urls.some(u => u.includes(`/campaigns/${CAMPAIGNS.MASTER}/leads`))).toBe(true);
      expect(urls.some(u => u.includes(`/campaigns/${CAMPAIGNS.WELCOME}/leads`))).toBe(true);

      // Verify payload structure
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.lead_list).toHaveLength(1);
      expect(body.lead_list[0]).toMatchObject({
        email: 'test@example.com',
        first_name: 'John',
        last_name: 'Doe',
        phone_number: '555-1234',
        location: 'Kansas City, MO',
        custom_fields: { camvasser_status: 'new' }
      });
    });

    it('should lowercase email', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true })
      });

      const { onNewLead } = await import('../../netlify/functions/lib/smartlead.js');

      await onNewLead({ email: 'John@Example.COM', firstName: 'John' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.lead_list[0].email).toBe('john@example.com');
    });

    it('should default status to "new" when not provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true })
      });

      const { onNewLead } = await import('../../netlify/functions/lib/smartlead.js');

      await onNewLead({ email: 'test@example.com' });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.lead_list[0].custom_fields.camvasser_status).toBe('new');
    });

    it('should skip when email is missing', async () => {
      const { onNewLead } = await import('../../netlify/functions/lib/smartlead.js');

      await onNewLead({ firstName: 'John' });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should not throw when API fails', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const { onNewLead } = await import('../../netlify/functions/lib/smartlead.js');

      // Should not throw
      await onNewLead({ email: 'test@example.com', status: 'new' });
    });
  });

  describe('CAMPAIGNS', () => {
    it('should export correct campaign IDs', async () => {
      process.env.SMARTLEAD_API_KEY = 'test-api-key';
      const { CAMPAIGNS } = await import('../../netlify/functions/lib/smartlead.js');

      expect(CAMPAIGNS.MASTER).toBe(2987823);
      expect(CAMPAIGNS.WELCOME).toBe(2987833);
    });
  });
});

describe('push-to-smartlead custom_fields', () => {
  it('should attach camvasser_status to uploaded leads', async () => {
    const { createMockPrisma, factories } = await import('../helpers/mock-prisma.js');
    const { createAuthenticatedEvent } = await import('../helpers/auth.js');

    const mockPrisma = createMockPrisma();

    vi.doMock('@prisma/client', () => ({
      PrismaClient: class { constructor() { return mockPrisma; } }
    }));

    vi.doMock('@paralleldrive/cuid2', () => ({
      createId: () => 'test-job-id'
    }));

    // Mock prospect query
    mockPrisma.prospect.findMany.mockResolvedValue([
      factories.prospect({
        id: 'p1',
        name: 'John Doe',
        emails: ['john@example.com'],
        companyName: 'Acme',
        phones: [{ number: '555-1234' }]
      })
    ]);

    // Mock lead query for status lookup
    mockPrisma.lead.findMany.mockResolvedValue([
      factories.lead({ email: 'john@example.com', status: 'contacted' })
    ]);

    // Mock $queryRaw for tag filter
    mockPrisma.$queryRaw.mockResolvedValue([]);

    // Mock campaign creation
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 999, name: 'Test Campaign' })
    });

    // Mock lead upload
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true, upload_count: 1, duplicate_count: 0, invalid_email_count: 0, already_in_campaign_count: 0 })
    });

    // Mock job creation and updates
    mockPrisma.backgroundJob = {
      create: vi.fn().mockResolvedValue({ id: 'test-job-id' }),
      findUnique: vi.fn(),
      update: vi.fn()
    };

    // After job create, mock findUnique for processBatch
    mockPrisma.backgroundJob.findUnique.mockResolvedValue({
      id: 'test-job-id',
      status: 'running',
      input: {
        campaignId: 999,
        campaignName: 'Test Campaign',
        filters: { tenant: 'acme' },
        leads: [{
          email: 'john@example.com',
          first_name: 'John',
          last_name: 'Doe',
          company_name: 'Acme',
          phone_number: '555-1234',
          location: '',
          custom_fields: { camvasser_status: 'contacted' }
        }],
        batchIndex: 0,
        uploaded: 0,
        duplicates: 0,
        invalid: 0,
        alreadyInCampaign: 0,
        errors: []
      }
    });
    mockPrisma.backgroundJob.update.mockResolvedValue({});

    const { handler } = await import('../../netlify/functions/push-to-smartlead.js');

    const event = createAuthenticatedEvent({
      httpMethod: 'POST',
      body: JSON.stringify({
        campaignName: 'Test Campaign',
        filters: { tenant: 'acme' }
      })
    });

    const response = await handler(event);
    const body = JSON.parse(response.body);

    // The job should have been created with leads that have custom_fields
    const createCall = mockPrisma.backgroundJob.create.mock.calls[0][0];
    const storedLeads = createCall.data.input.leads;
    expect(storedLeads[0].custom_fields).toEqual({ camvasser_status: 'contacted' });
  });

  it('should default to "prospect" when no matching lead exists', async () => {
    const { createMockPrisma, factories } = await import('../helpers/mock-prisma.js');
    const { createAuthenticatedEvent } = await import('../helpers/auth.js');

    const mockPrisma = createMockPrisma();

    vi.doMock('@prisma/client', () => ({
      PrismaClient: class { constructor() { return mockPrisma; } }
    }));

    vi.doMock('@paralleldrive/cuid2', () => ({
      createId: () => 'test-job-id-2'
    }));

    mockPrisma.prospect.findMany.mockResolvedValue([
      factories.prospect({
        id: 'p2',
        name: 'No Lead Match',
        emails: ['nolead@example.com'],
        phones: []
      })
    ]);

    // No matching leads
    mockPrisma.lead.findMany.mockResolvedValue([]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: 888 })
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true, upload_count: 1, duplicate_count: 0, invalid_email_count: 0, already_in_campaign_count: 0 })
    });

    mockPrisma.backgroundJob = {
      create: vi.fn().mockResolvedValue({ id: 'test-job-id-2' }),
      findUnique: vi.fn().mockResolvedValue({
        id: 'test-job-id-2',
        status: 'running',
        input: {
          campaignId: 888,
          campaignName: 'Test',
          filters: {},
          leads: [{
            email: 'nolead@example.com',
            first_name: 'No',
            last_name: 'Lead Match',
            company_name: '',
            phone_number: '',
            location: '',
            custom_fields: { camvasser_status: 'prospect' }
          }],
          batchIndex: 0,
          uploaded: 0,
          duplicates: 0,
          invalid: 0,
          alreadyInCampaign: 0,
          errors: []
        }
      }),
      update: vi.fn().mockResolvedValue({})
    };

    const { handler } = await import('../../netlify/functions/push-to-smartlead.js');

    const event = createAuthenticatedEvent({
      httpMethod: 'POST',
      body: JSON.stringify({ campaignName: 'Test', filters: {} })
    });

    await handler(event);

    const createCall = mockPrisma.backgroundJob.create.mock.calls[0][0];
    const storedLeads = createCall.data.input.leads;
    expect(storedLeads[0].custom_fields).toEqual({ camvasser_status: 'prospect' });
  });
});
