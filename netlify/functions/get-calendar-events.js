import { verifyToken } from './lib/auth.js';
import { getEvents, isConfigured } from './lib/google-calendar.js';

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

  // Check if Google Calendar is configured
  if (!isConfigured()) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Google Calendar not configured' })
    };
  }

  try {
    const { days = '14', maxResults = '50' } = event.queryStringParameters || {};

    // Calculate time range
    const timeMin = new Date();
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + parseInt(days, 10));

    const events = await getEvents({
      maxResults: parseInt(maxResults, 10),
      timeMin,
      timeMax
    });

    // Format events for frontend
    const formattedEvents = events.map(e => ({
      id: e.id,
      summary: e.summary || 'Untitled',
      description: e.description,
      location: e.location,
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      htmlLink: e.htmlLink
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        count: formattedEvents.length,
        events: formattedEvents
      })
    };

  } catch (error) {
    console.error('Error fetching calendar events:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to fetch calendar events',
        details: error.message
      })
    };
  }
}
