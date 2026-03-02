# Smartlead Integration

## Overview

Smartlead is the email automation layer for Camvasser. All leads are synced to a **"Camvasser Master"** campaign (no sequences, never started) that serves as the tagged lead pool. Leads carry a `camvasser_status` custom field so agents and campaigns can segment by pipeline stage. Separate active campaigns handle actual outreach sequences.

**API Base:** `https://server.smartlead.ai/api/v1`
**Auth:** `SMARTLEAD_API_KEY` env var, passed as `?api_key=` query param
**Tenant:** `budroofing` (hardcoded in scripts)
**Plan:** 30k contacts, 150k monthly sends

## Key Campaigns

| Campaign | ID | Purpose | Sequences |
|----------|----|---------|-----------|
| **Camvasser Master** | `2987823` | Tagged lead pool — ALL leads live here | None. Never activate. |
| **Welcome** | `2987833` | New lead onboarding sequence | TODO: build welcome sequence |

## Camvasser Master Campaign

**Campaign ID:** `2987823`
**Purpose:** Master lead pool — holds ALL Camvasser leads with `camvasser_status` custom field. No email sequences. Never activate this campaign.

**How it works:**
- Every Camvasser lead with an email gets pushed here with their current status
- Active outreach campaigns are separate — leads can exist in Master AND an active campaign
- Agents query the Master campaign to segment leads by status before adding them to active campaigns
- When a lead's status changes in Camvasser, run `sync-smartlead-status.js` to update Smartlead

**When adding new leads to Camvasser:** Always push to Camvasser Master with the lead's status. For new inbound leads, also add to the relevant active campaign (e.g., Welcome sequence).

## Record Counts (as of 2026-03-02)

### Camvasser

| Entity | Count | With Email | Notes |
|--------|-------|------------|-------|
| Leads | 968 | 912 (867 unique) | 56 have no email |
| Prospects | 5,765 | 1,811 | 1,957 have no status |
| Projects | 6,258 | — | CompanyCam synced |

**Lead statuses:** new (333), lost (189), killed (167), completed (133), contacted (90), proposal_sent (34), unqualified (21), appointment_scheduled (1)

**Lead ownership:** 86% unowned. Tom Wisnasky (71), Ryan Riggin (58), Brody Wisnasky (7), Aya Aguinaldo (1).

### Smartlead

| Metric | Count |
|--------|-------|
| Campaigns | 14 (13 outreach + Camvasser Master) |
| Camvasser Master leads | 867 |
| Total lead slots (all campaigns) | ~2,750 (with cross-campaign dupes) |
| Unique emails | ~1,650 |
| Tagged with `camvasser_status` | 867 (all Master leads) + 238 in older campaigns |

### Overlap (Camvasser <-> Smartlead)

| Segment | Count | Notes |
|---------|-------|-------|
| Camvasser leads in Smartlead | 867 | All in Camvasser Master |
| Camvasser leads NOT in Smartlead | 56 | No email address |
| Camvasser prospects in Smartlead | 891 | In older outreach campaigns |
| Smartlead-only (no Camvasser match) | 244 | Orphan emails |

**Outreach campaigns (pre-Master):**

| Campaign | Leads | Smartlead Status |
|----------|-------|------------------|
| KC Realtor Outreach | 279 | COMPLETED:133, STARTED:99, BLOCKED:47 |
| May 20 | 217 | COMPLETED:205, BLOCKED:12 |
| Roofmaxx Aged Leads Outreach | 203 | COMPLETED:179, BLOCKED:24 |
| Roofmaxx Aged Wisetack | 179 | COMPLETED:179 |
| Olathe Leads Outreach | 177 | BLOCKED:34, COMPLETED:143 |
| KC Property Manager Outreach | 158 | COMPLETED:141, BLOCKED:17 |
| Olathe List - Wisetack | 144 | COMPLETED:143, BLOCKED:1 |
| Church Outreach | 142 | COMPLETED:130, BLOCKED:12 |
| Church Outreach 2 | 130 | COMPLETED:123, STARTED:7 |
| KC Insurance Agent Outreach | 130 | COMPLETED:119, BLOCKED:11 |
| realtor openers | 56 | COMPLETED:39, BLOCKED:17 |
| realtor clickers | 49 | COMPLETED:48, BLOCKED:1 |
| Review Request | 19 | COMPLETED:17, BLOCKED:2 |

## Data Flow

### 1. Push leads to Camvasser Master

**Script:** `scripts/push-leads-to-smartlead.js`
**What:** Pushes all Camvasser leads (with emails) to the Camvasser Master campaign with `camvasser_status` custom field. Smartlead dedupes by email, so safe to re-run.
**Batching:** 100 leads per batch, 500ms delay between batches.
**Flags:** `--dry-run` for preview.

### 2. Push prospects to outreach campaigns

**Script:** `netlify/functions/push-to-smartlead.js`
**What:** Pushes Prospects to a new Smartlead campaign in batches of 300. Includes `camvasser_status` — matched Lead status if email exists in Leads table, otherwise `"prospect"`.
**Triggered by:** Admin UI button.

### 3. Sync statuses to Smartlead

**Script:** `scripts/sync-smartlead-status.js`
**What:** Bulk-updates `camvasser_status` custom field on existing Smartlead leads across ALL campaigns. Matches by email.
**API:** `POST /campaigns/{campaign_id}/leads/{lead_id}` with `{ email, custom_fields: { camvasser_status } }`
**Rate limit:** 200ms delay between calls.
**Flags:** `--dry-run` for preview.

### 4. Pull engagement from Smartlead

**Script:** `scripts/sync-smartlead-clicks.js`
**What:** Fetches click engagement from all campaigns via CSV export. For each clicker:
- If email matches a Camvasser Lead: enriches `flowData` with open/click/reply counts
- If email matches a Prospect: updates `notes` and `campaign` fields
- If no match: creates a new Prospect with status `smartlead_clicker`

## Custom Fields on Smartlead Leads

| Field | Source | Values |
|-------|--------|--------|
| `camvasser_status` | Camvasser Lead.status | new, contacted, proposal_sent, completed, lost, killed, unqualified, appointment_scheduled, prospect |

Custom fields are visible in the Smartlead lead detail panel and accessible via API, but do NOT appear as table columns in the Smartlead UI. They can be used as template variables (`{{camvasser_status}}`) in email sequences and for agent-based segmentation.

## Agent Integration

Agents (e.g., Localbase lead gen agent) should:
1. Query Camvasser Master campaign to get leads with statuses
2. Filter/segment by `camvasser_status` for campaign targeting
3. Add selected leads to active outreach campaigns
4. After status changes in Camvasser, trigger `sync-smartlead-status.js` to keep Smartlead in sync

## Gaps / TODO

- **Prospects not in Master** — 891 prospects in older campaigns, not yet in Camvasser Master. Separate effort to add contacts.
- **244 Smartlead orphans** — emails in Smartlead with no Camvasser match
- **Prospect statuses fragmented** — 34% have no status, values mix call dispositions with pipeline stages
- **Lead ownership thin** — 86% of leads have no owner
- **No automated sync trigger** — status sync is manual. Could be a cron job or triggered on lead status change in Camvasser
- **Welcome campaign** — campaign created (id: 2987833), `onNewLead()` stub ready in `lib/smartlead.js`. Need to: build the email sequence in Smartlead UI, wire `onNewLead()` into `save-flow-lead.js`, `save-lead.js`, and `convert-contact-to-lead.js`
