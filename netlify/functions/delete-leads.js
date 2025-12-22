import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';
import { buildLeadsWhereClause } from './lib/leads-query.js';

const prisma = new PrismaClient();

export async function handler(event) {
  // Only allow POST (for bulk delete) or DELETE (for single)
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'DELETE') {
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
    let ids = [];
    let useFilters = false;
    let filters = {};

    if (event.httpMethod === 'DELETE') {
      // Single delete via query param
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Missing id parameter' })
        };
      }
      ids = [id];
    } else {
      // Bulk delete via POST body
      const body = JSON.parse(event.body || '{}');
      ids = body.ids || [];

      // Check if using filter-based deletion (select all matching)
      if (body.filters) {
        useFilters = true;
        filters = body.filters;
      } else if (!Array.isArray(ids) || ids.length === 0) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Missing or empty ids array' })
        };
      }
    }

    let result;
    if (useFilters) {
      // Build where clause from filters (same logic as get-leads)
      const where = buildLeadsWhereClause({
        tenant: filters.tenant,
        search: filters.search,
        status: filters.status
      });

      // First count how many will be deleted
      const count = await prisma.lead.count({ where });

      // Delete matching leads
      result = await prisma.lead.deleteMany({ where });

      console.log(`Deleted ${result.count} leads matching filters:`, filters);
    } else {
      // Delete by specific IDs
      result = await prisma.lead.deleteMany({
        where: {
          id: { in: ids }
        }
      });

      console.log(`Deleted ${result.count} leads:`, ids);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        deleted: result.count,
        ids: useFilters ? null : ids,
        usedFilters: useFilters
      })
    };

  } catch (error) {
    console.error('Error deleting leads:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to delete leads',
        details: error.message
      })
    };
  }
}
