/**
 * Google Calendar API client using Service Account authentication
 * Uses jsonwebtoken (already in deps) + fetch for minimal footprint
 *
 * Required env vars:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL - Service account email
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY - Private key (with \n for newlines)
 *   GOOGLE_CALENDAR_ID - Calendar ID to read/write events
 */

import jwt from 'jsonwebtoken';

// Get credentials from env
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

let cachedToken = null;
let tokenExpiry = 0;

/**
 * Get access token using JWT assertion
 */
async function getAccessToken() {
  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < tokenExpiry - 60000) {
    return cachedToken;
  }

  if (!SERVICE_ACCOUNT_EMAIL || !PRIVATE_KEY) {
    throw new Error('Google Calendar credentials not configured');
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: SERVICE_ACCOUNT_EMAIL,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600 // 1 hour
  };

  const assertion = jwt.sign(payload, PRIVATE_KEY, { algorithm: 'RS256' });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error_description || `Token error: ${response.status}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000);

  return cachedToken;
}

/**
 * Make authenticated request to Google Calendar API
 */
async function calendarFetch(path, options = {}) {
  const token = await getAccessToken();

  const url = `${CALENDAR_API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Calendar API error: ${response.status}`);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return null;
  }

  return response.json();
}

/**
 * Create a calendar event
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
 */
export async function deleteEvent(eventId, calendarId = CALENDAR_ID) {
  await calendarFetch(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE'
  });
}

/**
 * Check if Google Calendar is configured
 */
export function isConfigured() {
  return !!(SERVICE_ACCOUNT_EMAIL && PRIVATE_KEY && CALENDAR_ID);
}
