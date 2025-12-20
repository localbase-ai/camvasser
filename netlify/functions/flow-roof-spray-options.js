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
  <title>Roof Spray vs Sealant Options - ${tenant.name}</title>
  <meta name="description" content="Find out if roof spray or sealant treatment is right for your roof. Take our quick quiz.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

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

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--background);
      min-height: 100vh;
      color: var(--foreground);
      line-height: 1.5;
    }

    /* Header */
    .header {
      position: sticky;
      top: 0;
      z-index: 50;
      background: rgba(255, 255, 255, 0.8);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--border);
      padding: 1rem 1.5rem;
    }

    .header-inner {
      max-width: 56rem;
      margin: 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .logo {
      height: 48px;
      border-radius: 8px;
    }

    .progress-container {
      flex: 1;
      max-width: 20rem;
      margin: 0 2rem;
    }

    .progress-bar {
      height: 6px;
      background: var(--border);
      border-radius: 100px;
      overflow: hidden;
    }

    .progress-fill {
      height: 100%;
      background: var(--primary);
      border-radius: 100px;
      transition: width 0.5s ease-out;
    }

    .header-spacer {
      width: 48px;
    }

    /* Main Content */
    .main {
      max-width: 56rem;
      margin: 0 auto;
      padding: 3rem 1.5rem 4rem;
    }

    /* Steps */
    .step {
      display: none;
      animation: fadeSlideIn 0.5s ease-out;
    }

    .step.active {
      display: block;
    }

    @keyframes fadeSlideIn {
      from {
        opacity: 0;
        transform: translateY(16px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    /* Typography */
    .step-header {
      text-align: center;
      margin-bottom: 2.5rem;
    }

    .step-title {
      font-size: clamp(1.75rem, 5vw, 2.5rem);
      font-weight: 700;
      color: var(--foreground);
      margin-bottom: 0.75rem;
      line-height: 1.2;
      text-wrap: balance;
    }

    .step-subtitle {
      font-size: 1.125rem;
      color: var(--muted);
      max-width: 32rem;
      margin: 0 auto;
    }

    /* Option List - Vertical list style */
    .options-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      max-width: 32rem;
      margin: 0 auto 2rem;
    }

    .option-row {
      display: flex;
      align-items: center;
      gap: 1rem;
      background: var(--card);
      border: 2px solid var(--border);
      border-radius: var(--radius);
      padding: 1rem 1.25rem;
      cursor: pointer;
      transition: all 0.2s ease;
      text-align: left;
    }

    .option-row:hover {
      border-color: color-mix(in srgb, var(--primary) 50%, transparent);
      background: var(--card-hover);
    }

    .option-row.selected {
      border-color: var(--primary);
      background: color-mix(in srgb, var(--primary) 5%, white);
    }

    .option-label {
      flex: 1;
      font-size: 1rem;
      font-weight: 500;
      color: var(--foreground);
    }

    /* Checkbox for multi-select */
    .checkbox {
      width: 1.5rem;
      height: 1.5rem;
      border: 2px solid var(--border);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: all 0.2s ease;
      background: var(--card);
    }

    .option-row.selected .checkbox {
      background: var(--primary);
      border-color: var(--primary);
    }

    .checkbox svg {
      width: 14px;
      height: 14px;
      stroke: white;
      stroke-width: 3;
      opacity: 0;
      transition: opacity 0.2s ease;
    }

    .option-row.selected .checkbox svg {
      opacity: 1;
    }

    /* Form Section */
    .form-section {
      max-width: 32rem;
      margin: 0 auto 2rem;
    }

    .form-section-title {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--muted);
      margin-bottom: 1rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Form inputs */
    .form-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 2rem;
      max-width: 28rem;
      margin: 0 auto;
    }

    .input-group {
      margin-bottom: 1.25rem;
    }

    .input-group:last-of-type {
      margin-bottom: 1.5rem;
    }

    .input-group label {
      display: block;
      font-size: 0.875rem;
      font-weight: 500;
      margin-bottom: 0.5rem;
      color: var(--foreground);
    }

    .input-group input,
    .input-group select {
      width: 100%;
      padding: 0.875rem 1rem;
      border: 2px solid var(--border);
      border-radius: 0.5rem;
      background: var(--background);
      color: var(--foreground);
      font-size: 1rem;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }

    .input-group select {
      cursor: pointer;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      background-size: 20px;
      padding-right: 44px;
    }

    .input-group input::placeholder {
      color: var(--muted);
    }

    .input-group input:focus,
    .input-group select:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 20%, transparent);
    }

    .conditional-field {
      display: none;
      margin-top: 1rem;
    }

    .conditional-field.visible {
      display: block;
    }

    /* Buttons */
    .btn-container {
      max-width: 32rem;
      margin: 0 auto;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      background: var(--cta);
      color: white;
      border: none;
      border-radius: 0.5rem;
      padding: 1rem 2rem;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      width: 100%;
    }

    .btn:hover {
      background: var(--cta-hover);
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn svg {
      width: 1.25rem;
      height: 1.25rem;
    }

    /* Loading */
    .loading {
      display: none;
      text-align: center;
      padding: 4rem 2rem;
    }

    .loading.active {
      display: block;
    }

    .spinner {
      width: 48px;
      height: 48px;
      border: 3px solid var(--border);
      border-top-color: var(--primary);
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 1.5rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .loading p {
      color: var(--muted);
      font-size: 1.125rem;
    }

    /* Results */
    .results {
      display: none;
      animation: fadeSlideIn 0.5s ease-out;
    }

    .results.active {
      display: block;
    }

    .results-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 2rem;
      max-width: 32rem;
      margin: 0 auto 2rem;
    }

    .results-headline {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--primary);
      margin-bottom: 1.5rem;
      line-height: 1.4;
    }

    .results-item {
      display: flex;
      justify-content: space-between;
      padding: 0.875rem 0;
      border-bottom: 1px solid var(--border);
      font-size: 0.9375rem;
    }

    .results-item:last-of-type {
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

    .assessment {
      background: color-mix(in srgb, var(--primary) 8%, white);
      border: 1px solid color-mix(in srgb, var(--primary) 20%, transparent);
      border-radius: 0.5rem;
      padding: 1.25rem;
      margin-top: 1.5rem;
    }

    .assessment-title {
      font-weight: 600;
      margin-bottom: 0.5rem;
      color: var(--primary);
    }

    .assessment-text {
      font-size: 0.9375rem;
      line-height: 1.6;
      color: var(--foreground);
    }

    .next-steps {
      max-width: 32rem;
      margin: 0 auto;
    }

    .next-steps p {
      text-align: center;
      font-size: 1rem;
      color: var(--muted);
      margin-bottom: 1.5rem;
    }

    /* Footer */
    .powered-by {
      text-align: center;
      padding: 2rem;
      font-size: 0.75rem;
      color: var(--muted);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .powered-by img {
      height: 16px;
    }

    /* Responsive */
    @media (max-width: 640px) {
      .progress-container {
        display: none;
      }

      .main {
        padding: 2rem 1rem 3rem;
      }

      .form-card {
        padding: 1.5rem;
      }
    }
  </style>
</head>
<body>
  <header class="header">
    <div class="header-inner">
      <img src="${tenant.logo}" alt="${tenant.name}" class="logo">
      <div class="progress-container">
        <div class="progress-bar">
          <div class="progress-fill" id="progressFill" style="width: 25%"></div>
        </div>
      </div>
      <div class="header-spacer"></div>
    </div>
  </header>

  <main class="main">
    <!-- Step 1: Address -->
    <div class="step active" id="step1">
      <div class="step-header">
        <h1 class="step-title">Where is the roof you're considering treatment for?</h1>
        <p class="step-subtitle">We'll use this to check roof age averages and weather patterns for your area.</p>
      </div>

      <div class="form-card">
        <div class="input-group">
          <label for="address">Property Address</label>
          <input type="text" id="address" placeholder="123 Main St, City, State" autocomplete="street-address">
        </div>
        <button class="btn" onclick="nextStep(1)" id="btn1">
          Continue
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
      </div>
    </div>

    <!-- Step 2: Roof Type & Age -->
    <div class="step" id="step2">
      <div class="step-header">
        <h1 class="step-title">Tell us about your roof</h1>
        <p class="step-subtitle">This helps us determine which treatment options might work best.</p>
      </div>

      <div class="form-card">
        <div class="input-group">
          <label for="roofMaterial">What type of roof do you have?</label>
          <select id="roofMaterial">
            <option value="">Select roof type...</option>
            <option value="asphalt_shingles">Asphalt shingles</option>
            <option value="architectural_shingles">Architectural / laminate shingles</option>
            <option value="metal">Metal</option>
            <option value="tile">Tile</option>
            <option value="flat_low_slope">Flat / low-slope (TPO, EPDM, etc.)</option>
            <option value="not_sure">Not sure</option>
          </select>
        </div>

        <div class="input-group">
          <label for="roofAge">About how old is your roof?</label>
          <select id="roofAge">
            <option value="">Select age...</option>
            <option value="under_5">Less than 5 years</option>
            <option value="5_10">5-10 years</option>
            <option value="11_15">11-15 years</option>
            <option value="16_20">16-20 years</option>
            <option value="21_25">21-25 years</option>
            <option value="26_plus_or_unknown">26+ years / not sure</option>
          </select>
        </div>

        <button class="btn" onclick="nextStep(2)" id="btn2" disabled>
          Continue
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
      </div>
    </div>

    <!-- Step 3: Condition & Goals -->
    <div class="step" id="step3">
      <div class="step-header">
        <h1 class="step-title">Roof condition and your goals</h1>
        <p class="step-subtitle">Select all that apply in each section.</p>
      </div>

      <div class="form-section">
        <div class="form-section-title">Current Condition</div>
        <div class="options-list" id="conditionOptions">
          <div class="option-row" data-value="worn_faded">
            <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></div>
            <span class="option-label">Some shingles look worn or faded</span>
          </div>
          <div class="option-row" data-value="curling_brittle">
            <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></div>
            <span class="option-label">Curling or brittle shingles</span>
          </div>
          <div class="option-row" data-value="granules_in_gutters">
            <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></div>
            <span class="option-label">Granules in gutters or at downspouts</span>
          </div>
          <div class="option-row" data-value="active_leaks">
            <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></div>
            <span class="option-label">Active leaks or water stains inside</span>
          </div>
          <div class="option-row" data-value="just_older">
            <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></div>
            <span class="option-label">No obvious issues, just getting older</span>
          </div>
          <div class="option-row" data-value="not_sure_condition">
            <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></div>
            <span class="option-label">Not sure / I haven't looked closely</span>
          </div>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-title">Your Goals</div>
        <div class="options-list" id="goalsOptions">
          <div class="option-row" data-value="avoid_replacement">
            <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></div>
            <span class="option-label">Avoid or delay a full roof replacement</span>
          </div>
          <div class="option-row" data-value="extend_life">
            <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></div>
            <span class="option-label">Extend the life of my roof a few more years</span>
          </div>
          <div class="option-row" data-value="fix_small_issues">
            <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></div>
            <span class="option-label">Help with small issues before they become big</span>
          </div>
          <div class="option-row" data-value="improve_curb_appeal">
            <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></div>
            <span class="option-label">Improve curb appeal / refresh the look</span>
          </div>
          <div class="option-row" data-value="greener_option">
            <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></div>
            <span class="option-label">Explore a greener / less wasteful option</span>
          </div>
          <div class="option-row" data-value="just_researching">
            <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></div>
            <span class="option-label">Just researching options right now</span>
          </div>
        </div>
      </div>

      <div class="form-section">
        <div class="form-section-title">Have you looked at other brands?</div>
        <div class="options-list" id="otherBrandOptions">
          <div class="option-row" data-value="yes">
            <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></div>
            <span class="option-label">Yes, I've looked into another spray or sealant</span>
          </div>
          <div class="option-row" data-value="no">
            <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></div>
            <span class="option-label">No, I haven't</span>
          </div>
        </div>

        <div class="conditional-field" id="otherBrandField">
          <div class="input-group" style="margin-bottom: 0;">
            <label for="otherBrandName">Which brand or product? (Optional)</label>
            <input type="text" id="otherBrandName" placeholder="e.g., Roof Maxx, SealantX">
          </div>
        </div>
      </div>

      <div class="btn-container">
        <button class="btn" onclick="nextStep(3)" id="btn3" disabled>
          Continue
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
      </div>
    </div>

    <!-- Step 4: Lead Capture -->
    <div class="step" id="step4">
      <div class="step-header">
        <h1 class="step-title">Where should we send your results?</h1>
        <p class="step-subtitle">We'll give you a quick comparison of spray vs sealant options for your roof.</p>
      </div>

      <div class="form-card">
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

        <button class="btn" onclick="submitLead()" id="btnSubmit">
          See My Results
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div class="loading" id="loading">
      <div class="spinner"></div>
      <p>Analyzing your roof treatment options...</p>
    </div>

    <!-- Results -->
    <div class="results" id="results">
      <div class="step-header">
        <h1 class="step-title">Your Roof Treatment Fit Check</h1>
      </div>

      <div class="results-card">
        <div class="results-headline" id="resultsHeadline">Here's how spray vs sealant options fit your roof.</div>

        <div class="results-item">
          <span class="results-label">Address</span>
          <span class="results-value" id="resultAddress">-</span>
        </div>
        <div class="results-item">
          <span class="results-label">Roof Type</span>
          <span class="results-value" id="resultMaterial">-</span>
        </div>
        <div class="results-item">
          <span class="results-label">Approximate Age</span>
          <span class="results-value" id="resultAge">-</span>
        </div>
        <div class="results-item">
          <span class="results-label">Condition</span>
          <span class="results-value" id="resultCondition">-</span>
        </div>
        <div class="results-item">
          <span class="results-label">Your Goals</span>
          <span class="results-value" id="resultGoals">-</span>
        </div>

        <div class="assessment">
          <div class="assessment-title">Our Assessment</div>
          <div class="assessment-text" id="assessmentText">-</div>
        </div>
      </div>

      <div class="next-steps">
        <p>One of our roof treatment specialists will reach out to discuss your options.</p>
        <button class="btn" onclick="callNow()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          Call Us Now: ${tenant.phone}
        </button>
      </div>
    </div>
  </main>

  <footer class="powered-by">
    <img src="/favicon.png" alt="Camvasser">
    <span>Powered by Camvasser</span>
  </footer>

  <script>
    const TENANT = '${tenant.slug}';
    const PHONE = '${tenant.phone}';

    // Form state
    let formData = {
      address: '',
      roofMaterial: '',
      roofAge: '',
      roofCondition: [],
      roofGoals: [],
      otherBrandContact: '',
      otherBrandName: '',
      name: '',
      email: '',
      phone: ''
    };

    // Labels for display
    const materialLabels = {
      'asphalt_shingles': 'Asphalt shingles',
      'architectural_shingles': 'Architectural shingles',
      'metal': 'Metal',
      'tile': 'Tile',
      'flat_low_slope': 'Flat / low-slope',
      'not_sure': 'Not sure'
    };

    const ageLabels = {
      'under_5': 'Less than 5 years',
      '5_10': '5-10 years',
      '11_15': '11-15 years',
      '16_20': '16-20 years',
      '21_25': '21-25 years',
      '26_plus_or_unknown': '26+ years / not sure'
    };

    const conditionLabels = {
      'worn_faded': 'Worn or faded',
      'curling_brittle': 'Curling or brittle',
      'granules_in_gutters': 'Granules in gutters',
      'active_leaks': 'Active leaks',
      'just_older': 'Just getting older',
      'not_sure_condition': 'Not sure'
    };

    const goalsLabels = {
      'avoid_replacement': 'Avoid replacement',
      'extend_life': 'Extend roof life',
      'fix_small_issues': 'Fix small issues',
      'improve_curb_appeal': 'Improve curb appeal',
      'greener_option': 'Greener option',
      'just_researching': 'Researching'
    };

    // Single select for other brand
    document.querySelectorAll('#otherBrandOptions .option-row').forEach(opt => {
      opt.addEventListener('click', function() {
        document.querySelectorAll('#otherBrandOptions .option-row').forEach(o => o.classList.remove('selected'));
        this.classList.add('selected');
        formData.otherBrandContact = this.dataset.value;

        const conditionalField = document.getElementById('otherBrandField');
        if (this.dataset.value === 'yes') {
          conditionalField.classList.add('visible');
        } else {
          conditionalField.classList.remove('visible');
        }

        validateStep3();
      });
    });

    // Multi select for condition
    document.querySelectorAll('#conditionOptions .option-row').forEach(opt => {
      opt.addEventListener('click', function() {
        this.classList.toggle('selected');
        const selected = [];
        document.querySelectorAll('#conditionOptions .option-row.selected').forEach(o => {
          selected.push(o.dataset.value);
        });
        formData.roofCondition = selected;
        validateStep3();
      });
    });

    // Multi select for goals
    document.querySelectorAll('#goalsOptions .option-row').forEach(opt => {
      opt.addEventListener('click', function() {
        this.classList.toggle('selected');
        const selected = [];
        document.querySelectorAll('#goalsOptions .option-row.selected').forEach(o => {
          selected.push(o.dataset.value);
        });
        formData.roofGoals = selected;
        validateStep3();
      });
    });

    function validateStep2() {
      const material = document.getElementById('roofMaterial').value;
      const age = document.getElementById('roofAge').value;
      document.getElementById('btn2').disabled = !material || !age;
    }

    document.getElementById('roofMaterial').addEventListener('change', function() {
      formData.roofMaterial = this.value;
      validateStep2();
    });

    document.getElementById('roofAge').addEventListener('change', function() {
      formData.roofAge = this.value;
      validateStep2();
    });

    function validateStep3() {
      const hasCondition = formData.roofCondition.length > 0;
      const hasGoals = formData.roofGoals.length > 0;
      const hasBrandAnswer = formData.otherBrandContact !== '';
      document.getElementById('btn3').disabled = !(hasCondition && hasGoals && hasBrandAnswer);
    }

    const progressSteps = [25, 50, 75, 90, 100];

    function nextStep(current) {
      if (current === 1) {
        const address = document.getElementById('address').value.trim();
        if (!address) {
          alert('Please enter your address');
          return;
        }
        formData.address = address;
      }

      if (current === 3) {
        formData.otherBrandName = document.getElementById('otherBrandName').value.trim();
      }

      document.getElementById('step' + current).classList.remove('active');
      document.getElementById('step' + (current + 1)).classList.add('active');
      document.getElementById('progressFill').style.width = progressSteps[current] + '%';
    }

    function computeUrgency() {
      const condition = formData.roofCondition;
      if (condition.includes('active_leaks')) return 'high';
      if (condition.includes('curling_brittle') || condition.includes('granules_in_gutters') || condition.includes('worn_faded')) return 'medium';
      return 'low';
    }

    function computeFitLikelihood() {
      const material = formData.roofMaterial;
      const age = formData.roofAge;
      const condition = formData.roofCondition;

      if (['asphalt_shingles', 'architectural_shingles'].includes(material) &&
          ['5_10', '11_15', '16_20'].includes(age) &&
          !condition.includes('active_leaks')) {
        return 'strong_fit';
      }

      if (['asphalt_shingles', 'architectural_shingles'].includes(material) && age === '21_25') {
        return 'possible_fit';
      }

      if (age === '26_plus_or_unknown' || condition.includes('active_leaks')) {
        return 'needs_inspection';
      }

      if (['metal', 'tile', 'flat_low_slope', 'not_sure'].includes(material)) {
        return 'unknown';
      }

      return 'possible_fit';
    }

    function getFitLikelihoodText(fit) {
      const texts = {
        'strong_fit': 'Your roof type and age fall into the range where spray rejuvenation usually performs best, often improving flexibility and lifespan.',
        'possible_fit': 'Your roof may still be a candidate for spray or sealant treatment, but we\\'d need a closer look to compare the benefits.',
        'needs_inspection': 'Because of the age or current signs of leaks, we\\'d want to inspect the roof before recommending spray vs sealant.',
        'unknown': 'Your roof could still be a candidate, but we\\'ll need more details to determine the best option.'
      };
      return texts[fit] || texts['possible_fit'];
    }

    async function submitLead() {
      formData.name = document.getElementById('name').value.trim();
      formData.email = document.getElementById('email').value.trim();
      formData.phone = document.getElementById('phone').value.trim();

      if (!formData.name || !formData.email || !formData.phone) {
        alert('Please fill in all fields');
        return;
      }

      document.getElementById('step4').classList.remove('active');
      document.getElementById('loading').classList.add('active');
      document.getElementById('progressFill').style.width = '95%';

      const urgency = computeUrgency();
      const fitLikelihood = computeFitLikelihood();

      const urlParams = new URLSearchParams(window.location.search);

      try {
        const response = await fetch('/.netlify/functions/save-flow-lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant: TENANT,
            flowType: 'qualify',
            flowSlug: 'roof-spray-vs-sealant-options',
            name: formData.name,
            email: formData.email,
            phone: formData.phone,
            address: formData.address,
            urgencyLevel: urgency,
            qualifyScore: fitLikelihood,
            flowData: {
              roofMaterial: formData.roofMaterial,
              roofAge: formData.roofAge,
              roofCondition: formData.roofCondition,
              roofGoals: formData.roofGoals,
              otherBrandContact: formData.otherBrandContact,
              otherBrandName: formData.otherBrandName
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
          document.getElementById('resultMaterial').textContent = materialLabels[formData.roofMaterial] || formData.roofMaterial;
          document.getElementById('resultAge').textContent = ageLabels[formData.roofAge] || formData.roofAge;
          document.getElementById('resultCondition').textContent = formData.roofCondition.map(c => conditionLabels[c] || c).join(', ');
          document.getElementById('resultGoals').textContent = formData.roofGoals.map(g => goalsLabels[g] || g).join(', ');
          document.getElementById('assessmentText').textContent = getFitLikelihoodText(fitLikelihood);
        }, 1500);

      } catch (error) {
        console.error('Error:', error);
        alert('Something went wrong. Please try again.');
        document.getElementById('loading').classList.remove('active');
        document.getElementById('step4').classList.add('active');
      }
    }

    function callNow() {
      window.location.href = 'tel:' + PHONE.replace(/[^0-9]/g, '');
    }

    document.getElementById('address').addEventListener('input', function() {
      document.getElementById('btn1').disabled = !this.value.trim();
    });
  </script>
</body>
</html>`;
}
