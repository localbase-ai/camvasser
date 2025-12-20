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
  <title>Is Your Roof at Risk for Ice Dams? - ${tenant.name}</title>
  <meta name="description" content="Find out if your home is at risk for ice dam damage and learn how to protect your roof this winter.">
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

    .input-group input {
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

    .input-group input::placeholder {
      color: #9ca3af;
    }

    .input-group input:focus {
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
      <h1 class="step-title">Where is the home you're asking about?</h1>
      <p class="step-subtitle">We'll check winter weather patterns and ice dam risk for your area.</p>

      <div id="map" style="width: 100%; height: 280px; border-radius: var(--radius); overflow: hidden;"></div>
      <div id="geocoder-container" style="margin-top: 12px;"></div>
      <div class="map-caption" style="text-align: center; margin-top: 8px;">Serving the Kansas City Metro Area</div>

      <button class="btn" onclick="nextStep(1)" id="btn1" disabled style="margin-top: 16px;">Continue</button>
    </div>

    <!-- Step 2: Winter Symptoms -->
    <div class="step" id="step2">
      <h1 class="step-title">During winter, have you noticed any of these around your roof or home?</h1>
      <p class="step-subtitle">Choose all that apply.</p>

      <div class="options" id="symptomsOptions">
        <div class="option multi" data-value="large_icicles">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Large icicles hanging from gutters or roof edges</span>
        </div>
        <div class="option multi" data-value="ice_buildup">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Ice buildup along roof edges</span>
        </div>
        <div class="option multi" data-value="uneven_melting">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Snow melting unevenly on the roof</span>
        </div>
        <div class="option multi" data-value="water_dripping">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Water dripping from soffits or gutters in freezing weather</span>
        </div>
        <div class="option multi" data-value="ice_in_gutters">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Ice forming inside gutters</span>
        </div>
        <div class="option multi" data-value="ceiling_stains">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Interior ceiling stains that appeared in winter</span>
        </div>
        <div class="option multi" data-value="drafts_cold_rooms">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Drafts or cold rooms near the roof</span>
        </div>
        <div class="option multi" data-value="none_not_sure">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>None of these / not sure</span>
        </div>
      </div>

      <button class="btn" onclick="nextStep(2)" id="btn2" disabled>Continue</button>
    </div>

    <!-- Step 3: Roof & Attic Conditions -->
    <div class="step" id="step3">
      <h1 class="step-title">Which of these describes your home?</h1>
      <p class="step-subtitle">These factors affect ice dam likelihood. Choose all that apply.</p>

      <div class="options" id="conditionsOptions">
        <div class="option multi" data-value="older_home">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Home is older (15+ years)</span>
        </div>
        <div class="option multi" data-value="cold_rooms">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Rooms near the roof feel colder than others</span>
        </div>
        <div class="option multi" data-value="old_insulation">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Attic insulation is old or minimal</span>
        </div>
        <div class="option multi" data-value="finished_attic">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Attic has been finished or modified</span>
        </div>
        <div class="option multi" data-value="complex_roof">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Roof has multiple valleys or dormers</span>
        </div>
        <div class="option multi" data-value="not_sure">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>I'm not sure about insulation or attic setup</span>
        </div>
      </div>

      <button class="btn" onclick="nextStep(3)" id="btn3" disabled>Continue</button>
    </div>

    <!-- Step 4: Past Experiences -->
    <div class="step" id="step4">
      <h1 class="step-title">Have you ever dealt with any of these?</h1>
      <p class="step-subtitle">Choose all that apply.</p>

      <div class="options" id="experiencesOptions">
        <div class="option multi" data-value="winter_leaks">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Winter roof leaks or moisture inside</span>
        </div>
        <div class="option multi" data-value="stains_after_snow">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Ceiling or wall stains after snow melts</span>
        </div>
        <div class="option multi" data-value="mold_musty">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Mold or musty smells after winter</span>
        </div>
        <div class="option multi" data-value="gutter_damage">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Gutter damage or pulling away</span>
        </div>
        <div class="option multi" data-value="shingle_damage">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Shingle damage near roof edges</span>
        </div>
        <div class="option multi" data-value="emergency_service">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Ice removal or emergency service calls</span>
        </div>
        <div class="option multi" data-value="none">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>None of these so far</span>
        </div>
      </div>

      <button class="btn" onclick="nextStep(4)" id="btn4" disabled>Continue</button>
    </div>

    <!-- Step 5: Goals -->
    <div class="step" id="step5">
      <h1 class="step-title">What matters most to you about winter roof issues?</h1>
      <p class="step-subtitle">Select all that apply.</p>

      <div class="options" id="goalsOptions">
        <div class="option multi" data-value="prevent_leaks">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Preventing roof leaks</span>
        </div>
        <div class="option multi" data-value="avoid_water_damage">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Avoiding interior water damage</span>
        </div>
        <div class="option multi" data-value="energy_efficiency">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Improving energy efficiency</span>
        </div>
        <div class="option multi" data-value="reduce_heating">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Reducing heating costs</span>
        </div>
        <div class="option multi" data-value="protect_attic">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Protecting insulation and attic</span>
        </div>
        <div class="option multi" data-value="avoid_emergency">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Avoiding emergency winter repairs</span>
        </div>
        <div class="option multi" data-value="just_learning">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Just understanding my risks better</span>
        </div>
      </div>

      <button class="btn" onclick="nextStep(5)" id="btn5" disabled>Continue</button>
    </div>

    <!-- Step 6: Lead Capture -->
    <div class="step" id="step6">
      <h1 class="step-title">Where should we send your Ice Dam Risk Report?</h1>
      <p class="step-subtitle">We'll estimate your home's risk for ice dams and the potential cost impact if they occur.</p>

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
      <p>Analyzing your ice dam risk...</p>
    </div>

    <!-- Results -->
    <div class="results" id="results">
      <h1 class="step-title">Your Ice Dam Risk Report</h1>

      <div class="results-card">
        <div class="results-headline" id="resultsHeadline">Ice dams can cause damage you don't see — here's what your home may be facing.</div>

        <div class="results-item">
          <span class="results-label">Address</span>
          <span class="results-value" id="resultAddress">-</span>
        </div>
        <div class="results-item">
          <span class="results-label">Winter Symptoms</span>
          <span class="results-value" id="resultSymptoms">-</span>
        </div>
        <div class="results-item">
          <span class="results-label">Home Conditions</span>
          <span class="results-value" id="resultConditions">-</span>
        </div>
        <div class="results-item">
          <span class="results-label">Past Experiences</span>
          <span class="results-value" id="resultExperiences">-</span>
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
          <div class="assessment-title">How Ice Dams Form</div>
          <div class="assessment-text" id="assessmentText">-</div>
        </div>
      </div>

      <div class="next-steps">
        <p style="text-align: center; font-size: 15px; line-height: 1.6; color: var(--muted); margin-bottom: 20px;">
          One of our specialists will reach out to discuss your personalized Risk Report and prevention options.
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
      winterSymptoms: [],
      homeConditions: [],
      pastExperiences: [],
      goals: [],
      name: '',
      email: '',
      phone: ''
    };

    // Labels for display
    const symptomsLabels = {
      'large_icicles': 'Large icicles',
      'ice_buildup': 'Ice at roof edges',
      'uneven_melting': 'Uneven snow melt',
      'water_dripping': 'Water dripping',
      'ice_in_gutters': 'Ice in gutters',
      'ceiling_stains': 'Ceiling stains',
      'drafts_cold_rooms': 'Drafts/cold rooms',
      'none_not_sure': 'None/not sure'
    };

    const conditionsLabels = {
      'older_home': 'Older home',
      'cold_rooms': 'Cold rooms near roof',
      'old_insulation': 'Old insulation',
      'finished_attic': 'Finished attic',
      'complex_roof': 'Complex roof',
      'not_sure': 'Not sure'
    };

    const experiencesLabels = {
      'winter_leaks': 'Winter leaks',
      'stains_after_snow': 'Stains after snow',
      'mold_musty': 'Mold/musty smells',
      'gutter_damage': 'Gutter damage',
      'shingle_damage': 'Shingle damage',
      'emergency_service': 'Emergency service',
      'none': 'None'
    };

    const goalsLabels = {
      'prevent_leaks': 'Prevent leaks',
      'avoid_water_damage': 'Avoid water damage',
      'energy_efficiency': 'Energy efficiency',
      'reduce_heating': 'Reduce heating costs',
      'protect_attic': 'Protect attic',
      'avoid_emergency': 'Avoid emergencies',
      'just_learning': 'Learning'
    };

    // Multi-select handlers
    document.querySelectorAll('#symptomsOptions .option').forEach(opt => {
      opt.addEventListener('click', function() {
        this.classList.toggle('selected');
        const selected = [];
        document.querySelectorAll('#symptomsOptions .option.selected').forEach(o => {
          selected.push(o.dataset.value);
        });
        formData.winterSymptoms = selected;
        document.getElementById('btn2').disabled = selected.length === 0;
      });
    });

    document.querySelectorAll('#conditionsOptions .option').forEach(opt => {
      opt.addEventListener('click', function() {
        this.classList.toggle('selected');
        const selected = [];
        document.querySelectorAll('#conditionsOptions .option.selected').forEach(o => {
          selected.push(o.dataset.value);
        });
        formData.homeConditions = selected;
        document.getElementById('btn3').disabled = selected.length === 0;
      });
    });

    document.querySelectorAll('#experiencesOptions .option').forEach(opt => {
      opt.addEventListener('click', function() {
        this.classList.toggle('selected');
        const selected = [];
        document.querySelectorAll('#experiencesOptions .option.selected').forEach(o => {
          selected.push(o.dataset.value);
        });
        formData.pastExperiences = selected;
        document.getElementById('btn4').disabled = selected.length === 0;
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
        document.getElementById('btn5').disabled = selected.length === 0;
      });
    });

    // Progress percentages (6 steps)
    const progressSteps = [16, 32, 48, 64, 80, 95, 100];

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
      const symptoms = formData.winterSymptoms;
      const conditions = formData.homeConditions;
      const experiences = formData.pastExperiences;

      // High risk indicators
      const severeSymptoms = ['ceiling_stains', 'water_dripping', 'large_icicles', 'ice_buildup'];
      const hasSevereSymptoms = symptoms.some(s => severeSymptoms.includes(s));
      const riskConditions = ['cold_rooms', 'old_insulation', 'older_home'];
      const hasRiskConditions = conditions.some(c => riskConditions.includes(c));
      const priorDamage = ['winter_leaks', 'stains_after_snow', 'mold_musty', 'emergency_service'];
      const hasPriorDamage = experiences.some(e => priorDamage.includes(e));

      if ((hasSevereSymptoms && hasRiskConditions) || hasPriorDamage) {
        return 'high_risk';
      }

      // Moderate risk
      const moderateSymptoms = ['uneven_melting', 'ice_in_gutters', 'drafts_cold_rooms'];
      const hasModerateSymptoms = symptoms.some(s => moderateSymptoms.includes(s));
      const uncertainConditions = conditions.includes('not_sure');

      if (hasModerateSymptoms || (hasSevereSymptoms && !hasRiskConditions) || uncertainConditions) {
        return 'moderate_risk';
      }

      // Unknown
      if (symptoms.includes('none_not_sure') && conditions.includes('not_sure')) {
        return 'unknown';
      }

      return 'low_risk';
    }

    function getCostImpact(risk) {
      const impacts = {
        'high_risk': '$1,000–$10,000+',
        'moderate_risk': '$500–$3,000',
        'low_risk': '$0–$500 (preventative)',
        'unknown': 'Varies — needs evaluation'
      };
      return impacts[risk] || impacts['moderate_risk'];
    }

    function getAssessmentText(risk) {
      const texts = {
        'high_risk': 'These conditions make it likely that melting snow refreezes at your roof edges, trapping water and forcing it under shingles. Heat escapes from your home, melts snow on the roof, and the water refreezes at the colder edges — creating ice dams that can damage insulation, decking, and interior finishes over time.',
        'moderate_risk': 'Early warning signs suggest conditions that can lead to ice dams. When heat escapes from your home and melts snow on the roof, that water can refreeze at colder roof edges. Addressing insulation, ventilation, or drainage now can often prevent costly damage later.',
        'low_risk': 'Your home appears to be handling winter conditions well. Ice dams form when heat escapes and melts snow that refreezes at roof edges — but periodic checks help ensure small issues don\\'t become expensive surprises.',
        'unknown': 'We don\\'t have enough information yet to assess your risk. Ice dams form when heat escapes through your roof, melts snow, and that water refreezes at the edges. A quick evaluation can clarify whether your roof and attic are vulnerable.'
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

      document.getElementById('step6').classList.remove('active');
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
            flowSlug: 'ice-dam-prevention',
            name: formData.name,
            email: formData.email,
            phone: formData.phone,
            address: formData.address,
            urgencyLevel: riskLevel === 'high_risk' ? 'high' : (riskLevel === 'moderate_risk' ? 'medium' : 'low'),
            qualifyScore: riskLevel,
            flowData: {
              winterSymptoms: formData.winterSymptoms,
              homeConditions: formData.homeConditions,
              pastExperiences: formData.pastExperiences,
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
          document.getElementById('resultSymptoms').textContent = formData.winterSymptoms.map(s => symptomsLabels[s] || s).join(', ');
          document.getElementById('resultConditions').textContent = formData.homeConditions.map(c => conditionsLabels[c] || c).join(', ');
          document.getElementById('resultExperiences').textContent = formData.pastExperiences.map(e => experiencesLabels[e] || e).join(', ');
          document.getElementById('resultGoals').textContent = formData.goals.map(g => goalsLabels[g] || g).join(', ');
          document.getElementById('resultCostImpact').textContent = costImpact;
          document.getElementById('assessmentText').textContent = getAssessmentText(riskLevel);
        }, 1500);

      } catch (error) {
        console.error('Error:', error);
        alert('Something went wrong. Please try again.');
        document.getElementById('loading').classList.remove('active');
        document.getElementById('step6').classList.add('active');
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
