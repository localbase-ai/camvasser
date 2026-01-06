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
  <title>Roof Ventilation Health Quiz - ${tenant.name}</title>
  <meta name="description" content="Find out how ventilation is the key to restoring and prolonging your roof. Take our quick quiz to assess your home's ventilation health.">
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
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 16px;
      color: var(--primary);
      line-height: 1.4;
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

    .risk-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .risk-badge.high {
      background: #fef2f2;
      color: #dc2626;
      border: 1px solid #fecaca;
    }

    .risk-badge.moderate {
      background: #fffbeb;
      color: #d97706;
      border: 1px solid #fde68a;
    }

    .risk-badge.low {
      background: #f0fdf4;
      color: #16a34a;
      border: 1px solid #bbf7d0;
    }

    .risk-badge.unknown {
      background: #f3f4f6;
      color: #6b7280;
      border: 1px solid #e5e7eb;
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

    .analysis-message {
      background: color-mix(in srgb, var(--primary) 5%, white);
      border: 1px solid color-mix(in srgb, var(--primary) 15%, white);
      border-radius: var(--radius);
      padding: 16px;
      margin: 16px 0;
      text-align: center;
      font-size: 14px;
      color: var(--muted);
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
        <div class="progress-fill" id="progressFill" style="width: 14%"></div>
      </div>
    </div>

    <!-- Step 1: Address -->
    <div class="step active" id="step1">
      <h1 class="step-title">Where is the home you're asking about?</h1>
      <p class="step-subtitle">We'll check climate conditions and common roof ventilation patterns for homes in your area.</p>

      <div id="map" style="width: 100%; height: 280px; border-radius: var(--radius); overflow: hidden;"></div>
      <div id="geocoder-container" style="margin-top: 12px;"></div>
      <div class="map-caption" style="text-align: center; margin-top: 8px;">Serving the Kansas City Metro Area</div>

      <div class="analysis-message" id="analysisMessage" style="display: none;">
        Checking climate conditions and common roof ventilation patterns for homes in your area…
      </div>

      <button class="btn" onclick="nextStep(1)" id="btn1" disabled style="margin-top: 16px;">Continue</button>
    </div>

    <!-- Step 2: Roof Snow & Melt Patterns -->
    <div class="step" id="step2">
      <h1 class="step-title">Does Your Roof Look Like This When It Snows?</h1>
      <img src="/images/melt-pattern.jpg" alt="Roof showing uneven snow melt patterns indicating ventilation issues" style="width: 100%; border-radius: var(--radius); margin-bottom: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
      <p class="step-subtitle">Uneven melt patterns are often the first visible sign of ventilation issues. Choose all that apply.</p>

      <div class="options" id="meltPatternsOptions">
        <div class="option multi" data-value="melts_evenly">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Snow melts evenly across the entire roof</span>
        </div>
        <div class="option multi" data-value="sections_faster">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Some sections melt much faster than others</span>
        </div>
        <div class="option multi" data-value="bare_patches">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Bare roof patches appear while other areas stay snow-covered</span>
        </div>
        <div class="option multi" data-value="ridge_melts_first">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Snow melts near the ridge but stays frozen near the edges</span>
        </div>
        <div class="option multi" data-value="refreezes_edges">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Ice or snow refreezes along roof edges or gutters</span>
        </div>
        <div class="option multi" data-value="not_noticed">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>I haven't noticed / not sure</span>
        </div>
      </div>

      <button class="btn" onclick="nextStep(2)" id="btn2" disabled>Continue</button>
    </div>

    <!-- Step 3: Comfort & Energy Symptoms -->
    <div class="step" id="step3">
      <h1 class="step-title">Have you noticed any of the following inside your home?</h1>
      <p class="step-subtitle">These symptoms often indicate attic heat and airflow imbalance. Choose all that apply.</p>

      <div class="options" id="comfortSymptomsOptions">
        <div class="option multi" data-value="upstairs_hot_summer">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Upstairs rooms are significantly hotter in summer</span>
        </div>
        <div class="option multi" data-value="upstairs_cold_winter">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Upstairs rooms are colder in winter</span>
        </div>
        <div class="option multi" data-value="high_bills">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>High heating or cooling bills</span>
        </div>
        <div class="option multi" data-value="hvac_struggles">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>HVAC runs constantly but struggles to keep up</span>
        </div>
        <div class="option multi" data-value="musty_smells">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Musty or stale smells upstairs or in closets</span>
        </div>
        <div class="option multi" data-value="comfort_none">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>None of these / not sure</span>
        </div>
      </div>

      <button class="btn" onclick="nextStep(3)" id="btn3" disabled>Continue</button>
    </div>

    <!-- Step 4: Roof & Attic Indicators -->
    <div class="step" id="step4">
      <h1 class="step-title">Have you noticed any of the following related to your roof or attic?</h1>
      <p class="step-subtitle">These are common downstream effects of poor ventilation. Choose all that apply.</p>

      <div class="options" id="roofIndicatorsOptions">
        <div class="option multi" data-value="shingles_aging">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Shingles aging or failing earlier than expected</span>
        </div>
        <div class="option multi" data-value="curling_shingles">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Curling or brittle shingles</span>
        </div>
        <div class="option multi" data-value="ice_dams">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Ice dams or large icicles forming</span>
        </div>
        <div class="option multi" data-value="attic_moisture">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Moisture, mold, or frost in the attic</span>
        </div>
        <div class="option multi" data-value="rusted_nails">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Rusted nails or metal components in the attic</span>
        </div>
        <div class="option multi" data-value="attic_hot">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Attic feels extremely hot in summer</span>
        </div>
        <div class="option multi" data-value="roof_not_sure">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>I'm not sure / haven't looked</span>
        </div>
      </div>

      <button class="btn" onclick="nextStep(4)" id="btn4" disabled>Continue</button>
    </div>

    <!-- Step 5: Home & Attic Setup -->
    <div class="step" id="step5">
      <h1 class="step-title">Which best describes your home or attic setup?</h1>
      <p class="step-subtitle">These factors increase ventilation imbalance risk. Choose all that apply.</p>

      <div class="options" id="homeSetupOptions">
        <div class="option multi" data-value="home_15_plus">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Home is 15+ years old</span>
        </div>
        <div class="option multi" data-value="limited_vents">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Attic has limited or no visible intake/exhaust vents</span>
        </div>
        <div class="option multi" data-value="old_insulation">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Attic insulation is old, uneven, or compressed</span>
        </div>
        <div class="option multi" data-value="finished_attic">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Attic has been finished or modified</span>
        </div>
        <div class="option multi" data-value="complex_roof">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Roof has a complex layout (valleys, dormers, multiple slopes)</span>
        </div>
        <div class="option multi" data-value="setup_not_sure">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>I'm not sure about attic setup</span>
        </div>
      </div>

      <button class="btn" onclick="nextStep(5)" id="btn5" disabled>Continue</button>
    </div>

    <!-- Step 6: Homeowner Goals -->
    <div class="step" id="step6">
      <h1 class="step-title">What matters most to you when it comes to your roof and home comfort?</h1>
      <p class="step-subtitle">Select all that apply.</p>

      <div class="options" id="goalsOptions">
        <div class="option multi" data-value="extend_roof_life">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Extending the life of my roof</span>
        </div>
        <div class="option multi" data-value="lower_energy_costs">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Lowering energy costs</span>
        </div>
        <div class="option multi" data-value="improve_comfort">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Improving comfort upstairs</span>
        </div>
        <div class="option multi" data-value="prevent_moisture">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Preventing moisture or mold issues</span>
        </div>
        <div class="option multi" data-value="avoid_ice_dams">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Avoiding ice dams or winter roof damage</span>
        </div>
        <div class="option multi" data-value="avoid_replacement">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Avoiding premature roof replacement</span>
        </div>
        <div class="option multi" data-value="just_learning">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg></div>
          <span>Just learning more</span>
        </div>
      </div>

      <button class="btn" onclick="nextStep(6)" id="btn6" disabled>Continue</button>
    </div>

    <!-- Step 7: Lead Capture -->
    <div class="step" id="step7">
      <h1 class="step-title">Where should we send your personalized Roof Ventilation Report?</h1>
      <p class="step-subtitle">Based on what you shared, we can estimate whether ventilation issues may be causing uneven roof temperatures, shortening roof life, and increasing energy costs.</p>

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

      <button class="btn" onclick="submitLead()" id="btnSubmit">Get My Ventilation Report</button>
    </div>

    <!-- Loading -->
    <div class="loading" id="loading">
      <div class="spinner"></div>
      <p>Analyzing your ventilation health...</p>
    </div>

    <!-- Results -->
    <div class="results" id="results">
      <h1 class="step-title">Your Roof Ventilation Report</h1>

      <div class="results-card">
        <div class="results-headline">Uneven roof temperatures are often a ventilation issue — here's what that means for your roof.</div>

        <div class="results-item">
          <span class="results-label">Address</span>
          <span class="results-value" id="resultAddress">-</span>
        </div>
        <div class="results-item">
          <span class="results-label">Roof Melt Patterns</span>
          <span class="results-value" id="resultMeltPatterns">-</span>
        </div>
        <div class="results-item">
          <span class="results-label">Comfort & Energy</span>
          <span class="results-value" id="resultComfortSymptoms">-</span>
        </div>
        <div class="results-item">
          <span class="results-label">Roof & Attic Signs</span>
          <span class="results-value" id="resultRoofIndicators">-</span>
        </div>
        <div class="results-item">
          <span class="results-label">Ventilation Risk Level</span>
          <span class="results-value"><span class="risk-badge" id="resultRiskBadge">-</span></span>
        </div>

        <div class="cost-highlight">
          <div class="label">Estimated Cost & Impact Range</div>
          <div class="value" id="resultCostImpact">-</div>
        </div>

        <div class="assessment">
          <div class="assessment-title">What This Means for Your Roof</div>
          <div class="assessment-text" id="assessmentText">-</div>
        </div>
      </div>

      <div class="next-steps">
        <p style="text-align: center; font-size: 15px; line-height: 1.6; color: var(--muted); margin-bottom: 20px;">
          One of our specialists will reach out to discuss your personalized Ventilation Report and options for improving airflow.
        </p>
        <button class="btn" onclick="callNow()">Get Your Roof Ventilation Report</button>
        <button class="btn btn-secondary" onclick="callNow()">Request a No-Pressure Ventilation & Roof Inspection</button>
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
      climateZone: '',
      meltPatterns: [],
      comfortSymptoms: [],
      roofIndicators: [],
      homeSetup: [],
      goals: [],
      name: '',
      email: '',
      phone: ''
    };

    // Labels for display
    const meltPatternsLabels = {
      'melts_evenly': 'Melts evenly',
      'sections_faster': 'Uneven melting',
      'bare_patches': 'Bare patches',
      'ridge_melts_first': 'Ridge melts first',
      'refreezes_edges': 'Refreezes at edges',
      'not_noticed': 'Not noticed'
    };

    const comfortSymptomsLabels = {
      'upstairs_hot_summer': 'Hot upstairs (summer)',
      'upstairs_cold_winter': 'Cold upstairs (winter)',
      'high_bills': 'High energy bills',
      'hvac_struggles': 'HVAC struggles',
      'musty_smells': 'Musty smells',
      'comfort_none': 'None'
    };

    const roofIndicatorsLabels = {
      'shingles_aging': 'Early shingle aging',
      'curling_shingles': 'Curling shingles',
      'ice_dams': 'Ice dams/icicles',
      'attic_moisture': 'Attic moisture/mold',
      'rusted_nails': 'Rusted attic metal',
      'attic_hot': 'Very hot attic',
      'roof_not_sure': 'Not sure'
    };

    const homeSetupLabels = {
      'home_15_plus': '15+ year old home',
      'limited_vents': 'Limited vents',
      'old_insulation': 'Old insulation',
      'finished_attic': 'Finished attic',
      'complex_roof': 'Complex roof',
      'setup_not_sure': 'Not sure'
    };

    const goalsLabels = {
      'extend_roof_life': 'Extend roof life',
      'lower_energy_costs': 'Lower energy costs',
      'improve_comfort': 'Improve comfort',
      'prevent_moisture': 'Prevent moisture',
      'avoid_ice_dams': 'Avoid ice dams',
      'avoid_replacement': 'Avoid early replacement',
      'just_learning': 'Learning more'
    };

    // Multi-select handlers
    function setupMultiSelect(containerId, dataKey, buttonId) {
      document.querySelectorAll('#' + containerId + ' .option').forEach(opt => {
        opt.addEventListener('click', function() {
          this.classList.toggle('selected');
          const selected = [];
          document.querySelectorAll('#' + containerId + ' .option.selected').forEach(o => {
            selected.push(o.dataset.value);
          });
          formData[dataKey] = selected;
          document.getElementById(buttonId).disabled = selected.length === 0;
        });
      });
    }

    setupMultiSelect('meltPatternsOptions', 'meltPatterns', 'btn2');
    setupMultiSelect('comfortSymptomsOptions', 'comfortSymptoms', 'btn3');
    setupMultiSelect('roofIndicatorsOptions', 'roofIndicators', 'btn4');
    setupMultiSelect('homeSetupOptions', 'homeSetup', 'btn5');
    setupMultiSelect('goalsOptions', 'goals', 'btn6');

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

    function computeVentilationRisk() {
      const melt = formData.meltPatterns;
      const comfort = formData.comfortSymptoms;
      const roof = formData.roofIndicators;
      const setup = formData.homeSetup;

      // High risk indicators
      const unevenMeltIndicators = ['sections_faster', 'bare_patches', 'ridge_melts_first', 'refreezes_edges'];
      const hasUnevenMelt = melt.some(m => unevenMeltIndicators.includes(m));

      const severeRoofIssues = ['ice_dams', 'attic_moisture', 'attic_hot', 'rusted_nails'];
      const hasSevereRoofIssues = roof.some(r => severeRoofIssues.includes(r));

      const comfortIssues = ['upstairs_hot_summer', 'upstairs_cold_winter', 'hvac_struggles', 'musty_smells'];
      const hasComfortIssues = comfort.some(c => comfortIssues.includes(c));

      // High risk: uneven melt + (ice dams OR moisture OR hot attic)
      if (hasUnevenMelt && hasSevereRoofIssues) {
        return 'high_risk';
      }

      // High risk: multiple severe roof issues
      const severeCount = roof.filter(r => severeRoofIssues.includes(r)).length;
      if (severeCount >= 2) {
        return 'high_risk';
      }

      // Moderate risk: some uneven melting OR comfort/energy issues OR uncertainty about setup
      const hasModerateIndicators = hasUnevenMelt || hasComfortIssues || setup.includes('setup_not_sure');
      const hasRiskFactors = setup.some(s => ['limited_vents', 'old_insulation', 'finished_attic'].includes(s));

      if (hasModerateIndicators || (hasSevereRoofIssues && !hasUnevenMelt) || hasRiskFactors) {
        return 'moderate_risk';
      }

      // Unknown: mostly "not sure" responses
      const notSureCount = [
        melt.includes('not_noticed'),
        comfort.includes('comfort_none'),
        roof.includes('roof_not_sure'),
        setup.includes('setup_not_sure')
      ].filter(Boolean).length;

      if (notSureCount >= 3) {
        return 'unknown';
      }

      // Low risk: even melt patterns, minimal issues
      if (melt.includes('melts_evenly') && !hasSevereRoofIssues) {
        return 'low_risk';
      }

      return 'moderate_risk';
    }

    function getCostImpact(risk) {
      const impacts = {
        'high_risk': '$1,000–$8,000+',
        'moderate_risk': '$500–$3,000',
        'low_risk': '$0–$500 (preventative)',
        'unknown': 'Varies — depends on attic airflow'
      };
      return impacts[risk] || impacts['moderate_risk'];
    }

    function getRiskLabel(risk) {
      const labels = {
        'high_risk': 'High Risk',
        'moderate_risk': 'Moderate Risk',
        'low_risk': 'Low Risk',
        'unknown': 'Unknown'
      };
      return labels[risk] || 'Unknown';
    }

    function getRiskClass(risk) {
      const classes = {
        'high_risk': 'high',
        'moderate_risk': 'moderate',
        'low_risk': 'low',
        'unknown': 'unknown'
      };
      return classes[risk] || 'unknown';
    }

    function getAssessmentText(risk) {
      const texts = {
        'high_risk': 'These signs suggest uneven attic temperatures caused by poor airflow. Heat escaping from your living space warms certain roof sections, causing snow to melt inconsistently. That water can refreeze at colder sections — stressing shingles, decking, and insulation. Over time, this can shorten roof life, increase energy costs, and lead to moisture-related damage.',
        'moderate_risk': 'There are early signs of ventilation imbalance. When attic airflow is restricted, heat builds up and affects roof temperature consistency. Improving airflow can often stabilize roof temperatures, reduce energy loss, and help protect shingles and insulation from premature wear.',
        'low_risk': 'Your roof appears to maintain consistent temperatures, which is what proper ventilation is designed to do. When airflow is balanced, heat doesn\\'t build up in the attic, snow melts evenly, and shingles last longer. Periodic checks help ensure this continues.',
        'unknown': 'We don\\'t yet have enough information to assess ventilation health. Roof ventilation affects how heat moves through your attic — when airflow is restricted, it can cause uneven roof temperatures, higher energy bills, and accelerated shingle wear. A quick evaluation can clarify whether uneven roof temperatures are a concern.'
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

      const riskLevel = computeVentilationRisk();
      const costImpact = getCostImpact(riskLevel);

      const urlParams = new URLSearchParams(window.location.search);

      try {
        const response = await fetch('/.netlify/functions/save-flow-lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant: TENANT,
            flowType: 'educate',
            flowSlug: 'roof-ventilation-issues',
            name: formData.name,
            email: formData.email,
            phone: formData.phone,
            address: formData.address,
            urgencyLevel: riskLevel === 'high_risk' ? 'high' : (riskLevel === 'moderate_risk' ? 'medium' : 'low'),
            qualifyScore: riskLevel,
            flowData: {
              climateZone: formData.climateZone,
              meltPatterns: formData.meltPatterns,
              comfortSymptoms: formData.comfortSymptoms,
              roofIndicators: formData.roofIndicators,
              homeSetup: formData.homeSetup,
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
          document.getElementById('resultMeltPatterns').textContent = formData.meltPatterns.map(m => meltPatternsLabels[m] || m).join(', ') || '-';
          document.getElementById('resultComfortSymptoms').textContent = formData.comfortSymptoms.map(c => comfortSymptomsLabels[c] || c).join(', ') || '-';
          document.getElementById('resultRoofIndicators').textContent = formData.roofIndicators.map(r => roofIndicatorsLabels[r] || r).join(', ') || '-';

          const riskBadge = document.getElementById('resultRiskBadge');
          riskBadge.textContent = getRiskLabel(riskLevel);
          riskBadge.className = 'risk-badge ' + getRiskClass(riskLevel);

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

    // Determine climate zone based on latitude
    function getClimateZone(lat) {
      if (lat >= 40) return 'cold';
      if (lat <= 33) return 'hot';
      return 'mixed';
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
        const lat = coords[1];

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
        formData.climateZone = getClimateZone(lat);

        // Show analysis message briefly
        document.getElementById('analysisMessage').style.display = 'block';
        setTimeout(() => {
          document.getElementById('btn1').disabled = false;
        }, 1500);
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
