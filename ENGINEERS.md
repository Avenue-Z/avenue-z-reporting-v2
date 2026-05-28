# Avenue Z Reporting Platform — Engineering Handoff

> Last updated: May 2026. Written for engineers joining this project.
> Read this before writing any code. `CLAUDE.md` is the canonical AI-context file — this document is the human-readable complement to it.

---

## What This Is

A **white-labeled, multi-client marketing intelligence platform** for Avenue Z and its clients. Avenue Z team members see a full internal dashboard with access to all clients and all reports. Clients log in to a scoped portal showing only their own data.

**No database. No external auth service. No per-user cost.**

The only "database" is `lib/clients.config.ts` — a flat config file that drives all routing, permissions, and available reports. Add an object to that array to onboard a new client.

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16 (App Router)** | RSC, Server Actions, API routes |
| Language | **TypeScript 5, strict mode** | |
| Auth | **Auth.js v5 (NextAuth beta)** | Google + Credentials providers |
| Styling | **Tailwind CSS v4** | |
| Charts | **Recharts (via shadcn/ui charts)** | |
| Deployment | **Vercel Pro** | ~$20/mo per dev seat |
| React | **19.2** | |

---

## Repository Map

```
/app
  page.tsx                                   # Root: role-aware redirect after login
  login/page.tsx                             # Auth.js login page (credentials + Google)
  unauthorized/page.tsx                      # Access-denied fallback

  dashboard/                                 # Internal Avenue Z view (INTERNAL_* roles only)
    layout.tsx                               # Auth guard: session check + role check
    page.tsx                                 # Client list
    connections/page.tsx                     # Global Supermetrics connection status
    settings/page.tsx                        # Platform settings
    [clientSlug]/
      page.tsx                               # Per-client overview
      auth/page.tsx                          # Manage platform connections for client
      reports/
        page.tsx                             # Report index
        report-nav.tsx                       # Tab navigation (reads enabledReports)
        report-date-range.tsx                # Date range picker (client component)
        [reportSlug]/
          page.tsx                           # Renders the correct report section
          report-date-range.tsx

  portal/                                    # Client-facing view (scoped to own slug)
    [clientSlug]/
      layout.tsx                             # Auth guard: session + slug ownership check
      page.tsx                               # Redirect to /reports
      auth/page.tsx                          # Connect their own marketing accounts
      reports/
        page.tsx
        report-nav.tsx
        [reportSlug]/
          page.tsx
          report-date-range.tsx

  actions/
    auth.ts                                  # signInWithGoogle, signInWithCredentials, signOutAction
    demo-auth.ts                             # Temporary demo helper
    supermetrics.ts                          # Server actions for Supermetrics queries

  api/
    auth/[...nextauth]/route.ts              # Auth.js handler
    auth/supermetrics-callback/route.ts      # Post-OAuth redirect from Supermetrics
    pr-placements/route.ts                   # News API proxy (CORS-safe)
    glean/meeting-brief/route.ts             # Glean AI meeting brief proxy

/components
  layout/
    sidebar.tsx                              # Internal dashboard sidebar
    portal-sidebar.tsx                       # Client portal sidebar
    header.tsx                               # Top bar with logo + sign-out
    date-range-picker.tsx                    # Global date picker
    avenue-z-logo.tsx                        # SVG logo component
    sticky-report-header.tsx                 # Scrollable report header

  charts/
    area-chart.tsx                           # Recharts area wrapper
    bar-chart.tsx                            # Recharts bar wrapper
    donut-chart.tsx                          # Recharts donut wrapper
    data-table.tsx                           # Sortable table
    kpi-card.tsx                             # Metric card with delta badge

  auth-hub/
    platform-card.tsx                        # OAuth connection card (Supermetrics login link)
    connect-button.tsx                       # "Connect" / "Reconnect" CTA
    platform-icons.tsx                       # Icon map per platform slug

  report-sections/
    error-boundary.tsx                       # Wraps every report section; catches fetch errors
    empty-state.tsx                          # Shown when platform is not connected

    # --- Fully built report sections ---
    ga4/                                     # Web analytics (Google Analytics 4)
    inbound-funnel/                          # HubSpot CRM + Forms: leads, lifecycle, quality
    hubspot-performance/                     # HubSpot deal pipeline + lead sources
    google-search-console/                   # GSC query/page performance
    demand-overview/                         # AI demand signals (Profound + PEEC composite)
    peec-ai/                                 # PEEC AI brand visibility in LLMs
    profound-ai/                             # Profound AI brand visibility in LLMs
    pr-placements/                           # News API earned media coverage
    ffci/                                    # Full-funnel cost intelligence
    blended-performance/                     # Cross-channel blended ROAS/CPA (placeholder)

    # --- Scaffold / placeholder sections ---
    exec-summary/
    meta-ads/
    google-ads/
    email-marketing/
    linkedin-ads/
    tiktok-ads/
    tiktok-shop/
    snapchat-ads/
    reddit-ads/
    bing-ads/
    shopify-performance/
    gohighlevel/
    ticket-sales/

  data-chat/index.tsx                        # AI chat overlay (BigQuery + Gemini)
  meeting-prep/index.tsx                     # Glean meeting brief widget
  export-pdf-button.tsx                      # PDF export trigger

/lib
  clients.config.ts                          # THE config file — all clients, users, reports
  constants.ts                               # Shared constants (chart colors, etc.)
  utils.ts                                   # Utility helpers (cn, formatters)
  demo-auth.ts                               # Demo-mode helpers

  ga4/
    client.ts                                # ga4Query() — Google Analytics Data API wrapper
    types.ts                                 # GA4 response types

  gsc/
    client.ts                                # gscQuery() — Google Search Console wrapper

  hubspot/
    client.ts                                # HubSpot CRM Search API + Forms API client

  peec/
    client.ts                                # PEEC AI API client
    brand-types.ts                           # PEEC response types

  profound/
    client.ts                                # Profound AI API client

  supermetrics/
    client.ts                                # smQuery() — Supermetrics Data API wrapper
    auth.ts                                  # createLoginLink(), getConnectionStatus()
    constants.ts                             # DS_IDS (data source identifiers)
    types.ts                                 # Supermetrics response types

  bigquery/
    client.ts                                # BigQuery client (used by data-chat)
    gemini.ts                                # Gemini AI client (used by data-chat)

  newsapi.ts                                 # News API client (PR placements)
  glean.ts                                   # Glean AI client (meeting prep)
  platforms/constants.ts                     # Platform metadata (names, icons, slugs)

/types
  react-simple-maps.d.ts                     # Ambient module declaration for react-simple-maps

auth.ts                                      # Auth.js v5 configuration
proxy.ts                                     # Next.js 16 route protection (replaces middleware.ts)
```

