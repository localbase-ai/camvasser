// Bulk add "Door Hanger" tag to projects by street address
// Usage: node scripts/tag-addresses-door-hanger.js [--dry-run]

import { PrismaClient } from '@prisma/client';
import 'dotenv/config';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

const ADDRESSES = [
  '402 SW Springwater Ridge',
  '2406 SW Springwater Ridge',
  '809 SW Forestpark Ln',
  '801 SW Forestpark Ln',
  '805 SW Forestpark Ln',
  '2274 SW Forestpark Blvd',
  '2348 SW Waterfall Dr',
  '2344 SW Waterfall Dr',
  '2340 SW Waterfall Dr',
  '2336 SW Waterfall Dr',
  '424 SW Waterfall Ct',
  '416 SW Waterfall Ct',
  '412 SW Waterfall Ct',
  '408 SW Waterfall Ct',
  '400 SW Waterfall Ct',
  '404 SW Waterfall Ct',
  '401 SW Waterfall Ct',
  '409 SW Waterfall Ct',
  '413 SW Waterfall Ct',
  '2312 SW Waterfall Dr',
  '2308 SW Waterfall Dr',
  '2304 SW Waterfall Dr',
  '2300 SW Waterfall Dr',
  '2236 SW Waterfall Pl',
  '2234 SW Waterfall Pl',
  '2230 SW Waterfall Pl',
  '2232 SW Waterfall Pl',
  '2228 SW Waterfall Pl',
  '2226 SW Waterfall Dr',
  '2224 SW Waterfall Dr',
  '2220 SW Waterfall Dr',
  '2216 SW Waterfall Dr',
  '2212 SW Waterfall Dr',
  '2208 SW Waterfall Dr',
  '2200 SW Waterfall Dr',
  '2204 SW Waterfall Dr',
  '2154 SW Hunt Cir',
  '809 SW Springwater Ln',
  '812 SW Springwater Ln',
  '804 SW Springwater Ln',
  '816 SW Springwater Ln',
  '805 SW Springwater Ln',
  '813 SW Springwater Ln',
  '800 SW Springwater Ln',
  '801 SW Springwater Ln',
  '720 SW Springwater Ln',
  '716 SW Springwater Ln',
  '712 SW Springwater Ln',
  '708 SW Springwater Ln',
  '704 SW Springwater Ln',
  '700 SW Springwater Ln',
  '2412 SW Springwater Dr',
  '2413 SW Springwater Dr',
  '2409 SW Springwater Dr',
  '2408 SW Springwater Dr',
  '2400 SW Springwater Dr',
  '2404 SW Springwater Dr',
  '701 SW Forestpark Ln',
  '705 SW Forestpark Ln',
  '709 SW Forestpark Ln',
  '2401 SW Springwater Dr',
  '2405 SW Springwater Dr',
  '2418 SW Springwater Ridge',
  '2422 SW Springwater Ridge',
  '2410 SW Springwater Ridge',
  '2414 SW Springwater Ridge',
  '2411 SW Springwater Ridge',
  '2407 SW Springwater Ridge',
  '2415 SW Springwater Ridge',
  '2150 SW Hunt Cir',
  '2151 SW Hunt Cir',
  '2155 SW Hunt Cir',
  '2154 SW Forestpark Ct',
  '2150 SW Forestpark Ct',
  '2151 SW Forestpark Ct',
  '2155 SW Forestpark Ct',
  '2345 SW Waterfall Dr',
  '2341 SW Waterfall Dr',
  '2329 SW Waterfall Dr',
  '2321 SW Waterfall Dr',
  '2313 SW Waterfall Dr',
  '2309 SW Waterfall Dr',
  '2305 SW Waterfall Dr',
  '2225 SW Waterfall Dr',
  '2223 SW Waterfall Dr',
  '2221 SW Waterfall Dr',
  '400 SW Tucker Ridge',
  '2209 SW Waterfall Dr',
  '401 SW Tucker Ridge',
  '2201 SW Waterfall Dr',
  '2205 SW Waterfall Dr',
  '2200 SW Forestpark Cir',
  '2204 SW Forestpark Cir',
  '2201 SW Forestpark Cir',
  '2250 SW Forestpark Pl',
  '2254 SW Forestpark Pl',
  '2262 SW Forestpark Pl',
  '416 SW Tucker Ridge',
  '412 SW Tucker Ridge',
  '408 SW Tucker Ridge',
  '404 SW Tucker Ridge',
  '405 SW Tucker Ridge',
  '413 SW Tucker Ridge',
  '409 SW Tucker Ridge',
  '505 SW Trailpark Dr',
  '601 SW Trailpark Dr',
  '605 SW Trailpark Cir',
  '609 SW Trailpark Dr',
  '613 SW Trailpark Dr',
  '701 SW Trailpark Dr',
  '705 SW Trailpark Dr',
  '709 SW Trailpark Dr',
  '2116 SW Walden Dr',
  '2112 SW Walden Dr',
  '2108 SW Walden Dr',
  '2104 SW Walden Dr',
  '2100 SW Walden Dr',
  '2024 SW Walden Dr',
  '2020 SW Walden Dr',
  '2016 SW Walden Dr',
  '2012 SW Walden Dr',
  '2008 SW Walden Dr',
  '2004 SW Walden Dr',
  '2000 SW Walden Dr',
  '2101 SW Cedar Hill Ln',
  '2105 SW Cedar Hill Ln',
  '2109 SW Cedar Hill Ln',
  '2113 SW Cedar Hill Ln',
  '2117 SW Cedar Hill Ln',
  '2121 SW Cedar Hill Ln',
  '2125 SW Cedar Hill Ln',
  '2129 SW Cedar Hill Ln',
  '2133 SW Cedar Hill Ln',
  '2132 SW Cedar Hill Ln',
  '2117 SW Walden Dr',
  '2113 SW Walden Dr',
  '2109 SW Walden Dr',
  '2105 SW Walden Dr',
  '2025 SW Walden Dr',
  '2021 SW Walden Dr',
  '2013 SW Walden Dr',
  '2104 SW Cedar Hill Ln',
  '2116 SW Cedar Hill Ln',
  '2120 SW Cedar Hill Ln',
  '2124 SW Cedar Hill Ln',
  '2128 SW Cedar Hill Ln',
  '700 SW Cutter Ln',
  '702 SW Cutter Ln',
  '704 SW Cutter Ln',
  '708 SW Cutter Ln',
  '800 SW Cutter Ct',
  '804 SW Cutter Ct',
  '808 SW Cutter Ct',
  '812 SW Cutter Ct',
  '816 SW Cutter Ct',
  '820 SW Cutter Ln',
  '824 SW Cutter Ln',
  '828 SW Cutter Ln',
  '2221 SW Walden Pl',
  '832 SW Cutter Ln',
  '2217 SW Walden Pl',
  '2213 SW Walden Pl',
  '732 SW Trailpark Dr',
  '2201 SW Walden Dr',
  '2209 SW Walden Dr',
  '2225 SW Walden Pl',
  '2229 SW Walden Pl',
  '2233 SW Walden Dr',
  '2241 SW Walden Dr',
  '2245 SW Walden Dr',
  '2249 SW Walden Dr',
  '2253 SW Walden Dr',
  '821 SW Cutter Ln',
  '825 SW Cutter Ln',
  '829 SW Cutter Ln',
  '833 SW Cutter Ln',
  '2200 SW Walden Dr',
  '2204 SW Walden Dr',
  '2208 SW Walden Dr',
  '2212 SW Walden Dr',
  '2216 SW Walden Dr',
  '2236 SW Walden Ct',
  '621 SW Walden Ln',
  '624 SW Walden Ln',
  '709 SW Cutter Ln',
  '705 SW Cutter Ln',
  '701 SW Cutter Ln',
  '620 SW Walden Ln',
  '616 SW Walden Ln',
  '612 SW Walden Ln',
  '608 SW Walden Ln',
  '604 SW Walden Ln',
  '600 SW Walden Ln',
  '609 SW Walden Ln',
  '613 SW Walden Ln',
  '617 SW Walden Ln',
  '2232 SW Walden Ct',
  '2228 SW Walden Ct',
  '2224 SW Walden Ct',
  '2220 SW Walden Ct',
  '708 SW Trailpark Ct',
  '712 SW Trailpark Ct',
  '716 SW Trailpark Dr',
  '612 SW Trailpark Cir',
  '604 SW Trailpark Cir',
  '600 SW Trailpark Cir',
  '554 SW Trailpark Dr',
  '550 SW Trailpark Dr',
  '1031 SW Ayrshire Dr',
  '1032 SW Ayrshire Dr',
  '2656 SW Heather Dr',
  '2661 SW Heather Dr',
  '2657 SW Heather Dr',
  '1036 SW Ayrshire Dr',
  '2658 SW Heather Dr',
  '994 SW Ayrshire Dr',
  '990 SW Ayrshire Dr',
  '986 SW Ayrshire Dr',
  '987 SW Perth Shire Dr',
  '991 SW Perth Shire Dr',
  '995 SW Perth Shire Dr',
  '1004 SW Perth Shire Dr',
  '1000 SW Perth Shire Dr',
  '996 SW Perth Shire Dr',
  '992 SW Perth Shire Dr',
  '988 SW Perth Shire Dr',
  '984 SW Perth Shire Dr',
  '980 SW Perth Shire Dr',
  '2664 SW 9th Terrace',
  '2660 SW 9th Terrace',
  '2656 SW 9th Terrace',
  '2652 SW 9th Terrace',
  '2648 SW 9th Terrace',
  '2644 SW 9th Terrace',
  '981 SW Ayrshire Dr',
  '985 SW Ayrshire Dr',
  '989 SW Ayrshire Dr',
  '993 SW Ayrshire Dr',
  '997 SW Ayrshire Dr',
  '1001 SW Ayrshire Dr',
  '1005 SW Ayrshire Dr',
  '1009 SW Ayrshire Dr',
  '1013 SW Ayrshire Dr',
  '1023 SW Ayrshire Dr',
  '1021 SW Ayrshire Dr',
  '1027 SW Ayrshire Dr',
  '900 SW Blazing Star Dr',
  '2512 SW 9th Terrace',
  '2508 SW 9th Terrace',
  '2504 SW 9th Terrace',
  '2500 SW 9th Terrace',
  '2505 SW 9th Terrace',
  '2509 SW 9th Terrace',
  '2513 SW 9th Terrace',
  '2517 SW 9th Terrace',
  '2521 SW 9th Terrace',
  '2600 SW 9th Terrace',
  '2604 SW 9th Terrace',
  '2608 SW 9th Terrace',
  '2616 SW 9th Terrace',
  '2612 SW 9th Terrace',
  '2620 SW 9th Terrace',
  '2624 SW 9th Terrace',
  '2632 SW 9th Terrace',
  '2636 SW 9th Terrace',
  '2640 SW 9th Terrace',
  '2633 SW 9th Terrace',
  '2637 SW 9th Terrace',
  '2625 SW 9th Terrace',
  '2621 SW 9th Terrace',
  '2617 SW 9th Terrace',
  '2613 SW 9th Terrace',
  '2609 SW 9th Terrace',
  '2605 SW 9th Terrace',
  '912 SW Blazing Star Dr',
  '2524 SW 10th St',
  '2520 SW 10th St',
  '2516 SW 10th St',
  '2512 SW 10th St',
  '2508 SW 10th St',
  '2504 SW 10th St',
  '2500 SW 10th St',
  '2505 SW 10th St',
  '2501 SW 10th St',
  '2509 SW 10th St',
  '2513 SW 10th St',
  '2517 SW 10th St',
  '2521 SW 10th St',
  '2525 SW 10th St',
  '2529 SW 10th St',
  '916 SW Blazing Star Dr',
  '920 SW Blazing Star Dr',
  '2604 SW 10th St',
  '2608 SW 10th St',
  '2612 SW 10th St',
  '2616 SW 10th St',
  '2620 SW 10th St',
  '2624 SW 10th St',
  '2628 SW 10th St',
  '2629 SW 10th St',
  '2609 SW 10th Ct',
  '2605 SW 10th Ct',
  '2601 SW 10th Ct',
  '1004 SW Blazing Star Dr',
  '1008 SW Blazing Star Dr',
  '1012 SW Blazing Star Dr',
  '2600 SW 11th St',
  '2604 SW 11th St',
  '2608 SW 11th St',
  '2612 SW 11th St',
  '2616 SW 11th St',
  '2528 SW 10th Terrace',
  '2524 SW 10th Terrace',
  '2520 SW 10th Terrace',
  '2516 SW 10th Terrace',
  '2512 SW 10th Terrace',
  '2508 SW 10th Terrace',
  '2504 SW 10th Terrace',
  '2500 SW 10th Terrace',
  '2501 SW 10th Terrace',
  '2505 SW 10th Terrace',
  '2509 SW 10th Terrace',
  '2513 SW 10th Terrace',
  '2517 SW 10th Terrace',
  '2521 SW 10th Terrace',
  '2525 SW 10th Terrace',
  '1001 SW Blazing Star Dr',
  '1005 SW Blazing Star Dr',
  '1009 SW Blazing Star Dr',
  '2528 SW 11th St',
  '2524 SW 11th St',
  '2520 SW 11th St',
  '2516 SW 11th St',
  '2512 SW 11th St',
  '2508 SW 11th St',
  '2504 SW 11th St',
  '2500 SW 11th St',
  '1109 SW Blazing Star Dr',
  '1121 SW Blazing Star Ct',
  '1113 SW Blazing Star Dr',
  '1117 SW Blazing Star Dr',
  '1125 SW Blazing Star Ct',
  '1129 SW Blazing Star Ct',
  '1145 SW Blazing Star Ct',
  '1141 SW Blazing Star Ct',
  '1137 SW Blazing Star Ct',
  '1133 SW Blazing Star Ct',
  '2528 SW Blazing Star Pl',
  '2524 SW Blazing Star Pl',
  '2520 SW Blazing Star Pl',
  '2516 SW Blazing Star Pl',
  '2512 SW Blazing Star Pl',
  '2508 SW Blazing Star Pl',
  '2504 SW Blazing Star Pl',
  '2500 SW 11th Ct',
  '2501 SW 11th Ct',
  '2505 SW Blazing Star Pl',
  '2509 SW 11th Ct',
  '2513 SW Blazing Star Pl',
  '2517 SW Blazing Star Pl',
  '2521 SW Blazing Star Pl',
  '2525 SW Blazing Star Pl',
  '2529 SW Blazing Star Pl',
  '2533 SW Blazing Star Pl',
  '2624 SW Blazing Star Cir',
  '2620 SW Blazing Star Cir',
  '2616 SW Blazing Star Cir',
  '2612 SW Blazing Star Cir',
  '2613 SW Blazing Star Cir',
  '2617 SW Blazing Star Cir',
  '2621 SW Blazing Star Cir',
  '2625 SW Blazing Star Cir',
  '1212 SW Blazing Star Dr',
  '1200 SW Blazing Star Dr',
  '1140 SW Blazing Star Dr',
  '1136 SW Blazing Star Dr',
  '1132 SW Blazing Star Dr',
  '2613 SW 11th St',
  '1100 SW Blazing Star Dr',
  '1104 SW Blazing Star Dr',
  '1108 SW Blazing Star Dr',
  '1112 SW Blazing Star Dr',
  '1116 SW Blazing Star Dr',
  '1120 SW Blazing Star Dr',
  '1124 SW Blazing Star Dr',
  '1128 SW Blazing Star Dr',
];

