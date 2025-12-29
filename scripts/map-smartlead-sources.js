import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Campaign name patterns to lead source mapping
const CAMPAIGN_MAPPINGS = [
  { pattern: /Review Request/i, leadSource: 'Past Customer', isReviewRequest: true },
  { pattern: /Realtor/i, leadSource: 'B2B' },
  { pattern: /Property Manager/i, leadSource: 'B2B' },
  { pattern: /Insurance/i, leadSource: 'B2B' },
  { pattern: /Church/i, leadSource: 'B2B' },
  { pattern: /Olathe/i, leadSource: 'NAP-S' },
  { pattern: /NAP/i, leadSource: 'NAP' },
  { pattern: /Aged Leads/i, leadSource: 'NAP' },
  { pattern: /Wisetack/i, leadSource: 'NAP' },
  { pattern: /May 20/i, leadSource: 'NAP' },
];

function getCampaignFromNotes(notes) {
  if (!notes) return null;
  const match = notes.match(/Imported from SmartLead campaign: (.+)$/);
  return match ? match[1] : null;
}

function getLeadSourceForCampaign(campaignName) {
  if (!campaignName) return null;
  for (const mapping of CAMPAIGN_MAPPINGS) {
    if (mapping.pattern.test(campaignName)) {
      return { leadSource: mapping.leadSource, isReviewRequest: mapping.isReviewRequest || false };
    }
  }
  return { leadSource: 'NAP', isReviewRequest: false }; // Default to NAP
}

function normalizeEmail(email) {
  return email?.toLowerCase().trim() || null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (dryRun) {
    console.log('=== DRY RUN MODE ===\n');
  }

  // Get all SmartLead-imported prospects
  const prospects = await prisma.prospect.findMany({
    where: {
      whitepagesId: { startsWith: 'smartlead_' }
    },
    select: { id: true, whitepagesId: true, name: true, emails: true, notes: true }
  });

  console.log(`Found ${prospects.length} SmartLead-imported prospects\n`);

  // Get all leads for matching Review Request contacts
  const leads = await prisma.lead.findMany({
    where: { email: { not: null } },
    select: { id: true, email: true, firstName: true, lastName: true, flowData: true }
  });

  const leadEmailMap = new Map();
  for (const lead of leads) {
    const email = normalizeEmail(lead.email);
    if (email) leadEmailMap.set(email, lead);
  }

  // Track updates by category
  const stats = {
    nap: 0,
    napS: 0,
    b2b: 0,
    pastCustomer: 0,
    reviewRequestMatched: 0,
    reviewRequestUnmatched: 0,
    unknown: 0
  };

  const toUpdate = [];
  const reviewRequestToDelete = [];

  for (const prospect of prospects) {
    const campaignName = getCampaignFromNotes(prospect.notes);
    const { leadSource, isReviewRequest } = getLeadSourceForCampaign(campaignName);

    const prospectEmail = Array.isArray(prospect.emails) && prospect.emails.length > 0
      ? normalizeEmail(typeof prospect.emails[0] === 'string' ? prospect.emails[0] : prospect.emails[0]?.email)
      : null;

    if (isReviewRequest && prospectEmail) {
      // Review Request - try to match to existing lead (past customer)
      const existingLead = leadEmailMap.get(prospectEmail);

      if (existingLead) {
        // Mark prospect for deletion - the lead already exists
        reviewRequestToDelete.push({ prospect, lead: existingLead });
        stats.reviewRequestMatched++;

        // Update lead with review request flag
        const flowData = existingLead.flowData || {};
        flowData.reviewRequestSent = true;
        flowData.reviewRequestCampaign = campaignName;

        toUpdate.push({
          type: 'lead',
          id: existingLead.id,
          data: { flowData }
        });
      } else {
        // No matching lead - update prospect with Past Customer campaign
        toUpdate.push({
          type: 'prospect',
          id: prospect.id,
          data: { campaign: 'Past Customer' }
        });
        stats.reviewRequestUnmatched++;
      }
    } else {
      // Regular campaign - update campaign field with lead source
      toUpdate.push({
        type: 'prospect',
        id: prospect.id,
        data: { campaign: leadSource }
      });

      if (leadSource === 'NAP') stats.nap++;
      else if (leadSource === 'NAP-S') stats.napS++;
      else if (leadSource === 'B2B') stats.b2b++;
      else if (leadSource === 'Past Customer') stats.pastCustomer++;
      else stats.unknown++;
    }
  }

  console.log('Campaign mapping summary:');
  console.log(`  NAP: ${stats.nap}`);
  console.log(`  NAP-S: ${stats.napS}`);
  console.log(`  B2B: ${stats.b2b}`);
  console.log(`  Past Customer (unmatched): ${stats.reviewRequestUnmatched}`);
  console.log(`  Review Request (matched to existing leads): ${stats.reviewRequestMatched}`);
  console.log('');

  if (!dryRun) {
    // Apply updates
    let prospectUpdates = 0;
    let leadUpdates = 0;

    for (const update of toUpdate) {
      if (update.type === 'prospect') {
        await prisma.prospect.update({
          where: { id: update.id },
          data: update.data
        });
        prospectUpdates++;
      } else if (update.type === 'lead') {
        await prisma.lead.update({
          where: { id: update.id },
          data: update.data
        });
        leadUpdates++;
      }
    }

    console.log(`Updated ${prospectUpdates} prospects with leadSource`);
    console.log(`Updated ${leadUpdates} leads with review request flag`);

    // Delete duplicate Review Request prospects that matched existing leads
    if (reviewRequestToDelete.length > 0) {
      console.log(`\nDeleting ${reviewRequestToDelete.length} Review Request prospects (matched to existing leads):`);
      for (const { prospect, lead } of reviewRequestToDelete) {
        console.log(`  ${prospect.emails?.[0]} -> matched lead ${lead.firstName} ${lead.lastName}`);
        await prisma.prospect.delete({ where: { id: prospect.id } });
      }
    }

    console.log('\nDone!');
  } else {
    console.log('\n=== DRY RUN - no changes made ===');

    if (reviewRequestToDelete.length > 0) {
      console.log(`\nWould delete ${reviewRequestToDelete.length} Review Request prospects:`);
      for (const { prospect, lead } of reviewRequestToDelete) {
        console.log(`  ${prospect.emails?.[0]} -> would match to lead ${lead.firstName} ${lead.lastName}`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
