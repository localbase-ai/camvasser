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
  <title>Are Clogged Gutters Damaging Your Roof? - ${tenant.name}</title>
  <meta name="description" content="Find out how clogged or poorly draining gutters may be putting your roof at risk.">
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
      --cta: #059669;
      --cta-hover: #047857;
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

    .progress-bar {
      background: var(--border);
      border-radius: 10px;
      height: 6px;
      width: 200px;
      overflow: hidden;
    }

    .progress-fill {
      background: var(--primary);
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

    .checkbox svg {
      width: 12px;
      height: 12px;
      opacity: 0;
      transition: opacity 0.2s ease;
      stroke: white;
    }

    .option.selected .checkbox svg {
      opacity: 1;
    }

    .input-group {
      margin-bottom: 16px;
    }

    .input-group label {
      display: block;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 6px;
      color: var(--foreground);
    }

    .input-group input,
    .input-group select {
      width: 100%;
      padding: 12px 14px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--card);
      color: var(--foreground);
      font-size: 15px;
      transition: all 0.2s ease;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    }

    .input-group select {
      cursor: pointer;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      background-size: 18px;
      padding-right: 44px;
    }

    .input-group input::placeholder {
      color: #9ca3af;
    }

    .input-group input:focus,
    .input-group select:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 15%, transparent);
    }

    .map-caption {
      font-size: 13px;
      color: var(--muted);
      margin-top: 8px;
    }

    /* Mapbox Geocoder styling */
    .mapboxgl-ctrl-geocoder {
      width: 100% !important;
      max-width: 100% !important;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      border-radius: var(--radius);
      border: 1px solid var(--border);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    }
    .mapboxgl-ctrl-geocoder input {
      padding: 12px 14px 12px 40px;
      font-size: 15px;
      color: var(--foreground);
      height: auto;
    }
    .mapboxgl-ctrl-geocoder input:focus {
      outline: none;
    }
    .mapboxgl-ctrl-geocoder--icon-search {
      left: 12px;
      top: 12px;
      fill: var(--muted);
    }
    .mapboxgl-ctrl-geocoder--suggestion {
      padding: 10px 14px;
      font-size: 14px;
    }
    .mapboxgl-ctrl-geocoder--suggestion:hover {
      background: var(--card-hover);
    }
    .mapboxgl-ctrl-geocoder--suggestion-title {
      color: var(--foreground);
    }
    .mapboxgl-ctrl-geocoder--suggestion-address {
      color: var(--muted);
    }

    .card-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }

    .card-option {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 32px 20px;
      cursor: pointer;
      transition: all 0.2s ease;
      text-align: center;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    }

    .card-option:hover {
      background: var(--card-hover);
      border-color: #d1d5db;
      transform: translateY(-2px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.08);
    }

    .card-option.selected {
      background: color-mix(in srgb, var(--primary) 8%, white);
      border-color: var(--primary);
      box-shadow: 0 0 0 2px var(--primary);
    }

    .card-option .icon {
      width: 48px;
      height: 48px;
      margin: 0 auto 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--muted);
    }

    .card-option.selected .icon {
      color: var(--primary);
    }

    .card-option .icon svg {
      width: 32px;
      height: 32px;
    }

    .card-option .label {
      font-size: 15px;
      font-weight: 600;
      color: var(--foreground);
    }

    .btn {
      background: var(--cta);
      color: #fff;
      border: none;
      border-radius: var(--radius);
      padding: 14px 28px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      width: 100%;
      margin-top: auto;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }

    .btn:hover {
      background: var(--cta-hover);
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
    }

    .btn:disabled {
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    .loading {
      display: none;
      text-align: center;
      padding: 60px 20px;
    }

    .loading.active {
      display: block;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--border);
      border-top-color: var(--primary);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }

    .loading p {
      color: var(--muted);
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .results {
      display: none;
      animation: slideIn 0.4s ease;
    }

    .results.active {
      display: block;
    }

    .results-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    }

    .results-headline {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 16px;
      color: var(--primary);
    }

    .results-item {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid var(--border);
      font-size: 14px;
    }

    .results-item:last-child {
      border-bottom: none;
    }

    .results-label {
      color: var(--muted);
    }

    .results-value {
      font-weight: 500;
      text-align: right;
      max-width: 60%;
      color: var(--foreground);
    }

    .cost-highlight {
      background: #fef3c7;
      border: 1px solid #fbbf24;
      border-radius: 8px;
      padding: 16px;
      margin: 16px 0;
      text-align: center;
    }

    .cost-highlight .label {
      font-size: 12px;
      color: #92400e;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 4px;
    }

    .cost-highlight .value {
      font-size: 24px;
      font-weight: 700;
      color: #b45309;
    }

    .assessment {
      background: color-mix(in srgb, var(--primary) 8%, white);
      border: 1px solid color-mix(in srgb, var(--primary) 20%, white);
      border-radius: var(--radius);
      padding: 16px;
      margin-top: 16px;
    }

    .assessment-title {
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--primary);
    }

    .assessment-text {
      font-size: 14px;
      line-height: 1.6;
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
      .step-title {
        font-size: 20px;
      }
      .option {
        padding: 14px 16px;
        font-size: 14px;
      }
      .header {
        padding: 12px 0;
      }
      .logo {
        height: 40px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="${tenant.logo}" alt="${tenant.name}" class="logo">
      <div class="progress-bar">
        <div class="progress-fill" id="progressFill" style="width: 16%"></div>
      </div>
    </div>

    <!-- Step 1: Address -->
    <div class="step active" id="step1">
      <h1 class="step-title">What is the address with Gutter issues??</h1>
      <p class="step-subtitle">Enter your address and we'll check drainage risk for your area.</p>

      <div id="map" style="width: 100%; height: 280px; border-radius: var(--radius); overflow: hidden;"></div>
      <div id="geocoder-container" style="margin-top: 12px;"></div>
      <div class="map-caption" style="text-align: center; margin-top: 8px;">Serving the Kansas City Metro Area</div>

      <button class="btn" onclick="nextStep(1)" id="btn1" disabled style="margin-top: 16px;">Continue</button>
    </div>

    <!-- Step 2: Gutter Behavior -->
    <div class="step" id="step2">
      <h1 class="step-title">When it rains, what do your gutters do?</h1>
      <p class="step-subtitle">Choose all that apply.</p>

      <div class="options" id="behaviorOptions">
        <div class="option multi" data-value="flows_smooth">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Water flows smoothly through downspouts</span>
        </div>
        <div class="option multi" data-value="spills_over">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Water spills over the sides</span>
        </div>
        <div class="option multi" data-value="pours_corners">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Water pours over corners or seams</span>
        </div>
        <div class="option multi" data-value="sagging">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Gutters sag or pull away in places</span>
        </div>
        <div class="option multi" data-value="pools_foundation">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Water pools near the foundation</span>
        </div>
        <div class="option multi" data-value="dripping_splashing">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>I hear dripping or splashing near the roof edge</span>
        </div>
        <div class="option multi" data-value="not_sure">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Not sure — I haven't paid attention</span>
        </div>
      </div>

      <button class="btn" onclick="nextStep(2)" id="btn2" disabled>Continue</button>
    </div>

    <!-- Step 3: Visible Symptoms -->
    <div class="step" id="step3">
      <h1 class="step-title">Have you noticed any of these around your gutters or roof edges?</h1>
      <p class="step-subtitle">Choose all that apply.</p>

      <div class="options" id="symptomsOptions">
        <div class="option multi" data-value="leaves_debris">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Leaves or debris visible in gutters</span>
        </div>
        <div class="option multi" data-value="dark_streaks">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Dark streaks below gutters</span>
        </div>
        <div class="option multi" data-value="rotting_fascia">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Rotting or peeling fascia boards</span>
        </div>
        <div class="option multi" data-value="rust_corrosion">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Rust, corrosion, or staining on gutters</span>
        </div>
        <div class="option multi" data-value="granules_gutters">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Granules collecting in gutters or at downspouts</span>
        </div>
        <div class="option multi" data-value="ice_buildup">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Ice buildup near roof edges (in winter)</span>
        </div>
        <div class="option multi" data-value="none_not_sure">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>None of these / not sure</span>
        </div>
      </div>

      <button class="btn" onclick="nextStep(3)" id="btn3" disabled>Continue</button>
    </div>

    <!-- Step 4: Maintenance & Environment -->
    <div class="step" id="step4">
      <h1 class="step-title">Tell us about your gutter maintenance and property.</h1>
      <p class="step-subtitle">This helps us estimate the risk level.</p>

      <div class="input-group">
        <label for="cleaningFreq">How often are your gutters cleaned?</label>
        <select id="cleaningFreq">
          <option value="">Select...</option>
          <option value="twice_year">2+ times per year</option>
          <option value="once_year">About once per year</option>
          <option value="every_few_years">Every few years</option>
          <option value="rarely_never">Rarely or never</option>
          <option value="not_sure">Not sure</option>
        </select>
      </div>

      <div class="input-group">
        <label for="treeExposure">What best describes your property?</label>
        <select id="treeExposure">
          <option value="">Select...</option>
          <option value="lots_trees">Lots of nearby trees</option>
          <option value="some_trees">Some trees nearby</option>
          <option value="few_no_trees">Very few or no trees</option>
          <option value="not_sure">Not sure</option>
        </select>
      </div>

      <button class="btn" onclick="nextStep(4)" id="btn4" disabled>Continue</button>
    </div>

    <!-- Step 5: Gutter Guards -->
    <div class="step" id="step5">
      <h1 class="step-title">Have you ever considered gutter guards for this property?</h1>
      <p class="step-subtitle">Gutter guards can help reduce debris buildup and maintenance.</p>

      <div class="card-grid" id="gutterGuardsOptions">
        <div class="card-option" data-value="yes">
          <div class="icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <div class="label">Yes</div>
        </div>
        <div class="card-option" data-value="no">
          <div class="icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </div>
          <div class="label">No</div>
        </div>
      </div>

      <button class="btn" onclick="nextStep(5)" id="btn5" disabled>Continue</button>
    </div>

    <!-- Step 6: Goals -->
    <div class="step" id="step6">
      <h1 class="step-title">What matters most to you about your home exterior?</h1>
      <p class="step-subtitle">Select all that apply.</p>

      <div class="options" id="goalsOptions">
        <div class="option multi" data-value="avoid_roof_damage">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Avoiding roof damage</span>
        </div>
        <div class="option multi" data-value="prevent_water_intrusion">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Preventing water intrusion</span>
        </div>
        <div class="option multi" data-value="reduce_repair_costs">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Reducing long-term repair costs</span>
        </div>
        <div class="option multi" data-value="protect_home_value">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Protecting home value</span>
        </div>
        <div class="option multi" data-value="avoid_surprise_repairs">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Avoiding surprise repairs</span>
        </div>
        <div class="option multi" data-value="just_learning">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Just learning more / being proactive</span>
        </div>
      </div>

      <button class="btn" onclick="nextStep(6)" id="btn6" disabled>Continue</button>
    </div>

    <!-- Step 7: Lead Capture -->
    <div class="step" id="step7">
      <h1 class="step-title">Where should we send your Gutter & Roof Risk Report?</h1>
      <p class="step-subtitle">We can estimate how clogged or poorly draining gutters may be affecting your roof and future repair costs.</p>

      <div class="input-group">
        <label for="name">Full Name</label>
        <input type="text" id="name" placeholder="John Smith">
      </div>

      <div class="input-group">
        <label for="email">Email</label>
        <input type="email" id="email" placeholder="john@example.com">
      </div>

      <div class="input-group">
        <label for="phone">Phone</label>
        <input type="tel" id="phone" placeholder="(555) 123-4567">
      </div>

      <button class="btn" onclick="submitLead()" id="btnSubmit">Get My Risk Report</button>
    </div>

    <!-- Loading -->
    <div class="loading" id="loading">
      <div class="spinner"></div>
      <p>Analyzing your gutter & roof risk...</p>
    </div>

    <!-- Results -->
    <div class="results" id="results">
      <h1 class="step-title">Your Gutter & Roof Risk Report</h1>

      <div class="results-card">
        <div class="results-headline" id="resultsHeadline">Your gutters may be putting your roof at risk.</div>

        <div class="results-item">
          <span class="results-label">Address</span>
          <span class="results-value" id="resultAddress">-</span>
        </div>
        <div class="results-item">
          <span class="results-label">Gutter Behavior</span>
          <span class="results-value" id="resultBehavior">-</span>
        </div>
        <div class="results-item">
          <span class="results-label">Visible Symptoms</span>
          <span class="results-value" id="resultSymptoms">-</span>
        </div>
        <div class="results-item">
          <span class="results-label">Cleaning Frequency</span>
          <span class="results-value" id="resultCleaning">-</span>
        </div>
        <div class="results-item">
          <span class="results-label">Tree Exposure</span>
          <span class="results-value" id="resultTrees">-</span>
        </div>
        <div class="results-item">
          <span class="results-label">Your Goals</span>
          <span class="results-value" id="resultGoals">-</span>
        </div>

        <div class="cost-highlight">
          <div class="label">Estimated Cost Impact</div>
          <div class="value" id="resultCostImpact">-</div>
        </div>

        <div class="assessment">
          <div class="assessment-title">Our Assessment</div>
          <div class="assessment-text" id="assessmentText">-</div>
        </div>
      </div>

      <div class="next-steps">
        <p style="text-align: center; font-size: 15px; line-height: 1.6; color: var(--muted); margin-bottom: 20px;">
          One of our specialists will reach out to discuss your personalized Risk Report and options.
        </p>
        <button class="btn" onclick="callNow()">Call Us Now: ${tenant.phone}</button>
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

    let formData = {
      address: '',
      gutterBehavior: [],
      visibleSymptoms: [],
      cleaningFreq: '',
      treeExposure: '',
      consideredGutterGuards: '',
      goals: [],
      name: '',
      email: '',
      phone: ''
    };

    // Labels for display
    const behaviorLabels = {
      'flows_smooth': 'Flows smoothly',
      'spills_over': 'Spills over sides',
      'pours_corners': 'Pours over corners',
      'sagging': 'Gutters sagging',
      'pools_foundation': 'Pools at foundation',
      'dripping_splashing': 'Dripping/splashing',
      'not_sure': 'Not sure'
    };

    const symptomsLabels = {
      'leaves_debris': 'Leaves/debris',
      'dark_streaks': 'Dark streaks',
      'rotting_fascia': 'Rotting fascia',
      'rust_corrosion': 'Rust/corrosion',
      'granules_gutters': 'Granules in gutters',
      'ice_buildup': 'Ice buildup',
      'none_not_sure': 'None/not sure'
    };

    const cleaningLabels = {
      'twice_year': '2+ times/year',
      'once_year': 'Once/year',
      'every_few_years': 'Every few years',
      'rarely_never': 'Rarely/never',
      'not_sure': 'Not sure'
    };

    const treeLabels = {
      'lots_trees': 'Lots of trees',
      'some_trees': 'Some trees',
      'few_no_trees': 'Few/no trees',
      'not_sure': 'Not sure'
    };

    const goalsLabels = {
      'avoid_roof_damage': 'Avoid roof damage',
      'prevent_water_intrusion': 'Prevent water intrusion',
      'reduce_repair_costs': 'Reduce repair costs',
      'protect_home_value': 'Protect home value',
      'avoid_surprise_repairs': 'Avoid surprises',
      'just_learning': 'Learning'
    };

    // Multi-select handlers
    document.querySelectorAll('#behaviorOptions .option').forEach(opt => {
      opt.addEventListener('click', function() {
        this.classList.toggle('selected');
        const selected = [];
        document.querySelectorAll('#behaviorOptions .option.selected').forEach(o => {
          selected.push(o.dataset.value);
        });
        formData.gutterBehavior = selected;
        document.getElementById('btn2').disabled = selected.length === 0;
      });
    });

    document.querySelectorAll('#symptomsOptions .option').forEach(opt => {
      opt.addEventListener('click', function() {
        this.classList.toggle('selected');
        const selected = [];
        document.querySelectorAll('#symptomsOptions .option.selected').forEach(o => {
          selected.push(o.dataset.value);
        });
        formData.visibleSymptoms = selected;
        document.getElementById('btn3').disabled = selected.length === 0;
      });
    });

    document.querySelectorAll('#goalsOptions .option').forEach(opt => {
      opt.addEventListener('click', function() {
        this.classList.toggle('selected');
        const selected = [];
        document.querySelectorAll('#goalsOptions .option.selected').forEach(o => {
          selected.push(o.dataset.value);
        });
        formData.goals = selected;
        document.getElementById('btn6').disabled = selected.length === 0;
      });
    });

    // Gutter guards card selection (single select)
    document.querySelectorAll('#gutterGuardsOptions .card-option').forEach(opt => {
      opt.addEventListener('click', function() {
        document.querySelectorAll('#gutterGuardsOptions .card-option').forEach(o => o.classList.remove('selected'));
        this.classList.add('selected');
        formData.consideredGutterGuards = this.dataset.value;
        document.getElementById('btn5').disabled = false;
      });
    });

    // Step 4 validation
    function validateStep4() {
      const cleaning = document.getElementById('cleaningFreq').value;
      const trees = document.getElementById('treeExposure').value;
      document.getElementById('btn4').disabled = !cleaning || !trees;
    }

    document.getElementById('cleaningFreq').addEventListener('change', function() {
      formData.cleaningFreq = this.value;
      validateStep4();
    });

    document.getElementById('treeExposure').addEventListener('change', function() {
      formData.treeExposure = this.value;
      validateStep4();
    });

    // Progress percentages (7 steps)
    const progressSteps = [14, 28, 42, 56, 70, 84, 95, 100];

    async function nextStep(current) {
      if (current === 1 && !formData.address) {
        alert('Please enter your address');
        return;
      }

      document.getElementById('step' + current).classList.remove('active');
      document.getElementById('step' + (current + 1)).classList.add('active');
      document.getElementById('progressFill').style.width = progressSteps[current] + '%';
    }

    function computeRiskLevel() {
      const behavior = formData.gutterBehavior;
      const symptoms = formData.visibleSymptoms;
      const cleaning = formData.cleaningFreq;
      const trees = formData.treeExposure;

      // High risk indicators
      const overflowBehaviors = ['spills_over', 'pours_corners', 'sagging', 'pools_foundation'];
      const hasOverflow = behavior.some(b => overflowBehaviors.includes(b));
      const severeSymptoms = ['rotting_fascia', 'granules_gutters', 'ice_buildup'];
      const hasSevereSymptoms = symptoms.some(s => severeSymptoms.includes(s));
      const rarelyCleaned = ['rarely_never', 'every_few_years'].includes(cleaning);
      const highTreeExposure = trees === 'lots_trees';

      if ((hasOverflow && hasSevereSymptoms) || (hasOverflow && rarelyCleaned && highTreeExposure)) {
        return 'high_risk';
      }

      // Moderate risk
      const moderateSymptoms = ['leaves_debris', 'dark_streaks', 'rust_corrosion'];
      const hasModerateSymptoms = symptoms.some(s => moderateSymptoms.includes(s));
      const infrequentCleaning = ['once_year', 'every_few_years'].includes(cleaning);

      if (hasOverflow || (hasModerateSymptoms && infrequentCleaning)) {
        return 'moderate_risk';
      }

      // Unknown
      if (behavior.includes('not_sure') || symptoms.includes('none_not_sure')) {
        return 'unknown';
      }

      return 'low_risk';
    }

    function getCostImpact(risk) {
      const impacts = {
        'high_risk': '$500–$5,000+ over time',
        'moderate_risk': '$250–$1,500 over time',
        'low_risk': '$0–$250 (preventative)',
        'unknown': 'Varies — needs a closer look'
      };
      return impacts[risk] || impacts['moderate_risk'];
    }

    function getAssessmentText(risk) {
      const texts = {
        'high_risk': 'Water backing up at the roof edge can slowly damage shingles, decking, and fascia over time. Addressing gutter issues early often prevents much more expensive roof repairs later.',
        'moderate_risk': 'There are early signs that water may not always be draining correctly. Proactive maintenance now can help avoid moisture-related roof damage.',
        'low_risk': 'Your gutters appear to be doing their job, but periodic checks and maintenance help keep small issues from becoming expensive ones.',
        'unknown': 'We don\\'t have enough information yet, but a quick look can clarify whether your gutters are protecting or putting stress on your roof.'
      };
      return texts[risk] || texts['moderate_risk'];
    }

    async function submitLead() {
      formData.name = document.getElementById('name').value.trim();
      formData.email = document.getElementById('email').value.trim();
      formData.phone = document.getElementById('phone').value.trim();

      if (!formData.name || !formData.email || !formData.phone) {
        alert('Please fill in all fields');
        return;
      }

      document.getElementById('step7').classList.remove('active');
      document.getElementById('loading').classList.add('active');
      document.getElementById('progressFill').style.width = '95%';

      const riskLevel = computeRiskLevel();
      const costImpact = getCostImpact(riskLevel);

      const urlParams = new URLSearchParams(window.location.search);

      try {
        const response = await fetch('/.netlify/functions/save-flow-lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant: TENANT,
            flowType: 'educate',
            flowSlug: 'clogged-gutters-damage',
            name: formData.name,
            email: formData.email,
            phone: formData.phone,
            address: formData.address,
            urgencyLevel: riskLevel === 'high_risk' ? 'high' : (riskLevel === 'moderate_risk' ? 'medium' : 'low'),
            qualifyScore: riskLevel,
            flowData: {
              gutterBehavior: formData.gutterBehavior,
              visibleSymptoms: formData.visibleSymptoms,
              cleaningFreq: formData.cleaningFreq,
              treeExposure: formData.treeExposure,
              consideredGutterGuards: formData.consideredGutterGuards,
              goals: formData.goals,
              estimatedCostImpact: costImpact
            },
            utmSource: urlParams.get('utm_source'),
            utmMedium: urlParams.get('utm_medium'),
            utmCampaign: urlParams.get('utm_campaign')
          })
        });

        const result = await response.json();

        setTimeout(() => {
          document.getElementById('loading').classList.remove('active');
          document.getElementById('results').classList.add('active');
          document.getElementById('progressFill').style.width = '100%';

          document.getElementById('resultAddress').textContent = formData.address;
          document.getElementById('resultBehavior').textContent = formData.gutterBehavior.map(b => behaviorLabels[b] || b).join(', ');
          document.getElementById('resultSymptoms').textContent = formData.visibleSymptoms.map(s => symptomsLabels[s] || s).join(', ');
          document.getElementById('resultCleaning').textContent = cleaningLabels[formData.cleaningFreq] || formData.cleaningFreq;
          document.getElementById('resultTrees').textContent = treeLabels[formData.treeExposure] || formData.treeExposure;
          document.getElementById('resultGoals').textContent = formData.goals.map(g => goalsLabels[g] || g).join(', ');
          document.getElementById('resultCostImpact').textContent = costImpact;
          document.getElementById('assessmentText').textContent = getAssessmentText(riskLevel);
        }, 1500);

      } catch (error) {
        console.error('Error:', error);
        alert('Something went wrong. Please try again.');
        document.getElementById('loading').classList.remove('active');
        document.getElementById('step7').classList.add('active');
      }
    }

    function callNow() {
      window.location.href = 'tel:' + PHONE.replace(/[^0-9]/g, '');
    }

    // Initialize Mapbox
    let map;
    let marker;
    const MAPBOX_TOKEN = '${mapboxToken}';

    function initMap() {
      mapboxgl.accessToken = MAPBOX_TOKEN;

      map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/dark-v11',
        center: [-94.5786, 39.0997],
        zoom: 8
      });

      const geocoder = new MapboxGeocoder({
        accessToken: MAPBOX_TOKEN,
        mapboxgl: mapboxgl,
        placeholder: 'Enter your address...',
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
        marker = new mapboxgl.Marker({ color: '${tenant.colors.primary}' })
          .setLngLat(coords)
          .addTo(map);

        formData.address = address;
        document.getElementById('btn1').disabled = false;
      });
    }

    window.addEventListener('load', initMap);

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