---

## Authentication

### How It Works

Auth.js v5 with two providers:

1. **Google OAuth** — intended for Avenue Z employees (`@avenuez.com`). Currently non-functional — `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are blank in `.env.local`. See "Immediate Fixes" below.
2. **Credentials** — email + password for clients. Currently validates only that the email exists in `clients.config.ts`. There is no password check — any password works. See "Security Gaps" below.

### Session Shape

After login, the JWT callback in `auth.ts` looks up the user's email in `clients.config.ts` and attaches:

- `session.user.role` — one of `INTERNAL_ADMIN`, `INTERNAL_ANALYST`, `CLIENT_ADMIN`, `CLIENT_VIEWER`
- `session.user.clientSlug` — the client slug this user belongs to (null for internal users)

### Route Protection — Three Layers

```
Layer 1: proxy.ts (Next.js 16 proxy)
  - Unauthenticated requests to /dashboard/* or /portal/* → redirect /login
  - Runs on every matched request before any page loads

Layer 2: app/dashboard/layout.tsx
  - Checks session again; redirects if role ≠ INTERNAL_ADMIN or INTERNAL_ANALYST

Layer 3: app/portal/[clientSlug]/layout.tsx
  - Internal users: full access to any portal slug
  - Client users: only their own slug; wrong slug → /unauthorized
```

### Login Page

`app/login/page.tsx` is a server component that reads `?error=` from search params and maps Auth.js error codes to human-readable messages. It has three auth paths:

1. Email/password form → `signInWithCredentials` server action
2. "Preview Access" button → pre-filled hidden form with `demo@avenuez.com` credentials
3. "Avenue Z employee?" footnote → `signInWithGoogle` server action

### Post-Login Routing

Both auth paths redirect to `/` after success. The root `app/page.tsx` then routes based on role:
- `INTERNAL_*` → `/dashboard`
- Client users → `/portal/[clientSlug]/reports`

---

## Client Configuration

Clients and users live in a **Neon Postgres database**, accessed via Drizzle ORM. There is no `clients.config.ts` file anymore (deleted in the DB migration PR).

- **Schema:** `lib/db/schema.ts` — Drizzle table definitions for `clients` and `users`, plus inferred TS types (`Client`, `User`, `ClientRole`, `ReportSlug`, `PRConfig`).
- **Helpers:** `lib/db/queries.ts` — three async functions wrapped in `React.cache()`:
  - `getClientBySlug(slug)` → returns `Client & { users: User[] } | null`
  - `getClientByEmail(email)` → returns `{ email, role, slug } | null` (flattened for auth.ts)
  - `getAllClients()` → returns `Client[]` ordered by name
- **Migrations:** `drizzle/*.sql`, generated from the schema. Apply with `npm run db:migrate`.
- **Seed:** `scripts/seed.ts` — inline data for both clients; idempotent upsert. Run with `npm run db:seed`.

The split:
- **Identifiers in the DB** — slug, name, logo URL, GA4 property ID, GSC site URL, Peec customer project ID, sheet IDs, etc. Stored as direct values, no indirection.
- **Secrets in env vars** — HubSpot tokens, the Google service account JSON, the Peec customer token, Auth.js secrets. The DB stores only the env-var *name* pointer when the secret is per-client (e.g. `hubspotTokenEnvVar = 'HUBSPOT_ACCESS_TOKEN_AVENUE_Z'`).

**To add a new client:**

1. Insert a row into the `clients` table via Drizzle Studio (`npm run db:studio`), the Neon dashboard SQL editor, or by extending `scripts/seed.ts` and re-running it.
2. Insert a row into `users` for each user (email + role + client_id).
3. If the client uses HubSpot, set their `hubspot_token_env_var` to the env var name and add that variable to Vercel.
4. No code deploy required for routine onboarding.

---

## Data Clients

### GA4 (`lib/ga4/client.ts`)
- Uses `@google-analytics/data` Node.js SDK
- Auth via a shared Google Service Account (`GOOGLE_SERVICE_ACCOUNT_KEY` env var)
- Property ID read directly from `client.ga4PropertyId` (DB column, e.g. `properties/355114071`)
- `ga4Query()` is the main helper — takes dimensions, metrics, date range, optional filters

### Google Search Console (`lib/gsc/client.ts`)
- Uses `google-auth-library` JWT for service-account-with-impersonation
- Site URL read directly from `client.gscSiteUrl` (DB column, e.g. `sc-domain:avenuez.com`)
- Requires `GSC_IMPERSONATE_EMAIL` env var — domain-wide-delegation user the service account impersonates

### HubSpot (`lib/hubspot/client.ts`)
- Uses `@hubspot/api-client`
- Token env var **name** stored in `client.hubspotTokenEnvVar` (e.g. `'HUBSPOT_ACCESS_TOKEN_AVENUE_Z'`); the actual token still lives in env. Secrets stay in env; only the pointer is in DB.
- React `cache()` wraps all functions — request-scoped memoization
- **Rate limit:** CRM Search API is throttled to ~4 req/s. All year-level cache queries run sequentially (not `Promise.all`)
- `getFormSubmissionCounts` has `[forms-debug]` console.log statements in place — these should be removed once the customer-column bug is resolved (see "Open Issues" below)

### Peec AI (`lib/peec/client.ts`)
- Direct HTTP to Peec AI API at `https://api.peec.ai/customer/v1`
- Uses `PEEC_AI_CUSTOMER_TOKEN` (the `skc-` multi-tenant key)
- Per-client `peecCustomerProjectId` from DB is sent in the request body
- Per-client "your brand" label from `client.peecYourBrand` (e.g. `'Avenue Z'` vs `'Renaissance'`) — drives the legend label and the "isYou" row matcher
- Whole `getPeecOverview` is wrapped in `unstable_cache` keyed by `clientSlug` with 1-hour TTL, so each client has its own cache entry (avoids URL-keyed fetch-cache collisions on the same endpoint)

### Profound AI (`lib/profound/client.ts`)
- Direct HTTP to Profound AI API

### News API (`lib/newsapi.ts`)
- PR placements data; proxied through `app/api/pr-placements/route.ts` to keep the API key server-side

### Supermetrics (`lib/supermetrics/`)
- Partially scaffolded — `smQuery()` and `createLoginLink()` are implemented
- **Not yet connected to any live report section.** Several report sections (Meta Ads, Google Ads, Email Marketing, etc.) are currently placeholder scaffolds waiting for Supermetrics wiring
- See `CLAUDE.md` for full Supermetrics API documentation

### BigQuery + Gemini (`lib/bigquery/`)
- Powers the AI data-chat overlay (`components/data-chat/`)
- Experimental; not yet exposed in any client portal

### Glean (`lib/glean.ts`)
- Powers the meeting prep widget
- Internal use only

---

## Report Sections — Build Status

| Report Slug | Status | Data Source |
|---|---|---|
| `demand-overview` | ✅ Built | Profound AI + PEEC AI |
| `ga4` | ✅ Built | Google Analytics 4 |
| `google-search-console` | ✅ Built | Google Search Console |
| `hubspot-performance` | ✅ Built | HubSpot CRM |
| `inbound-funnel` | ✅ Built | HubSpot CRM + Forms API |
| `peec-ai` | ✅ Built | PEEC AI |
| `profound-ai` | ✅ Built | Profound AI |
| `pr-placements` | ✅ Built | News API |
| `ffci` | ✅ Built | Static/placeholder data |
| `blended-performance` | 🟡 Scaffold | Awaiting Supermetrics |
| `exec-summary` | 🟡 Scaffold | Awaiting all data sources |
| `meta-ads` | 🟡 Scaffold | Awaiting Supermetrics |
| `google-ads` | 🟡 Scaffold | Awaiting Supermetrics |
| `email-marketing` | 🟡 Scaffold | Awaiting Supermetrics |
| `linkedin-ads` | 🟡 Scaffold | Awaiting Supermetrics |
| `tiktok-ads` | 🟡 Scaffold | Awaiting Supermetrics |
| `tiktok-shop` | 🟡 Scaffold | Awaiting Supermetrics |
| `snapchat-ads` | 🟡 Scaffold | Awaiting Supermetrics |
| `reddit-ads` | 🟡 Scaffold | Awaiting Supermetrics |
| `bing-ads` | 🟡 Scaffold | Awaiting Supermetrics |
| `shopify-performance` | 🟡 Scaffold | Awaiting Supermetrics/Shopify |
| `gohighlevel` | 🟡 Scaffold | Awaiting GoHighLevel API |
| `ticket-sales` | 🟡 Scaffold | Awaiting ticketing platform |

---

## Environment Variables

Copy this to `.env.local` for local development. All production values live in Vercel (with separate Production and Preview scopes — see below). Per-client identifiers (GA4 property IDs, GSC site URLs, etc.) now live in the database, not env vars.

```env
# Auth.js
AUTH_SECRET=                          # openssl rand -base64 32
AUTH_GOOGLE_ID=                       # Google Cloud Console → OAuth 2.0 client
AUTH_GOOGLE_SECRET=                   # Same credential
AUTH_TRUST_HOST=true                  # required in non-dev (NextAuth v5)

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
APP_URL=http://localhost:3000

# Database (Neon Postgres)
DATABASE_URL=                         # pooled connection (app runtime)
DATABASE_URL_UNPOOLED=                # direct connection (drizzle-kit migrations only)

# Google service account (shared across GA4 + GSC + Drive/Sheets for all clients)
GOOGLE_SERVICE_ACCOUNT_KEY=           # base64-encoded JSON
GSC_IMPERSONATE_EMAIL=                # user that the SA impersonates for GSC (domain-wide delegation)

# HubSpot — per-client secret, name pointer stored in clients.hubspot_token_env_var
HUBSPOT_ACCESS_TOKEN_AVENUE_Z=        # "pat-na1-..."

# Peec AI (multi-tenant; project IDs come from DB)
PEEC_AI_CUSTOMER_TOKEN=               # "skc-..." multi-tenant key
PEEC_AI_PROJECT_ID=                   # legacy fallback for callers without clientSlug
PEEC_AI_YOUR_BRAND=                   # legacy fallback for clients.peec_your_brand

# Profound AI
PROFOUND_AI_ACCESS_TOKEN=
PROFOUND_AI_YOUR_BRAND=
PROFOUND_CATEGORY_ID=

# Other third-party
NEWS_API_KEY=                         # newsapi.org
GLEAN_API_TOKEN=

# BigQuery
BQ_PROJECT_ID=
BQ_DATASET=
```

### Vercel scoping

Most env vars are shared across Production + Preview with the same value. Two exceptions:

- **`DATABASE_URL` / `DATABASE_URL_UNPOOLED`** — different values per scope. Production points at the prod Neon project; Preview points at the dev Neon project (or per-PR Neon branches if branching is enabled). Add as two separate Vercel entries with non-overlapping scopes.
- **`AUTH_TRUST_HOST`** — same value (`true`), but only meaningful in Production + Preview (dev auto-trusts localhost).

---

## Open Issues / Tech Debt

### 🔴 Security: No Password Validation

`auth.ts` `authorize()` function currently accepts **any password** as long as the email exists in the `users` table. This is fine for internal-only preview but must be fixed before any external client has login credentials.

**Fix:** Add a `password_hash` column to the `users` table (new migration) and validate with `bcrypt.compare()` in the `authorize()` callback. Or rely on Google OAuth for staff (already wired up — `@avenuez.com` domain-gated) and reserve credentials-only for specific external client accounts when those land.

### 🟢 Google OAuth — Configured

GWS-only OAuth is wired up: `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` set in Vercel, `hd=avenuez.com` parameter on the provider, server-side `signIn` callback rejects non-`@avenuez.com` accounts as defense-in-depth, and the Google Cloud OAuth client's consent screen is set to Internal. Unlisted `@avenuez.com` staff are auto-provisioned as `INTERNAL_ANALYST` on `avenue-z` client.

### 🟡 `CLAUDE.md` mostly current

The Postgres + Drizzle architecture is now reflected in `CLAUDE.md`. The Supermetrics section still describes the original aspirational architecture (Supermetrics as the data layer) — in practice, live report sections (GA4, HubSpot, GSC, Peec, Profound) all hit native APIs directly. Supermetrics scaffolding exists but isn't wired to any live section. Worth a future cleanup.

**Fix:** Update `CLAUDE.md` to accurately reflect current vs. planned data sources. This avoids confusing new engineers about what's actually running.

### 🟡 Debug Logs in Production Code

`lib/hubspot/client.ts` has numerous `[forms-debug]` console.log statements added during active debugging of the "customers showing 0" issue in the Forms tab. These will spam production logs.

**Fix:** Once the customer-column issue is confirmed resolved, remove all `[forms-debug]` lines from `getFormSubmissionCounts`.

### 🟡 No `.env.example`

There is a `.env.local` with real values but no `.env.example` checked into the repo.

**Fix:** Create `.env.example` with all keys present but values blank. This is the standard pattern for onboarding new developers without exposing secrets.

### 🟡 `proxy.ts` Note in `CLAUDE.md`

`CLAUDE.md` references `middleware.ts` throughout. The file was renamed to `proxy.ts` (Next.js 16 convention). New engineers following the docs will look for the wrong file.

**Fix:** Update all `middleware.ts` references in `CLAUDE.md` to `proxy.ts`.

---

## Open Issues

### HubSpot "Customers" Column Shows 0

In the Inbound Funnel → Forms tab, the `customers` column reads 0 despite confirmed customer records in HubSpot. Architecture has been corrected (customers now fetched via a separate paginated `EQ` query in Pass 2a, independent of the `IN`-based ICP/MCP query), but root cause has not been confirmed in production logs yet.

**To debug:** Run the app, navigate to the Forms tab, and check server logs for `[forms-debug]` output. Look for:
- `[forms-debug] customerEmails total: N` — should be > 0
- `[forms-debug] form emails count` — should match submission emails
- If `customerEmails total` is 0, the HubSpot lifecycle stage value may differ from `'customer'` (try `'Customer'` with capital C)

---

## Running Locally

```bash
cd /path/to/avenue-z-reporting
npm install
# Copy .env.local values (get from Nick or Vercel dashboard)
npm run dev
# Open http://localhost:3000
# Login: demo@avenuez.com / any password (or nick@avenuez.com)
```

---

## Key Conventions

1. **All data fetching is server-side.** No API keys ever reach the browser. Use Server Components, Server Actions, or API routes.
2. **Client config is the source of truth.** Never hardcode client names, slugs, or API key values outside `clients.config.ts`.
3. **Every report section is wrapped in `<ErrorBoundary>`** (see `components/report-sections/error-boundary.tsx`). A failed data fetch must never crash the full report page.
4. **HubSpot CRM Search calls must be sequential**, not parallel — the API rate-limits to ~4 req/s and will 429 under concurrent load.
5. **`react cache()`** is used in HubSpot and GA4 clients to deduplicate identical calls within a single server render pass.
6. **`enabledReports` in `clients.config.ts`** controls which tabs appear in both the dashboard and portal. Never render a section for a report not in that array.

---

## Roles

```
INTERNAL_ADMIN    → All clients, all reports, admin actions (e.g. manage connections)
INTERNAL_ANALYST  → All clients, all reports, read-only
CLIENT_ADMIN      → Own client only: auth hub + all enabled reports
CLIENT_VIEWER     → Own client only: enabled reports, read-only
```

Role is derived at session-creation time from `clients.config.ts`. No database query required.
