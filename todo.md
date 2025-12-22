# Camvasser TODO

# Bugs
- [✅] status filter dropdown doesn't work in leads list view
- [ ] board view columns should have status filters

# Map Features
- [ ] filter leads by 'lead-status'
- [ ] remove the 'lead' status it's redundant

## Mobile App
- [ ] Set up Capacitor for iOS app
- [ ] Native camera access for photo capture
- [ ] Photo upload to S3/R2
- [ ] Replace CompanyCam with built-in photo management
- [ ] TestFlight distribution for crews

## CompanyCam Integration
- [ ] Get OAuth write access (fill out form) or find alternative
- [✅] Clean up tags in CC and resync to local DB
- [✅] Script to bulk remove/rename tags

## Data Cleanup
- [✅] Delete 71 junk leads (address-only records with no contact info)

## Connect Data Sources
- [ ] Connect RoofMaxx API, sync new leads to Camvasser
- [ ] Connect Bud Roofing website forms, push new submissions into Camvasser

## Admin Features - Notes
- [ ] Add notes to lead
- [ ] Add notes to contact
- [ ] Add notes to address

## Admin Features - Conversions
- [ ] Convert contact to lead
- [ ] Revert lead to project/address

## Admin Features - Calendar
- [ ] Create appointment on Google Calendar
- [ ] Sync GCal to tenant

## Admin Features - Search & Bulk Actions
- [✅] Empty field search syntax (e.g., `email:empty`, `no:phone`, `has:name`)
- [✅] Checkbox selection on list views (leads)
- [ ] "Select all matching" (all records matching current search, not just visible)
- [✅] Bulk delete with confirmation modal
- [✅] Bulk delete API endpoints (leads)
- [✅] Delete contact (single + bulk)
- [ ] Delete address/project (single + bulk)

## Data Models
- [ ] Add HOA object (link to address/project)
- [ ] Add Company object (for HOA management companies, etc.)
