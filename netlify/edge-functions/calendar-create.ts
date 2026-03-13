/**
 * Edge Function: Create Google Calendar Event
 * Uses Web Crypto API for JWT signing - no npm dependencies
 */

import type { Context } from "https://edge.netlify.com";

const SERVICE_ACCOUNT_EMAIL = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
const PRIVATE_KEY = (Deno.env.get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY") || "").replace(/\\n/g, "\n");
const CALENDAR_ID = Deno.env.get("GOOGLE_CALENDAR_ID");
const JWT_SECRET = Deno.env.get("JWT_SECRET");
const IMPERSONATE_USER = Deno.env.get("GOOGLE_CALENDAR_USER"); // For domain-wide delegation

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

// Simple JWT verification for auth header
async function verifyAuthToken(authHeader: string | null): Promise<{ tenant: string } | null> {
  if (!authHeader?.startsWith("Bearer ") || !JWT_SECRET) return null;

  const token = authHeader.slice(7);
  try {
    const [headerB64, payloadB64, signatureB64] = token.split(".");
    const payload = JSON.parse(atob(payloadB64));

    // Verify signature
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

// Convert PEM private key to CryptoKey
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // Strip PEM headers/footers and whitespace
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");

  // Ensure proper base64 padding
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

// Create JWT for Google API
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

  // Add subject for domain-wide delegation (impersonate user)
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

// Get Google access token
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

export default async function handler(request: Request, context: Context) {
  const jsonHeaders = { "Content-Type": "application/json" };

  try {
    // Only allow POST
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405, headers: jsonHeaders,
      });
    }

    // Verify auth
    console.log("[calendar-create] Verifying auth...");
    const user = await verifyAuthToken(request.headers.get("Authorization"));
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: jsonHeaders,
      });
    }
    console.log("[calendar-create] Auth OK, tenant:", user.tenant);

    // Check config
    if (!SERVICE_ACCOUNT_EMAIL || !PRIVATE_KEY || !CALENDAR_ID) {
      console.error("[calendar-create] Missing config:", {
        hasEmail: !!SERVICE_ACCOUNT_EMAIL,
        hasKey: !!PRIVATE_KEY,
        hasCalId: !!CALENDAR_ID,
      });
      return new Response(JSON.stringify({ error: "Google Calendar not configured" }), {
        status: 503, headers: jsonHeaders,
      });
    }

    const body = await request.json();
    const { leadId, leadName, leadPhone, leadEmail, leadAddress, startTime, durationMinutes = 60, notes, eventType = 'sales' } = body;

    if (!startTime) {
      return new Response(JSON.stringify({ error: "startTime is required" }), {
        status: 400, headers: jsonHeaders,
      });
    }

    // Build event
    const eventTypeLabel = eventType === 'job' ? 'Job' : 'Sales';
    const summary = `[${eventTypeLabel}] ${leadName || "Unknown"}`;
    const descriptionParts = [];
    if (leadName) descriptionParts.push(`Name: ${leadName}`);
    if (leadPhone) descriptionParts.push(`Phone: ${leadPhone}`);
    if (leadEmail) descriptionParts.push(`Email: ${leadEmail}`);
    if (leadAddress) descriptionParts.push(`Address: ${leadAddress}`);
    if (notes) descriptionParts.push(`\nNotes: ${notes}`);
    if (leadId) {
      descriptionParts.push(`\nCamvasser: https://camvasser.com/admin.html?lead=${leadId}`);
    }

    const start = new Date(startTime);
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

    const event = {
      summary,
      description: descriptionParts.join("\n"),
      location: leadAddress,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    };

    // Get Google access token
    console.log("[calendar-create] Getting Google access token...");
    let token: string;
    try {
      token = await getAccessToken();
      console.log("[calendar-create] Got access token");
    } catch (tokenError) {
      console.error("[calendar-create] Token error:", tokenError);
      return new Response(JSON.stringify({
        error: "Failed to authenticate with Google Calendar",
        details: String(tokenError),
      }), { status: 502, headers: jsonHeaders });
    }

    // Create calendar event
    console.log("[calendar-create] Creating calendar event...");
    const response = await fetch(`${CALENDAR_API}/calendars/${encodeURIComponent(CALENDAR_ID)}/events`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[calendar-create] Calendar API error:", response.status, errorText);
      let errorDetail: string;
      try {
        errorDetail = JSON.parse(errorText).error?.message || errorText;
      } catch {
        errorDetail = errorText;
      }
      return new Response(JSON.stringify({
        error: "Google Calendar API error",
        details: errorDetail,
        status: response.status,
      }), { status: 502, headers: jsonHeaders });
    }

    const createdEvent = await response.json();
    console.log("[calendar-create] Event created:", createdEvent.id);

    // Save appointment to database
    let appointmentSaved = false;
    let appointmentId = null;
    try {
      const saveUrl = new URL("/.netlify/functions/save-appointment", request.url).href;

      const appointmentData = {
        leadId,
        tenant: user.tenant,
        googleEventId: createdEvent.id,
        summary,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        durationMinutes,
        location: leadAddress,
        notes,
        eventType,
      };

      const saveResponse = await fetch(saveUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(appointmentData),
      });

      const saveResult = await saveResponse.json();
      if (saveResponse.ok && saveResult.success) {
        appointmentSaved = true;
        appointmentId = saveResult.appointmentId;
      } else {
        console.error("[calendar-create] Failed to save appointment:", saveResult);
      }
    } catch (saveError) {
      console.error("[calendar-create] Error saving appointment:", saveError);
    }

    return new Response(JSON.stringify({
      success: true,
      event: {
        id: createdEvent.id,
        summary: createdEvent.summary,
        start: createdEvent.start,
        end: createdEvent.end,
        htmlLink: createdEvent.htmlLink,
      },
      appointmentSaved,
      appointmentId,
      ...(!appointmentSaved && { warning: 'Calendar event created but failed to save to database. The appointment may not appear in lead details.' }),
    }), {
      status: 200, headers: jsonHeaders,
    });

  } catch (error) {
    console.error("[calendar-create] Unhandled error:", error);
    return new Response(JSON.stringify({
      error: "Failed to create calendar event",
      details: String(error),
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

