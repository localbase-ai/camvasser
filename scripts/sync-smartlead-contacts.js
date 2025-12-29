import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_KEY = process.env.SMARTLEAD_API_KEY || 'd5660b37-5572-4f17-b72d-18ccd7a01bf6_d867d1e';

const CAMPAIGN_IDS = [355169, 256177, 256083, 251581, 239753, 233075, 231543, 219728, 215968, 215469, 215394];

async function fetchCampaignStats(campaignId) {
  const url = `https://server.smartlead.ai/api/v1/campaigns/${campaignId}/statistics?api_key=${API_KEY}`;
  const response = await fetch(url);
  const data = await response.json();
  return data;
}

async function fetchCampaignInfo(campaignId) {
  const url = `https://server.smartlead.ai/api/v1/campaigns/${campaignId}?api_key=${API_KEY}`;
  const response = await fetch(url);
  return response.json();
}

function normalizeEmail(email) {
  return email?.toLowerCase().trim() || null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (dryRun) {
    console.log('=== DRY RUN MODE ===\n');
  }

  // Collect all SmartLead contacts
  const smartleadContacts = new Map(); // email -> contact info

  console.log('Fetching SmartLead campaigns...\n');

  for (const campaignId of CAMPAIGN_IDS) {
    const [stats, info] = await Promise.all([
      fetchCampaignStats(campaignId),
      fetchCampaignInfo(campaignId)
    ]);

    const campaignName = info.name || `Campaign ${campaignId}`;
    const leads = stats.data || [];

    console.log(`${campaignName}: ${leads.length} leads`);

    for (const lead of leads) {
      const email = normalizeEmail(lead.lead_email);
      if (!email) continue;

      // Keep most recent / most engaged version
      const existing = smartleadContacts.get(email);
      const newContact = {
        email,
        name: lead.lead_name,
        campaignId,
        campaignName,
        bounced: lead.is_bounced,
        unsubscribed: lead.is_unsubscribed,
        opened: (lead.open_count || 0) > 0,
        clicked: (lead.click_count || 0) > 0,
        replied: lead.reply_time !== null,
        sentTime: lead.sent_time
      };

      if (!existing || newContact.replied || newContact.clicked || newContact.opened) {
        smartleadContacts.set(email, newContact);
      }
    }
  }

  console.log(`\nTotal unique SmartLead contacts: ${smartleadContacts.size}`);

  // Match against Camvasser leads
  const leads = await prisma.lead.findMany({
    where: { email: { not: null } },
    select: { id: true, email: true, firstName: true, lastName: true, status: true, flowData: true }
  });

  console.log(`Camvasser leads with email: ${leads.length}`);

  let matched = 0;
  let newContacts = 0;
  let bounced = 0;
  let unsubscribed = 0;

  const updates = [];

  for (const [email, slContact] of smartleadContacts) {
    const lead = leads.find(l => normalizeEmail(l.email) === email);

    if (lead) {
      matched++;

      // Update flowData with SmartLead info
      const flowData = lead.flowData || {};
      flowData.smartlead = {
        campaignId: slContact.campaignId,
        campaignName: slContact.campaignName,
        bounced: slContact.bounced,
        unsubscribed: slContact.unsubscribed,
        opened: slContact.opened,
        clicked: slContact.clicked,
        replied: slContact.replied,
        lastSentTime: slContact.sentTime,
        syncedAt: new Date().toISOString()
      };

      updates.push({ id: lead.id, flowData, slContact });

      if (slContact.bounced) bounced++;
      if (slContact.unsubscribed) unsubscribed++;
    } else {
      newContacts++;
    }
  }

  // Collect contacts not in Camvasser
  const newProspects = [];
  for (const [email, slContact] of smartleadContacts) {
    const lead = leads.find(l => normalizeEmail(l.email) === email);
    if (!lead) {
      newProspects.push(slContact);
    }
  }

  console.log(`\nMatched to Camvasser leads: ${matched}`);
  console.log(`New contacts to import: ${newProspects.length}`);
  console.log(`Bounced: ${bounced}`);
  console.log(`Unsubscribed: ${unsubscribed}`);

  // Check for existing prospects by email to avoid dupes
  const existingProspects = await prisma.prospect.findMany({
    select: { id: true, emails: true }
  });

  const prospectEmailSet = new Set();
  for (const p of existingProspects) {
    if (Array.isArray(p.emails)) {
      for (const e of p.emails) {
        const email = typeof e === 'string' ? e : e.email || e.email_address;
        if (email) prospectEmailSet.add(normalizeEmail(email));
      }
    }
  }

  const toCreate = newProspects.filter(c => !prospectEmailSet.has(c.email));
  console.log(`After deduping against existing prospects: ${toCreate.length} to create`);

  // Apply updates
  if (!dryRun) {
    // Update matched leads with SmartLead data
    if (updates.length > 0) {
      console.log(`\nUpdating ${updates.length} leads with SmartLead data...`);
      for (const update of updates) {
        await prisma.lead.update({
          where: { id: update.id },
          data: { flowData: update.flowData }
        });
      }
    }

    // Create new prospects for SmartLead-only contacts
    if (toCreate.length > 0) {
      console.log(`Creating ${toCreate.length} new prospects...`);

      let created = 0;
      for (const contact of toCreate) {
        // Parse name
        const nameParts = (contact.name || 'Unknown').split(' ');
        const firstName = nameParts[0] || 'Unknown';
        const lastName = nameParts.slice(1).join(' ') || '';
        const fullName = `${firstName} ${lastName}`.trim();

        // Determine status based on SmartLead engagement
        let status = 'emailed';
        if (contact.bounced) status = 'bounced';
        else if (contact.replied) status = 'replied';
        else if (contact.clicked) status = 'clicked';
        else if (contact.opened) status = 'opened';

        const whitepagesId = `smartlead_${contact.email.replace(/[^a-z0-9]/gi, '_')}`;

        try {
          await prisma.prospect.create({
            data: {
              whitepagesId,
              name: fullName,
              emails: [contact.email],
              phones: [],
              isHomeowner: false,
              isCurrentResident: false,
              tenant: 'budroofing',
              status,
              notes: `Imported from SmartLead campaign: ${contact.campaignName}`
            }
          });
          created++;
        } catch (e) {
          // Skip dupes
          if (!e.message.includes('Unique constraint')) {
            console.error(`Error creating prospect for ${contact.email}:`, e.message);
          }
        }
      }
      console.log(`Created ${created} new prospects`);
    }

    console.log('\nDone!');
  }

  if (dryRun) {
    console.log('\n=== DRY RUN - no changes made ===');
  }

  await prisma.$disconnect();
}

main().catch(console.error);
