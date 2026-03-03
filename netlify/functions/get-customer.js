import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';

const prisma = new PrismaClient();

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

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
    const { id, tenant: tenantParam } = event.queryStringParameters || {};
    const tenant = tenantParam || user.slug;

    if (!id) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing customer id' })
      };
    }

    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        leads: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            address: true,
            city: true,
            state: true,
            status: true,
            createdAt: true
          },
          orderBy: { createdAt: 'desc' }
        },
        proposals: {
          select: {
            id: true,
            proposalId: true,
            proposalAmount: true,
            status: true,
            sentDate: true,
            signedDate: true,
            qbDocNumber: true
          },
          orderBy: { sentDate: 'desc' }
        },
        invoices: {
          select: {
            id: true,
            invoiceAmount: true,
            balance: true,
            status: true,
            invoiceDate: true,
            qbDocNumber: true
          },
          orderBy: { invoiceDate: 'desc' }
        }
      }
    });

    if (!customer) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Customer not found' })
      };
    }

    // Tenant check
    if (tenant && customer.tenant !== tenant) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Customer not found' })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer })
    };

  } catch (error) {
    console.error('Error fetching customer:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to fetch customer', details: error.message })
    };
  }
}
