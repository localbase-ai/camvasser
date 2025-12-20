import { PrismaClient } from '@prisma/client';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function importLeads() {
  const csvPath = path.join(process.cwd(), 'docs/all_leads.csv');
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.split('\n').filter(line => line.trim());

  // Load localbase for created_at dates
  const localbasePath = path.join(process.env.HOME, 'Work/renu/data/localbase.db');
  const localbaseDb = new Database(localbasePath, { readonly: true });

  // Build lookup maps from localbase
  const dateByEmail = new Map();
  const dateByPhone = new Map();
  const dateByName = new Map();

  const customers = localbaseDb.prepare(`
    SELECT email, phone, first_name, last_name, created_at
    FROM customers
    WHERE created_at IS NOT NULL
  `).all();

  for (const c of customers) {
    if (c.email) dateByEmail.set(c.email.toLowerCase().trim(), c.created_at);
    if (c.phone) {
      const digits = c.phone.replace(/\D/g, '');
      if (digits.length >= 10) dateByPhone.set(digits.slice(-10), c.created_at);
    }
    if (c.first_name && c.last_name) {
      const fullName = `${c.first_name} ${c.last_name}`.toLowerCase().trim();
      dateByName.set(fullName, c.created_at);
    }
  }

  console.log(`Loaded ${customers.length} customers from localbase`);
  console.log(`  - ${dateByEmail.size} emails, ${dateByPhone.size} phones, ${dateByName.size} names`);
  localbaseDb.close();

  // Skip header
  const dataLines = lines.slice(1);
  console.log(`Found ${dataLines.length} leads to import`);

  // Parse CSV (handling quoted fields with commas)
  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  // Map stage to status
  function mapStage(stage) {
    const stageMap = {
      'NEW LEAD': 'new',
      'CONTACTED': 'contacted',
      'APPOINTMENT SCHEDULED': 'appointment_scheduled',
      'PROPOSAL SENT/PRESENTED': 'proposal_sent',
      'PROPOSAL SIGNED': 'proposal_signed',
      'JOB SCHEDULED': 'job_scheduled',
      'JOB COMPLETED': 'completed',
      'POST JOB COMPLETION FOLLOW-UP': 'follow_up',
      'INSURANCE CLAIM': 'insurance_claim',
      'ON HOLD': 'on_hold',
      'LOST': 'lost',
      'KILLED': 'killed',
      'UNQUALIFIED': 'unqualified'
    };
    return stageMap[stage] || stage.toLowerCase().replace(/\s+/g, '_');
  }

  // Map source
  function mapSource(source) {
    if (!source) return 'unknown';
    const sourceMap = {
      'NAP': 'nap',
      'NAP L': 'nap_letter',
      'NAP S': 'nap_search',
      'RMCL': 'rmcl',
      'DOOR KNOCKING': 'door_knock',
      'MICRO': 'micro',
      'SG': 'sg',
      'GRML': 'grml'
    };
    return sourceMap[source] || source.toLowerCase().replace(/\s+/g, '_');
  }

  // Split name into first/last
  function splitName(fullName) {
    if (!fullName) return { firstName: '', lastName: '' };
    const parts = fullName.trim().split(/\s+/);
    const firstName = parts[0] || '';
    const lastName = parts.slice(1).join(' ') || '';
    return { firstName, lastName };
  }

  // Format phone number
  function formatPhone(phone) {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
    }
    return phone;
  }

  // Find created_at from localbase
  function findCreatedAt(email, phone, name) {
    // Try email first (most reliable)
    if (email) {
      const date = dateByEmail.get(email.toLowerCase().trim());
      if (date) return { date, method: 'email' };
    }
    // Try phone
    if (phone) {
      const digits = phone.replace(/\D/g, '');
      if (digits.length >= 10) {
        const date = dateByPhone.get(digits.slice(-10));
        if (date) return { date, method: 'phone' };
      }
    }
    // Try name
    if (name) {
      const date = dateByName.get(name.toLowerCase().trim());
      if (date) return { date, method: 'name' };
    }
    return null;
  }

  const leads = [];
  let skipped = 0;
  let matchedByEmail = 0;
  let matchedByPhone = 0;
  let matchedByName = 0;
  let unmatched = 0;

  for (const line of dataLines) {
    const fields = parseCSVLine(line);

    // STAGE, ADDRESS, NAME, PHONE NUMBER, EMAIL ADDRESS, SOURCE, JOB VALUE
    const [stage, address, name, phone, email, source, jobValue] = fields;

    // Skip only if completely empty (no stage, no address, nothing)
    if (!stage && !address && !name && !phone && !email) {
      skipped++;
      continue;
    }

    const { firstName, lastName } = splitName(name);

    // Find created_at
    const match = findCreatedAt(email, phone, name);
    let createdAt = new Date(); // Default to now

    if (match) {
      createdAt = new Date(match.date);
      if (match.method === 'email') matchedByEmail++;
      else if (match.method === 'phone') matchedByPhone++;
      else if (match.method === 'name') matchedByName++;
    } else {
      unmatched++;
    }

    leads.push({
      firstName,
      lastName,
      email: email || null,
      phone: formatPhone(phone),
      address: address || null,
      tenant: 'budroofing',
      status: mapStage(stage),
      source: mapSource(source),
      flowData: jobValue ? { jobValue } : null,
      createdAt
    });
  }

  console.log(`Parsed ${leads.length} valid leads (skipped ${skipped} empty rows)`);
  console.log(`\nDate matching:`);
  console.log(`  - By email: ${matchedByEmail}`);
  console.log(`  - By phone: ${matchedByPhone}`);
  console.log(`  - By name: ${matchedByName}`);
  console.log(`  - Unmatched (using today): ${unmatched}`);

  // Preview first 5
  console.log('\nPreview (first 5 leads):');
  leads.slice(0, 5).forEach((lead, i) => {
    const dateStr = lead.createdAt.toISOString().split('T')[0];
    console.log(`${i + 1}. ${lead.firstName} ${lead.lastName} | ${lead.status} | ${dateStr}`);
  });

  // Count by status
  const statusCounts = {};
  leads.forEach(lead => {
    statusCounts[lead.status] = (statusCounts[lead.status] || 0) + 1;
  });
  console.log('\nBy status:');
  Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).forEach(([status, count]) => {
    console.log(`  ${status}: ${count}`);
  });

  // Ask for confirmation
  const args = process.argv.slice(2);
  if (!args.includes('--execute')) {
    console.log('\n⚠️  DRY RUN - No changes made');
    console.log('Run with --execute to delete existing leads and import these');
    await prisma.$disconnect();
    return;
  }

  // Execute import
  console.log('\n🚀 Executing import...');

  // Delete all existing leads
  const deleteResult = await prisma.lead.deleteMany({});
  console.log(`Deleted ${deleteResult.count} existing leads`);

  // Insert new leads in batches
  const batchSize = 50;
  let imported = 0;

  for (let i = 0; i < leads.length; i += batchSize) {
    const batch = leads.slice(i, i + batchSize);
    await prisma.lead.createMany({
      data: batch
    });
    imported += batch.length;
    console.log(`Imported ${imported}/${leads.length}`);
  }

  console.log(`\n✅ Import complete! ${imported} leads imported.`);

  await prisma.$disconnect();
}

importLeads().catch(console.error);
