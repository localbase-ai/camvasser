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
  const mapboxToken = process.env.MAPBOX_TOKEN || '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Emergency Roof Leak Help - ${tenant.name}</title>
  <meta name="description" content="Get immediate help for your roof leak. We'll stop the damage and get you scheduled fast.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link href="https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css" rel="stylesheet">
  <script src="https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.js"></script>
  <link href="https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-geocoder/v5.0.0/mapbox-gl-geocoder.css" rel="stylesheet">
  <script src="https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-geocoder/v5.0.0/mapbox-gl-geocoder.min.js"></script>
  <style>
    :root {
      --primary: ${tenant.colors.primary};
      --primary-hover: ${tenant.colors.primaryHover};
      --emergency: #dc2626;
      --emergency-hover: #b91c1c;
      --cta: #dc2626;
      --cta-hover: #b91c1c;
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
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .header {
      position: sticky;
      top: 0;
      background: var(--background);
      padding: 12px 0;
      z-index: 100;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }

    .logo {
      height: 52px;
    }

    .emergency-badge {
      background: var(--emergency);
      color: white;
      font-size: 11px;
      font-weight: 700;
      padding: 4px 12px;
      border-radius: 20px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .progress-bar {
      background: var(--border);
      border-radius: 10px;
      height: 6px;
      width: 200px;
      overflow: hidden;
    }

    .progress-fill {
      background: var(--emergency);
      height: 100%;
      border-radius: 10px;
      transition: width 0.3s ease;
    }

    .step {
      display: none;
      flex: 1;
      animation: slideIn 0.4s ease;
      padding-top: 12px;
    }

    .step.active {
      display: flex;
      flex-direction: column;
    }

    @keyframes slideIn {
      from { opacity: 0; transform: translateX(20px); }
      to { opacity: 1; transform: translateX(0); }
    }

    .step-title {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 8px;
      line-height: 1.3;
      color: var(--foreground);
    }

    .step-subtitle {
      font-size: 15px;
      color: var(--muted);
      margin-bottom: 24px;
      line-height: 1.5;
    }

    .reassurance {
      background: #fef3c7;
      border: 1px solid #f59e0b;
      border-radius: var(--radius);
      padding: 12px 16px;
      font-size: 14px;
      color: #92400e;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .reassurance-icon {
      font-size: 18px;
    }

    .options {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-bottom: 24px;
    }

    .option {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px 20px;
      cursor: pointer;
      transition: all 0.2s ease;
      font-size: 15px;
      text-align: left;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    }

    .option:hover {
      background: var(--card-hover);
      border-color: #d1d5db;
      transform: translateY(-1px);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
    }

    .option.selected {
      background: color-mix(in srgb, var(--primary) 8%, white);
      border-color: var(--primary);
      box-shadow: 0 0 0 1px var(--primary);
    }

    .option.multi {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .option.urgent {
      border-color: var(--emergency);
      background: #fef2f2;
    }

    .option.urgent.selected {
      background: #fee2e2;
      border-color: var(--emergency);
      box-shadow: 0 0 0 1px var(--emergency);
    }

    .checkbox {
      width: 20px;
      height: 20px;
      border: 2px solid var(--border);
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: all 0.2s ease;
      background: var(--card);
    }

    .option.selected .checkbox {
      background: var(--primary);
      border-color: var(--primary);
    }

    .option.selected .checkbox::after {
      content: '✓';
      color: white;
      font-size: 12px;
      font-weight: bold;
    }

    .radio {
      width: 20px;
      height: 20px;
      border: 2px solid var(--border);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: all 0.2s ease;
      background: var(--card);
    }

    .option.selected .radio {
      border-color: var(--primary);
    }

    .option.selected .radio::after {
      content: '';
      width: 10px;
      height: 10px;
      background: var(--primary);
      border-radius: 50%;
    }

    .btn {
      padding: 16px 32px;
      border: none;
      border-radius: var(--radius);
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      font-family: 'Inter', sans-serif;
      width: 100%;
      margin-top: auto;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .btn-primary {
      background: var(--cta);
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background: var(--cta-hover);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
    }

    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    .btn-secondary {
      background: var(--card);
      color: var(--foreground);
      border: 1px solid var(--border);
      margin-top: 12px;
    }

    .btn-secondary:hover {
      background: var(--card-hover);
      border-color: #d1d5db;
    }

    .btn-call {
      background: #059669;
      color: white;
      text-decoration: none;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-top: 12px;
    }

    .btn-call:hover {
      background: #047857;
    }

    /* Photo upload styles */
    .upload-area {
      border: 2px dashed var(--border);
      border-radius: var(--radius);
      padding: 32px 20px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s ease;
      background: var(--card);
      margin-bottom: 16px;
    }

    .upload-area:hover {
      border-color: var(--primary);
      background: var(--card-hover);
    }

    .upload-area.dragover {
      border-color: var(--primary);
      background: color-mix(in srgb, var(--primary) 5%, white);
    }

    .upload-icon {
      font-size: 40px;
      margin-bottom: 12px;
    }

    .upload-text {
      font-size: 15px;
      color: var(--foreground);
      margin-bottom: 4px;
    }

    .upload-hint {
      font-size: 13px;
      color: var(--muted);
    }

    .upload-input {
      display: none;
    }

    .photo-preview {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }

    .photo-thumb {
      position: relative;
      aspect-ratio: 1;
      border-radius: var(--radius);
      overflow: hidden;
      background: var(--border);
    }

    .photo-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .photo-thumb .remove-btn {
      position: absolute;
      top: 4px;
      right: 4px;
      width: 24px;
      height: 24px;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .skip-link {
      display: block;
      text-align: center;
      color: var(--muted);
      font-size: 14px;
      margin-top: 16px;
      cursor: pointer;
      text-decoration: underline;
    }

    .skip-link:hover {
      color: var(--foreground);
    }

    /* Form styles */
    .form-group {
      margin-bottom: 20px;
    }

    .form-group label {
      display: block;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 8px;
      color: var(--foreground);
    }

    .form-group input,
    .form-group select {
      width: 100%;
      padding: 14px 16px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font-size: 15px;
      font-family: 'Inter', sans-serif;
      transition: all 0.2s ease;
      background: var(--card);
    }

    .form-group input:focus,
    .form-group select:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent);
    }

    /* Results page */
    .results {
      text-align: center;
    }

    .results-icon {
      font-size: 64px;
      margin-bottom: 20px;
    }

    .results-title {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 16px;
      color: var(--foreground);
    }

    .results-message {
      font-size: 16px;
      color: var(--muted);
      margin-bottom: 32px;
      line-height: 1.6;
    }

    .priority-badge {
      display: inline-block;
      background: var(--emergency);
      color: white;
      font-size: 13px;
      font-weight: 600;
      padding: 6px 16px;
      border-radius: 20px;
      margin-bottom: 24px;
    }

    .priority-badge.high {
      background: var(--emergency);
    }

    .priority-badge.medium {
      background: #f59e0b;
    }

    .summary-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      text-align: left;
      margin-bottom: 24px;
    }

    .summary-card h3 {
      font-size: 14px;
      font-weight: 600;
      color: var(--muted);
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .summary-item {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid var(--border);
      font-size: 14px;
    }

    .summary-item:last-child {
      border-bottom: none;
    }

    .summary-item .label {
      color: var(--muted);
    }

    .summary-item .value {
      font-weight: 500;
      color: var(--foreground);
    }

    .expectation-box {
      background: #ecfdf5;
      border: 1px solid #059669;
      border-radius: var(--radius);
      padding: 16px;
      margin-bottom: 24px;
      text-align: left;
    }

    .expectation-box p {
      font-size: 14px;
      color: #065f46;
      line-height: 1.5;
    }

    /* Mapbox overrides */
    .mapboxgl-ctrl-geocoder {
      width: 100% !important;
      max-width: none !important;
      font-family: 'Inter', sans-serif !important;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08) !important;
      border: 1px solid var(--border) !important;
      border-radius: var(--radius) !important;
    }

    .mapboxgl-ctrl-geocoder input {
      height: 50px !important;
      padding: 0 16px 0 44px !important;
      font-size: 15px !important;
    }

    .mapboxgl-ctrl-geocoder input:focus {
      outline: none !important;
    }

    .mapboxgl-ctrl-geocoder--icon-search {
      left: 14px !important;
      top: 15px !important;
    }

    .mapboxgl-ctrl-geocoder--suggestion {
      padding: 12px 16px !important;
    }

    .mapboxgl-ctrl-geocoder--suggestion:hover {
      background: var(--card-hover) !important;
    }

    .mapboxgl-ctrl-geocoder--suggestion-title {
      font-weight: 500 !important;
    }

    .mapboxgl-ctrl-geocoder--suggestion-address {
      color: var(--muted) !important;
    }

    .powered-by {
      text-align: center;
      padding: 24px 0;
      font-size: 12px;
      color: var(--muted);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-top: auto;
    }

    .powered-by img {
      height: 16px;
    }

    /* Loading state */
    .loading {
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px 20px;
      flex: 1;
    }

    .loading.active {
      display: flex;
    }

    .spinner {
      width: 48px;
      height: 48px;
      border: 3px solid var(--border);
      border-top-color: var(--emergency);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-bottom: 20px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .loading-text {
      font-size: 16px;
      color: var(--muted);
    }

    @media (max-width: 480px) {
      .container {
        padding: 16px;
      }
      .step-title {
        font-size: 22px;
      }
      .logo {
        height: 44px;
      }
      .photo-preview {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${tenant.logo}" alt="${tenant.name}" class="logo">
      <span class="emergency-badge">Emergency Service</span>
      <div class="progress-bar">
        <div class="progress-fill" id="progress" style="width: 12.5%"></div>
      </div>
    </div>

    <!-- Step 1: Address -->
    <div class="step active" id="step1">
      <h1 class="step-title">Let's get help for your roof leak.</h1>
      <p class="step-subtitle">What's the address where the leak is happening?</p>

      <div id="map" style="width: 100%; height: 200px; border-radius: var(--radius); overflow: hidden; margin-bottom: 16px;"></div>
      <div id="geocoder-container" style="margin-bottom: 24px;"></div>

      <button class="btn btn-primary" id="btn1" disabled onclick="nextStep(2)">Continue</button>
    </div>

    <!-- Step 2: Active Leak -->
    <div class="step" id="step2">
      <h1 class="step-title">Is water actively coming into the home right now?</h1>
      <p class="step-subtitle">This helps us prioritize your request.</p>

      <div class="options">
        <div class="option urgent" onclick="selectSingle(this, 'leakStatus', 'active')">
          <div class="radio"></div>
          <span>Yes — water is actively leaking</span>
        </div>
        <div class="option" onclick="selectSingle(this, 'leakStatus', 'recent')">
          <div class="radio"></div>
          <span>Not right now, but it leaked recently</span>
        </div>
        <div class="option" onclick="selectSingle(this, 'leakStatus', 'intermittent')">
          <div class="radio"></div>
          <span>Not sure / it's intermittent</span>
        </div>
      </div>

      <button class="btn btn-primary" id="btn2" disabled onclick="nextStep(3)">Continue</button>
    </div>

    <!-- Step 3: Leak Location -->
    <div class="step" id="step3">
      <h1 class="step-title">Where are you seeing the leak or damage?</h1>
      <p class="step-subtitle">Select all that apply.</p>

      <div class="options">
        <div class="option multi" onclick="toggleMulti(this, 'leakLocation', 'ceiling')">
          <div class="checkbox"></div>
          <span>Ceiling</span>
        </div>
        <div class="option multi" onclick="toggleMulti(this, 'leakLocation', 'wall')">
          <div class="checkbox"></div>
          <span>Wall</span>
        </div>
        <div class="option multi" onclick="toggleMulti(this, 'leakLocation', 'attic')">
          <div class="checkbox"></div>
          <span>Attic</span>
        </div>
        <div class="option multi" onclick="toggleMulti(this, 'leakLocation', 'chimney_skylight')">
          <div class="checkbox"></div>
          <span>Around a chimney or skylight</span>
        </div>
        <div class="option multi" onclick="toggleMulti(this, 'leakLocation', 'multiple')">
          <div class="checkbox"></div>
          <span>Multiple areas</span>
        </div>
        <div class="option multi" onclick="toggleMulti(this, 'leakLocation', 'unsure')">
          <div class="checkbox"></div>
          <span>Not sure / can't tell yet</span>
        </div>
      </div>

      <button class="btn btn-primary" id="btn3" disabled onclick="nextStep(4)">Continue</button>
    </div>

    <!-- Step 4: Exterior Damage -->
    <div class="step" id="step4">
      <h1 class="step-title">If you've looked outside, what do you notice on the roof?</h1>
      <p class="step-subtitle">Select any that apply. Skip if you haven't looked.</p>

      <div class="reassurance">
        <span class="reassurance-icon">⚠️</span>
        <span>Do not climb on the roof if it's unsafe.</span>
      </div>

      <div class="options">
        <div class="option multi" onclick="toggleMulti(this, 'exteriorDamage', 'missing_shingles')">
          <div class="checkbox"></div>
          <span>Missing or damaged shingles</span>
        </div>
        <div class="option multi" onclick="toggleMulti(this, 'exteriorDamage', 'hole')">
          <div class="checkbox"></div>
          <span>Visible hole or puncture</span>
        </div>
        <div class="option multi" onclick="toggleMulti(this, 'exteriorDamage', 'debris')">
          <div class="checkbox"></div>
          <span>Debris or tree damage</span>
        </div>
        <div class="option multi" onclick="toggleMulti(this, 'exteriorDamage', 'ice_snow')">
          <div class="checkbox"></div>
          <span>Ice or snow buildup</span>
        </div>
        <div class="option multi" onclick="toggleMulti(this, 'exteriorDamage', 'standing_water')">
          <div class="checkbox"></div>
          <span>Standing water</span>
        </div>
        <div class="option multi" onclick="toggleMulti(this, 'exteriorDamage', 'havent_looked')">
          <div class="checkbox"></div>
          <span>I haven't looked / can't safely see</span>
        </div>
      </div>

      <button class="btn btn-primary" onclick="nextStep(5)">Continue</button>
    </div>

    <!-- Step 5: Interior Impact -->
    <div class="step" id="step5">
      <h1 class="step-title">Has the leak caused any of the following?</h1>
      <p class="step-subtitle">Select all that apply.</p>

      <div class="options">
        <div class="option multi" onclick="toggleMulti(this, 'interiorImpact', 'dripping')">
          <div class="checkbox"></div>
          <span>Dripping water</span>
        </div>
        <div class="option multi" onclick="toggleMulti(this, 'interiorImpact', 'wet_insulation')">
          <div class="checkbox"></div>
          <span>Wet insulation</span>
        </div>
        <div class="option multi urgent" onclick="toggleMulti(this, 'interiorImpact', 'sagging')">
          <div class="checkbox"></div>
          <span>Ceiling bubbling or sagging</span>
        </div>
        <div class="option multi urgent" onclick="toggleMulti(this, 'interiorImpact', 'electrical')">
          <div class="checkbox"></div>
          <span>Electrical concerns (lights, outlets nearby)</span>
        </div>
        <div class="option multi" onclick="toggleMulti(this, 'interiorImpact', 'mold')">
          <div class="checkbox"></div>
          <span>Mold or musty smell</span>
        </div>
        <div class="option multi" onclick="toggleMulti(this, 'interiorImpact', 'none')">
          <div class="checkbox"></div>
          <span>None of these yet</span>
        </div>
      </div>

      <button class="btn btn-primary" id="btn5" disabled onclick="nextStep(6)">Continue</button>
    </div>

    <!-- Step 6: Photo Upload -->
    <div class="step" id="step6">
      <h1 class="step-title">Photos help us respond faster.</h1>
      <p class="step-subtitle">If you can safely do so, upload photos of the leak area or roof damage.</p>

      <div id="photoPreview" class="photo-preview"></div>

      <div class="upload-area" id="uploadArea" onclick="document.getElementById('photoInput').click()">
        <div class="upload-icon">📷</div>
        <div class="upload-text">Tap to upload photos</div>
        <div class="upload-hint">Interior leak, ceiling damage, or roof (from ground only)</div>
      </div>
      <input type="file" id="photoInput" class="upload-input" accept="image/*" multiple onchange="handlePhotoUpload(event)">

      <button class="btn btn-primary" onclick="nextStep(7)">Continue</button>
      <span class="skip-link" onclick="nextStep(7)">Skip for now</span>
    </div>

    <!-- Step 7: Contact Info -->
    <div class="step" id="step7">
      <h1 class="step-title">Let's get someone scheduled.</h1>
      <p class="step-subtitle">We'll prioritize stopping the leak and preventing further damage.</p>

      <div class="form-group">
        <label for="name">Full Name</label>
        <input type="text" id="name" placeholder="John Smith" oninput="checkContactForm()">
      </div>

      <div class="form-group">
        <label for="phone">Phone Number</label>
        <input type="tel" id="phone" placeholder="(555) 123-4567" oninput="checkContactForm()">
      </div>

      <div class="form-group">
        <label for="email">Email Address</label>
        <input type="email" id="email" placeholder="john@example.com" oninput="checkContactForm()">
      </div>

      <div class="form-group">
        <label for="availability">Best time to contact</label>
        <select id="availability">
          <option value="now">Call me now / ASAP</option>
          <option value="today">Later today</option>
          <option value="tomorrow">Tomorrow</option>
        </select>
      </div>

      <button class="btn btn-primary" id="btn7" disabled onclick="submitForm()">Get Emergency Help</button>
    </div>

    <!-- Loading State -->
    <div class="loading" id="loading">
      <div class="spinner"></div>
      <div class="loading-text">Submitting your request...</div>
    </div>

    <!-- Step 8: Results -->
    <div class="step" id="step8">
      <div class="results">
        <div class="results-icon">🏠</div>
        <h1 class="results-title">We're ready to help with your roof leak.</h1>
        <div class="priority-badge" id="priorityBadge">High Priority</div>
        <p class="results-message" id="resultsMessage">
          Based on what you shared, this appears to be an active roof leak. We recommend immediate inspection to prevent further damage.
        </p>

        <div class="summary-card">
          <h3>Your Request</h3>
          <div class="summary-item">
            <span class="label">Address</span>
            <span class="value" id="summaryAddress">—</span>
          </div>
          <div class="summary-item">
            <span class="label">Status</span>
            <span class="value" id="summaryStatus">—</span>
          </div>
          <div class="summary-item">
            <span class="label">Photos</span>
            <span class="value" id="summaryPhotos">—</span>
          </div>
        </div>

        <div class="expectation-box">
          <p><strong>What happens next:</strong> Our goal is to stop the leak first, then walk you through your options. We'll contact you shortly to confirm your appointment.</p>
        </div>

        <a href="tel:${tenant.phone}" class="btn btn-primary btn-call">
          📞 Call Now: ${tenant.phone}
        </a>
        <button class="btn btn-secondary" onclick="window.location.reload()">Submit Another Request</button>
      </div>
    </div>

    <div class="powered-by">
      <img src="/favicon.png" alt="Camvasser">
      <span>Powered by Camvasser</span>
    </div>
  </div>

  <script>
    const TENANT = '${tenant.slug}';
    const PHONE = '${tenant.phone}';

    const formData = {
      address: '',
      leakStatus: '',
      leakLocation: [],
      exteriorDamage: [],
      interiorImpact: [],
      photos: [],
      name: '',
      phone: '',
      email: '',
      availability: 'now'
    };

    // Flags
    let safetyRisk = false;
    let structuralRisk = false;

    function nextStep(step) {
      document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
      document.getElementById('step' + step).classList.add('active');

      const progress = (step / 8) * 100;
      document.getElementById('progress').style.width = progress + '%';

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function selectSingle(el, field, value) {
      el.parentElement.querySelectorAll('.option').forEach(opt => opt.classList.remove('selected'));
      el.classList.add('selected');
      formData[field] = value;

      // Enable continue button
      const btnId = 'btn' + document.querySelector('.step.active').id.replace('step', '');
      const btn = document.getElementById(btnId);
      if (btn) btn.disabled = false;
    }

    function toggleMulti(el, field, value) {
      el.classList.toggle('selected');

      if (el.classList.contains('selected')) {
        if (!formData[field].includes(value)) {
          formData[field].push(value);
        }
        // Check for safety/structural flags
        if (value === 'electrical') safetyRisk = true;
        if (value === 'sagging') structuralRisk = true;
      } else {
        formData[field] = formData[field].filter(v => v !== value);
        if (value === 'electrical') safetyRisk = false;
        if (value === 'sagging') structuralRisk = false;
      }

      // Enable button if at least one selected
      const btnId = 'btn' + document.querySelector('.step.active').id.replace('step', '');
      const btn = document.getElementById(btnId);
      if (btn) btn.disabled = formData[field].length === 0;
    }

    function handlePhotoUpload(event) {
      const files = Array.from(event.target.files);
      const preview = document.getElementById('photoPreview');

      files.forEach((file, index) => {
        if (formData.photos.length >= 6) return; // Max 6 photos

        const reader = new FileReader();
        reader.onload = function(e) {
          formData.photos.push({
            name: file.name,
            data: e.target.result
          });

          const thumb = document.createElement('div');
          thumb.className = 'photo-thumb';
          thumb.innerHTML = \`
            <img src="\${e.target.result}" alt="Upload">
            <button class="remove-btn" onclick="removePhoto(\${formData.photos.length - 1}, this.parentElement)">×</button>
          \`;
          preview.appendChild(thumb);
        };
        reader.readAsDataURL(file);
      });
    }

    function removePhoto(index, element) {
      formData.photos.splice(index, 1);
      element.remove();
    }

    function checkContactForm() {
      const name = document.getElementById('name').value.trim();
      const phone = document.getElementById('phone').value.trim();
      const email = document.getElementById('email').value.trim();

      formData.name = name;
      formData.phone = phone;
      formData.email = email;
      formData.availability = document.getElementById('availability').value;

      document.getElementById('btn7').disabled = !(name && phone && email);
    }

    async function submitForm() {
      document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
      document.getElementById('loading').classList.add('active');

      // Calculate priority
      const isHighPriority = formData.leakStatus === 'active' || safetyRisk || structuralRisk;
      const priorityLevel = isHighPriority ? 'high' : 'medium';

      // Prepare flow data
      const flowData = {
        leakStatus: formData.leakStatus,
        leakLocation: formData.leakLocation,
        exteriorDamage: formData.exteriorDamage,
        interiorImpact: formData.interiorImpact,
        safetyRisk: safetyRisk,
        structuralRisk: structuralRisk,
        photosProvided: formData.photos.length > 0,
        photoCount: formData.photos.length,
        availability: formData.availability
      };

      try {
        const response = await fetch('/.netlify/functions/save-flow-lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant: TENANT,
            flowType: 'emergency',
            flowSlug: 'roof-leak-emergency',
            name: formData.name,
            email: formData.email,
            phone: formData.phone,
            address: formData.address,
            flowData: flowData,
            urgencyLevel: priorityLevel
          })
        });

        const result = await response.json();
        console.log('Lead saved:', result);

      } catch (error) {
        console.error('Error saving lead:', error);
      }

      // Show results
      setTimeout(() => {
        document.getElementById('loading').classList.remove('active');
        document.getElementById('step8').classList.add('active');
        document.getElementById('progress').style.width = '100%';

        // Update results page
        const priorityBadge = document.getElementById('priorityBadge');
        if (isHighPriority) {
          priorityBadge.textContent = 'High Priority';
          priorityBadge.className = 'priority-badge high';
          document.getElementById('resultsMessage').textContent =
            'Based on what you shared, this appears to be an active roof leak. We recommend immediate inspection to prevent further damage.';
        } else {
          priorityBadge.textContent = 'Priority Request';
          priorityBadge.className = 'priority-badge medium';
          document.getElementById('resultsMessage').textContent =
            'Based on what you shared, this appears to be a roof leak that still needs prompt attention.';
        }

        // Update summary
        const addressParts = formData.address.split(',');
        document.getElementById('summaryAddress').textContent = addressParts[0] || formData.address;

        const statusLabels = {
          'active': 'Active leak',
          'recent': 'Recent leak',
          'intermittent': 'Intermittent'
        };
        document.getElementById('summaryStatus').textContent = statusLabels[formData.leakStatus] || '—';
        document.getElementById('summaryPhotos').textContent = formData.photos.length > 0 ? formData.photos.length + ' uploaded' : 'None';

      }, 1500);
    }

    // Mapbox initialization
    let map;
    let marker;
    const MAPBOX_TOKEN = '${mapboxToken}';

    function initMap() {
      mapboxgl.accessToken = MAPBOX_TOKEN;

      map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [-94.5786, 39.0997],
        zoom: 8
      });

      const geocoder = new MapboxGeocoder({
        accessToken: MAPBOX_TOKEN,
        mapboxgl: mapboxgl,
        placeholder: 'Enter the address...',
        countries: 'us',
        types: 'address',
        proximity: { longitude: -94.5786, latitude: 39.0997 }
      });

      document.getElementById('geocoder-container').appendChild(geocoder.onAdd(map));

      geocoder.on('result', function(e) {
        const coords = e.result.center;
        const address = e.result.place_name;

        map.flyTo({
          center: coords,
          zoom: 16,
          duration: 1500
        });

        if (marker) marker.remove();
        marker = new mapboxgl.Marker({ color: '#dc2626' })
          .setLngLat(coords)
          .addTo(map);

        formData.address = address;
        document.getElementById('btn1').disabled = false;
      });
    }

    // Drag and drop for photos
    const uploadArea = document.getElementById('uploadArea');

    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      const files = e.dataTransfer.files;
      document.getElementById('photoInput').files = files;
      handlePhotoUpload({ target: { files } });
    });

    // Initialize map on load
    window.addEventListener('load', initMap);

    // Keyboard shortcut
    document.addEventListener('keydown', function(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const input = document.querySelector('.mapboxgl-ctrl-geocoder input');
        if (input) input.focus();
      }
    });
  </script>
</body>
</html>`;
}
