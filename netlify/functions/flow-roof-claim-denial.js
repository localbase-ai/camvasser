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
  <title>Roof Claim Denied? See If You Qualify - ${tenant.name}</title>
  <meta name="description" content="Had your roof insurance claim denied? Find out if you qualify for a second opinion review.">
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

    /* Option Cards - Grid for icon cards */
    .options-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
      max-width: 36rem;
      margin: 0 auto 2rem;
    }

    .option-card {
      background: var(--card);
      border: 2px solid var(--border);
      border-radius: var(--radius);
      padding: 1.5rem;
      cursor: pointer;
      transition: all 0.2s ease;
      text-align: center;
    }

    .option-card:hover {
      border-color: color-mix(in srgb, var(--primary) 50%, transparent);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
      transform: scale(1.02);
    }

    .option-card.selected {
      border-color: var(--primary);
      background: color-mix(in srgb, var(--primary) 5%, white);
    }

    .option-icon {
      width: 3rem;
      height: 3rem;
      margin: 0 auto 0.75rem;
      background: color-mix(in srgb, var(--primary) 10%, transparent);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .option-icon svg {
      width: 1.5rem;
      height: 1.5rem;
      stroke: var(--primary);
    }

    .option-label {
      font-size: 1rem;
      font-weight: 600;
      color: var(--foreground);
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

    .option-row .option-icon {
      margin: 0;
      flex-shrink: 0;
      width: 2.5rem;
      height: 2.5rem;
    }

    .option-row .option-icon svg {
      width: 1.25rem;
      height: 1.25rem;
    }

    .option-row .option-label {
      flex: 1;
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

    .input-group input {
      width: 100%;
      padding: 0.875rem 1rem;
      border: 2px solid var(--border);
      border-radius: 0.5rem;
      background: var(--background);
      color: var(--foreground);
      font-size: 1rem;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }

    .input-group input::placeholder {
      color: var(--muted);
    }

    .input-group input:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary) 20%, transparent);
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
      background: var(--primary);
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
      background: var(--primary-hover);
    }

    .btn:disabled {
      
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
      gap: 0.5rem;
    }

    .powered-by img {
      height: 14px;
      
    }

    /* Responsive */
    @media (max-width: 640px) {
      .options-grid {
        grid-template-columns: 1fr;
      }

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
          <div class="progress-fill" id="progressFill" style="width: 20%"></div>
        </div>
      </div>
      <div class="header-spacer"></div>
    </div>
  </header>

  <main class="main">
    <!-- Step 1: Address -->
    <div class="step active" id="step1">
      <div class="step-header">
        <h1 class="step-title">Where is the property with the denied claim?</h1>
        <p class="step-subtitle">We'll use this to check local storm history and coverage factors.</p>
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

    <!-- Step 2: Denial Reason -->
    <div class="step" id="step2">
      <div class="step-header">
        <h1 class="step-title">Why was your claim denied?</h1>
        <p class="step-subtitle">Select the reason that best matches your denial letter.</p>
      </div>

      <div class="options-list" id="denialOptions">
        <div class="option-row" data-value="wear_and_tear">
          <div class="option-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8"/></svg>
          </div>
          <span class="option-label">Wear and tear</span>
        </div>
        <div class="option-row" data-value="no_storm_event">
          <div class="option-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/><polyline points="13 11 9 17 15 17 11 23"/></svg>
          </div>
          <span class="option-label">No storm event / no covered peril</span>
        </div>
        <div class="option-row" data-value="not_severe_enough">
          <div class="option-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <span class="option-label">Damage not severe enough</span>
        </div>
        <div class="option-row" data-value="improper_installation">
          <div class="option-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
          </div>
          <span class="option-label">Improper installation</span>
        </div>
        <div class="option-row" data-value="cosmetic_only">
          <div class="option-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
          </div>
          <span class="option-label">Cosmetic damage only</span>
        </div>
        <div class="option-row" data-value="not_covered">
          <div class="option-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <span class="option-label">Not covered under policy</span>
        </div>
        <div class="option-row" data-value="other_unsure">
          <div class="option-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <span class="option-label">Other / Not sure</span>
        </div>
      </div>

      <div class="btn-container">
        <button class="btn" onclick="nextStep(2)" id="btn2" disabled>
          Continue
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
      </div>
    </div>

    <!-- Step 3: Visible Damage -->
    <div class="step" id="step3">
      <div class="step-header">
        <h1 class="step-title">What damage can you see?</h1>
        <p class="step-subtitle">Select all that apply.</p>
      </div>

      <div class="options-list" id="damageOptions">
        <div class="option-row" data-value="missing_shingles">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></div>
          <span class="option-label">Missing shingles</span>
        </div>
        <div class="option-row" data-value="lifted_shingles">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></div>
          <span class="option-label">Lifted or curling shingles</span>
        </div>
        <div class="option-row" data-value="granule_loss">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></div>
          <span class="option-label">Granule loss in gutters</span>
        </div>
        <div class="option-row" data-value="impact_marks">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></div>
          <span class="option-label">Dents or impact marks</span>
        </div>
        <div class="option-row" data-value="soft_spots">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></div>
          <span class="option-label">Soft spots when walking</span>
        </div>
        <div class="option-row" data-value="leaks">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></div>
          <span class="option-label">Leaks or water stains inside</span>
        </div>
        <div class="option-row" data-value="not_sure">
          <div class="checkbox"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></div>
          <span class="option-label">Not sure / Haven't checked</span>
        </div>
      </div>

      <div class="btn-container">
        <button class="btn" onclick="nextStep(3)" id="btn3" disabled>
          Continue
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
      </div>
    </div>

    <!-- Step 4: Has Denial Letter -->
    <div class="step" id="step4">
      <div class="step-header">
        <h1 class="step-title">Do you have your denial letter?</h1>
        <p class="step-subtitle">This helps us understand exactly why your claim was denied.</p>
      </div>

      <div class="options-grid" id="letterOptions">
        <div class="option-card" data-value="yes">
          <div class="option-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          </div>
          <span class="option-label">Yes, I have it</span>
        </div>
        <div class="option-card" data-value="no">
          <div class="option-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          </div>
          <span class="option-label">No, not right now</span>
        </div>
      </div>

      <div class="btn-container">
        <button class="btn" onclick="nextStep(4)" id="btn4" disabled>
          Continue
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
      </div>
    </div>

    <!-- Step 5: Lead Capture -->
    <div class="step" id="step5">
      <div class="step-header">
        <h1 class="step-title">Where should we send your results?</h1>
        <p class="step-subtitle">Based on your answers, you may qualify for a second opinion review.</p>
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
      <p>Analyzing your information...</p>
    </div>

    <!-- Results -->
    <div class="results" id="results">
      <div class="step-header">
        <h1 class="step-title">Your Claim Review Results</h1>
      </div>

      <div class="results-card">
        <div class="results-headline" id="resultsHeadline">Based on what you shared, you may qualify for a Second Opinion Roof Claim Review.</div>

        <div class="results-item">
          <span class="results-label">Address</span>
          <span class="results-value" id="resultAddress">-</span>
        </div>
        <div class="results-item">
          <span class="results-label">Denial Reason</span>
          <span class="results-value" id="resultDenial">-</span>
        </div>
        <div class="results-item">
          <span class="results-label">Visible Damage</span>
          <span class="results-value" id="resultDamage">-</span>
        </div>

        <div class="assessment">
          <div class="assessment-title">Our Assessment</div>
          <div class="assessment-text" id="assessmentText">-</div>
        </div>
      </div>

      <div class="next-steps">
        <p>One of our roof claim experts will reach out shortly to discuss your options.</p>
        <button class="btn" onclick="callNow()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          Call Us Now: ${tenant.phone}
        </button>
      </div>
    </div>
  </main>

  <footer class="powered-by">
    <span>Powered by Camvasser</span>
  </footer>

  <script>
    const TENANT = '${tenant.slug}';
    const PHONE = '${tenant.phone}';

    // Form state
    let formData = {
      address: '',
      denialReason: '',
      visibleDamage: [],
      hasLetter: '',
      name: '',
      email: '',
      phone: ''
    };

    // Labels for display
    const denialLabels = {
      'wear_and_tear': 'Wear and tear',
      'no_storm_event': 'No storm event',
      'not_severe_enough': 'Damage not severe enough',
      'improper_installation': 'Improper installation',
      'cosmetic_only': 'Cosmetic damage only',
      'not_covered': 'Not covered under policy',
      'other_unsure': 'Other / Not sure'
    };

    const damageLabels = {
      'missing_shingles': 'Missing shingles',
      'lifted_shingles': 'Lifted shingles',
      'granule_loss': 'Granule loss',
      'impact_marks': 'Impact marks',
      'soft_spots': 'Soft spots',
      'leaks': 'Leaks or water stains',
      'not_sure': 'Not sure'
    };

    // Single select - denial reasons
    document.querySelectorAll('#denialOptions .option-row').forEach(opt => {
      opt.addEventListener('click', function() {
        document.querySelectorAll('#denialOptions .option-row').forEach(o => o.classList.remove('selected'));
        this.classList.add('selected');
        formData.denialReason = this.dataset.value;
        document.getElementById('btn2').disabled = false;
      });
    });

    // Single select - letter options (card style)
    document.querySelectorAll('#letterOptions .option-card').forEach(opt => {
      opt.addEventListener('click', function() {
        document.querySelectorAll('#letterOptions .option-card').forEach(o => o.classList.remove('selected'));
        this.classList.add('selected');
        formData.hasLetter = this.dataset.value;
        document.getElementById('btn4').disabled = false;
      });
    });

    // Multi select - damage options
    document.querySelectorAll('#damageOptions .option-row').forEach(opt => {
      opt.addEventListener('click', function() {
        this.classList.toggle('selected');

        const selected = [];
        document.querySelectorAll('#damageOptions .option-row.selected').forEach(o => {
          selected.push(o.dataset.value);
        });
        formData.visibleDamage = selected;
        document.getElementById('btn3').disabled = selected.length === 0;
      });
    });

    // Progress percentages
    const progressSteps = [20, 40, 60, 75, 90, 100];

    function nextStep(current) {
      // Validate current step
      if (current === 1) {
        const address = document.getElementById('address').value.trim();
        if (!address) {
          alert('Please enter your address');
          return;
        }
        formData.address = address;
      }

      // Hide current, show next
      document.getElementById('step' + current).classList.remove('active');
      document.getElementById('step' + (current + 1)).classList.add('active');
      document.getElementById('progressFill').style.width = progressSteps[current] + '%';
    }

    function computeUrgency() {
      const damage = formData.visibleDamage;
      if (damage.includes('leaks') || damage.includes('soft_spots')) {
        return 'high';
      }
      if (damage.includes('missing_shingles') || damage.includes('lifted_shingles') ||
          damage.includes('impact_marks') || damage.includes('granule_loss')) {
        return 'medium';
      }
      if (damage.includes('not_sure')) {
        return 'unknown';
      }
      return 'medium';
    }

    function computeLikelihood() {
      const denial = formData.denialReason;
      const damage = formData.visibleDamage;

      // Strong likelihood
      if (['wear_and_tear', 'no_storm_event'].includes(denial) &&
          (damage.includes('missing_shingles') || damage.includes('lifted_shingles') ||
           damage.includes('impact_marks') || damage.includes('leaks'))) {
        return 'strong';
      }

      // Moderate likelihood
      if (['not_severe_enough', 'cosmetic_only', 'not_covered'].includes(denial) &&
          (damage.includes('granule_loss') || damage.includes('missing_shingles') ||
           damage.includes('lifted_shingles'))) {
        return 'moderate';
      }

      // Unknown
      if (denial === 'other_unsure') {
        return 'unknown';
      }

      return 'moderate';
    }

    function getLikelihoodText(likelihood) {
      const texts = {
        'strong': 'Your denial reason and the type of damage you reported are commonly overturned during a second inspection, especially when documented correctly.',
        'moderate': 'There are signs your claim may still have options, but we\\'ll need a closer look at your roof and paperwork.',
        'unknown': 'We need a bit more information, but a quick review of your denial letter and a roof inspection can clarify your options.'
      };
      return texts[likelihood] || texts['moderate'];
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

      // Compute scores
      const urgency = computeUrgency();
      const likelihood = computeLikelihood();

      // Get UTM params
      const urlParams = new URLSearchParams(window.location.search);

      try {
        const response = await fetch('/.netlify/functions/save-flow-lead', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant: TENANT,
            flowType: 'qualify',
            flowSlug: 'roof-claim-denial',
            name: formData.name,
            email: formData.email,
            phone: formData.phone,
            address: formData.address,
            urgencyLevel: urgency,
            qualifyScore: likelihood,
            flowData: {
              denialReason: formData.denialReason,
              visibleDamage: formData.visibleDamage,
              hasLetter: formData.hasLetter
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

          // Populate results
          document.getElementById('resultAddress').textContent = formData.address;
          document.getElementById('resultDenial').textContent = denialLabels[formData.denialReason] || formData.denialReason;
          document.getElementById('resultDamage').textContent = formData.visibleDamage.map(d => damageLabels[d] || d).join(', ');
          document.getElementById('assessmentText').textContent = getLikelihoodText(likelihood);
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

    // Enable first button when address has content
    document.getElementById('address').addEventListener('input', function() {
      document.getElementById('btn1').disabled = !this.value.trim();
    });
  </script>
</body>
</html>`;
}
