/**
 * QuickBooks API client for Camvasser
 * Handles OAuth token management and customer operations
 */

import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';

const QB_TOKEN_ENDPOINT = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const QB_API_BASE = 'https://quickbooks.api.intuit.com';
const PROVIDER = 'quickbooks';

// In-memory token cache (for performance within a single function execution)
let cachedAccessToken = null;
let cachedRefreshToken = null;
let tokenExpiresAt = null;

/**
 * Get tokens from database, falling back to env vars for initial setup
 */
async function getStoredTokens(prisma) {
  const stored = await prisma.oAuthToken.findUnique({
    where: { provider: PROVIDER }
  });

  if (stored) {
    return {
      accessToken: stored.accessToken,
      refreshToken: stored.refreshToken,
      expiresAt: stored.expiresAt,
      companyId: stored.companyId
    };
  }

  // Fall back to env vars (for initial setup or migration)
  const envExpiresAt = process.env.QUICKBOOKS_TOKEN_EXPIRES_AT;
  return {
    accessToken: process.env.QUICKBOOKS_ACCESS_TOKEN,
    refreshToken: process.env.QUICKBOOKS_REFRESH_TOKEN,
    expiresAt: envExpiresAt ? new Date(envExpiresAt) : null,
    companyId: process.env.QUICKBOOKS_COMPANY_ID
  };
}

/**
 * Save tokens to database
 */
async function saveTokens(prisma, { accessToken, refreshToken, expiresAt, companyId }) {
  await prisma.oAuthToken.upsert({
    where: { provider: PROVIDER },
    update: {
      accessToken,
      refreshToken,
      expiresAt,
      companyId,
      updatedAt: new Date()
    },
    create: {
      id: createId(),
      provider: PROVIDER,
      accessToken,
      refreshToken,
      expiresAt,
      companyId,
      updatedAt: new Date()
    }
  });
}

/**
 * Get a valid access token, refreshing if necessary
 */
