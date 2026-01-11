import axios from 'axios';
import { loadTenantConfig } from './lib/tenant-config.js';
import { syncProject } from './lib/project-sync.js';

export async function handler(event, context) {
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const { address, tenant } = event.queryStringParameters || {};

  if (!address) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Address parameter required' })
    };
  }

  if (!tenant) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Tenant parameter required' })
    };
  }

  try {
    // Load tenant configuration
    const config = loadTenantConfig();
    const tenantConfig = config.tenants[tenant];

    if (!tenantConfig) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          error: 'Tenant not found',
          tenant: tenant,
          available: Object.keys(config.tenants)
        })
      };
    }

    // Get Company Cam API token from environment variable specified in tenant config
    const apiTokenEnvVar = tenantConfig.companycam_api_token_env;
    const apiToken = process.env[apiTokenEnvVar];

    if (!apiToken) {
      throw new Error(`Missing Company Cam API token for environment variable: ${apiTokenEnvVar}`);
    }

    // Fetch projects page by page and search as we go
    let bestMatch = null;
    let page = 1;
    let hasMore = true;
    const perPage = 50; // CompanyCam API default

    // Normalize address for comparison
    function normalizeAddress(addr) {
      return addr
        .toLowerCase()
        .trim()
        // Normalize directionals
        .replace(/\bsw\b/g, 'southwest')
        .replace(/\bse\b/g, 'southeast')
        .replace(/\bnw\b/g, 'northwest')
        .replace(/\bne\b/g, 'northeast')
        .replace(/\bn\b/g, 'north')
        .replace(/\bs\b/g, 'south')
        .replace(/\be\b/g, 'east')
        .replace(/\bw\b/g, 'west')
        // Normalize street types
        .replace(/\bdr\b/g, 'drive')
        .replace(/\bst\b/g, 'street')
        .replace(/\bave\b/g, 'avenue')
        .replace(/\brd\b/g, 'road')
        .replace(/\bln\b/g, 'lane')
        .replace(/\bct\b/g, 'court')
        .replace(/\bpl\b/g, 'place')
        .replace(/\bblvd\b/g, 'boulevard')
        .replace(/\bcir\b/g, 'circle')
        .replace(/\bter\b/g, 'terrace')
        .replace(/\bterr\b/g, 'terrace')
        .replace(/\bpkwy\b/g, 'parkway')
        // Remove extra spaces
        .replace(/\s+/g, ' ');
    }

    const searchLower = address.toLowerCase().trim();
    const searchNormalized = normalizeAddress(address);
    const searchNumbers = searchLower.match(/\d+/g)?.join('') || '';

    // Fetch pages until we find a match or run out of pages
    // No hard limit - search the entire account
    const requestTimeout = 5000; // 5 seconds per request
    const startTime = Date.now();
    const maxSearchTime = 30000; // 30 seconds total search time limit

    while (hasMore && !bestMatch) {
      // Safety check: don't search for more than 30 seconds total
      if (Date.now() - startTime > maxSearchTime) {
        console.log(`Search timed out after ${page - 1} pages`);
        break;
      }
      const response = await axios.get('https://api.companycam.com/v2/projects', {
        params: {
          per_page: perPage,
          page: page
        },
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Accept': 'application/json'
        },
        timeout: requestTimeout
      });

      const projects = response.data || [];

      if (projects.length === 0) {
        // No more results
        break;
      }

      console.log(`Page ${page}: fetched ${projects.length} projects`);

      // Debug: Log first 3 addresses from page 1
      if (page === 1) {
        console.log('Sample addresses from first page:');
        projects.slice(0, 5).forEach((p, i) => {
          if (p.address?.street_address_1) {
            console.log(`  ${i + 1}. ${p.address.street_address_1} (${p.photo_count} photos)`);
          }
        });
      }

      // Search this page for a match
      bestMatch = projects.find(p => {
        // Skip deleted projects
        if (p.status === 'deleted') {
          return false;
        }

        // Skip projects with no address
        if (!p.address || !p.address.street_address_1) {
          return false;
        }

        // Note: We don't filter by photo_count because:
        // - Projects may have videos instead of photos
        // - Media may be in integrations (e.g., Google Drive)
        // - photo_count may be delayed/inaccurate
        // - Projects exist for a reason and should be findable

        const addr = p.address.street_address_1.toLowerCase().trim();
        const addrNormalized = normalizeAddress(p.address.street_address_1);
        const addrNumbers = addr.match(/\d+/g)?.join('') || '';

        // Check if street numbers match AND normalized street names match
        if (searchNumbers && addrNumbers && searchNumbers === addrNumbers) {
          // Extract street name (everything after the number)
          const searchStreet = searchNormalized.replace(/^\d+\s*/, '');
          const addrStreet = addrNormalized.replace(/^\d+\s*/, '');

          // Check if street names are similar
          if (searchStreet && addrStreet &&
              (searchStreet.includes(addrStreet) || addrStreet.includes(searchStreet) ||
               searchStreet === addrStreet)) {
            console.log(`Normalized match: ${p.address.street_address_1} (${addrNormalized} ~ ${searchNormalized})`);
            return true;
          }
        }

        // Check if full normalized address matches
        if (addrNormalized.includes(searchNormalized) || searchNormalized.includes(addrNormalized)) {
          console.log(`Text match: ${p.address.street_address_1}`);
          return true;
        }

        // Fallback: exact address contains match
        if (addr.includes(searchLower) || searchLower.includes(addr)) {
          console.log(`Exact match: ${p.address.street_address_1}`);
          return true;
        }

        return false;
      });

      // If we found a match, stop searching
      if (bestMatch) {
        console.log(`Found match on page ${page}: ${bestMatch.address.street_address_1}`);
        break;
      }

      // If we got fewer than perPage results, we've reached the end
      hasMore = projects.length === perPage;
      page++;
    }

    // If no match found after all pages
    if (!bestMatch) {
      console.log(`No match found for: ${address} after searching ${page - 1} pages`);
    }

    if (bestMatch) {
      // Sync project to database with labels
      let syncedProject = null;
      try {
        syncedProject = await syncProject(bestMatch, tenant, apiToken);
        console.log(`Synced project ${bestMatch.id} with ${syncedProject.labels?.length || 0} labels`);
      } catch (error) {
        console.error('Error syncing project to database:', error);
        // Continue even if sync fails
      }

      // Fetch photos for the project (up to 5)
      let photos = [];
      try {
        const photosResponse = await axios.get(`https://api.companycam.com/v2/projects/${bestMatch.id}/photos`, {
          params: {
            per_page: 5
          },
          headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Accept': 'application/json'
          },
          timeout: 5000
        });

        photos = (photosResponse.data || []).map(photo => ({
          thumbnail: photo.uris?.find(u => u.type === 'thumbnail')?.uri ||
                     photo.uris?.find(u => u.type === 'web')?.uri ||
                     photo.uris?.[0]?.uri
        })).filter(p => p.thumbnail);
      } catch (error) {
        console.error('Error fetching photos:', error);
      }

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          found: true,
          project: {
            id: bestMatch.id,
            address: bestMatch.address?.street_address_1,
            city: bestMatch.address?.city,
            state: bestMatch.address?.state,
            url: bestMatch.public_url,
            photo_count: bestMatch.photo_count,
            photos: photos,
            labels: syncedProject?.labels?.map(l => ({
              displayValue: l.displayValue,
              value: l.value
            })) || []
          }
        })
      };
    } else {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          found: false,
          message: 'No project found for this address'
        })
      };
    }
  } catch (error) {
    console.error('Company Cam search error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: 'Search failed',
        details: error.message
      })
    };
  }
}
