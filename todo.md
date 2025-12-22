# Camvasser TODO

# Bugs
- [x] status filter dropdown doesn't work in leads list view
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
- [x] Clean up tags in CC and resync to local DB
- [x] Script to bulk remove/rename tags

## Data Cleanup
- [ ] Delete 71 junk leads (address-only records with no contact info)

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
- [x] Empty field search syntax (e.g., `email:empty`, `no:phone`, `has:name`)
- [x] Checkbox selection on list views (leads)
- [ ] "Select all matching" (all records matching current search, not just visible)
- [x] Bulk delete with confirmation modal
- [x] Bulk delete API endpoints (leads)
- [x] Delete contact (single + bulk)
- [ ] Delete address/project (single + bulk)

## Data Models
- [ ] Add HOA object (link to address/project)
- [ ] Add Company object (for HOA management companies, etc.)
