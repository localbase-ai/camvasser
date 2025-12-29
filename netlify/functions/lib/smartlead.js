/**
 * SmartLead API client for Camvasser
 * Handles email campaign and lead management
 */

const SMARTLEAD_API_BASE = 'https://server.smartlead.ai/api/v1';

/**
 * Get the API key from environment
 */
function getApiKey() {
  const apiKey = process.env.SMARTLEAD_API_KEY;
  if (!apiKey) {
    throw new Error('SMARTLEAD_API_KEY not configured');
  }
  return apiKey;
}

/**
 * Make a request to the SmartLead API
 */
async function apiRequest(endpoint, options = {}) {
  const apiKey = getApiKey();
  const url = `${SMARTLEAD_API_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${apiKey}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SmartLead API error: ${response.status} ${errorText}`);
  }

  return response.json();
}

/**
 * Get all campaigns
 */
export async function getCampaigns() {
  return apiRequest('/campaigns');
}

/**
 * Get campaign by ID
 */
export async function getCampaign(campaignId) {
  return apiRequest(`/campaigns/${campaignId}`);
}

/**
 * Get campaign statistics
 */
export async function getCampaignStats(campaignId) {
  return apiRequest(`/campaigns/${campaignId}/statistics`);
}

/**
 * Get leads from a campaign
 */
export async function getCampaignLeads(campaignId, offset = 0, limit = 100) {
  return apiRequest(`/campaigns/${campaignId}/leads?offset=${offset}&limit=${limit}`);
}

/**
 * Add lead to a campaign
 */
export async function addLeadToCampaign(campaignId, lead) {
  return apiRequest(`/campaigns/${campaignId}/leads`, {
    method: 'POST',
    body: JSON.stringify({
      lead_list: [lead]
    })
  });
}

/**
 * Add multiple leads to a campaign
 */
export async function addLeadsToCampaign(campaignId, leads) {
  return apiRequest(`/campaigns/${campaignId}/leads`, {
    method: 'POST',
    body: JSON.stringify({
      lead_list: leads
    })
  });
}

/**
 * Get all email accounts
 */
export async function getEmailAccounts() {
  return apiRequest('/email-accounts');
}

/**
 * Get client info / account details
 */
export async function getClientInfo() {
  return apiRequest('/client');
}
