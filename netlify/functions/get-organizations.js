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
    const { limit, page, sortBy, sortDir, search, type, tenant: tenantParam } = event.queryStringParameters || {};
    const tenant = tenantParam || user.slug;

    const limitNum = limit ? parseInt(limit) : 25;
    const pageNum = page ? parseInt(page) : 1;
    const skip = (pageNum - 1) * limitNum;

    // Build sort order - default to name asc
    const validSortFields = ['name', 'type', 'city', 'createdAt'];
    const sortDirection = sortDir === 'desc' ? 'desc' : 'asc';

    // Handle _count sorting (contacts, properties)
    let orderBy;
    if (sortBy === '_count.contacts') {
      orderBy = { OrganizationContact: { _count: sortDirection } };
    } else if (sortBy === '_count.properties') {
      orderBy = { OrganizationProperty: { _count: sortDirection } };
    } else {
      const sortField = validSortFields.includes(sortBy) ? sortBy : 'name';
      orderBy = { [sortField]: sortDirection };
    }

    // Build where clause
    const where = { tenant };

    if (type) {
      where.type = type;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { address: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Fetch organizations with contact and property counts
    const [organizations, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        orderBy,
        take: limitNum,
        skip,
        include: {
          _count: {
            select: {
              OrganizationContact: true,
              OrganizationProperty: true
            }
          }
        }
      }),
      prisma.organization.count({ where })
    ]);

    // Get distinct types for filter dropdown
    const typesResult = await prisma.organization.findMany({
      where: { tenant },
      select: { type: true },
      distinct: ['type']
    });
    const distinctTypes = typesResult.map(r => r.type).filter(Boolean).sort();

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant,
        count: organizations.length,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
        organizations,
        distinctTypes
      })
    };

  } catch (error) {
    console.error('Error fetching organizations:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to fetch organizations',
        details: error.message
      })
    };
  }
}
