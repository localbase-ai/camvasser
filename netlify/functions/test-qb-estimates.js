import { getAccessToken } from './lib/quickbooks.js';
import { verifyToken } from './lib/auth.js';

const QB_API_BASE = 'https://quickbooks.api.intuit.com';

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

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
    const accessToken = await getAccessToken();
    const companyId = process.env.QUICKBOOKS_COMPANY_ID;

    // Query recent estimates (last 10)
    const query = `SELECT * FROM Estimate ORDERBY MetaData.CreateTime DESC MAXRESULTS 10`;
    const url = `${QB_API_BASE}/v3/company/${companyId}/query?query=${encodeURIComponent(query)}`;

    console.log('[QB Test] Fetching estimates...');

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        statusCode: response.status,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: 'QuickBooks API error',
          status: response.status,
          details: errorText
        })
      };
    }

    const data = await response.json();
    const estimates = data.QueryResponse?.Estimate || [];

    console.log(`[QB Test] Found ${estimates.length} estimates`);

    // Return simplified estimate data
    const simplified = estimates.map(e => ({
      id: e.Id,
      docNumber: e.DocNumber,
      customerName: e.CustomerRef?.name,
      customerId: e.CustomerRef?.value,
      totalAmount: e.TotalAmt,
      status: e.TxnStatus,
      createTime: e.MetaData?.CreateTime,
      email: e.BillEmail?.Address
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        count: estimates.length,
        estimates: simplified
      })
    };

  } catch (error) {
    console.error('[QB Test] Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message })
    };
  }
}
