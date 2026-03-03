import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';

const prisma = new PrismaClient();

export async function handler(event) {
  // Only allow GET
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Verify authentication
  const authHeader = event.headers.authorization || event.headers.Authorization;
  const user = verifyToken(authHeader);

  if (!user) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized - Please log in' })
    };
  }

  try {
    const { limit, page, sortBy, sortDir, search, qbStatus, hasValue, tenant: tenantParam } = event.queryStringParameters || {};
    const tenant = tenantParam || user.slug;

    const limitNum = limit ? parseInt(limit) : 25;
    const pageNum = page ? parseInt(page) : 1;
    const skip = (pageNum - 1) * limitNum;

    // Build sort order - default to lastName asc
    const validSortFields = ['lastName', 'firstName', 'email', 'createdAt'];
    const sortDirection = sortDir === 'desc' ? 'desc' : 'asc';

    // Handle _count sorting (leads, proposals)
    let orderBy;
    if (sortBy === '_count.leads') {
      orderBy = { leads: { _count: sortDirection } };
    } else if (sortBy === '_count.proposals') {
      orderBy = { proposals: { _count: sortDirection } };
    } else {
      const sortField = validSortFields.includes(sortBy) ? sortBy : 'lastName';
      orderBy = { [sortField]: sortDirection };
    }

    // Build where clause
    const where = { tenant };

    // QB sync status filter
    if (qbStatus === 'synced') {
      where.qbCustomerId = { not: null };
    } else if (qbStatus === 'not_linked') {
      where.qbCustomerId = null;
    }

    // Has value filter — at least one proposal or invoice with an amount
    if (hasValue === 'true') {
      where.AND = [
        ...(where.AND || []),
        { OR: [
          { proposals: { some: { proposalAmount: { not: null } } } },
          { invoices: { some: { invoiceAmount: { not: null } } } }
        ]}
      ];
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { qbDisplayName: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Fetch customers with lead/proposal counts and proposal amounts
    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy,
        take: limitNum,
        skip,
        include: {
          _count: {
            select: {
              leads: true,
              proposals: true
            }
          },
          proposals: {
            select: { proposalAmount: true },
            where: { proposalAmount: { not: null } }
          },
          invoices: {
            select: { invoiceAmount: true },
            where: { invoiceAmount: { not: null } }
          }
        }
      }),
      prisma.customer.count({ where })
    ]);

    // Compute totalValue (estimates) and totalRevenue (invoices), strip raw arrays
    const customersWithValue = customers.map(({ proposals, invoices, ...customer }) => ({
      ...customer,
      totalValue: proposals.reduce((sum, p) => sum + (p.proposalAmount || 0), 0),
      totalRevenue: invoices.reduce((sum, i) => sum + (i.invoiceAmount || 0), 0)
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customers: customersWithValue,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
        tenant
      })
    };

  } catch (error) {
    console.error('Error fetching customers:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to fetch customers',
        details: error.message
      })
    };
  }
}
