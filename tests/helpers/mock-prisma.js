import { vi } from 'vitest';

// Create a mock Prisma client that can be configured per test
export function createMockPrisma() {
  return {
    project: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 })
    },
    prospect: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      delete: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 })
    },
    lead: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 })
    },
    businessUser: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    tenant: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0)
    },
    userTenant: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null)
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    $disconnect: vi.fn()
  };
}

// Sample test data factories
export const factories = {
  project: (overrides = {}) => ({
    id: 'proj_123',
    address: '123 Main St',
    city: 'Denver',
    state: 'CO',
    postalCode: '80202',
    tenant: 'acme',
    tags: [],
    photoCount: 5,
    publicUrl: 'https://app.companycam.com/projects/123',
    featureImage: null,
    ccCreatedAt: new Date(),
    ccUpdatedAt: new Date(),
    lastSyncedAt: new Date(),
    coordinates: null,
    prospects: [],
    ...overrides
  }),

  prospect: (overrides = {}) => ({
    id: 'prosp_123',
    name: 'John Doe',
    isHomeowner: true,
    isDead: false,
    phones: [{ number: '555-1234', type: 'mobile' }],
    emails: [{ address: 'john@example.com', type: 'personal' }],
    projectId: 'proj_123',
    tenant: 'acme',
    status: null,
    createdAt: new Date(),
    ...overrides
  }),

  lead: (overrides = {}) => ({
    id: 'lead_123',
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane@example.com',
    phone: '555-5678',
    address: '456 Oak Ave',
    city: 'Boulder',
    state: 'CO',
    zip: '80301',
    status: 'new',
    tenant: 'acme',
    createdAt: new Date(),
    ...overrides
  }),

  businessUser: (overrides = {}) => ({
    id: 'user_123',
    name: 'Test User',
    email: 'test@example.com',
    passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz', // bcrypt hash
    status: 'approved',
    slug: 'acme',
    companyName: 'Acme Roofing',
    isAdmin: false,
    createdAt: new Date(),
    tenants: [],
    ...overrides
  }),

  tenant: (overrides = {}) => ({
    id: 'tenant_123',
    slug: 'acme',
    name: 'Acme Roofing',
    domain: 'acme.camvasser.com',
    logoUrl: null,
    ...overrides
  }),

  tag: (overrides = {}) => ({
    id: 'tag_123',
    value: 'storm-damage',
    display_value: 'Storm Damage',
    tag_type: 'label',
    ...overrides
  })
};
