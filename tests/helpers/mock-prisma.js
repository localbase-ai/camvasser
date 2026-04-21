import { vi } from 'vitest';

// Create a mock Prisma client that can be configured per test
export function createMockPrisma() {
  return {
    project: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
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
      findFirst: vi.fn().mockResolvedValue(null),
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
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null)
    },
    note: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 })
    },
    appointment: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 })
    },
    callList: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 })
    },
    callListItem: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 })
    },
    callListAssignment: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      delete: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 })
    },
    customer: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    invoice: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    proposal: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      delete: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 })
    },
    organizationContact: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    $transaction: vi.fn().mockImplementation(async (fn) => fn(this)),
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
  }),

  note: (overrides = {}) => ({
    id: 'note_123',
    content: 'This is a test note',
    entityType: 'lead',
    entityId: 'lead_123',
    tenant: 'acme',
    authorId: 'user_123',
    authorName: 'Test User',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  }),

  appointment: (overrides = {}) => ({
    id: 'appt_123',
    leadId: 'lead_123',
    tenant: 'acme',
    googleEventId: 'google_event_abc123',
    summary: 'Appointment: John Doe',
    startTime: new Date('2025-12-25T10:00:00Z'),
    endTime: new Date('2025-12-25T11:00:00Z'),
    durationMinutes: 60,
    location: '123 Main St, Denver, CO',
    notes: 'Test appointment notes',
    status: 'scheduled',
    eventType: 'sales',
    createdById: 'user_123',
    createdByName: 'Test User',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  }),

  callList: (overrides = {}) => ({
    id: 'calllist_123',
    name: 'Test Call List',
    tenantId: 'acme',
    userId: 'user_123',
    assignedToUserId: 'user_123',
    createdAt: new Date(),
    _count: { items: 0 },
    ...overrides
  }),

  callListItem: (overrides = {}) => ({
    id: 'calllistitem_123',
    callListId: 'calllist_123',
    contactId: null,
    leadId: null,
    position: 0,
    createdAt: new Date(),
    ...overrides
  }),

  customer: (overrides = {}) => ({
    id: 'cust_123',
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane@example.com',
    phone: '555-5678',
    tenant: 'acme',
    qbCustomerId: '1001',
    qbDisplayName: 'Jane Smith',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  }),

  invoice: (overrides = {}) => ({
    id: 'inv_123',
    tenant: 'acme',
    invoiceAmount: 7500.00,
    balance: 0,
    status: 'paid',
    invoiceDate: new Date(),
    customerId: 'cust_123',
    customerName: 'Jane Smith',
    qbInvoiceId: 'inv_100',
    qbCustomerId: '1001',
    qbDocNumber: '1001',
    qbSyncedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  }),

  proposal: (overrides = {}) => ({
    id: 'prop_123',
    proposalId: 'qb-est-100',
    customerName: 'Jane Smith',
    customerEmail: 'jane@example.com',
    proposalAmount: 5000.00,
    sentDate: new Date(),
    signedDate: null,
    status: 'pending',
    tenant: 'acme',
    qbCustomerId: '1001',
    qbDocNumber: '100',
    qbEstimateId: 'est_100',
    qbSyncedAt: new Date(),
    customerId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  })
};
