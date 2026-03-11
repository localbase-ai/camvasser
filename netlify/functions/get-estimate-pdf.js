import { verifyToken } from './lib/auth.js';
import { getAccessToken } from './lib/quickbooks.js';

const QB_API_BASE = 'https://quickbooks.api.intuit.com';

export async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  // Accept auth via header or query param (needed for new-tab PDF links)
  const authHeader = event.headers.authorization || event.headers.Authorization
    || (event.queryStringParameters?.token ? `Bearer ${event.queryStringParameters.token}` : null);
  const user = verifyToken(authHeader);
  if (!user) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  const estimateId = event.queryStringParameters?.estimateId;
  if (!estimateId) {
    return { statusCode: 400, body: 'estimateId is required' };
  }

  try {
    const accessToken = await getAccessToken();
    const companyId = process.env.QUICKBOOKS_COMPANY_ID;

    const response = await fetch(
      `${QB_API_BASE}/v3/company/${companyId}/estimate/${estimateId}/pdf`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/pdf'
        }
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('[get-estimate-pdf] QB error:', response.status, errText);
      return { statusCode: 502, body: 'Failed to fetch estimate PDF' };
    }

    const pdfBuffer = await response.arrayBuffer();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="estimate-${estimateId}.pdf"`
      },
      body: Buffer.from(pdfBuffer).toString('base64'),
      isBase64Encoded: true
    };

  } catch (error) {
    console.error('[get-estimate-pdf] Error:', error);
    return { statusCode: 500, body: 'Failed to fetch estimate PDF' };
  }
}
