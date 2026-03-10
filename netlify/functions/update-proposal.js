import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';

const prisma = new PrismaClient();

export async function handler(event) {
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'PATCH') {
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
    const { proposalId, pdfUrl } = JSON.parse(event.body);

    if (!proposalId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'proposalId is required' })
      };
    }

    const proposal = await prisma.proposal.findUnique({
      where: { proposalId },
      select: { tenant: true }
    });

    if (!proposal) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Proposal not found' })
      };
    }

    const updateData = {};
    if (pdfUrl !== undefined) {
      updateData.pdfUrl = pdfUrl || null;
    }

    const updated = await prisma.proposal.update({
      where: { proposalId },
      data: updateData
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, proposalId: updated.proposalId })
    };

  } catch (error) {
    console.error('Error updating proposal:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to update proposal', details: error.message })
    };
  }
}
