#!/usr/bin/env node
// Parse an EagleView wall measurement JSON and print a budgetary
// siding estimate with multiple material options, ready to paste
// into a QuickBooks estimate.
//
// Usage:
//   node scripts/eagleview-to-estimate.js <path-to-EVMeasurementJSON.JSON> [--html <output.html>]
//
// Markdown goes to stdout. With --html, also writes a styled
// printable HTML page suitable for opening in a browser.

import fs from 'node:fs';
import path from 'node:path';

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node scripts/eagleview-to-estimate.js <path-to-EVMeasurementJSON.JSON> [--html <output.html>]');
  process.exit(1);
}
const htmlIdx = process.argv.indexOf('--html');
const htmlPath = htmlIdx > -1 ? process.argv[htmlIdx + 1] : null;
const exIdx = process.argv.indexOf('--exclude');
const excludeDirs = exIdx > -1 ? process.argv[exIdx + 1].split(',').map(s => s.trim()) : [];
const shakeDeductIdx = process.argv.indexOf('--shake-deduct');
const shakeDeduct = shakeDeductIdx > -1 ? parseFloat(process.argv[shakeDeductIdx + 1]) : 0;

const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const ev = raw.EAGLEVIEW_EXPORT;
const loc = ev.LOCATION;
const summary = Object.fromEntries(
  ev.OVERALL_SUMMARY.ATTRIBUTE.map(a => [a['@name'], parseFloat(a['@value'])])
);

const totalWall = summary.TotalWallArea ?? 0;
const evTotalSiding = summary.TotalSidingAreaLessPenetrations ?? summary.TotalSidingArea ?? 0;
const totalMasonry = summary.TotalMasonryAreaLessPenetrations ?? summary.TotalMasonryArea ?? 0;

const faces = ev.STRUCTURES?.ROOF?.FACES?.FACE ?? [];
const mats = Object.fromEntries(ev.MATERIALS.MATERIAL.map(m => [m['@id'], m['@label']]));
const byDir = {};
for (const f of faces) {
  const dir = f.POLYGON?.['@direction'] ?? 'Unknown';
  const mat = mats[f['@material']] ?? 'None';
  const sz = parseFloat(f.POLYGON?.['@size'] ?? 0);
  if (!byDir[dir]) byDir[dir] = { Siding: 0, Masonry: 0 };
  if (mat === 'Siding') byDir[dir].Siding += sz;
  else if (mat === 'Masonry') byDir[dir].Masonry += sz;
}

// Apply scope exclusions
const excludedSiding = excludeDirs.reduce((sum, d) => sum + (byDir[d]?.Siding ?? 0), 0);
const totalSiding = Math.max(0, evTotalSiding - excludedSiding - shakeDeduct);

const WASTE = 0.10;
const orderQty = Math.ceil(totalSiding * (1 + WASTE));

// Budgetary rates — restored from April 23 research session, finalize before sending
const tearoffRate = 1.50;
const tearoffTotal = totalSiding * tearoffRate;

const options = [
  { name: 'T1-11 In-Kind Replacement',       rate: 5.00,  note: 'Like-for-like 4×8 vertical-groove plywood panels, factory-primed' },
  { name: 'Vinyl Siding',                    rate: 8.00,  note: 'Vinyl, board & batten or lap profile, low maintenance' },
  { name: 'LP SmartSide Engineered Wood',    rate: 10.00, note: 'Engineered wood, panel or lap, factory-primed, 50yr warranty' },
  { name: 'James Hardie Fiber Cement',       rate: 12.00, note: 'HardiePanel or HardiePlank, ColorPlus finish available' },
];

const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const out = [];
const w = (s = '') => out.push(s);

