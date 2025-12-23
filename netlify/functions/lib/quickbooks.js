/**
 * QuickBooks API client for Camvasser
 * Handles OAuth token management and customer operations
 */

const QB_TOKEN_ENDPOINT = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const QB_API_BASE = 'https://quickbooks.api.intuit.com';

// In-memory token cache (refreshed tokens stay valid for ~1 hour)
let cachedAccessToken = null;
let tokenExpiresAt = null;

/**
 * Get a valid access token, refreshing if necessary
 */
export async function getAccessToken() {
  // Check if cached token is still valid (with 5 min buffer)
  if (cachedAccessToken && tokenExpiresAt && new Date() < new Date(tokenExpiresAt.getTime() - 5 * 60 * 1000)) {
    return cachedAccessToken;
  }

  // Check if env token is still valid
  const envExpiresAt = process.env.QUICKBOOKS_TOKEN_EXPIRES_AT;
  if (envExpiresAt && new Date() < new Date(envExpiresAt)) {
    cachedAccessToken = process.env.QUICKBOOKS_ACCESS_TOKEN;
    tokenExpiresAt = new Date(envExpiresAt);
    return cachedAccessToken;
  }

  // Need to refresh
  console.log('[QuickBooks] Token expired, refreshing...');
  const newToken = await refreshToken();
  return newToken;
}

/**
 * Refresh the OAuth access token
 */
async function refreshToken() {
  const refreshToken = process.env.QUICKBOOKS_REFRESH_TOKEN;
  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;

  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error('Missing QuickBooks OAuth credentials');
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken
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

  // Cache the new token
  cachedAccessToken = tokenData.access_token;
  tokenExpiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));

  console.log('[QuickBooks] Token refreshed successfully');

  // Note: In a serverless environment, we can't persist the new token to env
  // The token will be refreshed again on next cold start if needed

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
export async function createCustomer({ firstName, lastName, email, phone, address }) {
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

  if (address) {
    // Parse address string into components if needed
    if (typeof address === 'string') {
      const parts = address.split(',').map(p => p.trim());
      payload.BillAddr = {
        Line1: parts[0] || address
      };
      if (parts[1]) payload.BillAddr.City = parts[1];
      if (parts[2]) {
        // Parse "State ZIP" or just state
        const stateZip = parts[2].split(' ').filter(Boolean);
        if (stateZip[0]) payload.BillAddr.CountrySubDivisionCode = stateZip[0];
        if (stateZip[1]) payload.BillAddr.PostalCode = stateZip[1];
      }
      if (parts[3]) payload.BillAddr.PostalCode = parts[3];
    } else {
      payload.BillAddr = {
        Line1: address.line1,
        City: address.city,
        CountrySubDivisionCode: address.state,
        PostalCode: address.zip
      };
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
