// Resync tags from CompanyCam to local database
// Usage: node scripts/resync-tags.js [--tenant=budroofing] [--dry-run]

import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import 'dotenv/config';

const prisma = new PrismaClient();

const API_TOKEN = process.env.COMPANYCAM_API_TOKEN || process.env.BUDROOFING_COMPANYCAM_TOKEN;

if (!API_TOKEN) {
  console.error('Error: No CompanyCam API token found. Set COMPANYCAM_API_TOKEN or BUDROOFING_COMPANYCAM_TOKEN');
  process.exit(1);
}

async function fetchProjectLabels(projectId) {
  try {
    const response = await axios.get(
      `https://api.companycam.com/v2/projects/${projectId}/labels`,
      {
        headers: {
          'Authorization': `Bearer ${API_TOKEN}`,
          'Accept': 'application/json'
        },
        timeout: 10000
      }
    );
    return response.data || [];
  } catch (error) {
    if (error.response?.status === 404) {
      return [];
    }
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const tenantArg = args.find(a => a.startsWith('--tenant='));
  const tenant = tenantArg ? tenantArg.split('=')[1] : null;

  console.log(`Resyncing tags from CompanyCam...`);
  if (dryRun) console.log('(DRY RUN - no changes will be made)');
  if (tenant) console.log(`Filtering by tenant: ${tenant}`);

  // Get all projects
  const where = tenant ? { tenant } : {};
  const projects = await prisma.project.findMany({
    where,
    select: { id: true, address: true, tags: true }
  });

  console.log(`Found ${projects.length} projects to sync\n`);

  let updated = 0;
  let unchanged = 0;
  let errors = 0;

  for (let i = 0; i < projects.length; i++) {
    const project = projects[i];
    const progress = `[${i + 1}/${projects.length}]`;

    try {
      // Fetch fresh labels from CompanyCam
      const labels = await fetchProjectLabels(project.id);

      // Format labels for storage
      const formattedLabels = labels.map(label => ({
        id: label.id,
        displayValue: label.display_value,
        value: label.value,
        tagType: label.tag_type
      }));

      // Compare with existing tags
      const existingTags = project.tags || [];
      const existingIds = new Set(existingTags.map(t => t.id));
      const newIds = new Set(formattedLabels.map(t => t.id));

      const tagsChanged = existingIds.size !== newIds.size ||
        [...existingIds].some(id => !newIds.has(id)) ||
        [...newIds].some(id => !existingIds.has(id));

      if (tagsChanged) {
        const oldCount = existingTags.length;
        const newCount = formattedLabels.length;

        if (!dryRun) {
          await prisma.project.update({
            where: { id: project.id },
            data: { tags: formattedLabels }
          });
        }

        console.log(`${progress} ${project.address || project.id}: ${oldCount} -> ${newCount} tags`);
        updated++;
      } else {
        unchanged++;
      }

      // Rate limit - small delay between requests
      await new Promise(r => setTimeout(r, 100));

    } catch (error) {
      console.error(`${progress} Error syncing ${project.id}:`, error.message);
      errors++;
    }
  }

  console.log(`\nSync complete!`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Unchanged: ${unchanged}`);
  console.log(`  Errors: ${errors}`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