export async function getAccessToken() {
  const prisma = new PrismaClient();

  try {
    // Check if in-memory cached token is still valid (with 5 min buffer)
    if (cachedAccessToken && tokenExpiresAt && new Date() < new Date(tokenExpiresAt.getTime() - 5 * 60 * 1000)) {
      return cachedAccessToken;
    }

    // Get tokens from database
    const stored = await getStoredTokens(prisma);

    // Check if stored token is still valid (with 5 min buffer)
    if (stored.accessToken && stored.expiresAt && new Date() < new Date(stored.expiresAt.getTime() - 5 * 60 * 1000)) {
      cachedAccessToken = stored.accessToken;
      cachedRefreshToken = stored.refreshToken;
      tokenExpiresAt = stored.expiresAt;
      return cachedAccessToken;
    }

    // Need to refresh
    console.log('[QuickBooks] Token expired, refreshing...');
    const newToken = await refreshTokenFlow(prisma, stored.refreshToken, stored.companyId);
    return newToken;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Refresh the OAuth access token and persist new tokens
 */
async function refreshTokenFlow(prisma, currentRefreshToken, companyId) {
  const refreshTokenValue = currentRefreshToken || process.env.QUICKBOOKS_REFRESH_TOKEN;
  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;

  if (!refreshTokenValue || !clientId || !clientSecret) {
    throw new Error('Missing QuickBooks OAuth credentials');
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshTokenValue
  });

  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(QB_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${authHeader}`,
      'Accept': 'application/json'
    },
    body: params
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
  }

  const tokenData = await response.json();
  const newExpiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));

  // Save both access AND refresh tokens to database
  await saveTokens(prisma, {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token, // QB returns a new refresh token!
    expiresAt: newExpiresAt,
    companyId: companyId || process.env.QUICKBOOKS_COMPANY_ID
  });

  // Update in-memory cache
  cachedAccessToken = tokenData.access_token;
  cachedRefreshToken = tokenData.refresh_token;
  tokenExpiresAt = newExpiresAt;

  console.log('[QuickBooks] Token refreshed and saved to database');

  return cachedAccessToken;
}

/**
 * Search for existing customers matching the given criteria
 * @param {Object} criteria - Search criteria
 * @returns {Promise<Array>} Matching customers
 */
export async function findCustomer({ firstName, lastName, email, address }) {
  const accessToken = await getAccessToken();
  const companyId = process.env.QUICKBOOKS_COMPANY_ID;

  // Build query - QuickBooks uses SQL-like syntax
  // We'll search by DisplayName or PrimaryEmailAddr
  const displayName = `${firstName} ${lastName}`.trim();

  let query = `SELECT * FROM Customer WHERE Active = true`;

  // Search by display name (most reliable)
  if (displayName) {
    query += ` AND DisplayName LIKE '%${displayName}%'`;
  }

  console.log('[QuickBooks] Searching for customer:', { displayName, email });

  const url = `${QB_API_BASE}/v3/company/${companyId}/query?query=${encodeURIComponent(query)}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Customer search failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const customers = data.QueryResponse?.Customer || [];

  console.log(`[QuickBooks] Found ${customers.length} potential matches`);

  // Filter more precisely in code
  const matches = customers.filter(c => {
    // Exact name match
    if (c.DisplayName?.toLowerCase() === displayName.toLowerCase()) return true;
    // Email match
    if (email && c.PrimaryEmailAddr?.Address?.toLowerCase() === email.toLowerCase()) return true;
    // Address match (partial)
    if (address && c.BillAddr?.Line1?.toLowerCase().includes(address.toLowerCase().split(',')[0])) return true;
    return false;
  });

  return matches;
}

/**
 * Create a new customer in QuickBooks
 * @param {Object} customerData - Customer information
 * @returns {Promise<Object>} Created customer
 */
export async function createCustomer({ firstName, lastName, email, phone, address, city, state, postalCode }) {
  const accessToken = await getAccessToken();
  const companyId = process.env.QUICKBOOKS_COMPANY_ID;

  const payload = {
    DisplayName: `${firstName} ${lastName}`.trim(),
    GivenName: firstName,
    FamilyName: lastName
  };

  if (email) {
    payload.PrimaryEmailAddr = { Address: email };
  }

  if (phone) {
    payload.PrimaryPhone = { FreeFormNumber: phone };
  }

  // Build address from separate fields if available, otherwise parse from address string
  if (address || city || state || postalCode) {
    payload.BillAddr = {};

    if (address) {
      payload.BillAddr.Line1 = address;
    }
    if (city) {
      payload.BillAddr.City = city;
    }
    if (state) {
      payload.BillAddr.CountrySubDivisionCode = state;
    }
    if (postalCode) {
      payload.BillAddr.PostalCode = postalCode;
    }

    // Fallback: if we have address but no city/state/zip, try to parse from comma-separated string
    if (address && !city && !state && !postalCode && address.includes(',')) {
      const parts = address.split(',').map(p => p.trim());
      payload.BillAddr.Line1 = parts[0];
      if (parts[1]) payload.BillAddr.City = parts[1];
      if (parts[2]) {
        const stateZip = parts[2].split(' ').filter(Boolean);
        if (stateZip[0]) payload.BillAddr.CountrySubDivisionCode = stateZip[0];
        if (stateZip[1]) payload.BillAddr.PostalCode = stateZip[1];
      }
      if (parts[3]) payload.BillAddr.PostalCode = parts[3];
    }
  }

  console.log('[QuickBooks] Creating customer:', payload.DisplayName);

  const url = `${QB_API_BASE}/v3/company/${companyId}/customer`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const errorText = errorData?.Fault?.Error?.[0]?.Detail || response.statusText;
    throw new Error(`Failed to create customer: ${errorText}`);
  }

  const data = await response.json();
  console.log('[QuickBooks] Customer created:', data.Customer.Id);

  return data.Customer;
}

/**
 * Get a customer by ID
 * @param {string} customerId - QuickBooks customer ID
 * @returns {Promise<Object>} Customer object
 */
export async function getCustomer(customerId) {
  const accessToken = await getAccessToken();
  const companyId = process.env.QUICKBOOKS_COMPANY_ID;

  const url = `${QB_API_BASE}/v3/company/${companyId}/customer/${customerId}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get customer: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.Customer;
}

/**
 * Update customer notes in QuickBooks
 * @param {string} customerId - QuickBooks customer ID
 * @param {string} notes - Notes content to set
 * @returns {Promise<Object>} Updated customer
 */
export async function updateCustomerNotes(customerId, notes) {
  const accessToken = await getAccessToken();
  const companyId = process.env.QUICKBOOKS_COMPANY_ID;

  // First get the customer to get the SyncToken
  const customer = await getCustomer(customerId);

  const payload = {
    Id: customerId,
    SyncToken: customer.SyncToken,
    Notes: notes,
    sparse: true
  };

  console.log('[QuickBooks] Updating notes for customer:', customerId);

  const url = `${QB_API_BASE}/v3/company/${companyId}/customer`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const errorText = errorData?.Fault?.Error?.[0]?.Detail || response.statusText;
    throw new Error(`Failed to update customer notes: ${errorText}`);
  }

  const data = await response.json();
  console.log('[QuickBooks] Notes updated for customer:', customerId);

  return data.Customer;
}

/**
 * Create a shell estimate in QuickBooks
 */
export async function createEstimate({ customerId, itemId, itemName, amount, description }) {
  const accessToken = await getAccessToken();
  const companyId = process.env.QUICKBOOKS_COMPANY_ID;

  const payload = {
    CustomerRef: { value: customerId },
    Line: [
      {
        Amount: amount,
        DetailType: 'SalesItemLineDetail',
        SalesItemLineDetail: {
          ItemRef: { value: itemId, name: itemName },
          Qty: 1,
          UnitPrice: amount
        },
        Description: description || itemName
      }
    ]
  };

  console.log('[QuickBooks] Creating estimate for customer:', customerId, 'amount:', amount);

  const url = `${QB_API_BASE}/v3/company/${companyId}/estimate`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const errorText = errorData?.Fault?.Error?.[0]?.Detail || response.statusText;
    throw new Error(`Failed to create estimate: ${errorText}`);
  }

  const data = await response.json();
  console.log('[QuickBooks] Estimate created:', data.Estimate.Id, 'DocNumber:', data.Estimate.DocNumber);
  return data.Estimate;
}

/**
 * Delete an estimate in QuickBooks
 */
export async function deleteEstimate(estimateId) {
  const accessToken = await getAccessToken();
  const companyId = process.env.QUICKBOOKS_COMPANY_ID;

  // First get the estimate to get the SyncToken
  const getUrl = `${QB_API_BASE}/v3/company/${companyId}/estimate/${estimateId}`;
  const getRes = await fetch(getUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  if (!getRes.ok) {
    const errText = await getRes.text();
    throw new Error(`Failed to fetch estimate ${estimateId}: ${errText}`);
  }

  const estimateData = await getRes.json();
  const estimate = estimateData.Estimate;

  console.log('[QuickBooks] Deleting estimate:', estimateId, 'SyncToken:', estimate.SyncToken);

  const deleteUrl = `${QB_API_BASE}/v3/company/${companyId}/estimate?operation=delete`;
  const response = await fetch(deleteUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      Id: estimateId,
      SyncToken: estimate.SyncToken
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const errorText = errorData?.Fault?.Error?.[0]?.Detail || response.statusText;
    throw new Error(`Failed to delete estimate: ${errorText}`);
  }

  console.log('[QuickBooks] Estimate deleted:', estimateId);
  return true;
}
