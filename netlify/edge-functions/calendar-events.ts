/**
 * Edge Function: Get Google Calendar Events
 * Uses Web Crypto API for JWT signing - no npm dependencies
 */

import type { Context } from "https://edge.netlify.com";

const SERVICE_ACCOUNT_EMAIL = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
const PRIVATE_KEY = (Deno.env.get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY") || "").replace(/\\n/g, "\n");
const CALENDAR_ID = Deno.env.get("GOOGLE_CALENDAR_ID");
const JWT_SECRET = Deno.env.get("JWT_SECRET");

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

    return { tenant: payload.tenant };
  } catch {
    return null;
  }
}

// Convert PEM private key to CryptoKey
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  console.log("Raw key length:", pem.length);
  console.log("Raw key first 60:", pem.substring(0, 60));

  const pemContents = pem
    .replace(/-+\s*BEGIN\s+PRIVATE\s+KEY\s*-+/gi, "")
    .replace(/-+\s*END\s+PRIVATE\s+KEY\s*-+/gi, "")
    .replace(/[^A-Za-z0-9+/=]/g, "");  // Keep only valid base64 chars

  console.log("Cleaned base64 length:", pemContents.length);
  console.log("Cleaned first 50:", pemContents.substring(0, 50));
  console.log("Cleaned last 20:", pemContents.substring(pemContents.length - 20));
  console.log("Length mod 4:", pemContents.length % 4);

  // Pad to multiple of 4 if needed
  const padding = (4 - (pemContents.length % 4)) % 4;
  const paddedContent = pemContents + "=".repeat(padding);
  console.log("Padded length:", paddedContent.length);

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
  const payload = {
    iss: SERVICE_ACCOUNT_EMAIL,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

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
  // Only allow GET
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Verify auth
  const user = await verifyAuthToken(request.headers.get("Authorization"));
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Check config
  if (!SERVICE_ACCOUNT_EMAIL || !PRIVATE_KEY || !CALENDAR_ID) {
    return new Response(JSON.stringify({ error: "Google Calendar not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get("days") || "14", 10);
    const maxResults = parseInt(url.searchParams.get("maxResults") || "50", 10);

    const timeMin = new Date();
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + days);

    const params = new URLSearchParams({
      maxResults: String(maxResults),
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
    });

    const token = await getAccessToken();
    const response = await fetch(
      `${CALENDAR_API}/calendars/${encodeURIComponent(CALENDAR_ID)}/events?${params}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "Calendar API error");
    }

    const data = await response.json();
    const events = (data.items || []).map((e: any) => ({
      id: e.id,
      summary: e.summary || "Untitled",
      description: e.description,
      location: e.location,
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      htmlLink: e.htmlLink,
    }));

    return new Response(JSON.stringify({ count: events.length, events }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error fetching calendar events:", error);
    console.error("Error type:", typeof error);
    console.error("Error name:", error?.name);
    console.error("Error string:", String(error));
    return new Response(JSON.stringify({
      error: "Failed to fetch calendar events",
      details: error?.message || String(error),
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

