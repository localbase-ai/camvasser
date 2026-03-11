import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';

const prisma = new PrismaClient();

export async function handler(event) {
  if (event.httpMethod !== 'PATCH' && event.httpMethod !== 'POST') {
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
    const { appointmentId, googleEventId, eventType } = JSON.parse(event.body);

    if (!appointmentId && !googleEventId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'appointmentId or googleEventId is required' })
      };
    }

    const appointment = appointmentId
      ? await prisma.appointment.findUnique({ where: { id: appointmentId } })
      : await prisma.appointment.findFirst({ where: { googleEventId, tenant: user.tenant } });

    if (!appointment || appointment.tenant !== user.tenant) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Appointment not found' })
      };
    }

    const updateData = { updatedAt: new Date() };

    if (eventType && (eventType === 'sales' || eventType === 'job')) {
      updateData.eventType = eventType;

      // Update summary prefix
      const typeLabel = eventType === 'job' ? 'Job' : 'Sales';
      updateData.summary = appointment.summary.replace(/^\[(Sales|Job)\]/, `[${typeLabel}]`);
    }

    const updated = await prisma.appointment.update({
      where: { id: appointmentId },
      data: updateData
    });

    // Update Google Calendar event if linked
    let gcalUpdated = false;
    if (appointment.googleEventId && updateData.summary) {
      try {
        // Call the calendar-update edge function to patch the Google event
        const baseUrl = event.headers.host ? `https://${event.headers.host}` : 'https://camvasser.com';
        const gcalRes = await fetch(`${baseUrl}/api/calendar/update`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': event.headers.authorization || event.headers.Authorization
          },
          body: JSON.stringify({
            googleEventId: appointment.googleEventId,
            summary: updateData.summary
          })
        });
        gcalUpdated = gcalRes.ok;
        if (!gcalRes.ok) {
          console.error('[update-appointment] Google Calendar update failed:', await gcalRes.text());
        }
      } catch (gcalErr) {
        console.error('[update-appointment] Google Calendar update error:', gcalErr.message);
      }
    }

    console.log(`[update-appointment] Updated ${appointmentId}: eventType=${updated.eventType}, gcal=${gcalUpdated}`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        appointment: {
          id: updated.id,
          eventType: updated.eventType,
          summary: updated.summary
        },
        gcalUpdated
      })
    };

  } catch (error) {
    console.error('[update-appointment] Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to update appointment', details: error.message })
    };
  }
}
