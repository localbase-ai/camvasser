import { PrismaClient } from '@prisma/client';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();
const hoaDbPath = path.join(process.env.HOME, 'Work/scraperish/leawood_hoa.db');

async function main() {
  const hoaDb = new Database(hoaDbPath, { readonly: true });

  // Get management companies
  const managementCompanies = hoaDb.prepare('SELECT * FROM management_companies').all();
  console.log(`Found ${managementCompanies.length} management companies`);

  // Get HOA contacts
  const hoaContacts = hoaDb.prepare(`
    SELECT h.*, m.name as mgmt_name, m.phone as mgmt_phone, m.email as mgmt_email
    FROM hoa_contacts h
    LEFT JOIN management_companies m ON h.management_company_id = m.id
  `).all();
  console.log(`Found ${hoaContacts.length} HOA contacts`);

  const tenant = 'budroofing';

  // Create management companies as Organizations (type: property_management)
  console.log('\n--- Creating Management Companies ---');
  const mgmtOrgMap = new Map();

  for (const mc of managementCompanies) {
    if (!mc.name || mc.name.trim() === '') continue;

    const existing = await prisma.organization.findFirst({
      where: { name: mc.name, type: 'property_management', tenant }
    });

    if (existing) {
      console.log(`  Skipping existing: ${mc.name}`);
      mgmtOrgMap.set(mc.id, existing.id);
      continue;
    }

    const org = await prisma.organization.create({
      data: {
        name: mc.name,
        type: 'property_management',
        phone: mc.phone || null,
        email: mc.email || null,
        address: mc.address || null,
        tenant
      }
    });
    console.log(`  Created: ${mc.name}`);
    mgmtOrgMap.set(mc.id, org.id);
  }

  // Create HOAs as Organizations (type: hoa)
  console.log('\n--- Creating HOAs ---');
  let hoasCreated = 0;
  let contactsCreated = 0;

  for (const hoa of hoaContacts) {
    if (!hoa.hoa_name || hoa.hoa_name.trim() === '') continue;

    // Check if HOA already exists
    let hoaOrg = await prisma.organization.findFirst({
      where: { name: hoa.hoa_name, type: 'hoa', tenant }
    });

    if (!hoaOrg) {
      // Create HOA organization
      hoaOrg = await prisma.organization.create({
        data: {
          name: hoa.hoa_name,
          type: 'hoa',
          phone: hoa.phone || null,
          email: hoa.email || null,
          website: hoa.website || null,
          address: hoa.street_address || null,
          city: hoa.city || 'Leawood',
          state: hoa.state || 'KS',
          postalCode: hoa.zip_code || null,
          tenant
        }
      });
      hoasCreated++;
      console.log(`  Created HOA: ${hoa.hoa_name}`);
    }

    // Create contact for this HOA if we have contact info
    if (hoa.contact_name && hoa.contact_name.trim() !== '') {
      const existingContact = await prisma.organizationContact.findFirst({
        where: {
          organizationId: hoaOrg.id,
          name: hoa.contact_name
        }
      });

      if (!existingContact) {
        await prisma.organizationContact.create({
          data: {
            organizationId: hoaOrg.id,
            name: hoa.contact_name,
            title: hoa.title || null,
            phone: hoa.phone || null,
            email: hoa.email || null,
            isPrimary: true
          }
        });
        contactsCreated++;
      }
    }

    // Link HOA to management company if applicable
    if (hoa.management_company_id && mgmtOrgMap.has(hoa.management_company_id)) {
      const mgmtOrgId = mgmtOrgMap.get(hoa.management_company_id);

      // Add the HOA contact as a contact of the management company too
      if (hoa.contact_name && hoa.contact_name.trim() !== '') {
        const mgmtContact = await prisma.organizationContact.findFirst({
          where: {
            organizationId: mgmtOrgId,
            name: hoa.contact_name
          }
        });

        if (!mgmtContact) {
          await prisma.organizationContact.create({
            data: {
              organizationId: mgmtOrgId,
              name: hoa.contact_name,
              title: `${hoa.title || 'Contact'} - ${hoa.hoa_name}`,
              phone: hoa.phone || null,
              email: hoa.email || null,
              isPrimary: false,
              notes: `HOA: ${hoa.hoa_name}`
            }
          });
        }
      }
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Management companies created: ${managementCompanies.length}`);
  console.log(`HOAs created: ${hoasCreated}`);
  console.log(`Contacts created: ${contactsCreated}`);

  hoaDb.close();
  await prisma.$disconnect();
}

main().catch(console.error);
