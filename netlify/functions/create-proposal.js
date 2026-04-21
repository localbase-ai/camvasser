import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';
import { verifyToken } from './lib/auth.js';
import { createEstimate } from './lib/quickbooks.js';

const prisma = new PrismaClient();

// Job types mapped to QB service items
const JOB_TYPES = {
  'roof_replacement': { qbItemId: '7', qbItemName: 'Roof Replacement', label: 'Roof Replacement' },
  'roof_repair': { qbItemId: '24', qbItemName: 'Roof Repair', label: 'Roof Repair' },
  'gutter_replacement': { qbItemId: '5', qbItemName: 'Gutter Replacement', label: 'Gutter Replacement' },
  'roof_tuneup': { qbItemId: '8', qbItemName: 'Roof Tune-Up', label: 'Roof Tune-Up' },
  'roof_cleaning': { qbItemId: '23', qbItemName: 'Roof Cleaning', label: 'Roof Cleaning' },
  'roofmaxx_treatment': { qbItemId: '22', qbItemName: 'Roof Maxx Treatment', label: 'RoofMaxx Treatment' }
};

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
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
      body: JSON.stringify({ error: 'Unauthorized' })
    };
  }

  try {
    const { leadId, jobType, amount, description } = JSON.parse(event.body);

    if (!leadId || !jobType || !amount) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'leadId, jobType, and amount are required' })
      };
    }

    const jobConfig = JOB_TYPES[jobType];
    if (!jobConfig) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid job type', validTypes: Object.keys(JOB_TYPES) })
      };
    }

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Lead not found' })
      };
    }

    // Create QB estimate if lead has a QB customer linked
    let qbEstimate = null;
    const qbCustomerId = lead.flowData?.quickbooks_customer_id;

    if (qbCustomerId) {
      try {
        qbEstimate = await createEstimate({
          customerId: qbCustomerId,
          itemId: jobConfig.qbItemId,
          itemName: jobConfig.qbItemName,
          amount: parseFloat(amount),
          description: description || jobConfig.label
        });
      } catch (qbError) {
        console.error('[create-proposal] QB estimate creation failed:', qbError.message);
        // Continue without QB — still create local proposal
      }
    }

    // Create the proposal linked to the lead
    const proposal = await prisma.proposal.create({
      data: {
        id: createId(),
        proposalId: qbEstimate ? `qb-est-${qbEstimate.Id}` : `cam-${createId()}`,
        customerName: `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
        customerEmail: lead.email,
        proposalAmount: parseFloat(amount),
        sentDate: new Date(),
        status: 'pending',
        tenant: lead.tenant,
        qbEstimateId: qbEstimate?.Id || null,
        qbCustomerId: qbCustomerId || null,
        qbDocNumber: qbEstimate?.DocNumber || null,
        qbSyncedAt: qbEstimate ? new Date() : null,
        customerId: lead.customerId || null,
        leadId: leadId,
        organizationId: lead.organizationId || null,
        updatedAt: new Date()
      }
    });

    // Update lead status to proposal_sent and set job_value
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        status: 'proposal_sent',
        flowData: {
          ...lead.flowData,
          job_value: parseFloat(amount),
          job_type: jobType
        },
        updatedAt: new Date()
      }
    });

    console.log(`[create-proposal] Created proposal ${proposal.proposalId} for lead ${leadId}, amount: ${amount}, QB estimate: ${qbEstimate?.Id || 'none'}`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        proposal: {
          id: proposal.id,
          proposalId: proposal.proposalId,
          amount: proposal.proposalAmount,
          jobType,
          qbEstimateId: qbEstimate?.Id || null,
          qbDocNumber: qbEstimate?.DocNumber || null
        }
      })
    };

  } catch (error) {
    console.error('[create-proposal] Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to create proposal', details: error.message })
    };
  }
}
