import 'dotenv/config';

const WHITEPAGES_API_KEY = process.env.WHITEPAGES_API_KEY;
const BASE_URL = 'https://api.whitepages.com';

async function testPhoneLookup(phone) {
  console.log(`\n📞 Phone Lookup: ${phone}`);
  console.log('─'.repeat(50));

  const cleanPhone = phone.replace(/\D/g, '');
  const url = `${BASE_URL}/v1/person?phone=${cleanPhone}`;

  try {
    const response = await fetch(url, {
      headers: { 'X-Api-Key': WHITEPAGES_API_KEY }
    });

    if (!response.ok) {
      console.log('HTTP Error:', response.status, await response.text());
      return;
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      console.log('No results found');
      return;
    }

    console.log(`Found ${data.length} result(s)\n`);

    data.forEach((person, i) => {
      console.log(`--- Person ${i + 1} ---`);
      console.log('  Name:', person.name);
      if (person.aliases?.length) console.log('  Aliases:', person.aliases.join(', '));
      if (person.date_of_birth) console.log('  DOB:', person.date_of_birth);
      if (person.is_dead) console.log('  Status: Deceased');

      if (person.phones?.length) {
        console.log('  Phones:');
        person.phones.forEach(p => {
          console.log(`    ${p.number} (${p.type || 'unknown'}) score: ${p.score || 'n/a'}`);
        });
      }

      if (person.emails?.length) {
        console.log('  Emails:', person.emails.join(', '));
      }

      if (person.current_addresses?.length) {
        console.log('  Current Addresses:');
        person.current_addresses.forEach(a => console.log(`    ${a.address}`));
      }

      if (person.company_name) console.log('  Company:', person.company_name);
      if (person.job_title) console.log('  Title:', person.job_title);
      if (person.linkedin_url) console.log('  LinkedIn:', person.linkedin_url);

      if (person.relatives?.length) {
        console.log('  Relatives:', person.relatives.map(r => r.name).join(', '));
      }

      console.log('');
    });

    // Uncomment to see raw response
    // console.log('\nRaw:', JSON.stringify(data, null, 2));

  } catch (err) {
    console.error('Request failed:', err.message);
  }
}

async function testPersonSearch(name, city, state) {
  console.log(`\n👤 Person Search: ${name} in ${city}, ${state}`);
  console.log('─'.repeat(50));

  const params = new URLSearchParams({ name, city, state_code: state });
  const url = `${BASE_URL}/v1/person?${params}`;

  try {
    const response = await fetch(url, {
      headers: { 'X-Api-Key': WHITEPAGES_API_KEY }
    });

    if (!response.ok) {
      console.log('HTTP Error:', response.status, await response.text());
      return;
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      console.log('No results found');
      return;
    }

    console.log(`Found ${data.length} result(s)\n`);
    data.slice(0, 3).forEach((person, i) => {
      console.log(`${i + 1}. ${person.name}`);
      if (person.current_addresses?.[0]) console.log(`   ${person.current_addresses[0].address}`);
      if (person.phones?.[0]) console.log(`   ${person.phones[0].number}`);
    });

  } catch (err) {
    console.error('Request failed:', err.message);
  }
}

// Main
console.log('='.repeat(50));
console.log('Whitepages API Test (New v1 API)');
console.log('='.repeat(50));
console.log('API Key:', WHITEPAGES_API_KEY ? `${WHITEPAGES_API_KEY.slice(0, 8)}...` : 'NOT SET');

const arg = process.argv[2];

if (arg && /^\d+$/.test(arg.replace(/\D/g, ''))) {
  // Phone number provided
  await testPhoneLookup(arg);
} else if (arg) {
  // Name provided - search
  const [name, city = 'Seattle', state = 'WA'] = arg.split(',').map(s => s.trim());
  await testPersonSearch(name, city, state);
} else {
  // Default test
  console.log('\nUsage: node scripts/test-whitepages.js <phone|"name,city,state">');
  console.log('\nRunning default phone test...');
  await testPhoneLookup('2069735100');
}
