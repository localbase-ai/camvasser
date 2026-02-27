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
    const { customerId } = event.queryStringParameters || {};

    if (!customerId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing customerId' })
      };
    }

    const accessToken = await getAccessToken();
    const companyId = process.env.QUICKBOOKS_COMPANY_ID;

    // Query Estimates, Invoices, and Payments for this customer in parallel
    const [estimatesRes, invoicesRes, paymentsRes] = await Promise.all([
      queryQB(accessToken, companyId, `SELECT * FROM Estimate WHERE CustomerRef = '${customerId}' ORDERBY MetaData.CreateTime DESC MAXRESULTS 25`),
      queryQB(accessToken, companyId, `SELECT * FROM Invoice WHERE CustomerRef = '${customerId}' ORDERBY MetaData.CreateTime DESC MAXRESULTS 25`),
      queryQB(accessToken, companyId, `SELECT * FROM Payment WHERE CustomerRef = '${customerId}' ORDERBY MetaData.CreateTime DESC MAXRESULTS 25`)
    ]);

    const estimates = (estimatesRes.QueryResponse?.Estimate || []).map(e => ({
      type: 'estimate',
      id: e.Id,
      docNumber: e.DocNumber,
      date: e.TxnDate,
      amount: e.TotalAmt,
      status: e.TxnStatus || 'Pending',
      description: e.Line?.find(l => l.Description)?.Description || '',
      createTime: e.MetaData?.CreateTime
    }));

    const invoices = (invoicesRes.QueryResponse?.Invoice || []).map(i => ({
      type: 'invoice',
      id: i.Id,
      docNumber: i.DocNumber,
      date: i.TxnDate,
      amount: i.TotalAmt,
      balance: i.Balance,
      status: i.Balance === 0 ? 'Paid' : 'Open',
      dueDate: i.DueDate,
      description: i.Line?.find(l => l.Description)?.Description || '',
      createTime: i.MetaData?.CreateTime
    }));

    const payments = (paymentsRes.QueryResponse?.Payment || []).map(p => ({
      type: 'payment',
      id: p.Id,
      docNumber: p.PaymentRefNum || '',
      date: p.TxnDate,
      amount: p.TotalAmt,
      status: 'Received',
      method: p.PaymentMethodRef?.name || '',
      createTime: p.MetaData?.CreateTime
    }));

    // Merge and sort by date descending
    const activity = [...estimates, ...invoices, ...payments]
      .sort((a, b) => new Date(b.date || b.createTime) - new Date(a.date || a.createTime));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerId, count: activity.length, activity })
    };

  } catch (error) {
    console.error('[QB Activity] Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message })
    };
  }
}

async function queryQB(accessToken, companyId, query) {
  const url = `${QB_API_BASE}/v3/company/${companyId}/query?query=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[QB Activity] Query failed: ${response.status}`, errorText);
    return { QueryResponse: {} };
  }

  return response.json();
}
