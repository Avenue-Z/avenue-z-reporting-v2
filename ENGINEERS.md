# Avenue Z Reporting Platform — Engineering Handoff

> Last updated: May 2026. Written for engineers joining this project.
> Read this before writing any code. `CLAUDE.md` is the canonical AI-context file — this document is the human-readable complement to it.

---

## What This Is

A **white-labeled, multi-client marketing intelligence platform** for Avenue Z and its clients. Avenue Z team members see a full internal dashboard with access to all clients and all reports. Clients log in to a scoped portal showing only their own data.

**No external auth service. No per-user cost.**

Clients and users live in a **Neon Postgres database**, accessed via Drizzle ORM (`lib/db/`). The database drives all routing, permissions, and available reports. To onboard a new client, insert rows into the `clients` and `users` tables — see "Client Configuration" below. (Earlier versions used a flat `lib/clients.config.ts` file; it has been removed.)

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

  tools/                                     # Internal tools area (per-team utilities)
    page.tsx
    [teamSlug]/page.tsx

  actions/
    auth.ts                                  # signInWithGoogle, signInWithCredentials, signOutAction
    client-access.ts                         # Admin: grant/revoke client access for users
    report-request.ts                        # "Request a report" submissions
    supermetrics.ts                          # Server actions for Supermetrics queries
    team.ts                                  # Tools-area / team server actions

  api/
    auth/[...nextauth]/route.ts              # Auth.js handler
    auth/supermetrics-callback/route.ts      # Post-OAuth redirect from Supermetrics
    pr-placements/route.ts                   # News API proxy (CORS-safe)
    glean/meeting-brief/route.ts             # Glean AI meeting brief proxy
    cache-warm/route.ts                      # Pre-warm vendor caches
    health/route.ts                          # Health-check / alerting endpoint
    perf/route.ts                            # Report-loading perf telemetry

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
    paid-search/                             # Google paid search (Supermetrics)
    meta-ads/                                # Meta Ads (Supermetrics)
    linkedin-ads/                            # LinkedIn Ads (Supermetrics)
    organic-social/                          # Organic social (Dash Social)
    ai-summaries/                            # AI-generated per-channel narrative summaries
    conversational-summary/                  # AI chat-style summary (BigQuery + Gemini)
    request-a-report/                        # Client-facing "request a report" form
    report-generator/                        # Report assembly / export building blocks

    # --- Scaffold / placeholder sections (static or awaiting data wiring) ---
    exec-summary/                            # GA4 + HubSpot KPIs (partial)
    email-marketing/
    blended-performance/
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
  db/
    client.ts                                # Drizzle client singleton (Neon serverless)
    schema.ts                                # Table definitions + inferred TS types
    queries.ts                               # getClientBySlug, getClientByEmail, getAllClients
    admin-queries.ts                         # Admin-panel reads/writes
  auth/
    password.ts                              # Password hashing + verifyPassword
    credential-login.ts                      # Credential-login policy evaluation
    test-admin.ts                            # Env-gated, preview-only admin login
  constants.ts                               # Shared constants (chart colors, feature flags)
  utils.ts                                   # Utility helpers (cn, formatters)

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
    client.ts                                # smQuery() — Supermetrics Data API wrapper + parseSmRows
    auth.ts                                  # deprecated empty stub (Branded Auth removed)
    constants.ts                             # DS_IDS (GA4, GOOGLE_ADS, META, LINKEDIN)
    types.ts                                 # SmQueryParams, SmResult, error classes

  # Supermetrics-backed paid/social report data (each builds queries via lib/supermetrics)
  paid-search/                               # Google paid search KPIs, campaigns, keywords, geo
  meta/                                      # Meta Ads KPIs, creative tree, geo
  linkedin/                                  # LinkedIn Ads KPIs, creative, geo
  organic-social/                            # Organic social headlines, trends, top content
  dash-social/                               # Dash Social API client (organic social source)

  # Other data-source clients
  shopify/                                   # Shopify client (catalog + OAuth); section not yet wired
  triplewhale/                               # Triple Whale client (used by the configurable dashboard)

  # AEO / AI-visibility + content + SEO crawls
  aeo/                                       # Answer-engine optimization helpers
  content-calendar/                          # Content calendar sync
  pr-proof/                                  # PR proof-point data
  screaming-frog/                            # Screaming Frog crawl ingestion
  sitebulb/                                  # Sitebulb crawl ingestion

  # Platform internals
  admin/                                     # Admin-panel domain logic
  dashboard/                                 # Configurable dashboard engine (adapters: supermetrics/shopify/triplewhale)
  health/                                    # Health alerting (Slack)
  report-generator/                          # Report data snapshot + assembly

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

