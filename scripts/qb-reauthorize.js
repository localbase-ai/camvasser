#!/usr/bin/env node

/**
 * QuickBooks OAuth Re-authorization
 *
 * Opens the Intuit consent page. After you approve, Intuit redirects to the
 * registered Netlify callback URL. Paste the full URL from your browser's
 * address bar back into this script's prompt. It exchanges the code for tokens
 * and saves to:
 *   1. Camvasser Postgres OAuthToken table (shared source of truth)
 *   2. Renu env.local (backward compat)
 *
 * Usage: node scripts/qb-reauthorize.js
 */

import readline from 'readline';
import { exec } from 'child_process';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Load QB credentials from renu's env.local (single source for client_id/secret)
const renuEnvPath = '/Users/ryanriggin/Work/renu/env.local';
const renuEnv = {};
fs.readFileSync(renuEnvPath, 'utf8').split('\n').forEach(line => {
  if (line.includes('=') && !line.startsWith('#')) {
    const [key, ...valueParts] = line.split('=');
    renuEnv[key.trim()] = valueParts.join('=').trim();
  }
});

const CLIENT_ID = renuEnv.QUICKBOOKS_CLIENT_ID;
const CLIENT_SECRET = renuEnv.QUICKBOOKS_CLIENT_SECRET;
const COMPANY_ID = renuEnv.QUICKBOOKS_COMPANY_ID;
// Must match the redirect URI registered in Intuit Developer portal
const REDIRECT_URI = 'https://benevolent-malabi-37c3f8.netlify.app/callback';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing QUICKBOOKS_CLIENT_ID or QUICKBOOKS_CLIENT_SECRET in renu/env.local');
  process.exit(1);
}

const authUrl = `https://appcenter.intuit.com/connect/oauth2?` +
  `client_id=${CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&response_type=code` +
  `&scope=com.intuit.quickbooks.accounting` +
  `&state=camvasser-reauth`;

console.log('\nOpening browser for Intuit authorization...');
console.log('After you approve, you\'ll be redirected to a page (it may show an error — that\'s fine).');
console.log('Copy the FULL URL from your browser\'s address bar and paste it here.\n');

exec(`open "${authUrl}"`);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('Paste the callback URL here: ', async (callbackUrl) => {
  rl.close();

  try {
    const url = new URL(callbackUrl.trim());
    const code = url.searchParams.get('code');
    const realmId = url.searchParams.get('realmId');

    if (!code) {
      console.error('No authorization code found in URL. Make sure you pasted the full URL.');
      process.exit(1);
    }

    console.log(`\nAuthorization code received (realmId: ${realmId || COMPANY_ID})`);
    console.log('Exchanging for tokens...');

    const tokenRes = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
        'Accept': 'application/json'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI
      })
    });

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      throw new Error(`Token exchange failed: ${tokenRes.status} ${errorText}`);
    }

    const tokenData = await tokenRes.json();
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);
    const companyId = realmId || COMPANY_ID;

    console.log('\nToken exchange successful!');
    console.log(`  Expires at: ${expiresAt.toISOString()}`);
    console.log(`  Company ID: ${companyId}`);

    // 1. Save to Postgres (shared source of truth)
    await prisma.oAuthToken.upsert({
      where: { provider: 'quickbooks' },
      update: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt,
        companyId
      },
      create: {
        provider: 'quickbooks',
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt,
        companyId
      }
    });
    console.log('Saved to Postgres OAuthToken table');

    // 2. Update renu's env.local
    let renuContent = fs.readFileSync(renuEnvPath, 'utf8');
    renuContent = renuContent.replace(/QUICKBOOKS_ACCESS_TOKEN=.*/, `QUICKBOOKS_ACCESS_TOKEN=${tokenData.access_token}`);
    renuContent = renuContent.replace(/QUICKBOOKS_REFRESH_TOKEN=.*/, `QUICKBOOKS_REFRESH_TOKEN=${tokenData.refresh_token}`);
    renuContent = renuContent.replace(/QUICKBOOKS_TOKEN_EXPIRES_AT=.*/, `QUICKBOOKS_TOKEN_EXPIRES_AT=${expiresAt.toISOString()}`);
    if (realmId) {
      renuContent = renuContent.replace(/QUICKBOOKS_COMPANY_ID=.*/, `QUICKBOOKS_COMPANY_ID=${realmId}`);
    }
    fs.writeFileSync(renuEnvPath, renuContent);
    console.log('Saved to renu/env.local');

    console.log('\nDone! Both camvasser and renu now have fresh tokens.');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
});
