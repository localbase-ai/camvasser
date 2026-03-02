# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Sync local SQLite mirror + start Netlify dev server (localhost:8888)
npm run test             # Vitest watch mode
npm run test:run         # Vitest single run
npx vitest run tests/api/update-lead-status.test.js  # Run a single test file
npm run test:e2e         # Playwright end-to-end tests
npm run build            # Prisma generate + compile Tailwind CSS
npm run db:migrate       # Run Prisma migrations (dev)
npm run db:push          # Push schema changes without migration
npm run db:studio        # Open Prisma Studio GUI
npm run deploy           # Deploy to Netlify production
node scripts/sync-local-db.js  # Sync Postgres → prisma/camvasser_local.db (for VisiData)
```

## Architecture

Camvasser is a multi-tenant lead generation platform built on Netlify serverless functions with PostgreSQL (Supabase). It turns CompanyCam roofing projects into qualified leads through branded landing pages and flows.

### Stack
- **Frontend:** Vanilla JS SPA (`public/admin.html`), Tailwind CSS + DaisyUI
- **Backend:** Netlify Functions (Node.js serverless), Edge Functions (Deno for Google Calendar)
- **Database:** PostgreSQL via Prisma ORM. Supabase in prod, local Postgres for dev (`camvasser_dev`)
- **Local mirror:** `prisma/camvasser_local.db` (SQLite, synced from Postgres for VisiData browsing)

### Multi-Tenancy
- Tenant config in `public/tenants.yml` (branding, colors, API token env var names)
- URL routing: `/{tenant}` and `/{tenant}/{page}` handled by `tenant-router.js`
- Data isolation: most models have a `tenant` string field filtered in every query
- Users access tenants via `UserTenant` junction table with role (member/admin)
- Currently two tenants: `budroofing`, `kcroofrestoration`

### Request Flow
- **Public (unauthenticated):** Visitor → `/{tenant}/{flow}` → `tenant-router.js` → flow handler → creates Lead in DB. CORS validated, tenant existence checked.
- **Admin (authenticated):** User → `/admin.html` → login via `login.js` → JWT issued (24h) → API calls with `Authorization: Bearer {token}` → `verifyToken()` in each endpoint → query filtered by tenant.

### Key Directories
- `netlify/functions/` — API endpoints: `get-*`, `save-*`, `update-*`, `delete-*`, `flow-*`, `sync-*`
- `netlify/functions/lib/` — Shared clients: `auth.js`, `quickbooks.js`, `smartlead.js`, `companycam-api.js`, `whitepages.js`, `leads-query.js`
- `netlify/edge-functions/` — Google Calendar (Deno runtime)
- `scripts/` — Admin/utility scripts for data management, syncing, enrichment
- `tests/` — Vitest unit tests; `tests/api/` for endpoint tests

### Key Database Models
- **Lead** — Inbound leads with address, contact info, `ownerName` (denormalized string), `flowData` (JSON), `status`, full-text `search_vector`
- **Project** — CompanyCam projects (synced), with photos/tags/coordinates as JSON
- **Prospect** — Whitepages-enriched people with phones/emails/addresses as JSON arrays
- **Organization** — Companies, HOAs, churches with `OrganizationContact` and `OrganizationProperty` relations
- **OAuthToken** — OAuth tokens for QuickBooks (auto-refresh in `quickbooks.js`)
- **Proposal** — QB estimates synced as proposals

### Integrations
- **CompanyCam:** Project/photo sync. Token per tenant in env vars.
- **QuickBooks:** OAuth with auto-refresh stored in `OAuthToken` table. Creates customers, syncs estimates/invoices. Shares OAuth app with `~/Work/renu` — token rotation breaks the other app (known issue).
- **Smartlead:** Email campaigns. Push leads to campaigns, pull engagement stats (opens/clicks/replies via CSV export endpoint).
- **Google Calendar:** Edge functions create/list/delete events. Service account with domain-wide delegation.
- **Whitepages:** Person/address enrichment for prospects.

## Testing Patterns

Tests use Vitest with mocked Prisma and auth helpers:

```javascript
import { createMockPrisma, factories } from '../helpers/mock-prisma.js';
import { createAuthenticatedEvent } from '../helpers/auth.js';

const mockPrisma = createMockPrisma();
vi.mock('@prisma/client', () => ({
  PrismaClient: class { constructor() { return mockPrisma; } }
}));

// In tests:
mockPrisma.lead.findUnique.mockResolvedValue(factories.lead({ status: 'completed' }));
const event = createAuthenticatedEvent({ httpMethod: 'POST', body: JSON.stringify({...}) });
const response = await handler(event);
expect(response.statusCode).toBe(200);
```

## Database

- **Dev:** `postgresql://ryanriggin@localhost:5432/camvasser_dev`
- **Prod:** Supabase (pooled via `DATABASE_URL`, direct via `DIRECT_URL` for migrations)
- Full-text search on Lead, Project, Prospect using PostgreSQL `tsvector` with GIN indexes
- `Lead.ownerName` is a plain string, not a FK — no customer model yet

## Security

Pre-commit hook (`.githooks/pre-commit`) runs **gitleaks** for secret detection + Vitest tests.

### Dependencies
- `gitleaks` — install with `brew install gitleaks`

### Commands
```bash
npm run check-secrets    # Full-repo secret scan (on-demand)
```

### Config
- `.gitleaks.toml` — custom rules + path allowlist (extends gitleaks built-in 100+ patterns)
- `.gitleaksignore` — fingerprints for false positives
- `.env.example` — all required env vars with placeholder values
