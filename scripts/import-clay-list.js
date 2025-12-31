// Import Clay property list as Projects + Prospects
// Usage: node scripts/import-clay-list.js <csv-file> [--dry-run]

import { PrismaClient } from '@prisma/client';
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';
import { createId } from '@paralleldrive/cuid2';
import 'dotenv/config';

const prisma = new PrismaClient();
const TENANT = 'budroofing';

// Keywords that indicate a business/organization
const BUSINESS_KEYWORDS = [
  'LLC', 'L.L.C.', 'Inc', 'Inc.', 'Incorporated', 'Corp', 'Corp.', 'Corporation',
  'Company', 'Co.', 'Ltd', 'Ltd.', 'Limited', 'LP', 'L.P.', 'LLP', 'L.L.P.',
  'Property', 'Properties', 'Management', 'Realty', 'Real Estate', 'Rentals',
  'Investments', 'Investment', 'Holdings', 'Holding', 'Capital',
  'HOA', 'H.O.A.', 'Association', 'Homeowners', 'Homeowner', 'Community',
  'Trust', 'Estate', 'Estates', 'Living Trust', 'Family Trust', 'Revocable Trust',
  'Church', 'Ministry', 'Ministries', 'Temple', 'Mosque', 'Synagogue',
  'Group', 'Partners', 'Partnership', 'Enterprises', 'Services', 'Solutions',
  'Apartments', 'Apartment', 'Complex'
];

