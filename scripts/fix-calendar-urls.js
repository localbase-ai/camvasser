#!/usr/bin/env node

/**
 * Fix old Google Calendar events that reference camvasser.netlify.app
 * Updates them to use camvasser.com instead.
 */

import 'dotenv/config';
import crypto from 'crypto';

const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'c_07624ff7d43a2c281780e0640b5c2f22fe4de6bbce49ae189d7b015c347cdaa0@group.calendar.google.com';
const IMPERSONATE_USER = process.env.GOOGLE_CALENDAR_USER || 'ryan@nplus1.digital';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

function base64url(data) {
  return Buffer.from(data).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: SERVICE_ACCOUNT_EMAIL,
    scope: 'https://www.googleapis.com/auth/calendar',
    aud: TOKEN_URL,
    sub: IMPERSONATE_USER,
    iat: now,
    exp: now + 3600
  }));

  const signature = crypto.sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), PRIVATE_KEY);
  const jwt = `${header}.${payload}.${base64url(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Token error: ${err.error_description || JSON.stringify(err)}`);
  }
  return (await res.json()).access_token;
}

async function main() {
  if (!SERVICE_ACCOUNT_EMAIL || !PRIVATE_KEY) {
    console.error('Missing Google service account credentials in env');
    process.exit(1);
  }

  console.log('Getting Google access token...');
  const token = await getAccessToken();

  // Search for events with the old URL
  console.log('Searching for events with camvasser.netlify.app...');
  const params = new URLSearchParams({
    q: 'camvasser.netlify.app',
    maxResults: '100',
    singleEvents: 'true',
    orderBy: 'startTime'
  });

  const res = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(CALENDAR_ID)}/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) throw new Error(`Calendar API error: ${res.status} ${await res.text()}`);
  const events = (await res.json()).items || [];

  console.log(`Found ${events.length} event(s) with old URL.\n`);

  let updated = 0;
  for (const event of events) {
    if (!event.description?.includes('camvasser.netlify.app')) continue;

    const newDescription = event.description.replace(
      /camvasser\.netlify\.app/g,
      'camvasser.com'
    );

    console.log(`  Updating: ${event.summary} (${event.start?.dateTime || event.start?.date})`);

    const updateRes = await fetch(
      `${CALENDAR_API}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${event.id}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ description: newDescription })
      }
    );

    if (updateRes.ok) {
      updated++;
    } else {
      console.error(`    Failed: ${updateRes.status} ${await updateRes.text()}`);
    }
  }

  console.log(`\nDone. Updated ${updated} of ${events.length} event(s).`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
