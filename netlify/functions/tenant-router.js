import { loadTenantConfig } from './lib/tenant-config.js';
import { handler as tenantIndexHandler } from './tenant-index.js';
import { handler as pageHandler } from './page.js';
import { handler as flowRoofClaimDenialHandler } from './flow-roof-claim-denial.js';
import { handler as flowDirtyRoofCostsHandler } from './flow-dirty-roof-costs.js';
import { handler as flowRoofSprayOptionsHandler } from './flow-roof-spray-options.js';
import { handler as flowCloggedGuttersHandler } from './flow-clogged-gutters.js';
import { handler as flowIceDamHandler } from './flow-ice-dam.js';
import { handler as flowRoofLeakEmergencyHandler } from './flow-roof-leak-emergency.js';
import { handler as flowRoofVentilationHandler } from './flow-roof-ventilation.js';

// Route mapping: page slug -> handler
const pageHandlers = {
  'photos': pageHandler,
  'instant-roof-quote': pageHandler,
  'roof-claim-denial': flowRoofClaimDenialHandler,
  'dirty-roof-costs': flowDirtyRoofCostsHandler,
  'roof-spray-vs-sealant-options': flowRoofSprayOptionsHandler,
  'clogged-gutters-damage': flowCloggedGuttersHandler,
  'ice-dam-prevention': flowIceDamHandler,
  'roof-leak-emergency': flowRoofLeakEmergencyHandler,
  'roof-ventilation-issues': flowRoofVentilationHandler,
};

/**
 * Dynamic tenant router - replaces individual tenant wrapper functions.
 *
 * URL patterns:
 *   /:tenant           -> tenant index page
 *   /:tenant/:page     -> specific page (photos, flows, etc.)
 *
 * Examples:
 *   /budroofing                    -> tenant index
 *   /budroofing/photos             -> photo search page
 *   /kcroofrestoration/dirty-roof-costs -> dirty roof costs flow
 */
export async function handler(event, context) {
  const path = event.path || event.rawUrl || '';

  // Parse path: /tenant or /tenant/page
  const segments = path.split('/').filter(Boolean);

  if (segments.length === 0) {
    return {
      statusCode: 404,
      body: 'Not found - no tenant specified',
    };
  }

  const tenant = segments[0];
  const page = segments[1] || null;

  // Set tenant in query params for downstream handlers
  event.queryStringParameters = event.queryStringParameters || {};
  event.queryStringParameters.tenant = tenant;

  // Route to appropriate handler
  if (!page) {
    // Tenant index page
    return tenantIndexHandler(event, context);
  }

  // Check if this tenant has flows enabled
  const config = loadTenantConfig();
  const tenantConfig = config.tenants[tenant];
  const allowedFlows = tenantConfig?.flows || [];

  const targetHandler = pageHandlers[page];
  if (targetHandler && (allowedFlows.includes(page) || !tenantConfig)) {
    return targetHandler(event, context);
  }

  return {
    statusCode: 404,
    body: `Not found - unknown page: ${page}`,
  };
}