1. **Google OAuth** — for Avenue Z employees. Wired up and functional: the provider sends `hd=avenuez.com`, and a server-side `signIn` callback rejects any non-`@avenuez.com` or unverified account as defense-in-depth. `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` are set in Vercel. Unlisted `@avenuez.com` staff are auto-provisioned as `INTERNAL_ANALYST` on the `avenue-z` client.
2. **Credentials** — email + password for clients. The password is verified against the client's `shared_password_hash` column (`lib/auth/password.ts` → `verifyPassword`; policy in `lib/auth/credential-login.ts`). A separate env-gated, **preview-only** test admin (`lib/auth/test-admin.ts`) is active only when the `TEST_ADMIN_*` vars are set in a Preview deploy.

### Session Shape

After login, the JWT callback in `auth.ts` looks up the user's email in the database (`getClientByEmail` in `lib/db/queries.ts`) and attaches:

- `session.user.role` — one of `INTERNAL_ADMIN`, `INTERNAL_ANALYST`, `CLIENT_ADMIN`, `CLIENT_VIEWER`
- `session.user.clientSlug` — the client slug this user belongs to (null for internal users)

### Route Protection — Three Layers

```
Layer 1: proxy.ts (Next.js 16 proxy)
  - Unauthenticated requests to /dashboard/*, /portal/*, or /tools/* → redirect /login
  - Runs on every matched request before any page loads

Layer 2: app/dashboard/layout.tsx
  - Checks session again; redirects if role ≠ INTERNAL_ADMIN or INTERNAL_ANALYST

Layer 3: app/portal/[clientSlug]/layout.tsx
  - Internal users: full access to any portal slug
  - Client users: only their own slug; wrong slug → /unauthorized
```

### Login Page

`app/login/page.tsx` is a server component that reads `?error=` from search params and maps Auth.js error codes to human-readable messages. It has two auth paths:

