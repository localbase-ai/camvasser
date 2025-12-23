/**
 * Google Calendar API client using Service Account authentication
 *
 * Required env vars:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL - Service account email
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY - Private key (with \n for newlines)
 *   GOOGLE_CALENDAR_ID - Calendar ID to read/write events
 */

import { google } from 'googleapis';

// Get credentials from env
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;

/**
 * Create authenticated Google Calendar client
 */
function getCalendarClient() {
  if (!SERVICE_ACCOUNT_EMAIL || !PRIVATE_KEY) {
    throw new Error('Google Calendar credentials not configured');
  }

  const auth = new google.auth.JWT(
    SERVICE_ACCOUNT_EMAIL,
    null,
    PRIVATE_KEY,
    ['https://www.googleapis.com/auth/calendar']
  );

  return google.calendar({ version: 'v3', auth });
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
  const calendar = getCalendarClient();

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

  const response = await calendar.events.insert({
    calendarId,
    resource: event
  });

  return response.data;
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
  const calendar = getCalendarClient();

  const params = {
    calendarId,
    maxResults,
    timeMin: new Date(timeMin).toISOString(),
    singleEvents: true,
    orderBy: 'startTime'
  };

  if (timeMax) {
    params.timeMax = new Date(timeMax).toISOString();
  }

  const response = await calendar.events.list(params);

  return response.data.items || [];
}

/**
 * Delete a calendar event
 * @param {string} eventId - Google Calendar event ID
 * @param {string} calendarId - Override calendar ID (optional)
 */
export async function deleteEvent(eventId, calendarId = CALENDAR_ID) {
  const calendar = getCalendarClient();

  await calendar.events.delete({
    calendarId,
    eventId
  });
}

/**
 * Check if Google Calendar is configured
 */
export function isConfigured() {
  return !!(SERVICE_ACCOUNT_EMAIL && PRIVATE_KEY && CALENDAR_ID);
}