function isBusinessName(name) {
  if (!name) return false;
  for (const keyword of BUSINESS_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword.replace(/\./g, '\\.')}\\b`, 'i');
    if (regex.test(name)) return true;
  }
  return false;
}

function inferOrgType(name) {
  if (/\b(HOA|H\.O\.A\.|ASSOCIATION|HOMEOWNERS?)\b/i.test(name)) return 'hoa';
  if (/\b(PROPERTY|PROPERTIES|MANAGEMENT|REALTY|REAL ESTATE|RENTALS)\b/i.test(name)) return 'property_management';
  if (/\b(CHURCH|MINISTRY|MINISTRIES|TEMPLE|MOSQUE|SYNAGOGUE)\b/i.test(name)) return 'church';
  if (/\b(APARTMENTS?|COMPLEX)\b/i.test(name)) return 'apartment_complex';
  return 'other';
}

async function parseCSV(filePath) {
  const records = [];
  const parser = createReadStream(filePath).pipe(
    parse({ columns: true, skip_empty_lines: true, trim: true })
  );

  for await (const record of parser) {
    records.push(record);
  }
  return records;
}

function parseOwnerName(owner) {
  if (!owner || owner === 'NOT AVAIL FROM COUNTY' || owner === 'N/A') {
    return null;
  }

  // Handle formats like "LASTNAME,FIRSTNAME & SPOUSE" or "LASTNAME,FIRSTNAME"
  const parts = owner.split(',');
  if (parts.length >= 2) {
    const lastName = parts[0].trim();
    let firstName = parts[1].trim().split('&')[0].trim().split(' ')[0];
    // Title case
    firstName = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
    const lastNameFormatted = lastName.charAt(0).toUpperCase() + lastName.slice(1).toLowerCase();
    return `${firstName} ${lastNameFormatted}`;
  }
  return owner;
}

function cleanPhone(phone) {
  if (!phone) return null;
  // Remove non-digits
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits[0] === '1') return digits.slice(1);
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find(a => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');

  if (!filePath) {
    console.error('Usage: node scripts/import-clay-list.js <csv-file> [--dry-run]');
    process.exit(1);
  }

  console.log('Clay List Import');
  console.log('=================');
  if (dryRun) console.log('DRY RUN - no changes will be made');
  console.log(`File: ${filePath}\n`);

  const records = await parseCSV(filePath);
  console.log(`Found ${records.length} records\n`);

  let projectsCreated = 0;
  let projectsSkipped = 0;
  let prospectsCreated = 0;
  let prospectsSkipped = 0;
  let orgsCreated = 0;
  let errors = 0;

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const progress = `[${i + 1}/${records.length}]`;

    try {
      const address = row['Address']?.trim();
      const city = row['City']?.trim();
      const owner = row['Owner'];
      const phone = cleanPhone(row['Phone Number']);
      const sqFt = parseInt(row['Sq Ft']) || null;
      const beds = parseInt(row['Beds']) || null;
      const baths = parseFloat(row['Baths']) || null;
      const estValue = parseInt(row['Est Value']?.replace(/\D/g, '')) || null;
      const estEquity = parseInt(row['Est Equity $']?.replace(/\D/g, '')) || null;
      const ownerOccupied = row['Owner Occ?'] === '1';

      if (!address) {
        console.log(`${progress} Skipped: no address`);
        errors++;
        continue;
      }

      // Check if project exists by address
      const existingProject = await prisma.project.findFirst({
        where: {
          address: { equals: address, mode: 'insensitive' },
          city: { equals: city, mode: 'insensitive' },
          tenant: TENANT
        }
      });

      let projectId;

      if (existingProject) {
        projectId = existingProject.id;
        projectsSkipped++;
      } else {
        projectId = `proj_clay_${createId()}`;

        if (!dryRun) {
          await prisma.project.create({
            data: {
              id: projectId,
              tenant: TENANT,
              address,
              city,
              state: 'KS',
              postalCode: '66206',
              name: address,
              notepad: JSON.stringify({ sqFt, beds, baths, estValue, estEquity, ownerOccupied, type: row['Type'] }),
              createdAt: new Date()
            }
          });
        }
        projectsCreated++;
      }

      // Create prospect if we have owner info
      const ownerName = parseOwnerName(owner);
      if (ownerName && projectId) {
        // Check if prospect exists for this project
        const existingProspect = await prisma.prospect.findFirst({
          where: {
            projectId,
            name: { equals: ownerName, mode: 'insensitive' }
          }
        });

        if (!existingProspect) {
          const prospectId = createId();
          if (!dryRun) {
            await prisma.prospect.create({
              data: {
                id: prospectId,
                whitepagesId: `clay_${createId()}`,
                projectId,
                name: ownerName,
                phones: phone ? [{ phone_number: phone, line_type: 'unknown' }] : null,
                isHomeowner: true,
                isCurrentResident: ownerOccupied,
                tenant: TENANT,
                campaign: '66206 List'
              }
            });

            // If business name, also create Organization and link
            if (isBusinessName(ownerName)) {
              const orgType = inferOrgType(ownerName);
              const org = await prisma.organization.create({
                data: {
                  name: ownerName,
                  type: orgType,
                  address,
                  city,
                  state: 'KS',
                  postalCode: '66206',
                  phone: phone || null,
                  notes: 'Auto-created from import (business name detected)',
                  tenant: TENANT
                }
              });

              await prisma.organizationContact.create({
                data: {
                  organizationId: org.id,
                  prospectId,
                  name: ownerName,
                  phone: phone || null,
                  isPrimary: true
                }
              });
              orgsCreated++;
            }
          }
          prospectsCreated++;
        } else {
          prospectsSkipped++;
        }
      }

      if ((i + 1) % 100 === 0) {
        console.log(`${progress} Processing... (${projectsCreated} projects, ${prospectsCreated} prospects)`);
      }

    } catch (error) {
      console.error(`${progress} Error:`, error.message);
      errors++;
    }
  }

  console.log('\n=================');
  console.log('Import complete!');
  console.log(`  Projects created: ${projectsCreated}`);
  console.log(`  Projects skipped (existing): ${projectsSkipped}`);
  console.log(`  Prospects created: ${prospectsCreated}`);
  console.log(`  Prospects skipped (existing): ${prospectsSkipped}`);
  console.log(`  Organizations created: ${orgsCreated}`);
  console.log(`  Errors: ${errors}`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
