import { verifyToken } from './lib/auth.js';
import { createEvent, isConfigured } from './lib/google-calendar.js';

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

  // Check if Google Calendar is configured
  if (!isConfigured()) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Google Calendar not configured' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const {
      leadId,
      leadName,
      leadPhone,
      leadEmail,
      leadAddress,
      startTime,
      durationMinutes = 60,
      notes
    } = body;

    if (!startTime) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'startTime is required' })
      };
    }

    // Build event summary and description
    const summary = `Appointment: ${leadName || 'Unknown'}`;

    const descriptionParts = [];
    if (leadName) descriptionParts.push(`Name: ${leadName}`);
    if (leadPhone) descriptionParts.push(`Phone: ${leadPhone}`);
    if (leadEmail) descriptionParts.push(`Email: ${leadEmail}`);
    if (leadAddress) descriptionParts.push(`Address: ${leadAddress}`);
    if (notes) descriptionParts.push(`\nNotes: ${notes}`);
    if (leadId) {
      // Add link back to Camvasser (adjust URL as needed)
      const camvasserUrl = `https://camvasser.netlify.app/admin.html?lead=${leadId}`;
      descriptionParts.push(`\nCamvasser: ${camvasserUrl}`);
    }

    const description = descriptionParts.join('\n');

    // Create the event
    const createdEvent = await createEvent({
      summary,
      description,
      location: leadAddress,
      startTime,
      durationMinutes
    });

    console.log(`Created calendar event: ${createdEvent.id} for lead ${leadId}`);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        event: {
          id: createdEvent.id,
          summary: createdEvent.summary,
          start: createdEvent.start,
          end: createdEvent.end,
          htmlLink: createdEvent.htmlLink
        }
      })
    };

  } catch (error) {
    console.error('Error creating calendar event:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to create calendar event',
        details: error.message
      })
    };
  }
}
