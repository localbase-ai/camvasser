import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';
import { deleteEstimate } from './lib/quickbooks.js';

const prisma = new PrismaClient();

export async function handler(event) {
  // Only allow DELETE
  if (event.httpMethod !== 'DELETE') {
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
    const { id } = event.queryStringParameters || {};

    if (!id) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'proposal id parameter required' })
      };
    }

    // Find the proposal first to check for QB estimate
    const proposal = await prisma.proposal.findFirst({
      where: {
        proposalId: id,
        tenant: user.tenant
      }
    });

    if (!proposal) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Proposal not found' })
      };
    }

    // Delete from QuickBooks if linked to an estimate
    let qbDeleted = false;
    if (proposal.qbEstimateId) {
      try {
        await deleteEstimate(proposal.qbEstimateId);
        qbDeleted = true;
        console.log(`Deleted QB estimate ${proposal.qbEstimateId} for proposal ${id}`);
      } catch (qbError) {
        console.error(`Failed to delete QB estimate ${proposal.qbEstimateId}:`, qbError.message);
        // Continue with local delete even if QB fails
      }
    }

    // Delete the proposal locally
    await prisma.proposal.delete({
      where: { id: proposal.id }
    });

    console.log(`Deleted proposal: ${id}${qbDeleted ? ' (+ QB estimate)' : ''}`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        deleted: id,
        qbEstimateDeleted: qbDeleted
      })
    };

  } catch (error) {
    console.error('Error deleting proposal:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to delete proposal',
        details: error.message
      })
    };
  }
}
