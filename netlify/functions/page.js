import { loadTenantConfig } from './lib/tenant-config.js';

// Generate dynamic HTML for a tenant
function generateHTML(tenant) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${tenant.page_title}</title>

  <!-- Open Graph / Social Media Preview -->
  <meta property="og:title" content="${tenant.page_title}">
  <meta property="og:description" content="${tenant.page_subtitle}">
  <meta property="og:image" content="${tenant.og_image}">
  <meta property="og:type" content="website">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${tenant.page_title}">
  <meta name="twitter:description" content="${tenant.page_subtitle}">
  <meta name="twitter:image" content="${tenant.og_image}">

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
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
      color: var(--foreground);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .container {
      background: var(--card);
      max-width: 480px;
      width: 100%;
      border-radius: var(--radius);
      text-align: center;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
      border: 1px solid var(--border);
    }

    .logo-container {
      padding: 32px 40px 24px;
      background: var(--background);
      border-bottom: 1px solid var(--border);
    }

    .logo-placeholder img {
      max-width: 120px;
      height: auto;
      margin: 0 auto;
      display: block;
    }

    .content {
      padding: 32px 40px 40px;
    }

    h1 {
      font-size: 26px;
      font-weight: 700;
      color: var(--foreground);
      margin-bottom: 8px;
      line-height: 1.2;
    }

    .subtitle {
      color: var(--muted);
      font-size: 15px;
      margin-bottom: 28px;
      line-height: 1.5;
    }

    .input-group {
      margin-bottom: 20px;
      text-align: left;
    }

    label {
      display: block;
      color: var(--foreground);
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 8px;
    }

    input[type="text"] {
      width: 100%;
      padding: 14px 16px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      color: var(--foreground);
      font-size: 15px;
      font-family: 'Inter', sans-serif;
      transition: all 0.2s;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    }

    input[type="text"]:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent);
    }

    input[type="text"]::placeholder {
      color: #9ca3af;
    }

    .hint {
      margin-top: 8px;
      font-size: 13px;
      color: var(--muted);
    }

    .btn {
      width: 100%;
      padding: 14px 24px;
      border: none;
      border-radius: var(--radius);
      font-size: 15px;
      font-weight: 600;
      font-family: 'Inter', sans-serif;
      cursor: pointer;
      transition: all 0.2s;
      margin-top: 10px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .btn-primary {
      background: var(--primary);
      color: #fff;
      border: none;
    }

    .btn-primary:hover:not(:disabled) {
      background: var(--primary-hover);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .btn-primary:disabled {
      
      cursor: not-allowed;
    }

    .btn-success {
      background: var(--primary);
      color: #fff;
      border: none;
      font-size: 15px;
      margin-bottom: 16px;
    }

    .btn-success:hover {
      background: var(--primary-hover);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .btn-call {
      background: #059669;
      color: white;
      border: none;
      text-decoration: none;
      display: block;
      font-size: 15px;
    }

    .btn-call:hover {
      background: #047857;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(5, 150, 105, 0.3);
    }

    .result {
      display: none;
      margin-top: 24px;
      padding: 24px;
      border-radius: var(--radius);
      background: var(--card);
      border: 1px solid var(--border);
      animation: slideIn 0.3s ease;
    }

    @keyframes slideIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .result.success {
      border-color: var(--primary);
      background: color-mix(in srgb, var(--primary) 5%, white);
    }

    .result.lead-capture {
      border-color: var(--primary);
      background: var(--card);
    }

    .result.error {
      border-color: #ef4444;
      background: #fef2f2;
    }

    .result.not-found {
      border-color: #f59e0b;
      background: #fffbeb;
    }

    .lead-form {
      text-align: left;
    }

    .lead-form .input-group {
      margin-bottom: 16px;
    }

    .lead-form input[type="text"],
    .lead-form input[type="email"],
    .lead-form input[type="tel"] {
      width: 100%;
      padding: 12px 14px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font-size: 15px;
      font-family: 'Inter', sans-serif;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    }

    .lead-form input:focus {
      border-color: var(--primary);
      outline: none;
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent);
    }

    .lead-form label {
      font-size: 14px;
      margin-bottom: 6px;
    }

    .result-title {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 16px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
      color: var(--foreground);
    }

    .result-message {
      color: var(--muted);
      margin-bottom: 20px;
      line-height: 1.6;
      font-size: 15px;
    }

    .result-message strong {
      color: var(--foreground);
      display: block;
      margin-bottom: 6px;
      font-size: 16px;
      line-height: 1.4;
    }

    .loader {
      display: none;
      margin: 32px auto;
      border: 3px solid var(--border);
      border-top: 3px solid var(--primary);
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .photo-count {
      color: var(--muted);
      margin-top: 16px;
      margin-bottom: 16px;
      font-size: 14px;
      font-weight: 500;
    }

    .photo-thumbnails {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 8px;
      margin: 16px 0;
    }

    .photo-thumbnails img {
      width: 100%;
      height: 60px;
      object-fit: cover;
      border-radius: 6px;
      border: 1px solid var(--border);
    }

    .reset-link {
      display: inline-block;
      margin-top: 16px;
      color: var(--muted);
      text-decoration: none;
      font-size: 14px;
      cursor: pointer;
      transition: color 0.2s;
    }

    .reset-link:hover {
      color: var(--foreground);
      text-decoration: underline;
    }

    #resultAction {
      margin-top: 16px;
    }

    #resultAction .btn {
      margin-top: 0;
      margin-bottom: 12px;
    }

    #resultAction .btn:first-child {
      margin-top: 20px;
    }

    #resultAction .btn:last-child {
      margin-bottom: 0;
    }

    .powered-by {
      margin-top: 32px;
      padding-top: 20px;
      border-top: 1px solid var(--border);
      color: var(--muted);
      font-size: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .powered-by img {
      height: 16px;
      width: auto;
      
    }

    @media (max-width: 480px) {
      .container {
        border-radius: 0;
        border: none;
        box-shadow: none;
      }
      .content {
        padding: 24px 20px 32px;
      }
      .logo-container {
        padding: 24px 20px 20px;
      }
      h1 {
        font-size: 22px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo-container">
      <div class="logo-placeholder">
        <img src="${tenant.logo}" alt="${tenant.name}">
      </div>
    </div>

    <div class="content">
      <h1>${tenant.heading}</h1>
      <p class="subtitle">${tenant.subheading}</p>

      <div id="searchForm">
        <div class="input-group">
          <label for="address">Street Address</label>
          <input
            type="text"
            id="address"
            placeholder="e.g., 123 Main Street"
            autofocus
          >
          <div class="hint">Press Enter to search</div>
        </div>
      </div>

      <div class="loader" id="loader"></div>

      <div id="result" class="result">
        <div class="result-title" id="resultTitle"></div>
        <div class="result-message" id="resultMessage"></div>
        <div id="resultAction"></div>
      </div>

      <div class="powered-by">
        <img src="/favicon.png" alt="Camvasser">
        <span>Powered by Camvasser</span>
      </div>
    </div>
  </div>

  <script>
    const PHONE_NUMBER = '${tenant.phone}';
    const TENANT_SLUG = '${tenant.slug}';

    // Store the found project temporarily
    let foundProject = null;

    async function searchAddress() {
      const addressInput = document.getElementById('address');
      const address = addressInput.value.trim();

      if (!address) {
        alert('Please enter an address');
        return;
      }

      // Show loader, hide search form and previous results
      document.getElementById('loader').style.display = 'block';
      document.getElementById('result').style.display = 'none';
      document.getElementById('searchForm').style.display = 'none';

      try {
        const response = await fetch(\`/.netlify/functions/search?address=\${encodeURIComponent(address)}&tenant=\${TENANT_SLUG}\`);
        const data = await response.json();

        console.log('Search response:', data); // Debug log

        // Hide loader
        document.getElementById('loader').style.display = 'none';

        if (data.found && data.project) {
          // Store project and show lead capture form first
          foundProject = data.project;
          showLeadCapture();
        } else {
          showNotFound();
        }
      } catch (error) {
        console.error('Search error:', error);
        document.getElementById('loader').style.display = 'none';
        showError();
      }
    }

    function showLeadCapture() {
      // Redirect directly to gallery instead of showing lead form
      window.location.href = \`/.netlify/functions/gallery?tenant=\${TENANT_SLUG}&projectId=\${foundProject.id}\`;
    }

    async function submitLead() {
      const leadData = {
        firstName: document.getElementById('firstName').value,
        lastName: document.getElementById('lastName').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        tenant: TENANT_SLUG,
        projectId: foundProject.id,
        address: foundProject.address
      };

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
          // Continue to gallery anyway - don't block user
        } else {
          console.log('Lead saved successfully:', result.leadId);
        }

      } catch (error) {
        console.error('Error saving lead:', error);
        // Continue to gallery anyway - don't block user
      }

      // Redirect to gallery page with real CompanyCam photos (skip lead form since already captured)
      window.location.href = \`/.netlify/functions/gallery?tenant=\${TENANT_SLUG}&projectId=\${foundProject.id}&skipLead=true\`;
    }

    function showSuccess(project) {
      const result = document.getElementById('result');
      result.className = 'result success';
      result.style.display = 'block';

      document.getElementById('resultTitle').textContent = '✓ Project Found!';

      // Build photo thumbnails HTML
      let thumbnailsHTML = '';
      if (project.photos && project.photos.length > 0) {
        thumbnailsHTML = '<div class="photo-thumbnails">';
        project.photos.forEach(photo => {
          thumbnailsHTML += \`<img src="\${photo.thumbnail}" alt="Project photo">\`;
        });
        thumbnailsHTML += '</div>';
      }

      document.getElementById('resultMessage').innerHTML = \`
        <div style="font-size: 19px; font-weight: 700; color: #212529; margin-bottom: 15px; line-height: 1.4;">\${project.address}</div>
        <div style="font-size: 17px; color: #6C757D; margin-bottom: 30px;">\${project.city}, \${project.state}</div>
        \${thumbnailsHTML}
        <div class="photo-count">\${project.photo_count} Photos</div>
      \`;
      document.getElementById('resultAction').innerHTML = \`
        <a href="\${project.url}" target="_blank" class="btn btn-success">
          View Project Photos
        </a>
        <div><a href="#" class="reset-link" onclick="event.preventDefault(); resetForm();">← Search Another Address</a></div>
      \`;
    }

    function showNotFound() {
      const result = document.getElementById('result');
      result.className = 'result not-found';
      result.style.display = 'block';

      document.getElementById('resultTitle').textContent = 'Project Not Found';
      document.getElementById('resultMessage').textContent =
        "We couldn't find photos for this address. Give us a call and we'll help you out!";
      document.getElementById('resultAction').innerHTML = \`
        <a href="tel:\${PHONE_NUMBER}" class="btn btn-call">
          📞 Call Us: \${PHONE_NUMBER}
        </a>
        <div><a href="#" class="reset-link" onclick="event.preventDefault(); resetForm();">← Try Another Address</a></div>
      \`;
    }

    function showError() {
      const result = document.getElementById('result');
      result.className = 'result error';
      result.style.display = 'block';

      document.getElementById('resultTitle').textContent = 'Search Error';
      document.getElementById('resultMessage').textContent =
        'Something went wrong. Please try again or give us a call.';
      document.getElementById('resultAction').innerHTML = \`
        <a href="tel:\${PHONE_NUMBER}" class="btn btn-call">
          📞 Call Us: \${PHONE_NUMBER}
        </a>
        <div><a href="#" class="reset-link" onclick="event.preventDefault(); resetForm();">← Try Again</a></div>
      \`;
    }

    function resetForm() {
      document.getElementById('searchForm').style.display = 'block';
      document.getElementById('result').style.display = 'none';
      document.getElementById('address').value = '';
      document.getElementById('address').focus();
    }

    // Allow Enter key to submit
    document.getElementById('address').addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        searchAddress();
      }
    });
  </script>
</body>
</html>`;
}

export async function handler(event, context) {
  try {
    // Get tenant parameter from query string
    const { tenant } = event.queryStringParameters || {};

    if (!tenant) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/html' },
        body: `
          <html>
            <body style="font-family: sans-serif; padding: 40px; text-align: center;">
              <h1>Missing Tenant Parameter</h1>
              <p>Please provide a tenant parameter in the URL:</p>
              <code>?tenant=budroofing</code>
            </body>
          </html>
        `
      };
    }

    // Load tenant configuration
    const config = loadTenantConfig();
    const tenantConfig = config.tenants[tenant];

    if (!tenantConfig) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'text/html' },
        body: `
          <html>
            <body style="font-family: sans-serif; padding: 40px; text-align: center;">
              <h1>Tenant Not Found</h1>
              <p>The tenant "${tenant}" does not exist.</p>
              <p>Available tenants: ${Object.keys(config.tenants).join(', ')}</p>
            </body>
          </html>
        `
      };
    }

    // Generate and return HTML
    const html = generateHTML(tenantConfig);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
      },
      body: html
    };

  } catch (error) {
    console.error('Page generation error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html' },
      body: `
        <html>
          <body style="font-family: sans-serif; padding: 40px; text-align: center;">
            <h1>Error</h1>
            <p>Failed to generate page: ${error.message}</p>
          </body>
        </html>
      `
    };
  }
}
