# Camvasser

Turn your CompanyCam projects into lead generation machines. A multi-tenant SaaS platform that captures leads before showing project photos.

## Features

### Lead Capture
- Clean, branded landing pages with custom logos and colors
- Address search → CompanyCam project lookup
- Lead capture flows (quizzes, qualification forms, emergency intake)
- Direct links to project photos

### Admin Dashboard
- **Leads View** - Track inbound inquiries with status management, call notes, and campaign tracking
- **Addresses View** - Browse CompanyCam projects with tag filtering
- **Contacts View** - Prospect management with Whitepages enrichment (homeowner detection, phone numbers, email)
- **Map View** - Interactive map with all addresses and leads geocoded
  - Marker clustering with toggle
  - Layer toggles (With Contacts, Leads, Address Targets)
  - Filter by tags (Door Hanger, RoofMaxx Treatment, etc.)
  - Color-coded pins by lead status
- PostgreSQL full-text search across all views
- Multi-tenant support with tenant switcher

### Data & Integrations
- CompanyCam API sync (projects, photos, tags)
- Whitepages reverse address lookup for prospect discovery
- Mapbox geocoding for map display
- Serverless Netlify functions with PostgreSQL (Prisma + Supabase)

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure tenants:**

   Edit `public/tenants.yml` and add your tenant configuration:

   ```yaml
   tenants:
     yourcompany:
       name: "Your Company Name"
       slug: "yourcompany"
       logo: "https://yourwebsite.com/logo.png"
       phone: "555-123-4567"
       colors:
         primary: "#0066CC"
         primaryHover: "#0052A3"
         background: "#1a1a1a"
         logoBackground: "#1a1a1a"
       companycam_api_token_env: "YOURCOMPANY_COMPANYCAM_TOKEN"
       page_title: "View Your Project Photos - Your Company"
       heading: "View Your Photos"
       subheading: "Enter your address to view photos from your project."
   ```

3. **Set up environment variables:**

   Create a `.env` file:

   ```bash
   # Database (Supabase PostgreSQL)
   DATABASE_URL=postgresql://...
   DIRECT_URL=postgresql://...

   # CompanyCam tokens (one per tenant)
   YOURCOMPANY_COMPANYCAM_TOKEN=your_api_token_here

   # Geocoding (for map view)
   MAPBOX_TOKEN=your_mapbox_token

   # Auth
   JWT_SECRET=your_secret_key
   ```

4. **Build CSS:**
   ```bash
   npm run build:css
   ```

5. **Run locally:**
   ```bash
   npm run dev
   ```

   - Tenant pages: `http://localhost:8888/yourcompany`
   - Admin dashboard: `http://localhost:8888/admin.html`

6. **Deploy to Netlify:**
   ```bash
   npm run deploy
   ```

## Scripts

```bash
npm run dev          # Start local dev server
npm run build        # Generate Prisma client + build CSS
npm run build:css    # Build Tailwind CSS only
npm run watch:css    # Watch mode for CSS development
npm run test         # Run tests
```

### Utility Scripts

```bash
# Geocode addresses for map display
node scripts/geocode-leads.js      # Geocode leads via Mapbox
node scripts/geocode-mapbox.js     # Geocode projects via Mapbox

# Data management
node scripts/import-roofr-leads.js # Import leads from Roofr
node scripts/sync-local-db.js      # Sync local dev database
node scripts/seed-tenants.js       # Seed tenant data

# User management
node scripts/create-business-user.js
node scripts/set-password.js
```

## URL Structure

**Tenant Pages:**
- `/:tenant` - Tenant index page
- `/:tenant/photos` - Photo search page
- `/:tenant/instant-roof-quote` - Quote request flow
- `/:tenant/roof-claim-denial` - Insurance claim flow
- `/:tenant/dirty-roof-costs` - Roof cleaning flow
- `/:tenant/roof-leak-emergency` - Emergency intake flow

**Admin:**
- `/admin.html` - Admin dashboard (requires login)

## Project Structure

```
camvasser/
├── public/
│   ├── tenants.yml         # Multi-tenant configuration
│   ├── admin.html          # Admin dashboard
│   ├── index.html          # Landing page
│   ├── styles/
│   │   ├── input.css       # Tailwind source
│   │   └── output.css      # Compiled CSS
│   └── logos/              # Tenant logo storage
├── netlify/
│   └── functions/
│       ├── tenant-router.js    # Dynamic URL router
│       ├── tenant-index.js     # Tenant landing page
│       ├── page.js             # Photo search page
│       ├── flow-*.js           # Lead capture flows
│       ├── get-*.js            # API endpoints
│       ├── save-*.js           # Data persistence
│       ├── auth-*.js           # Authentication
│       └── lib/                # Shared utilities
├── prisma/
│   └── schema.prisma       # Database schema
├── scripts/                # Admin utilities
├── tests/                  # Test files
├── docs/                   # Documentation
├── netlify.toml            # Netlify configuration
└── package.json
```

## Database Models

- **Lead** - Inbound inquiries from landing pages and flows
- **BusinessUser** - Contractors using the platform
- **Tenant** - Business/brand configuration
- **Project** - CompanyCam project data (synced)
- **Prospect** - People discovered via Whitepages lookup
- **ProjectLabel** - Tags/statuses from CompanyCam

## Tech Stack

- **Frontend:** Vanilla JS, Tailwind CSS v4, DaisyUI, Leaflet.js
- **Backend:** Netlify Functions (serverless)
- **Database:** PostgreSQL (Supabase) with Prisma ORM
- **APIs:** CompanyCam, Whitepages, Mapbox
