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
  // Mapbox token (needs to be set in Netlify env vars)
  const mapboxToken = process.env.MAPBOX_TOKEN || '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Is Your Dirty Roof Costing You Money? - ${tenant.name}</title>
  <meta name="description" content="Find out how a dirty roof may be costing you money in energy, lifespan, and curb appeal.">
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

    .form-section {
      margin-bottom: 24px;
    }

    .form-section-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--muted);
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .map-preview {
      margin-bottom: 16px;
    }

    .map-preview img {
      width: 100%;
      border-radius: var(--radius);
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

    .streetview-preview {
      margin: 16px 0 0;
      border-radius: var(--radius);
      overflow: hidden;
      background: var(--card);
      border: 1px solid var(--border);
      display: none;
    }

    .streetview-preview.visible {
      display: block;
    }

    .streetview-preview img {
      width: 100%;
      height: 200px;
      object-fit: cover;
    }

    .streetview-preview .caption {
      padding: 12px;
      font-size: 13px;
      color: var(--muted);
      text-align: center;
    }

    .streetview-loading {
      display: none;
      text-align: center;
      padding: 16px 0 0;
      color: var(--muted);
      font-size: 14px;
    }

    .streetview-loading.visible {
      display: block;
    }

    .btn {
      background: var(--primary);
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
      background: var(--primary-hover);
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
        <div class="progress-fill" id="progressFill" style="width: 20%"></div>
      </div>
    </div>

    <!-- Step 1: Address -->
    <div class="step active" id="step1">
      <h1 class="step-title">What's the address of your dirty roof?</h1>
      <p class="step-subtitle">Enter your address and we'll pinpoint your location.</p>

      <div id="map" style="width: 100%; height: 280px; border-radius: var(--radius); overflow: hidden;"></div>
      <div id="geocoder-container" style="margin-top: 12px;"></div>
      <div class="map-caption" style="text-align: center; margin-top: 8px;">Serving the Kansas City Metro Area</div>

      <button class="btn" onclick="nextStep(1)" id="btn1" disabled style="margin-top: 16px;">Continue</button>
    </div>

    <!-- Step 2: Symptoms -->
    <div class="step" id="step2">
      <h1 class="step-title">What do you see when you look at your roof?</h1>
      <p class="step-subtitle">Choose all that apply.</p>

      <div class="options" id="symptomsOptions">
        <div class="option multi" data-value="dark_streaks">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Dark streaks or stains</span>
        </div>
        <div class="option multi" data-value="black_algae">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Black algae spots</span>
        </div>
        <div class="option multi" data-value="green_growth">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Greenish film or growth</span>
        </div>
        <div class="option multi" data-value="moss_lichen">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Moss or lichen patches</span>
        </div>
        <div class="option multi" data-value="granules_in_gutters">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Lots of granules in gutters or at downspouts</span>
        </div>
        <div class="option multi" data-value="dull_faded">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Roof looks dull or faded compared to neighbors</span>
        </div>
        <div class="option multi" data-value="not_sure">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Not sure - I haven't really looked</span>
        </div>
      </div>

      <button class="btn" onclick="nextStep(2)" id="btn2" disabled>Continue</button>
    </div>

    <!-- Step 3: Age & Maintenance -->
    <div class="step" id="step3">
      <h1 class="step-title">Tell us about your roof's age and history.</h1>
      <p class="step-subtitle">This helps us estimate the cost impact.</p>

      <div class="input-group">
        <label for="roofAge">About how old is your roof?</label>
        <select id="roofAge">
          <option value="">Select age...</option>
          <option value="under_10">Under 10 years</option>
          <option value="10_15">10-15 years</option>
          <option value="16_20">16-20 years</option>
          <option value="21_25">21-25 years</option>
          <option value="26_plus_or_unknown">26+ years / not sure</option>
        </select>
      </div>

      <div class="input-group">
        <label for="lastCleaned">When was your roof last cleaned or treated?</label>
        <select id="lastCleaned">
          <option value="">Select...</option>
          <option value="within_1_year">Within the last year</option>
          <option value="one_to_three_years">1-3 years ago</option>
          <option value="three_to_five_years">3-5 years ago</option>
          <option value="five_plus_years">5+ years ago</option>
          <option value="never_or_unknown">Never / not sure</option>
        </select>
      </div>

      <button class="btn" onclick="nextStep(3)" id="btn3" disabled>Continue</button>
    </div>

    <!-- Step 4: Goals -->
    <div class="step" id="step4">
      <h1 class="step-title">What matters most to you?</h1>
      <p class="step-subtitle">Select all that apply.</p>

      <div class="options" id="goalsOptions">
        <div class="option multi" data-value="lower_energy_costs">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Lowering energy/cooling costs</span>
        </div>
        <div class="option multi" data-value="extend_lifespan">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Extending the life of my roof</span>
        </div>
        <div class="option multi" data-value="improve_curb_appeal">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Improving curb appeal / how it looks</span>
        </div>
        <div class="option multi" data-value="protect_home_value">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Protecting home value</span>
        </div>
        <div class="option multi" data-value="prevent_future_issues">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Preventing future leaks or issues</span>
        </div>
        <div class="option multi" data-value="avoid_early_replacement">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Avoiding an early roof replacement</span>
        </div>
        <div class="option multi" data-value="just_learning">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Just learning more right now</span>
        </div>
      </div>

      <button class="btn" onclick="nextStep(4)" id="btn4" disabled>Continue</button>
    </div>

    <!-- Step 5: Lead Capture -->
    <div class="step" id="step5">
      <h1 class="step-title">Where should we send your Roof Condition Savings Report?</h1>
      <p class="step-subtitle">We've analyzed your roof symptoms and can estimate how much a dirty roof may be costing you over time.</p>

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

      <button class="btn" onclick="submitLead()" id="btnSubmit">See My Savings Report</button>
    </div>

    <!-- Loading -->
    <div class="loading" id="loading">
      <div class="spinner"></div>
      <p>Calculating your roof's cost impact...</p>
    </div>

    <!-- Results -->
    <div class="results" id="results">
      <h1 class="step-title">Your Roof Condition Savings Impact</h1>

      <div class="results-card">
        <div class="results-headline" id="resultsHeadline">Your roof's condition may be costing you more than you think.</div>

        <div id="streetviewResultContainer" style="display: none; margin-bottom: 16px;">
          <img id="streetviewResultImage" src="" alt="Your property" style="width: 100%; border-radius: 8px;">
        </div>

        <div class="results-item">
          <span class="results-label">Address</span>
          <span class="results-value" id="resultAddress">-</span>
        </div>
        <div class="results-item">
          <span class="results-label">Visible Symptoms</span>
          <span class="results-value" id="resultSymptoms">-</span>
        </div>
        <div class="results-item">
          <span class="results-label">Roof Age</span>
          <span class="results-value" id="resultAge">-</span>
        </div>
        <div class="results-item">
          <span class="results-label">Last Cleaned</span>
          <span class="results-value" id="resultCleaned">-</span>
        </div>
        <div class="results-item">
          <span class="results-label">Your Goals</span>
          <span class="results-value" id="resultGoals">-</span>
        </div>

        <div class="cost-highlight">
          <div class="label">Estimated Impact on Home Value</div>
          <div class="value" id="resultHomeValueImpact">-</div>
        </div>

        <div class="assessment">
          <div class="assessment-title">Our Assessment</div>
          <div class="assessment-text" id="assessmentText">-</div>
        </div>
      </div>

      <div class="next-steps">
        <p style="text-align: center; font-size: 16px; line-height: 1.6; color: rgba(255,255,255,0.9); margin-bottom: 20px;">
          One of our roof care specialists will reach out with your personalized Savings Report and discuss your options.
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

    // Form state
    let formData = {
      address: '',
      streetviewUrl: '',
      streetviewAvailable: false,
      roofSymptoms: [],
      roofAge: '',
      lastCleaned: '',
      homeownerGoals: [],
      name: '',
      email: '',
      phone: ''
    };

    // Labels for display
    const symptomsLabels = {
      'dark_streaks': 'Dark streaks',
      'black_algae': 'Black algae',
      'green_growth': 'Green growth',
      'moss_lichen': 'Moss/lichen',
      'granules_in_gutters': 'Granules in gutters',
      'dull_faded': 'Dull/faded',
      'not_sure': 'Not sure'
    };

    const ageLabels = {
      'under_10': 'Under 10 years',
      '10_15': '10-15 years',
      '16_20': '16-20 years',
      '21_25': '21-25 years',
      '26_plus_or_unknown': '26+ years / not sure'
    };

    const cleanedLabels = {
      'within_1_year': 'Within the last year',
      'one_to_three_years': '1-3 years ago',
      'three_to_five_years': '3-5 years ago',
      'five_plus_years': '5+ years ago',
      'never_or_unknown': 'Never / not sure'
    };

    const goalsLabels = {
      'lower_energy_costs': 'Lower energy costs',
      'extend_lifespan': 'Extend roof life',
      'improve_curb_appeal': 'Curb appeal',
      'protect_home_value': 'Home value',
      'prevent_future_issues': 'Prevent issues',
      'avoid_early_replacement': 'Avoid replacement',
      'just_learning': 'Learning'
    };

    // Multi select for symptoms
    document.querySelectorAll('#symptomsOptions .option').forEach(opt => {
      opt.addEventListener('click', function() {
        this.classList.toggle('selected');
        const selected = [];
        document.querySelectorAll('#symptomsOptions .option.selected').forEach(o => {
          selected.push(o.dataset.value);
        });
        formData.roofSymptoms = selected;
        document.getElementById('btn2').disabled = selected.length === 0;
      });
    });

    // Multi select for goals
    document.querySelectorAll('#goalsOptions .option').forEach(opt => {
      opt.addEventListener('click', function() {
        this.classList.toggle('selected');
        const selected = [];
        document.querySelectorAll('#goalsOptions .option.selected').forEach(o => {
          selected.push(o.dataset.value);
        });
        formData.homeownerGoals = selected;
        document.getElementById('btn4').disabled = selected.length === 0;
      });
    });

    // Validate step 3 (age and maintenance)
    function validateStep3() {
      const age = document.getElementById('roofAge').value;
      const cleaned = document.getElementById('lastCleaned').value;
      document.getElementById('btn3').disabled = !age || !cleaned;
    }

    document.getElementById('roofAge').addEventListener('change', function() {
      formData.roofAge = this.value;
      validateStep3();
    });

    document.getElementById('lastCleaned').addEventListener('change', function() {
      formData.lastCleaned = this.value;
      validateStep3();
    });

    // Street View fetch via server-side proxy (avoids CORS issues)
    async function fetchStreetView(address) {
      try {
        const response = await fetch(\`/.netlify/functions/streetview?address=\${encodeURIComponent(address)}\`);
        const data = await response.json();

        if (data.available && data.imageUrl) {
          return data.imageUrl;
        }

        console.log('Street View not available:', data.reason);
        return null;
      } catch (error) {
        console.error('Street View fetch error:', error);
        return null;
      }
    }

    // Progress percentages (5 steps)
    const progressSteps = [16, 32, 48, 64, 80, 96, 100];

    async function nextStep(current) {
      // Validate and process current step
      if (current === 1) {
        // Address already set by map interaction
        if (!formData.address) {
          alert('Please enter your address');
          return;
        }
      }

      // Hide current, show next
      document.getElementById('step' + current).classList.remove('active');
      document.getElementById('step' + (current + 1)).classList.add('active');
      document.getElementById('progressFill').style.width = progressSteps[current] + '%';
    }

    function computeCostImpact() {
      const symptoms = formData.roofSymptoms;
      const age = formData.roofAge;
      const cleaned = formData.lastCleaned;

      // Major: heavy growth symptoms + older roof + never cleaned
      const heavySymptoms = ['moss_lichen', 'black_algae', 'green_growth', 'dark_streaks'];
      const hasHeavySymptoms = symptoms.some(s => heavySymptoms.includes(s));
      const isOlderRoof = ['16_20', '21_25', '26_plus_or_unknown'].includes(age);
      const neverCleaned = ['five_plus_years', 'never_or_unknown'].includes(cleaned);

      if (hasHeavySymptoms && isOlderRoof && neverCleaned) {
        return 'major_cost_impact';
      }

      // Moderate: visible symptoms + mid-age roof
      const visibleSymptoms = ['dark_streaks', 'dull_faded', 'granules_in_gutters'];
      const hasVisibleSymptoms = symptoms.some(s => visibleSymptoms.includes(s));
      const isMidAgeRoof = ['10_15', '16_20'].includes(age);

      if (hasVisibleSymptoms && isMidAgeRoof) {
        return 'moderate_cost_impact';
      }

      // Minor: mild symptoms + newer roof + recently cleaned
      const recentlyCleaned = ['within_1_year', 'one_to_three_years', 'three_to_five_years'].includes(cleaned);
      const isNewerRoof = ['under_10', '10_15'].includes(age);

      if (symptoms.includes('dull_faded') && isNewerRoof && recentlyCleaned) {
        return 'minor_cost_impact';
      }

      // Unknown: not sure answers
      if (symptoms.includes('not_sure')) {
        return 'unknown';
      }

      return 'moderate_cost_impact';
    }

    function getHomeValueImpact(impact) {
      const impacts = {
        'major_cost_impact': '-3% to -5% of home value',
        'moderate_cost_impact': '-1% to -3% of home value',
        'minor_cost_impact': 'Up to -1% of home value',
        'unknown': 'Varies - needs a closer look'
      };
      return impacts[impact] || impacts['moderate_cost_impact'];
    }

    function getCostImpactText(impact) {
      const texts = {
        'major_cost_impact': 'Based on what you shared, your roof has significant visible issues that are likely affecting your home\\'s curb appeal and resale value. Buyers notice dirty roofs immediately - it\\'s one of the first things they see. A professional cleaning and treatment can restore your roof\\'s appearance and protect your home\\'s value.',
        'moderate_cost_impact': 'Your roof shows noticeable signs of wear that could be impacting how your home looks from the street. This kind of visible neglect can hurt your home\\'s perceived value and make buyers hesitant. A cleaning and treatment now can improve curb appeal and help maintain your home\\'s worth.',
        'minor_cost_impact': 'Your roof has mild symptoms that are starting to affect its appearance. Addressing these early helps maintain your home\\'s curb appeal and prevents bigger problems down the road.',
        'unknown': 'We need a bit more information to assess the impact on your home\\'s value, but a quick look at your roof can clarify how much curb appeal you may be losing.'
      };
      return texts[impact] || texts['moderate_cost_impact'];
    }

    async function submitLead() {
      // Get form values
      formData.name = document.getElementById('name').value.trim();
      formData.email = document.getElementById('email').value.trim();
      formData.phone = document.getElementById('phone').value.trim();

      if (!formData.name || !formData.email || !formData.phone) {
        alert('Please fill in all fields');
        return;
      }

      // Show loading
      document.getElementById('step5').classList.remove('active');
      document.getElementById('loading').classList.add('active');
      document.getElementById('progressFill').style.width = '95%';

      // Compute cost impact
      const costImpact = computeCostImpact();
      const homeValueImpact = getHomeValueImpact(costImpact);

      // Get UTM params
      const urlParams = new URLSearchParams(window.location.search);

      try {
        const response = await fetch('/.netlify/functions/save-flow-lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant: TENANT,
            flowType: 'educate',
            flowSlug: 'dirty-roof-costs',
            name: formData.name,
            email: formData.email,
            phone: formData.phone,
            address: formData.address,
            urgencyLevel: costImpact === 'major_cost_impact' ? 'high' : (costImpact === 'moderate_cost_impact' ? 'medium' : 'low'),
            qualifyScore: costImpact,
            flowData: {
              roofSymptoms: formData.roofSymptoms,
              roofAge: formData.roofAge,
              lastCleaned: formData.lastCleaned,
              homeownerGoals: formData.homeownerGoals,
              streetviewAvailable: formData.streetviewAvailable,
              streetviewUrl: formData.streetviewUrl,
              estimatedHomeValueImpact: homeValueImpact
            },
            utmSource: urlParams.get('utm_source'),
            utmMedium: urlParams.get('utm_medium'),
            utmCampaign: urlParams.get('utm_campaign')
          })
        });

        const result = await response.json();

        // Show results
        setTimeout(() => {
          document.getElementById('loading').classList.remove('active');
          document.getElementById('results').classList.add('active');
          document.getElementById('progressFill').style.width = '100%';

          // Show Street View in results if available
          if (formData.streetviewAvailable && formData.streetviewUrl) {
            document.getElementById('streetviewResultImage').src = formData.streetviewUrl;
            document.getElementById('streetviewResultContainer').style.display = 'block';
          }

          // Populate results
          document.getElementById('resultAddress').textContent = formData.address;
          document.getElementById('resultSymptoms').textContent = formData.roofSymptoms.map(s => symptomsLabels[s] || s).join(', ');
          document.getElementById('resultAge').textContent = ageLabels[formData.roofAge] || formData.roofAge;
          document.getElementById('resultCleaned').textContent = cleanedLabels[formData.lastCleaned] || formData.lastCleaned;
          document.getElementById('resultGoals').textContent = formData.homeownerGoals.map(g => goalsLabels[g] || g).join(', ');
          document.getElementById('resultHomeValueImpact').textContent = homeValueImpact;
          document.getElementById('assessmentText').textContent = getCostImpactText(costImpact);
        }, 1500);

      } catch (error) {
        console.error('Error:', error);
        alert('Something went wrong. Please try again.');
        document.getElementById('loading').classList.remove('active');
        document.getElementById('step5').classList.add('active');
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
        center: [-94.5786, 39.0997], // KC center [lng, lat]
        zoom: 8
      });

      // Add geocoder search control
      const geocoder = new MapboxGeocoder({
        accessToken: MAPBOX_TOKEN,
        mapboxgl: mapboxgl,
        placeholder: 'Enter your address...',
        countries: 'us',
        types: 'address',
        proximity: { longitude: -94.5786, latitude: 39.0997 }
      });

      // Add geocoder to the address input container
      document.getElementById('geocoder-container').appendChild(geocoder.onAdd(map));

      // Handle result selection
      geocoder.on('result', function(e) {
        const coords = e.result.center;
        const address = e.result.place_name;

        // Fly to location
        map.flyTo({
          center: coords,
          zoom: 16,
          duration: 1500
        });

        // Add marker
        if (marker) marker.remove();
        marker = new mapboxgl.Marker({ color: '${tenant.colors.primary}' })
          .setLngLat(coords)
          .addTo(map);

        // Store address and enable Continue button
        formData.address = address;
        document.getElementById('btn1').disabled = false;
      });
    }

    // Initialize map when page loads
    window.addEventListener('load', initMap);

    // Cmd+K to focus address input
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