w(`# Siding Estimate — ${loc['@address']}, ${loc['@city']} ${loc['@state']} ${loc['@postal']}`);
w(`EagleView report: ${ev.REPORT['@reportId']}`);
w('');
w(`## Measurements`);
w(`- Total wall area: ${totalWall.toLocaleString()} sqft`);
w(`- Siding to replace: **${totalSiding.toLocaleString()} sqft** (net of penetrations)`);
w(`- Stone / masonry (no work): ${totalMasonry.toLocaleString()} sqft`);
w(`- Material order quantity (incl. ${WASTE * 100}% waste): **${orderQty.toLocaleString()} sqft**`);
w('');
w('### Per-elevation breakdown');
w('| Direction | Siding (sqft) | Masonry (sqft) |');
w('|-----------|--------------:|---------------:|');
for (const dir of ['North', 'East', 'South', 'West']) {
  const d = byDir[dir] ?? { Siding: 0, Masonry: 0 };
  w(`| ${dir} | ${Math.round(d.Siding).toLocaleString()} | ${Math.round(d.Masonry).toLocaleString()} |`);
}
w('');
w('---');
w('');
w('## Estimate line items (paste into QuickBooks)');
w('');
w('### Common to all options');
w(`1. **Tear-off & disposal of existing T1-11 siding** — ${totalSiding.toLocaleString()} sqft × $${tearoffRate.toFixed(2)} = ${fmt(tearoffTotal)}`);
w(`2. **Site protection, dumpster, debris haul-off** — Lump sum: $TBD`);
w(`3. **Trim, soffit, fascia rot repair** (T&M, as-needed) — Allowance: $TBD`);
w(`4. **Permits, inspection** — $TBD`);
w('');

for (const opt of options) {
  const matCost = orderQty * opt.rate;
  const subtotal = matCost + tearoffTotal;
  w(`### Option: ${opt.name}`);
  w(`*${opt.note}*`);
  w('');
  w(`- Install ${orderQty.toLocaleString()} sqft × $${opt.rate.toFixed(2)}/sqft = ${fmt(matCost)}`);
  w(`- Tear-off & disposal (from above) = ${fmt(tearoffTotal)}`);
  w(`- **Budgetary subtotal: ${fmt(subtotal)}** (excludes trim, soffit, permits)`);
  w('');
}

w('---');
w('');
w('## Notes for the customer');
w(`- All quantities derived from EagleView report ${ev.REPORT['@reportId']}.`);
w(`- Stone/masonry areas (${totalMasonry.toLocaleString()} sqft on the front) are not part of this scope.`);
w('- Pricing above is **budgetary**, finalized once a material is selected.');
w('- Trim, soffit, and fascia replacement priced T&M based on field condition.');
w('- Color, profile, and warranty options chosen with the selected material.');
w('');
w('## Pricing assumptions (internal — adjust before sending)');
w(`- Tear-off rate: $${tearoffRate.toFixed(2)}/sqft`);
w(`- Waste factor: ${WASTE * 100}%`);
w('- Material rates: KC mid-market budgetary, installed:');
for (const opt of options) {
  w(`  - ${opt.name}: $${opt.rate.toFixed(2)}/sqft`);
}

console.log(out.join('\n'));

