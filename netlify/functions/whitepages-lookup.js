import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';
import { lookupPhone } from './lib/whitepages.js';

const prisma = new PrismaClient();

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
    const { phone, contactId, leadId } = JSON.parse(event.body || '{}');

    if (!phone) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Phone number is required' })
      };
    }

    // Look up the phone number
    const result = await lookupPhone(phone);

    // Optionally update the contact or lead with enriched data
    if (contactId && result.owner) {
      await prisma.contact.update({
        where: { id: contactId },
        data: {
          // Only update fields that are currently empty
          ...(result.owner.name && { name: result.owner.name }),
          ...(result.address?.streetLine1 && {
            address: [
              result.address.streetLine1,
              result.address.streetLine2,
              result.address.city,
              result.address.state,
              result.address.zip
            ].filter(Boolean).join(', ')
          })
        }
      });
    }

    if (leadId && result.owner) {
      const updateData = {};

      // Only update empty fields
      const lead = await prisma.lead.findUnique({ where: { id: leadId } });

      if (lead) {
        if (!lead.firstName && result.owner.firstName) {
          updateData.firstName = result.owner.firstName;
        }
        if (!lead.lastName && result.owner.lastName) {
          updateData.lastName = result.owner.lastName;
        }
        if (!lead.address && result.address?.streetLine1) {
          updateData.address = result.address.streetLine1;
        }
        if (!lead.city && result.address?.city) {
          updateData.city = result.address.city;
        }
        if (!lead.state && result.address?.state) {
          updateData.state = result.address.state;
        }
        if (!lead.zip && result.address?.zip) {
          updateData.zip = result.address.zip;
        }

        if (Object.keys(updateData).length > 0) {
          await prisma.lead.update({
            where: { id: leadId },
            data: updateData
          });
        }
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        result,
        enrichedContact: !!contactId,
        enrichedLead: !!leadId
      })
    };

  } catch (error) {
    console.error('Whitepages lookup error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message || 'Failed to lookup phone' })
    };
  }
}
