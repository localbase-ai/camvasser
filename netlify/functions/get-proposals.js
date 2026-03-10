import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';

const prisma = new PrismaClient();

export async function handler(event) {
  // Only allow GET
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
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
    const { email, name, all, tenant, customerId } = event.queryStringParameters || {};
    const tenantFilter = tenant || user.tenant;

    const proposalSelect = {
      proposalId: true,
      customerName: true,
      customerEmail: true,
      proposalAmount: true,
      sentDate: true,
      signedDate: true,
      status: true,
      pdfUrl: true
    };

    let proposals = [];

    // If 'all' param is set, fetch all proposals for this tenant
    if (all === 'true') {
      proposals = await prisma.proposal.findMany({
        where: { tenant: tenantFilter },
        orderBy: { sentDate: 'desc' },
        select: proposalSelect
      });
    } else if (customerId) {
      // Fetch by Customer FK (most reliable path)
      proposals = await prisma.proposal.findMany({
        where: { tenant: tenantFilter, customerId },
        orderBy: { sentDate: 'desc' },
        select: proposalSelect
      });
    } else if (!email && !name) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'email, name, customerId, or all=true parameter required' })
      };
    } else {
      // Try email match first (more reliable)
      if (email) {
        proposals = await prisma.proposal.findMany({
          where: {
            tenant: tenantFilter,
            customerEmail: { equals: email, mode: 'insensitive' }
          },
          orderBy: { sentDate: 'desc' },
          select: proposalSelect
        });
      }

      // If no email matches and name provided, try name match
      if (proposals.length === 0 && name) {
        proposals = await prisma.proposal.findMany({
          where: {
            tenant: tenantFilter,
            customerName: { contains: name, mode: 'insensitive' }
          },
          orderBy: { sentDate: 'desc' },
          select: proposalSelect
        });
      }
    }

    // Transform to match expected format (snake_case for frontend compatibility)
    const formattedProposals = proposals.map(p => ({
      proposal_id: p.proposalId,
      customer_name: p.customerName,
      customer_email: p.customerEmail,
      proposal_amount: p.proposalAmount,
      sent_date: p.sentDate,
      signed_date: p.signedDate,
      status: p.status,
      pdf_url: p.pdfUrl
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        count: formattedProposals.length,
        proposals: formattedProposals
      })
    };

  } catch (error) {
    console.error('Error fetching proposals:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to fetch proposals',
        details: error.message
      })
    };
  }
}