1. Email/password form → `signInWithCredentials` server action
2. "Avenue Z employee?" footnote → `signInWithGoogle` server action

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
- Only the **Data API** is live: `smQuery()` in `client.ts` (synchronous POST to `/query/data/json`, with `schedule_id` polling fallback for queued queries). The caller passes the API key in `SmQueryParams.apiKey`, read from the env var named in the client's `sm_api_key_env_var` column.
- **Powers live report sections:** Paid Search (`lib/paid-search/`), Meta Ads (`lib/meta/`), and LinkedIn Ads (`lib/linkedin/`) all build their queries through `smQuery()` (via each lib's `base.ts`). Each surfaces `SmTimeoutError` from `lib/supermetrics/client` for graceful timeout handling.
- `DS_IDS` (`constants.ts`) is `GA4`, `GOOGLE_ADS`, `META`, `LINKEDIN`, `SHOPIFY` (plus a `SM_TIME_DIMENSION` map for granularity field IDs).
- **Branded Authentication (login links) has been removed** — `lib/supermetrics/auth.ts` is a deprecated empty stub; `createLoginLink()` / `getConnectionStatus()` no longer exist. Platform connections are configured via env vars (see Auth Hub below), not Supermetrics OAuth links.
- Remaining ad-platform sections (Email Marketing, TikTok, Snapchat, Reddit, Bing, etc.) are still placeholder scaffolds awaiting wiring.
- See `CLAUDE.md` for the Supermetrics API reference.

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
| `paid-search` | ✅ Built | Supermetrics (Google Ads) |
| `meta-ads` | ✅ Built | Supermetrics (Meta) |
| `linkedin-ads` | ✅ Built | Supermetrics (LinkedIn) |
| `organic-social` | ✅ Built | Dash Social |
| `ai-summaries` | ✅ Built | Report-generator snapshot + LLM |
| `conversational-summary` | ✅ Built | BigQuery + Gemini |
| `request-a-report` | ✅ Built | Form → report-request action |
| `exec-summary` | 🟡 Partial | GA4 + HubSpot |
| `blended-performance` | 🟡 Scaffold | Awaiting Supermetrics |
| `email-marketing` | 🟡 Scaffold | Awaiting Supermetrics |
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

**`.env.example` in the repo root is the complete, authoritative list** (`cp .env.example .env.local`). The annotated subset below covers the essentials. All production values live in Vercel (with separate Production and Preview scopes — see below). Per-client identifiers (GA4 property IDs, GSC site URLs, etc.) now live in the database, not env vars.

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
NEWSAPI_AI_KEY=                       # newsapi.ai (PR placements) — the var is NEWSAPI_AI_KEY, not NEWS_API_KEY
GLEAN_API_TOKEN=
GLEAN_INSTANCE=

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

### 🟢 Security: Password Validation — Implemented

Credential logins are verified against the client's `shared_password_hash` column. `auth.ts` `authorize()` calls `evaluateCredentialLogin()` (`lib/auth/credential-login.ts`), which checks the supplied password via `verifyPassword()` (`lib/auth/password.ts`). The earlier "any password works" behavior is gone. The preview-only test admin (`lib/auth/test-admin.ts`) bypasses this, but only when the `TEST_ADMIN_*` env vars are set in a Preview deploy — it is inert in Production.

### 🟢 Google OAuth — Configured

GWS-only OAuth is wired up: `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` set in Vercel, `hd=avenuez.com` parameter on the provider, server-side `signIn` callback rejects non-`@avenuez.com` accounts as defense-in-depth, and the Google Cloud OAuth client's consent screen is set to Internal. Unlisted `@avenuez.com` staff are auto-provisioned as `INTERNAL_ANALYST` on `avenue-z` client.

### 🟡 `CLAUDE.md` — data-source framing

`CLAUDE.md` leads with Supermetrics as *the* data layer. In reality the platform is multi-source: GA4, GSC, HubSpot, Peec, and Profound hit native APIs directly, while Supermetrics now backs the paid/social ad sections (Paid Search, Meta, LinkedIn). The CLAUDE.md intro carries a note to this effect, but the bulk of its Supermetrics section still reads as the primary integration — keep that in mind when using it as a reference.

### 🟡 Debug Logs in Production Code

`lib/hubspot/client.ts` has numerous `[forms-debug]` console.log statements added during active debugging of the "customers showing 0" issue in the Forms tab. These will spam production logs.

**Fix:** Once the customer-column issue is confirmed resolved, remove all `[forms-debug]` lines from `getFormSubmissionCounts`.

### 🟢 `.env.example` — Added

A complete `.env.example` now lives in the repo root — all keys present, values
blank, annotated by `[required]` / `[per-client]` / `[optional]`. Onboard with
`cp .env.example .env.local` and fill in values from the team or Vercel. (The
`.gitignore` `.env*` rule has a `!.env.example` exception so the template is tracked.)

### 🟢 `proxy.ts` / `lib/db` References in `CLAUDE.md` — Fixed

`CLAUDE.md` previously referenced the old `middleware.ts` and the deleted `lib/clients.config.ts` in its prose and code examples. These have been corrected to `proxy.ts` and `lib/db/queries.ts` (async helpers).

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

cp .env.example .env.local   # then fill in values from the team or the Vercel dashboard

# Set up the database (DATABASE_URL_UNPOOLED should point at the dev Neon project)
npm run db:migrate     # apply Drizzle migrations
npm run db:seed        # seed the avenue-z + renaissance clients and users

npm run dev
# Open http://localhost:3000
# Log in with Google (@avenuez.com) or a seeded client credential.
```

---

## Key Conventions

1. **All data fetching is server-side.** No API keys ever reach the browser. Use Server Components, Server Actions, or API routes.
2. **The database is the source of truth.** Never hardcode client names, slugs, or identifiers; read them via `lib/db/queries.ts` (always `await`).
3. **Every report section is wrapped in `<ErrorBoundary>`** (see `components/report-sections/error-boundary.tsx`). A failed data fetch must never crash the full report page.
4. **HubSpot CRM Search calls must be sequential**, not parallel — the API rate-limits to ~4 req/s and will 429 under concurrent load.
5. **`react cache()`** is used in HubSpot and GA4 clients to deduplicate identical calls within a single server render pass.
6. **`enabledReports` on the client row** (DB) controls which tabs appear in both the dashboard and portal. Never render a section for a report not in that array.

---

## Roles

```
INTERNAL_ADMIN    → All clients, all reports, admin actions (e.g. manage connections)
INTERNAL_ANALYST  → All clients, all reports; read-only on the Reports product + admin actions
                    (MAY still edit configurable dashboards — see lib/dashboard/permissions.ts)
CLIENT_ADMIN      → Own client only: auth hub + all enabled reports
CLIENT_VIEWER     → Own client only: enabled reports, read-only
```

Role is derived at sign-in from a DB lookup (`getClientByEmail` in `lib/db/queries.ts`) and baked into the JWT. Subsequent requests decode the role from the token — no per-request DB hit.
