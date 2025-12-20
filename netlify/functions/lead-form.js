import { loadTenantConfig } from './lib/tenant-config.js';

export async function handler(event) {
  const { tenant, projectId } = event.queryStringParameters || {};

  if (!tenant) {
    return {
      statusCode: 400,
      body: 'Missing tenant parameter'
    };
  }

  try {
    // Load tenant configuration
    const config = loadTenantConfig();
    const tenantConfig = config.tenants[tenant];

    if (!tenantConfig) {
      return {
        statusCode: 404,
        body: 'Tenant not found'
      };
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Contact Us - ${tenantConfig.name}</title>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">

  <style>
    :root {
      --primary: ${tenantConfig.colors.primary};
      --primary-hover: ${tenantConfig.colors.primaryHover};
      --background: #fafafa;
      --foreground: #1a1a2e;
      --muted: #6b7280;
      --border: #e5e7eb;
      --card: #ffffff;
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
      color: var(--foreground);
      min-height: 100vh;
    }

    .header {
      background: var(--background);
      padding: 16px 20px;
      text-align: center;
      border-bottom: 1px solid var(--border);
    }

    .logo {
      max-width: 100px;
      height: auto;
      margin: 0 auto;
      display: block;
    }

    .company-name {
      font-size: 24px;
      font-weight: 700;
      color: var(--foreground);
    }

    .container {
      max-width: 480px;
      margin: 0 auto;
      padding: 24px 20px;
    }

    .lead-capture {
      background: var(--card);
      padding: 28px 24px;
      border-radius: var(--radius);
      border: 1px solid var(--border);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
      text-align: center;
    }

    .lead-capture h1 {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 8px;
      color: var(--foreground);
    }

    .lead-capture .subtitle {
      color: var(--muted);
      font-size: 14px;
      margin-bottom: 24px;
      line-height: 1.5;
    }

    .input-group {
      margin-bottom: 16px;
      text-align: left;
    }

    .input-group label {
      display: block;
      margin-bottom: 6px;
      color: var(--foreground);
      font-weight: 500;
      font-size: 14px;
    }

    .input-group input,
    .input-group textarea {
      width: 100%;
      padding: 12px 14px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font-size: 15px;
      font-family: inherit;
      transition: all 0.2s;
      background: var(--card);
      color: var(--foreground);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    }

    .input-group input:focus,
    .input-group textarea:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent);
    }

    .input-group textarea {
      min-height: 100px;
      resize: vertical;
    }

    .btn {
      background: #059669;
      color: white;
      padding: 14px 28px;
      border: none;
      border-radius: var(--radius);
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      width: 100%;
      margin-top: 8px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .btn:hover {
      background: #047857;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(5, 150, 105, 0.25);
    }

    .btn:active {
      transform: translateY(0);
    }

    .success-message {
      display: none;
      background: #ecfdf5;
      border: 1px solid #059669;
      color: #065f46;
      padding: 20px;
      border-radius: var(--radius);
      margin-top: 20px;
      text-align: center;
    }

    .success-message.visible {
      display: block;
    }

    .back-link {
      display: block;
      text-align: center;
      margin-top: 20px;
      color: var(--muted);
      text-decoration: none;
      font-size: 14px;
    }

    .back-link:hover {
      color: var(--foreground);
    }

    .powered-by {
      text-align: center;
      padding: 24px 20px;
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
        padding: 16px;
      }
      .lead-capture {
        padding: 24px 20px;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    ${tenantConfig.logo ? `<img src="${tenantConfig.logo}" alt="${tenantConfig.name}" class="logo">` : `<div class="company-name">${tenantConfig.name}</div>`}
  </div>

  <div class="container">
    <div class="lead-capture">
      <h1>Get In Touch</h1>
      <p class="subtitle">Ready to start your project? Fill out the form below and we'll get back to you shortly.</p>

      <form id="leadForm">
        <div class="input-group">
          <label for="firstName">First Name</label>
          <input type="text" id="firstName" required>
        </div>

        <div class="input-group">
          <label for="lastName">Last Name</label>
          <input type="text" id="lastName" required>
        </div>

        <div class="input-group">
          <label for="email">Email</label>
          <input type="email" id="email" required>
        </div>

        <div class="input-group">
          <label for="phone">Phone</label>
          <input type="tel" id="phone" required>
        </div>

        <div class="input-group">
          <label for="message">Message (Optional)</label>
          <textarea id="message" placeholder="Tell us about your project..."></textarea>
        </div>

        <button type="submit" class="btn">Submit</button>
      </form>

      <div class="success-message" id="successMessage">
        <h3>Thank you for contacting us!</h3>
        <p>We'll get back to you shortly.</p>
      </div>

      ${projectId ? `<a href="/.netlify/functions/gallery?tenant=${tenant}&projectId=${projectId}" class="back-link">← Back to Gallery</a>` : ''}
    </div>

    <div class="powered-by">
      <img src="/favicon.png" alt="Camvasser">
      <span>Powered by Camvasser</span>
    </div>
  </div>

  <script>
    const tenant = '${tenant}';
    const projectId = '${projectId || ''}';

    document.getElementById('leadForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const leadData = {
        firstName: document.getElementById('firstName').value,
        lastName: document.getElementById('lastName').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        message: document.getElementById('message').value,
        tenant: tenant,
        projectId: projectId,
        timestamp: new Date().toISOString()
      };

      console.log('Lead captured:', leadData);

      try {
        // Save lead to database
        const response = await fetch('/.netlify/functions/save-lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(leadData)
        });

        const result = await response.json();

        if (!response.ok) {
          console.error('Failed to save lead:', result);
          alert('There was an error submitting your information. Please try again.');
          return;
        }

        console.log('Lead saved successfully:', result.leadId);

        // Hide form, show success
        document.getElementById('leadForm').style.display = 'none';
        document.getElementById('successMessage').classList.add('visible');

      } catch (error) {
        console.error('Error saving lead:', error);
        alert('There was an error submitting your information. Please try again.');
      }
    });
  </script>
</body>
</html>`;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html'
      },
      body: html
    };

  } catch (error) {
    console.error('Error rendering lead form:', error);
    return {
      statusCode: 500,
      body: 'Internal server error'
    };
  }
}
