import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';
import { findCustomer, createCustomer } from './lib/quickbooks.js';

const prisma = new PrismaClient();

export async function handler(event) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
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
    const { leadId } = JSON.parse(event.body);

    if (!leadId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'leadId is required' })
      };
    }

    // Get the lead
    const lead = await prisma.lead.findUnique({
      where: { id: leadId }
    });

    if (!lead) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Lead not found' })
      };
    }

    // Check if user has access to this tenant (via UserTenant membership or matching slug)
    const hasAccess = lead.tenant === user.slug || await prisma.userTenant.findFirst({
      where: {
        userId: user.userId,
        tenant: { slug: lead.tenant }
      }
    });

    if (!hasAccess) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Access denied' })
      };
    }

    // Check if already linked to QB
    if (lead.flowData?.quickbooks_customer_id) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'Lead is already linked to a QuickBooks customer',
          quickbooks_customer_id: lead.flowData.quickbooks_customer_id
        })
      };
    }

    const customerData = {
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      address: lead.address
    };

    // Check for existing customer
    console.log('[QB] Checking for existing customer...');
    const existingCustomers = await findCustomer(customerData);

    if (existingCustomers.length > 0) {
      const existing = existingCustomers[0];
      console.log('[QB] Found existing customer:', existing.Id, existing.DisplayName);

      // Link lead to existing customer
      await prisma.lead.update({
        where: { id: leadId },
        data: {
          flowData: {
            ...lead.flowData,
            quickbooks_customer_id: existing.Id,
            quickbooks_display_name: existing.DisplayName,
            quickbooks_linked_at: new Date().toISOString(),
            quickbooks_was_existing: true
          }
        }
      });

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          action: 'linked',
          message: `Linked to existing QuickBooks customer: ${existing.DisplayName}`,
          customer: {
            id: existing.Id,
            displayName: existing.DisplayName,
            email: existing.PrimaryEmailAddr?.Address,
            wasExisting: true
          }
        })
      };
    }

    // Create new customer
    console.log('[QB] Creating new customer...');
    const newCustomer = await createCustomer(customerData);

    // Update lead with QB customer ID
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        flowData: {
          ...lead.flowData,
          quickbooks_customer_id: newCustomer.Id,
          quickbooks_display_name: newCustomer.DisplayName,
          quickbooks_linked_at: new Date().toISOString(),
          quickbooks_was_existing: false
        }
      }
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        action: 'created',
        message: `Created QuickBooks customer: ${newCustomer.DisplayName}`,
        customer: {
          id: newCustomer.Id,
          displayName: newCustomer.DisplayName,
          email: newCustomer.PrimaryEmailAddr?.Address,
          wasExisting: false
        }
      })
    };

  } catch (error) {
    console.error('[QB] Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to create QuickBooks customer',
        details: error.message
      })
    };
  }
}
