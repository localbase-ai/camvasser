import { PrismaClient } from '@prisma/client';
import { verifyToken } from './lib/auth.js';

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
    // Fetch events from Google Calendar via edge function
    const baseUrl = event.headers.host ? `https://${event.headers.host}` : 'https://camvasser.com';
    const timeMin = new Date();
    timeMin.setMonth(timeMin.getMonth() - 6);
    const timeMax = new Date();
    timeMax.setMonth(timeMax.getMonth() + 6);

    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      maxResults: '250'
    });

    const calRes = await fetch(`${baseUrl}/api/calendar/events?${params}`, {
      headers: { 'Authorization': authHeader }
    });

    if (!calRes.ok) {
      const err = await calRes.json().catch(() => ({}));
      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to fetch calendar events', details: err.error })
      };
    }

    const calData = await calRes.json();
    const events = calData.events || [];

    // Get existing appointments by googleEventId
    const existing = await prisma.appointment.findMany({
      where: { tenant: user.tenant },
      select: { googleEventId: true }
    });
    const existingIds = new Set(existing.map(a => a.googleEventId).filter(Boolean));

    // Filter to new events only
    const newEvents = events.filter(e => !existingIds.has(e.id));

    if (newEvents.length === 0) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, synced: 0, total: events.length, message: 'All events already synced' })
      };
    }

    // Try to match leads by name from summary
    const leads = await prisma.lead.findMany({
      where: { tenant: user.tenant },
      select: { id: true, firstName: true, lastName: true, address: true }
    });

    const results = [];

    for (const ev of newEvents) {
      // Parse name from summary like "[Sales] Gregg Shields" or "[Job] Don Olson"
      const nameMatch = ev.summary.match(/^\[(Sales|Job)\]\s*(.+)$/i);
      const eventType = nameMatch ? (nameMatch[1].toLowerCase() === 'job' ? 'job' : 'sales') : 'sales';
      const personName = nameMatch ? nameMatch[2].trim() : ev.summary;

      // Try to match a lead
      let leadId = null;
      if (personName) {
        const nameLower = personName.toLowerCase();
        const match = leads.find(l => {
          const fullName = `${l.firstName || ''} ${l.lastName || ''}`.trim().toLowerCase();
          return fullName === nameLower;
        });
        if (match) leadId = match.id;
      }

      const startTime = new Date(ev.start);
      const endTime = ev.end ? new Date(ev.end) : new Date(startTime.getTime() + 60 * 60 * 1000);
      const durationMinutes = Math.round((endTime - startTime) / 60000);

      const appointment = await prisma.appointment.create({
        data: {
          leadId,
          tenant: user.tenant,
          googleEventId: ev.id,
          summary: ev.summary,
          startTime,
          endTime,
          durationMinutes,
          location: ev.location || null,
          notes: ev.description || null,
          status: 'scheduled',
          eventType,
          updatedAt: new Date()
        }
      });

      results.push({
        id: appointment.id,
        googleEventId: ev.id,
        summary: ev.summary,
        leadId,
        leadMatched: !!leadId
      });
    }

    console.log(`[sync-calendar] Synced ${results.length} events for ${user.tenant}`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        synced: results.length,
        total: events.length,
        results
      })
    };

  } catch (error) {
    console.error('[sync-calendar] Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to sync calendar', details: error.message })
    };
  }
}
