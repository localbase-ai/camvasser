import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';

const prisma = new PrismaClient();

function normalizeEmail(email) {
  return email?.toLowerCase().trim() || null;
}

function normalizePhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

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

function parseAmount(amount) {
  if (!amount) return null;
  // Remove $ and commas, parse as float
  const cleaned = amount.replace(/[$,]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

function parseName(fullName) {
  if (!fullName) return { firstName: '', lastName: '' };
  const parts = fullName.trim().split(' ');
  const firstName = parts[0] || '';
  const lastName = parts.slice(1).join(' ') || '';
  return { firstName, lastName };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  // Get CSV path from args (skip --dry-run if present)
  const args = process.argv.slice(2).filter(arg => !arg.startsWith('--'));
  const csvPath = args[0] || '/Users/ryanriggin/Downloads/TASK - Sheet2.csv';

  if (dryRun) {
    console.log('=== DRY RUN MODE - No changes will be made ===\n');
  }

  console.log(`Reading CSV from: ${csvPath}\n`);

  // Read and parse CSV
  const content = readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  const headers = parseCSVLine(lines[0]);

  console.log('Headers:', headers);
  console.log(`Total rows: ${lines.length - 1}\n`);

  // Get existing leads for deduplication
  const existingLeads = await prisma.lead.findMany({
    select: { id: true, email: true, phone: true, firstName: true, lastName: true, address: true }
  });

  const leadsByEmail = new Map();
  const leadsByPhone = new Map();

  for (const lead of existingLeads) {
    const email = normalizeEmail(lead.email);
    const phone = normalizePhone(lead.phone);
    if (email) leadsByEmail.set(email, lead);
    if (phone) leadsByPhone.set(phone, lead);
  }

  console.log(`Existing leads: ${existingLeads.length}`);
  console.log('='.repeat(60) + '\n');

  let created = 0;
  let updated = 0;
  let skipped = 0;

  // Process each row
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);

    // Build record from headers
    const record = {};
    headers.forEach((h, idx) => {
      record[h.trim()] = values[idx] || '';
    });

    const name = record['NAME'] || record['Name'] || '';
    const address = record['ADDRESS'] || record['Address'] || '';
    const phone = record['PHONE NUMBER'] || record['Phone'] || '';
    const email = record['EMAIL ADDRESS'] || record['Email'] || '';
    const amount = record['AMOUNT'] || record['Amount'] || '';
    const date = record['DATE'] || record['Date'] || '';
    const owner = record['OWNER'] || record['Owner'] || '';

    // Skip if it looks like a header row or empty
    if (!name || name === 'NAME' || name.includes('RoofMaxx Sold Jobs Program')) {
      skipped++;
      continue;
    }

    const { firstName, lastName } = parseName(name);
    const normalizedEmail = normalizeEmail(email);
    const normalizedPhone = normalizePhone(phone);
    const jobValue = parseAmount(amount);

    // Check for existing lead
    let existingLead = null;
    if (normalizedEmail) existingLead = leadsByEmail.get(normalizedEmail);
    if (!existingLead && normalizedPhone) existingLead = leadsByPhone.get(normalizedPhone);

    if (existingLead) {
      // Update existing lead with owner and status
      console.log(`UPDATE: ${firstName} ${lastName} | owner: ${owner}`);

      if (!dryRun) {
        await prisma.lead.update({
          where: { id: existingLead.id },
          data: {
            ownerName: owner || null,
            status: 'completed',
            address: existingLead.address || address || null,
            flowData: {
              ...(existingLead.flowData || {}),
              job_value: jobValue,
              job_date: date,
              imported_from: 'sold_jobs_csv',
              imported_at: new Date().toISOString()
            }
          }
        });
      }
      updated++;
    } else {
      // Create new lead
      console.log(`CREATE: ${firstName} ${lastName} | ${email || phone} | owner: ${owner}`);

      if (!dryRun) {
        const newLead = await prisma.lead.create({
          data: {
            firstName,
            lastName,
            email: email || null,
            phone: phone || null,
            address: address || null,
            tenant: 'budroofing',
            dataSource: 'sold_jobs_csv',
            status: 'completed',
            ownerName: owner || null,
            flowData: {
              job_value: jobValue,
              job_date: date,
              imported_from: 'sold_jobs_csv',
              imported_at: new Date().toISOString()
            }
          }
        });

        // Add to lookup maps
        if (normalizedEmail) leadsByEmail.set(normalizedEmail, newLead);
        if (normalizedPhone) leadsByPhone.set(normalizedPhone, newLead);
      }
      created++;
    }
  }

  // Summary
  const finalCount = dryRun ? existingLeads.length + created : await prisma.lead.count();

  console.log('\n' + '='.repeat(60));
  console.log('\nSummary:');
  console.log(`  Rows processed: ${lines.length - 1}`);
  console.log(`  New leads created: ${created}`);
  console.log(`  Existing leads updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Total leads now: ${finalCount}`);

  if (dryRun) {
    console.log('\n=== This was a DRY RUN - run without --dry-run to apply changes ===');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
