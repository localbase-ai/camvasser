/**
 * Edge Function: Update Google Calendar Event
 * Patches event summary (and optionally other fields) on Google Calendar + local DB
 */

import type { Context } from "https://edge.netlify.com";

const SERVICE_ACCOUNT_EMAIL = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
const PRIVATE_KEY = (Deno.env.get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY") || "").replace(/\\n/g, "\n");
const CALENDAR_ID = Deno.env.get("GOOGLE_CALENDAR_ID");
const JWT_SECRET = Deno.env.get("JWT_SECRET");
const IMPERSONATE_USER = Deno.env.get("GOOGLE_CALENDAR_USER");

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

async function verifyAuthToken(authHeader: string | null): Promise<{ tenant: string } | null> {
  if (!authHeader?.startsWith("Bearer ") || !JWT_SECRET) return null;

  const token = authHeader.slice(7);
  try {
    const [headerB64, payloadB64, signatureB64] = token.split(".");
    const payload = JSON.parse(atob(payloadB64));

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(JWT_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const signature = Uint8Array.from(atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

    const valid = await crypto.subtle.verify("HMAC", key, signature, data);
    if (!valid || payload.exp < Date.now() / 1000) return null;

    return { tenant: payload.tenant || payload.slug };
  } catch {
    return null;
  }
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");

  const withoutPadding = pemContents.replace(/=+$/, "");
  const padding = (4 - (withoutPadding.length % 4)) % 4;
  const paddedContent = withoutPadding + "=".repeat(padding);

  const binaryDer = Uint8Array.from(atob(paddedContent), c => c.charCodeAt(0));

  return crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function createGoogleJWT(): Promise<string> {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    iss: SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  if (IMPERSONATE_USER) {
    payload.sub = IMPERSONATE_USER;
  }

  const encode = (obj: object) => btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const headerB64 = encode(header);
  const payloadB64 = encode(payload);

  const key = await importPrivateKey(PRIVATE_KEY);
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, data);
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

async function getAccessToken(): Promise<string> {
  const jwt = await createGoogleJWT();

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error_description || "Token request failed");
  }

  const data = await response.json();
  return data.access_token;
}

export default async function handler(request: Request, _context: Context) {
  const jsonHeaders = { "Content-Type": "application/json" };

  try {
    if (request.method !== "PATCH" && request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405, headers: jsonHeaders,
      });
    }

    const user = await verifyAuthToken(request.headers.get("Authorization"));
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: jsonHeaders,
      });
    }

    if (!SERVICE_ACCOUNT_EMAIL || !PRIVATE_KEY || !CALENDAR_ID) {
      return new Response(JSON.stringify({ error: "Google Calendar not configured" }), {
        status: 503, headers: jsonHeaders,
      });
    }

    const body = await request.json();
    const { googleEventId, summary } = body;

    if (!googleEventId) {
      return new Response(JSON.stringify({ error: "googleEventId is required" }), {
        status: 400, headers: jsonHeaders,
      });
    }

    // Build patch payload for Google Calendar
    const patch: Record<string, string> = {};
    if (summary) {
      patch.summary = summary;
    }

    if (Object.keys(patch).length === 0) {
      return new Response(JSON.stringify({ error: "Nothing to update" }), {
        status: 400, headers: jsonHeaders,
      });
    }

    // Patch Google Calendar event
    console.log("[calendar-update] Patching event:", googleEventId);
    const token = await getAccessToken();

    const gcalRes = await fetch(
      `${CALENDAR_API}/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${encodeURIComponent(googleEventId)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patch),
      }
    );

    if (!gcalRes.ok) {
      const errText = await gcalRes.text();
      console.error("[calendar-update] Google Calendar error:", gcalRes.status, errText);
      return new Response(JSON.stringify({ error: "Failed to update calendar event", details: errText }), {
        status: 502, headers: jsonHeaders,
      });
    }

    const updatedEvent = await gcalRes.json();
    console.log("[calendar-update] Event updated:", updatedEvent.id);

    return new Response(JSON.stringify({
      success: true,
      event: {
        id: updatedEvent.id,
        summary: updatedEvent.summary,
      },
    }), {
      status: 200, headers: jsonHeaders,
    });

  } catch (error) {
    console.error("[calendar-update] Error:", error);
    return new Response(JSON.stringify({
      error: "Failed to update calendar event",
      details: String(error),
    }), {
      status: 500, headers: jsonHeaders,
    });
  }
}
