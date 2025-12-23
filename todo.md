# Camvasser TODO

# White Pages Test
- [ ] set up a test account with white pages and source data for a test list

## Quickbooks Integration
- [✅] create customer record from lead detail view in camvasser

# Next up Integrations: 
- [ ] Ring Central
- [ ] Google Business Listings: figure out mapstacking

## Features 
- [ ] Add HOA object (link to address/project)
- [ ] Add Company object (for HOA management companies, etc.)

## Mobile App
- [ ] Set up Capacitor for iOS app
- [ ] Native camera access for photo capture
- [ ] Photo upload to S3/R2
- [ ] Replace CompanyCam with built-in photo management
- [ ] TestFlight distribution for crews

## Admin Features - Calendar
- [ ] Create appointment on Google Calendar
- [ ] Sync GCal to tenant
- [ ] Instant Estimator 

# Bugs
- [✅] status filter dropdown doesn't work in leads list view
- [✅] board view columns should have status filters

# Map Features
- [✅] filter leads by 'lead-status'

# Lead Management / Call Flow Features
- [✅] Update status on lead (dropdown in detail view)

## CompanyCam Integration
- [ ] Get OAuth write access (fill out form) or find alternative
- [✅] Clean up tags in CC and resync to local DB
- [✅] Script to bulk remove/rename tags

## Data Cleanup
- [✅] Delete 71 junk leads (address-only records with no contact info)
- [ ] get pins from Cade's door hanging into the data somehow

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

## Admin Features - Search & Bulk Actions
- [✅] Empty field search syntax (e.g., `email:empty`, `no:phone`, `has:name`)
- [✅] Checkbox selection on list views (leads)
- [✅] "Select all matching" (all records matching current search, not just visible)
- [✅] Bulk delete with confirmation modal
- [✅] Bulk delete API endpoints (leads)
- [✅] Delete contact (single + bulk)
- [✅] Delete address/project (single + bulk)

