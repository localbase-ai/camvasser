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
npm run db:push          # Push schema changes without migration (local dev DB)
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
- **Smartlead:** Email automation layer. **"Camvasser Master" (id: 2987823)** holds ALL leads with `camvasser_status` custom field — never activate. **"Welcome" (id: 2987833)** is the new lead onboarding sequence. Use `onNewLead()` from `lib/smartlead.js` to push to both on lead creation. See `docs/integrations/smartlead.md` for full details.
- **Google Calendar:** Edge functions create/list/delete events. Service account with domain-wide delegation.
- **Whitepages:** Person/address enrichment for prospects.
- **Site Leads (pull-based):** Camvasser pulls lead rows directly from each tenant's own Postgres (their marketing website's authoritative store) via `netlify/functions/sync-site-leads.js`. Credentials are stored per-tenant in `Tenant.siteLeadsConfig` as `{ adapter, enabled, credentials }` where `credentials` is an AES-256-GCM ciphertext of `{ connectionString }` encrypted with `CONNECTOR_ENC_KEY`. Per-schema adapters (`kcroof-v1`, `budroofing-v1`, etc.) live as code in the same file — each knows the SQL to run against that site's `leads` table and how to map a row into camvasser's Lead shape. Dedup via unique `(tenant, externalSource, externalId)` on Lead. Manual sync only (no scheduler yet). See "Onboarding a new site" below.

### Onboarding a new tenant site to the site_leads pattern

1. Site owner stands up their own marketing site on Netlify with its own Postgres (typically a new database inside the shared Neon project). Schema just needs a `leads` table with the usual contact columns and a `created_at`.
2. In `netlify/functions/sync-site-leads.js`, add a new entry to `SITE_LEAD_ADAPTERS` if the site's `leads` table shape differs from existing adapters. An adapter is `{ query, map }` — the query filters by the incremental cursor `$1::timestamptz`, and `map(row, tenantSlug)` returns a camvasser Lead-shaped object including `externalId` and `externalSource`. Do NOT map credentials or tenant-specific constants into the adapter; it should be pure schema translation.
3. Create the tenant row in camvasser's Prisma Tenant table if it doesn't exist. Slug must match what admin.html and all clients send as `?tenant=`.
4. Seed the encrypted connector config:
   ```
   DATABASE_URL=<prod> CONNECTOR_ENC_KEY=<base64-32> \
     node scripts/seed-site-leads-connector.js <slug> <adapter-key> <site-postgres-url>
   ```
5. Trigger a sync: authenticated POST to `/.netlify/functions/sync-site-leads` as the tenant user, or run `scripts/test-sync-site-leads.js` locally pointing at prod. Verify leads land in the Lead table with `externalSource=<slug>`, and that re-running produces `newInCamvasser: 0`.
6. Renu's existing camvasser connector will mirror the new leads on its next sync — nothing to configure on the renu side.

### Known multi-tenancy warts (as of 2026-04-10)
- **`user.tenant` does not exist on JWTs.** The login payload is `{ userId, email, slug, companyName }` where `slug` is the user's own slug, NOT a tenant slug. Functions that reference `user.tenant` as a tenant filter silently fall through to cross-tenant reads because Prisma treats `where: { tenant: undefined }` as no filter. `get-proposals.js` was fixed (requires `?tenant=`); `sync-calendar.js`, `link-appointment.js`, `update-appointment.js`, `save-storm-report.js` still have this bug (not in the pitch demo path). Source of truth for tenant scoping is the `?tenant=` query parameter, not the JWT.
- **No authorization check on `?tenant=`.** Any authenticated user can pass `?tenant=X` and read that tenant's data, regardless of `UserTenant` membership. Should be fixed alongside building the "all tenants" admin view for `isAdmin` users.
- **`create-test-users.js` and `seed-tenants.js` previously created a `kcroof` tenant slug** distinct from the canonical `kcroofrestoration`. The two rows drifted apart — data landed on `kcroofrestoration`, access mappings landed on `kcroof`, users saw zero leads. Resolved via a one-off UserTenant migration and by pointing the scripts at `kcroofrestoration`.
- **`JWT_SECRET` history.** Production previously shipped with the `.env.example` default placeholder (never rotated at deploy time). Rotated to a fresh random 64-byte value on 2026-04-10 after it was noticed. Do NOT document secret values — even placeholders — in any repo file; gitleaks treats them as non-secret and will not catch the regression if the placeholder ever becomes the real value again. Any time you stand up a new camvasser environment: generate a fresh `JWT_SECRET` via `node -e "console.log(require('crypto').randomBytes(64).toString('base64url'))"` and set it on Netlify BEFORE the first deploy.

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

### Pushing schema to production

Prisma always reads `.env` and ignores env var overrides. To push schema changes to Supabase prod, temporarily swap the connection string:

```bash
# Get the prod DIRECT_URL from Netlify
netlify env:get DIRECT_URL

# Swap .env, push, restore
cp .env .env.bak
# Replace DATABASE_URL and DIRECT_URL in .env with the Supabase URL
npx prisma db push --skip-generate
mv .env.bak .env
```

Use `db push` (not `migrate dev`) — Prisma migrations have shadow DB issues with the RLS migration history. `db push` works fine for additive changes (new columns, new models).

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
