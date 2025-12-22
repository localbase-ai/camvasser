import { verifyToken } from './lib/auth.js';
import { loadTenantConfig } from './lib/tenant-config.js';

export async function handler(event) {
  // Only allow GET
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Verify authentication
  const authHeader = event.headers.authorization || event.headers.Authorization;
  const user = verifyToken(authHeader);

  if (!user) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unauthorized - Please log in' })
    };
  }

  try {
    // Load tenant config
    const config = loadTenantConfig();
    const tenantConfig = config.tenants[user.slug];

    if (!tenantConfig) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Tenant configuration not found' })
      };
    }

    // Get API key from environment
    const apiKeyEnvVar = tenantConfig.companycam_api_token_env;
    const apiKey = process.env[apiKeyEnvVar];

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: tenantConfig.domain,
        logo: tenantConfig.logo,
        apiKey: apiKey ? `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}` : 'Not set',
        slug: user.slug
      })
    };

  } catch (error) {
    console.error('Error loading settings:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Failed to load settings',
        details: error.message
      })
    };
  }
}
