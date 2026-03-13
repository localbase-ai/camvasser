# Camvasser TODO

## BUGS
- switch urls in the appointment object from camvasser.netlify.com to camvasser.com

## 🔥 DAILY NON-NEGOTIABLE: SEND EMAIL
**If we're not sending 1,000 emails a day per rep, we shouldn't be doing anything else.**

- [ ] Send 100+ targeted emails today (EVERY DAY)
- [ ] Set up flows and start running ads
- [ ] Make a daily scorecard view
---

## Sales & Lead Gen (the only thing that matters right now)
- [ ] build hail storm map gpt function
- [ ] Set up virtual canvassing email test
- [ ] Test Twilio integration for outbound calling
- [ ] Ring Central data integration
- [ ] Google Business Listings: figure out mapstacking
- [x] Set up a test account with white pages and source data for a test list

## QuickBooks
- [ ] Consolidate QB OAuth token management — renu and camvasser both refresh tokens independently, which rotates the refresh token and breaks the other app. Need a single source of truth (shared DB row or one app owns the refresh).

## Product (only after daily email is sent)
- [ ] Test views for iPad landscape
- [ ] Add instant estimator as a plugin?
- [ ] Auto-advance to next item after call

## Calendar
- [ ] As tenant admin set up my gcal from UI (later)
- [ ] Change appointment status

## Mobile App (later)
- [ ] Set up Capacitor for iOS app
- [ ] Native camera access for photo capture
- [ ] Photo upload to S3/R2
- [ ] Replace CompanyCam with built-in photo management
- [ ] TestFlight distribution for crews

## Instant Estimator (later)
- [ ] Instant Estimator

---

## Done
<details>
<summary>Completed items (click to expand)</summary>

- [x] Appointment setting bug (fixed domain-wide delegation for Google Calendar)
- [x] Fix demo site logo finder bug (smart fallback system)
- [x] Make the UI snappy as fuck
- [x] Pre-compute filter values on data load to fix checkbox lag
- [x] Test white pages enrichment on 66206 list
- [x] Add search UI to call log view
- [x] Show on cards in board view
- [x] Show totals in column headers in board view
- [x] Show job value on records in lead list view
- [x] has:value, no:value, sort:value search syntax
- [x] Delete a proposal from a lead object
- [x] Create customer record from lead detail view in camvasser
- [x] Sync QB estimates to proposals
- [x] Admin UI button to sync estimates
- [x] Auto-mark estimates as "won" when invoiced/paid
- [x] Cleaned up 25 old estimates in QB
- [x] SmartLead: CSV export for leads and contacts
- [x] Add HOA object
- [x] Add Company object
- [x] Organizations tab with full CRUD
- [x] Organization contacts
- [x] Contact type filter in Contacts view
- [x] Import Leawood HOA data
- [x] Show totals on list views
- [x] Create appointment on Google Calendar
- [x] Read-only calendar list view
- [x] Store appointments in database
- [x] Show appointments in lead detail view
- [x] Add event type
- [x] Filter leads by lead-status
- [x] Update status on lead
- [x] Call scripts - create, edit, assign to call lists
- [x] Show call script in call list UI
- [x] Detail pane on call list
- [x] Convert contact to lead from call list detail
- [x] Notes on call list contact detail
- [x] Call logging / outcome tracking
- [x] Clean up tags in CC and resync to local DB
- [x] Script to bulk remove/rename tags
- [x] Full CC sync script
- [x] Tag normalization
- [x] Fixed per_page=100 bug
- [x] Delete 71 junk leads
- [x] Review and clean up 244 orphaned leads
- [x] Create projects for orphaned leads
- [x] Lead owner field added
- [x] Import 86 sold jobs with owner assignments
- [x] Connect RoofMaxx API
- [x] Connect Bud Roofing website forms
- [x] Add notes to lead/contact/address
- [x] Convert contact to lead
- [x] Revert lead to project/address
- [x] Convert lead to organization
- [x] Kanban drag-and-drop
- [x] Lead owner assignment and filter
- [x] Board view as default
- [x] Share URL feature for leads
- [x] Empty field search syntax
- [x] Checkbox selection on list views
- [x] Select all matching
- [x] Bulk delete with confirmation modal
- [x] Bulk delete API endpoints
- [x] Delete contact (single + bulk)
- [x] Delete address/project (single + bulk)
- [x] Get pins from Cade's door hanging into the data
- [x] Go through all leads in system and make sure right status

</details>