function normalize(addr) {
  return addr.replace(/\s+/g, ' ').trim().toLowerCase();
}

function generateProjectId() {
  return 'proj_local_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

const targetSet = new Set(ADDRESSES.map(normalize));

// Default location for all these addresses
const CITY = "Lee's Summit";
const STATE = 'MO';
const POSTAL_CODE = '64081';
const TENANT = 'budroofing';

async function main() {
  console.log(`Door Hanger Tag Script — ${ADDRESSES.length} addresses`);
  console.log(dryRun ? 'MODE: DRY RUN\n' : 'MODE: LIVE\n');

  const projects = await prisma.project.findMany({
    where: { address: { not: null } },
    select: { id: true, address: true, tags: true }
  });

  console.log(`Found ${projects.length} total projects with addresses\n`);

  let tagged = 0;
  let alreadyTagged = 0;
  let created = 0;
  const matched = new Set();

  for (const p of projects) {
    const normAddr = normalize(p.address);
    if (!targetSet.has(normAddr)) continue;

    matched.add(normAddr);
    const tags = Array.isArray(p.tags) ? p.tags : [];

    const hasDoorHanger = tags.some(
      t => t?.value && t.value.toLowerCase() === 'door hanger'
    );

    if (hasDoorHanger) {
      alreadyTagged++;
      console.log(`  SKIP (already tagged): ${p.address}`);
      continue;
    }

    const newTags = [...tags, { value: 'Door Hanger' }];

    if (!dryRun) {
      await prisma.project.update({
        where: { id: p.id },
        data: { tags: newTags }
      });
    }

    console.log(`  ${dryRun ? 'WOULD TAG' : 'TAGGED'}: ${p.address}`);
    tagged++;
  }

  // Create missing projects with Door Hanger tag
  const unmatched = ADDRESSES.filter(a => !matched.has(normalize(a)));
  if (unmatched.length > 0) {
    console.log(`\n--- Creating ${unmatched.length} missing projects ---`);
    for (const addr of unmatched) {
      const id = generateProjectId();

      if (!dryRun) {
        await prisma.project.create({
          data: {
            id,
            tenant: TENANT,
            address: addr,
            city: CITY,
            state: STATE,
            postalCode: POSTAL_CODE,
            name: addr,
            status: 'active',
            tags: [{ value: 'Door Hanger' }],
            createdAt: new Date(),
            updatedAt: new Date(),
            lastSyncedAt: new Date()
          }
        });
      }

      console.log(`  ${dryRun ? 'WOULD CREATE' : 'CREATED'}: ${addr}`);
      created++;
    }
  }

  console.log(`\n========================`);
  console.log(`Tagged (existing): ${tagged}`);
  console.log(`Already had tag: ${alreadyTagged}`);
  console.log(`Created + tagged: ${created}`);
  console.log(`Total: ${tagged + alreadyTagged + created}`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
