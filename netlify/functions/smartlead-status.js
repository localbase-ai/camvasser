import { getCampaigns, getEmailAccounts } from './lib/smartlead.js';
import { verifyToken } from './lib/auth.js';

export async function handler(event) {
  // Verify authentication
  const authHeader = event.headers.authorization || event.headers.Authorization;
  const user = verifyToken(authHeader);

  if (!user) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized' })
    };
  }

  try {
    // Check if API key is configured
    if (!process.env.SMARTLEAD_API_KEY) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connected: false,
          error: 'API key not configured'
        })
      };
    }

    // Fetch campaigns and email accounts in parallel
    const [campaigns, emailAccounts] = await Promise.all([
      getCampaigns(),
      getEmailAccounts()
    ]);

    const activeCampaigns = Array.isArray(campaigns)
      ? campaigns.filter(c => c.status === 'ACTIVE' || c.status === 'STARTED')
      : [];

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connected: true,
        campaignCount: Array.isArray(campaigns) ? campaigns.length : 0,
        emailAccountCount: Array.isArray(emailAccounts) ? emailAccounts.length : 0,
        activeCampaignCount: activeCampaigns.length,
        campaigns: Array.isArray(campaigns) ? campaigns.map(c => ({
          id: c.id,
          name: c.name,
          status: c.status
        })) : [],
        emailAccounts: Array.isArray(emailAccounts) ? emailAccounts.map(e => ({
          email: e.from_email,
          warmupEnabled: e.warmup_enabled
        })) : []
      })
    };

  } catch (error) {
    console.error('[smartlead-status] Error:', error);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connected: false,
        error: error.message
      })
    };
  }
}
