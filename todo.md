# Camvasser TODO

## Marketing Site
- [ ] Clean up marketing site and launch

# Bugs
- [ ] test  views for ipad landscape.
- [ ] fix has:phone has:name chained search on contacts view

# White Pages Test
- [ ] set up a test account with white pages and source data for a test list

## Show Job Values on 'Lead Object'
- [✅] show on cards in board view
- [✅] show totals in column headers in board view
- [✅] show job value on records in lead list view
- [✅] has:value, no:value, sort:value search syntax
- [✅] Delete a proposal from a lead object
- [ ] make a proposal generator? is this worth it?

## Scorecard / Dashboard Views
- [ ] make a daily scorecard view
- [ ] make a dashboard with key stats `or leave this to localbase?`

## Quickbooks Integration
- [✅] create customer record from lead detail view in camvasser
- [✅] sync QB estimates to proposals (shows job values on deal cards)
- [✅] admin UI button to sync estimates
- [✅] auto-mark estimates as "won" when invoiced/paid
- [✅] cleaned up 25 old estimates in QB (marked as Closed)

# Next up Integrations:
- [ ] Ring Central
- [ ] Google Business Listings: figure out mapstacking
- [✅] SmartLead: CSV export for leads and contacts

## Features
- [✅] Add HOA object (link to address/project)
- [✅] Add Company object (for HOA management companies, etc.)
- [✅] Organizations tab with full CRUD (HOAs, property mgmt, real estate, churches, apartments)
- [✅] Organization contacts (separate from residential prospects)
- [✅] Contact type filter in Contacts view (Prospects / Org Contacts / All)
- [✅] Import Leawood HOA data (96 HOAs, 9 mgmt companies, 72 contacts)
- [✅] show totals on list views for leads, contacts, addresses

## Mobile App
- [ ] Set up Capacitor for iOS app
- [ ] Native camera access for photo capture
- [ ] Photo upload to S3/R2
- [ ] Replace CompanyCam with built-in photo management
- [ ] TestFlight distribution for crews

## Admin Features - Calendar
- [✅] Create appointment on Google Calendar (Edge Functions)
- [✅] Read-only calendar list view in Camvasser
- [✅] Store appointments in database (Appointment model)
- [✅] Show appointments in lead detail view
- [✅] add event type
- [ ] as tenant admin set up my gcal from ui (later)
- [ ] change appointment status 

## Admin Features - Instant Estimator
- [ ] Instant Estimator 

# Map Features
- [✅] filter leads by 'lead-status'

# Lead Management / Call Flow Features
- [✅] Update status on lead (dropdown in detail view)

## CompanyCam Integration
- [ ] Get OAuth write access (fill out form) or find alternative
- [✅] Clean up tags in CC and resync to local DB
- [✅] Script to bulk remove/rename tags
- [✅] Full CC sync script (1253 projects, preserves local tags)
- [✅] Tag normalization (case cleanup: door hanger → Door Hanger)
- [✅] Fixed per_page=100 bug (CC caps at 50)

## Data Cleanup
- [✅] Delete 71 junk leads (address-only records with no contact info)
- [✅] Review and clean up 244 orphaned leads (merge duplicates, fix typos, delete junk)
- [✅] Create projects for orphaned leads
- [✅] Lead owner field added (ownerName)
- [✅] Import 86 sold jobs with owner assignments
- [ ] get pins from Cade's door hanging into the data somehow
- [ ] go through all leads in system and make sure right status

## Connect Data Sources
- [✅] Connect RoofMaxx API, sync new leads to Camvasser (via LocalBase integration)
- [✅] Connect Bud Roofing website forms, push new submissions into Camvasser

## Admin Features - Notes
- [✅] Add notes to lead
- [✅] Add notes to contact
- [✅] Add notes to address

## Admin Features - Conversions
- [✅] Convert contact to lead
- [✅] Revert lead to project/address
- [✅] Convert lead to organization (for HOAs, property mgmt companies found in leads)

## Admin Features - Leads Board
- [✅] Kanban drag-and-drop for lead status
- [✅] Lead owner assignment and filter
- [✅] Board view as default
- [✅] Share URL feature for leads

## Admin Features - Search & Bulk Actions
- [✅] Empty field search syntax (e.g., `email:empty`, `no:phone`, `has:name`)
- [✅] Checkbox selection on list views (leads)
- [✅] "Select all matching" (all records matching current search, not just visible)
- [✅] Bulk delete with confirmation modal
- [✅] Bulk delete API endpoints (leads)
- [✅] Delete contact (single + bulk)
- [✅] Delete address/project (single + bulk)

