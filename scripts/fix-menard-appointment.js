#!/usr/bin/env node

/**
 * Fix Mary Menard's missing appointment DB record.
 *
 * Searches Google Calendar for the Menard event, then creates
 * the Appointment row in the database linked to her lead.
 *
 * Uses service account credentials from .env (same as edge functions).
 *
 * Run against prod:
 *   DATABASE_URL="postgresql://..." node scripts/fix-menard-appointment.js
 *
 * Or local dev (default — reads .env automatically via Prisma):
 *   node scripts/fix-menard-appointment.js
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

const LEAD_ID = 'cmjdqsvkp00d33qpwoene00sj';
const LEAD_NAME = 'Mary Menard';

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

async function searchCalendar(token, query) {
  const params = new URLSearchParams({
    q: query,
    maxResults: '10',
    singleEvents: 'true',
    orderBy: 'startTime'
  });
  const res = await fetch(
    `${CALENDAR_API}/calendars/${encodeURIComponent(CALENDAR_ID)}/events?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Calendar API error: ${res.status} ${await res.text()}`);
  return (await res.json()).items || [];
}

async function main() {
  if (!SERVICE_ACCOUNT_EMAIL || !PRIVATE_KEY) {
    console.error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY in env');
    process.exit(1);
  }

  console.log('Getting Google access token...');
  const token = await getAccessToken();

  console.log('Searching Google Calendar for "Menard"...');
  let events = await searchCalendar(token, 'Menard');

  if (events.length === 0) {
    console.log('No results for "Menard", trying "Mary"...');
    events = await searchCalendar(token, 'Mary');
  }

  if (events.length === 0) {
    console.error('No matching Google Calendar events found.');
    process.exit(1);
  }

  console.log(`\nFound ${events.length} event(s):\n`);
  events.forEach((e, i) => {
    const start = e.start?.dateTime || e.start?.date;
    console.log(`  [${i}] ${e.summary} — ${start} (id: ${e.id})`);
  });

  const match = events.find(e =>
    e.summary?.toLowerCase().includes('menard') ||
    e.description?.toLowerCase().includes('menard')
  ) || events[0];

  console.log(`\nUsing event: "${match.summary}" (${match.id})`);

  const startTime = new Date(match.start?.dateTime || match.start?.date);
  const endTime = new Date(match.end?.dateTime || match.end?.date);
  const durationMinutes = Math.round((endTime - startTime) / 60000);

  // Check if appointment already exists
  const existing = await prisma.appointment.findFirst({
    where: { googleEventId: match.id }
  });

  if (existing) {
    if (existing.leadId === LEAD_ID) {
      console.log('\nAppointment already exists and is linked correctly. Nothing to do.');
    } else {
      console.log(`\nAppointment exists but linked to lead ${existing.leadId}. Updating to ${LEAD_ID}...`);
      await prisma.appointment.update({
        where: { id: existing.id },
        data: { leadId: LEAD_ID }
      });
      console.log('Updated.');
    }
  } else {
    console.log('\nCreating appointment record...');
    const appointment = await prisma.appointment.create({
      data: {
        leadId: LEAD_ID,
        tenant: 'budroofing',
        googleEventId: match.id,
        summary: match.summary || `[Sales] ${LEAD_NAME}`,
        startTime,
        endTime,
        durationMinutes,
        location: match.location || null,
        notes: match.description || null,
        status: 'scheduled',
        eventType: match.summary?.includes('[Job]') ? 'job' : 'sales',
        updatedAt: new Date()
      }
    });
    console.log(`Created appointment ${appointment.id}`);
  }

  // Verify
  const appts = await prisma.appointment.findMany({ where: { leadId: LEAD_ID } });
  console.log(`\nMary Menard now has ${appts.length} appointment(s) in the database.`);
  appts.forEach(a => {
    console.log(`  - ${a.summary} | ${a.startTime.toISOString()} | status: ${a.status}`);
  });

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Error:', err);
  prisma.$disconnect();
  process.exit(1);
});
