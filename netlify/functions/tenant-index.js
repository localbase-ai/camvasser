import { loadTenantConfig } from './lib/tenant-config.js';

export async function handler(event) {
  const { tenant } = event.queryStringParameters || {};

  if (!tenant) {
    return {
      statusCode: 400,
      body: 'Missing tenant parameter'
    };
  }

  const config = loadTenantConfig();
  const tenantConfig = config.tenants[tenant];

  if (!tenantConfig) {
    return {
      statusCode: 404,
      body: 'Tenant not found'
    };
  }

  const html = generateHTML(tenantConfig);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'public, max-age=300'
    },
    body: html
  };
}

function generateHTML(tenant) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${tenant.name} - Services</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: ${tenant.colors.primary};
      --primary-hover: ${tenant.colors.primaryHover};
      --background: #fafafa;
      --foreground: #1a1a2e;
      --muted: #6b7280;
      --border: #e5e7eb;
      --card: #ffffff;
      --card-hover: #f9fafb;
      --radius: 0.75rem;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--background);
      min-height: 100vh;
      color: var(--foreground);
    }

    .container {
      max-width: 520px;
      margin: 0 auto;
      padding: 40px 20px;
    }

    .header {
      text-align: center;
      margin-bottom: 32px;
    }

    .logo {
      height: 64px;
      margin-bottom: 24px;
    }

    .title {
      font-size: 26px;
      font-weight: 700;
      margin-bottom: 8px;
      color: var(--foreground);
    }

    .subtitle {
      font-size: 15px;
      color: var(--muted);
    }

    .flows {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .flow-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px 24px;
      text-decoration: none;
      color: var(--foreground);
      transition: all 0.2s ease;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    }

    .flow-card:hover {
      background: var(--card-hover);
      border-color: var(--primary);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    }

    .flow-card h3 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 6px;
      color: var(--foreground);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .flow-card p {
      font-size: 14px;
      color: var(--muted);
      line-height: 1.5;
    }

    .flow-card .arrow {
      color: var(--primary);
      font-size: 18px;
      transition: transform 0.2s ease;
    }

    .flow-card:hover .arrow {
      transform: translateX(4px);
    }

    .section-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--muted);
      margin-bottom: 10px;
      margin-top: 24px;
    }

    .section-label:first-of-type {
      margin-top: 0;
    }

    .powered-by {
      text-align: center;
      padding: 32px 20px 0;
      font-size: 12px;
      color: var(--muted);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .powered-by img {
      height: 16px;
      
    }

    @media (max-width: 480px) {
      .container {
        padding: 24px 16px;
      }
      .title {
        font-size: 22px;
      }
      .logo {
        height: 56px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${tenant.logo}" alt="${tenant.name}" class="logo">
      <h1 class="title">How can we help?</h1>
      <p class="subtitle">Select an option below to get started</p>
    </div>

    <div class="flows">
      ${tenant.flows.includes('roof-claim-denial') || tenant.flows.includes('roof-spray-vs-sealant-options') ? `
      <div class="section-label">Qualification</div>
      ` : ''}
      ${tenant.flows.includes('roof-claim-denial') ? `
      <a href="/${tenant.slug}/roof-claim-denial" class="flow-card">
        <h3>Roof Claim Denied? <span class="arrow">&rarr;</span></h3>
        <p>See if you qualify for a second opinion review</p>
      </a>
      ` : ''}
      ${tenant.flows.includes('roof-spray-vs-sealant-options') ? `
      <a href="/${tenant.slug}/roof-spray-vs-sealant-options" class="flow-card">
        <h3>Roof Spray vs Sealant Options <span class="arrow">&rarr;</span></h3>
        <p>Find out which treatment is right for your roof</p>
      </a>
      ` : ''}

      ${tenant.flows.includes('dirty-roof-costs') || tenant.flows.includes('clogged-gutters-damage') || tenant.flows.includes('ice-dam-prevention') ? `
      <div class="section-label">Learn More</div>
      ` : ''}
      ${tenant.flows.includes('dirty-roof-costs') ? `
      <a href="/${tenant.slug}/dirty-roof-costs" class="flow-card">
        <h3>Dirty Roof Costing You Money? <span class="arrow">&rarr;</span></h3>
        <p>Learn how a dirty roof may be impacting your energy bills and roof lifespan</p>
      </a>
      ` : ''}
      ${tenant.flows.includes('clogged-gutters-damage') ? `
      <a href="/${tenant.slug}/clogged-gutters-damage" class="flow-card">
        <h3>Clogged Gutters Damaging Your Roof? <span class="arrow">&rarr;</span></h3>
        <p>Find out how gutter issues may be putting your roof at risk</p>
      </a>
      ` : ''}
      ${tenant.flows.includes('ice-dam-prevention') ? `
      <a href="/${tenant.slug}/ice-dam-prevention" class="flow-card">
        <h3>Ice Dam Risk Assessment <span class="arrow">&rarr;</span></h3>
        <p>Find out if your home is at risk for ice dam damage this winter</p>
      </a>
      ` : ''}

      ${tenant.flows.includes('photos') ? `
      <div class="section-label">View Your Project</div>
      <a href="/${tenant.slug}/photos" class="flow-card">
        <h3>View Project Photos <span class="arrow">&rarr;</span></h3>
        <p>Enter your address to view photos from your roofing project</p>
      </a>
      ` : ''}
    </div>

    <div class="powered-by">
      <img src="/favicon.png" alt="Camvasser">
      <span>Powered by Camvasser</span>
    </div>
  </div>
</body>
</html>`;
}
