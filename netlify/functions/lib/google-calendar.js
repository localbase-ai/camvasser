/**
 * Google Calendar API client using Service Account authentication
 * Uses google-auth-library (lightweight) instead of googleapis
 *
 * Required env vars:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL - Service account email
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY - Private key (with \n for newlines)
 *   GOOGLE_CALENDAR_ID - Calendar ID to read/write events
 */

import { GoogleAuth } from 'google-auth-library';

// Get credentials from env
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

/**
 * Get authenticated client for Google APIs
 */
function getAuthClient() {
  if (!SERVICE_ACCOUNT_EMAIL || !PRIVATE_KEY) {
    throw new Error('Google Calendar credentials not configured');
  }

  return new GoogleAuth({
    credentials: {
      client_email: SERVICE_ACCOUNT_EMAIL,
      private_key: PRIVATE_KEY
    },
    scopes: ['https://www.googleapis.com/auth/calendar']
  });
}

/**
 * Make authenticated request to Google Calendar API
 */
async function calendarFetch(path, options = {}) {
  const auth = getAuthClient();
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  const url = `${CALENDAR_API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token.token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Calendar API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Create a calendar event
 * @param {Object} options Event options
 * @param {string} options.summary - Event title
 * @param {string} options.description - Event description
 * @param {string} options.location - Event location (address)
 * @param {Date|string} options.startTime - Start time
 * @param {number} options.durationMinutes - Duration in minutes (default 60)
 * @param {string} options.calendarId - Override calendar ID (optional)
 * @returns {Promise<Object>} Created event
 */
export async function createEvent({
  summary,
  description,
  location,
  startTime,
  durationMinutes = 60,
  calendarId = CALENDAR_ID
}) {
  const start = new Date(startTime);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const event = {
    summary,
    description,
    location,
    start: {
      dateTime: start.toISOString(),
      timeZone: 'America/New_York'
    },
    end: {
      dateTime: end.toISOString(),
      timeZone: 'America/New_York'
    }
  };

  return calendarFetch(`/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    body: JSON.stringify(event)
  });
}

/**
 * Get upcoming calendar events
 * @param {Object} options Query options
 * @param {number} options.maxResults - Max events to return (default 50)
 * @param {Date|string} options.timeMin - Start of time range (default now)
 * @param {Date|string} options.timeMax - End of time range (optional)
 * @param {string} options.calendarId - Override calendar ID (optional)
 * @returns {Promise<Array>} List of events
 */
export async function getEvents({
  maxResults = 50,
  timeMin = new Date(),
  timeMax,
  calendarId = CALENDAR_ID
} = {}) {
  const params = new URLSearchParams({
    maxResults: String(maxResults),
    timeMin: new Date(timeMin).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime'
  });

  if (timeMax) {
    params.set('timeMax', new Date(timeMax).toISOString());
  }

  const data = await calendarFetch(`/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
  return data.items || [];
}

/**
 * Delete a calendar event
 * @param {string} eventId - Google Calendar event ID
 * @param {string} calendarId - Override calendar ID (optional)
 */
export async function deleteEvent(eventId, calendarId = CALENDAR_ID) {
  const auth = getAuthClient();
  const client = await auth.getClient();
  const token = await client.getAccessToken();

  const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token.token}`
    }
  });

  if (!response.ok && response.status !== 204) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Calendar API error: ${response.status}`);
  }
}

/**
 * Check if Google Calendar is configured
 */
export function isConfigured() {
  return !!(SERVICE_ACCOUNT_EMAIL && PRIVATE_KEY && CALENDAR_ID);
}
