const WHITEPAGES_API_KEY = process.env.WHITEPAGES_API_KEY;
const BASE_URL = 'https://api.whitepages.com';

/**
 * Search for a person by phone number
 * New Whitepages API - uses X-Api-Key header
 */
export async function lookupPhone(phoneNumber) {
  if (!WHITEPAGES_API_KEY) {
    throw new Error('WHITEPAGES_API_KEY not configured');
  }

  // Clean the phone number - remove non-digits
  const cleanPhone = phoneNumber.replace(/\D/g, '');

  if (!cleanPhone || cleanPhone.length < 10) {
    throw new Error('Invalid phone number');
  }

  const url = `${BASE_URL}/v1/person?phone=${cleanPhone}`;

  const response = await fetch(url, {
    headers: {
      'X-Api-Key': WHITEPAGES_API_KEY
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Whitepages API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  // Returns array of person records
  return normalizePersonResults(data, cleanPhone);
}

/**
 * Search for a person by name and location
 */
export async function findPerson({ firstName, lastName, city, state, zip, street }) {
  if (!WHITEPAGES_API_KEY) {
    throw new Error('WHITEPAGES_API_KEY not configured');
  }

  const params = new URLSearchParams();

  if (firstName) params.append('first_name', firstName);
  if (lastName) params.append('last_name', lastName);
  if (firstName && lastName) params.append('name', `${firstName} ${lastName}`);
  if (city) params.append('city', city);
  if (state) params.append('state_code', state);
  if (zip) params.append('zipcode', zip);
  if (street) params.append('street', street);

  const url = `${BASE_URL}/v1/person?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      'X-Api-Key': WHITEPAGES_API_KEY
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Whitepages API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return normalizePersonResults(data);
}

/**
 * Get property details by address (V2 API)
 */
export async function getProperty({ street, city, state, zip }) {
  if (!WHITEPAGES_API_KEY) {
    throw new Error('WHITEPAGES_API_KEY not configured');
  }

  const params = new URLSearchParams();
  if (street) params.append('street', street);
  if (city) params.append('city', city);
  if (state) params.append('state_code', state);
  if (zip) params.append('zipcode', zip);

  const url = `${BASE_URL}/v2/property/?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      'X-Api-Key': WHITEPAGES_API_KEY
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Whitepages API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Normalize the person search results into a clean format
 */
function normalizePersonResults(data, phoneQuery = null) {
  if (!Array.isArray(data) || data.length === 0) {
    return {
      found: false,
      results: [],
      phoneQuery
    };
  }

  const results = data.map(person => ({
    id: person.id,
    name: person.name,
    aliases: person.aliases || [],
    isDead: person.is_dead,
    dateOfBirth: person.date_of_birth,
    currentAddresses: (person.current_addresses || []).map(a => ({
      id: a.id,
      address: a.address
    })),
    historicAddresses: (person.historic_addresses || []).map(a => ({
      id: a.id,
      address: a.address
    })),
    phones: (person.phones || []).map(p => ({
      number: p.number,
      type: p.type,
      score: p.score
    })),
    emails: person.emails || [],
    linkedinUrl: person.linkedin_url,
    companyName: person.company_name,
    jobTitle: person.job_title,
    relatives: (person.relatives || []).map(r => ({
      id: r.id,
      name: r.name
    })),
    ownedProperties: (person.owned_properties || []).map(p => ({
      id: p.id,
      address: p.address
    }))
  }));

  return {
    found: true,
    count: results.length,
    results,
    phoneQuery
  };
}
