import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';

const prisma = new PrismaClient();

/**
 * Link an orphaned Google Calendar event to a lead by creating
 * (or updating) the Appointment DB record.
 *
 * POST { leadId, googleEventId, tenant, summary, startTime, endTime, durationMinutes, location, notes, eventType }
 */
export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization;
  const user = verifyToken(authHeader);
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  try {
    const data = JSON.parse(event.body);
    const { leadId, googleEventId, summary, startTime, endTime, durationMinutes, location, notes, eventType } = data;

    if (!leadId || !googleEventId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'leadId and googleEventId are required' })
      };
    }

    // Check if an appointment already exists for this Google event
    const existing = await prisma.appointment.findFirst({
      where: { googleEventId }
    });

    let appointment;
    if (existing) {
      // Update the existing record to link it to the lead
      appointment = await prisma.appointment.update({
        where: { id: existing.id },
        data: { leadId }
      });
    } else {
      // Create a new appointment record
      if (!summary || !startTime || !endTime) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'summary, startTime, and endTime are required when creating a new appointment record' })
        };
      }

      appointment = await prisma.appointment.create({
        data: {
          leadId,
          tenant: user.tenant,
          googleEventId,
          summary,
          startTime: new Date(startTime),
          endTime: new Date(endTime),
          durationMinutes: durationMinutes || 60,
          location: location || null,
          notes: notes || null,
          status: 'scheduled',
          eventType: eventType || 'sales',
          updatedAt: new Date()
        }
      });
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        appointmentId: appointment.id,
        action: existing ? 'updated' : 'created'
      })
    };
  } catch (error) {
    console.error('Error linking appointment:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to link appointment', details: error.message })
    };
  }
}