if (htmlPath) {
  const optionRows = options.map(opt => {
    const matCost = orderQty * opt.rate;
    const subtotal = matCost + tearoffTotal;
    return `
    <section class="option">
      <h3>${opt.name}</h3>
      <p class="muted">${opt.note}</p>
      <table class="lines">
        <tr><td>Install ${orderQty.toLocaleString()} sqft × $${opt.rate.toFixed(2)}/sqft</td><td class="r">${fmt(matCost)}</td></tr>
        <tr><td>Tear-off &amp; disposal (${totalSiding.toLocaleString()} sqft × $${tearoffRate.toFixed(2)})</td><td class="r">${fmt(tearoffTotal)}</td></tr>
        <tr class="total"><td>Budgetary subtotal <span class="muted">(excludes trim, soffit, permits)</span></td><td class="r">${fmt(subtotal)}</td></tr>
      </table>
    </section>`;
  }).join('');

  const elevRows = ['North','East','South','West'].map(dir => {
    const d = byDir[dir] ?? { Siding: 0, Masonry: 0 };
    return `<tr><td>${dir}</td><td class="r">${Math.round(d.Siding).toLocaleString()}</td><td class="r">${Math.round(d.Masonry).toLocaleString()}</td></tr>`;
  }).join('');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Siding Estimate — ${loc['@address']}</title>
<style>
  * { box-sizing: border-box; }
  body { font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #1a1a1a; max-width: 760px; margin: 32px auto; padding: 0 24px 64px; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  h2 { font-size: 18px; margin-top: 32px; padding-bottom: 6px; border-bottom: 2px solid #1a1a1a; }
  h3 { font-size: 16px; margin: 0 0 4px; }
  .muted { color: #666; font-size: 14px; margin: 0; }
  .meta { color: #666; font-size: 13px; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 12px; }
  th, td { padding: 6px 8px; text-align: left; }
  table.measurements td { padding: 4px 0; }
  table.measurements td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  table.elevations { font-size: 14px; }
  table.elevations th { background: #f0f0f0; border-bottom: 1px solid #ccc; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; }
  table.elevations td, table.elevations th { padding: 6px 12px; }
  table.lines td { border-bottom: 1px solid #eee; padding: 6px 0; font-variant-numeric: tabular-nums; }
  table.lines tr.total td { font-weight: 600; border-top: 2px solid #1a1a1a; border-bottom: 0; padding-top: 10px; font-size: 16px; }
  .r { text-align: right; }
  section.option { margin: 24px 0; padding: 16px 20px; background: #fafafa; border-left: 3px solid #1a1a1a; border-radius: 4px; }
  ul { padding-left: 20px; }
  ul li { margin: 4px 0; }
  .common { margin: 16px 0 8px; }
  .common ol { padding-left: 20px; }
  .common li { margin: 6px 0; }
  .stamp { display: inline-block; padding: 2px 8px; background: #fff3a0; border-radius: 3px; font-size: 12px; font-weight: 600; }
  @media print {
    body { margin: 0; padding: 0 16px; max-width: none; }
    section.option { background: none; border-left-color: #999; break-inside: avoid; }
  }
</style>
</head>
<body>
  <h1>Siding Estimate — Budgetary</h1>
  <p class="meta">${loc['@address']}, ${loc['@city']} ${loc['@state']} ${loc['@postal']} · EagleView report ${ev.REPORT['@reportId']}</p>

  <h2>Measurements</h2>
  <table class="measurements">
    <tr><td>Total wall area</td><td>${totalWall.toLocaleString()} sqft</td></tr>
    <tr><td>Siding to replace (net of penetrations)</td><td><strong>${totalSiding.toLocaleString()} sqft</strong></td></tr>
    <tr><td>Stone / masonry (excluded from scope)</td><td>${totalMasonry.toLocaleString()} sqft</td></tr>
    <tr><td>Material order quantity (incl. ${WASTE * 100}% waste)</td><td><strong>${orderQty.toLocaleString()} sqft</strong></td></tr>
  </table>

  <h3 style="margin-top:18px">Per-elevation breakdown</h3>
  <table class="elevations">
    <thead><tr><th>Direction</th><th class="r">Siding (sqft)</th><th class="r">Masonry (sqft)</th></tr></thead>
    <tbody>${elevRows}</tbody>
  </table>

  <h2>Estimate options</h2>
  <div class="common">
    <h3>Common to all options</h3>
    <ol>
      <li>Tear-off &amp; disposal of existing T1-11 siding — ${totalSiding.toLocaleString()} sqft × $${tearoffRate.toFixed(2)} = ${fmt(tearoffTotal)}</li>
      <li>Site protection, dumpster, debris haul-off — Lump sum: <span class="stamp">TBD</span></li>
      <li>Trim, soffit, fascia rot repair (T&amp;M, as-needed) — Allowance: <span class="stamp">TBD</span></li>
      <li>Permits, inspection — <span class="stamp">TBD</span></li>
    </ol>
  </div>
  ${optionRows}

  <h2>Notes for the customer</h2>
  <ul>
    <li>All quantities derived from EagleView report ${ev.REPORT['@reportId']}.</li>
    <li>Stone/masonry areas (${totalMasonry.toLocaleString()} sqft on the front) are not part of this scope.</li>
    <li>Pricing above is <strong>budgetary</strong>, finalized once a material is selected.</li>
    <li>Trim, soffit, and fascia replacement priced T&amp;M based on field condition.</li>
    <li>Color, profile, and warranty options chosen with the selected material.</li>
  </ul>

  <h2>Internal pricing assumptions</h2>
  <p class="muted">Adjust these in <code>scripts/eagleview-to-estimate.js</code> before sending. Current rates are KC mid-market budgetary placeholders.</p>
  <ul>
    <li>Tear-off rate: $${tearoffRate.toFixed(2)}/sqft</li>
    <li>Waste factor: ${WASTE * 100}%</li>
    ${options.map(o => `<li>${o.name}: $${o.rate.toFixed(2)}/sqft installed</li>`).join('')}
  </ul>
</body>
</html>`;

  fs.writeFileSync(htmlPath, html, 'utf8');
  console.error(`\nHTML written to ${path.resolve(htmlPath)}`);
}
