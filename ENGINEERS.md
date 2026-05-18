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

`lib/clients.config.ts` is the only place clients are registered. There is no database.

```typescript
// Current config — one client: Avenue Z internal
{
  slug: 'avenue-z',
  name: 'Avenue Z',
  ga4PropertyId: 'GA4_PROPERTY_ID_AVENUE_Z',     // env var name
  gscSiteUrl: 'GSC_SITE_URL_AVENUE_Z',            // env var name
  hubspotToken: 'HUBSPOT_ACCESS_TOKEN_AVENUE_Z',  // env var name
  enabledReports: ['demand-overview', 'ga4', 'google-search-console',
                   'hubspot-performance', 'inbound-funnel', 'peec-ai', 'profound-ai'],
  hiddenReports: ['exec-summary'],
  prConfig: { keywords: [...], excludeKeywords: [...], ... },
  users: [
    { email: 'nick@avenuez.com',  role: 'INTERNAL_ADMIN' },
    { email: 'demo@avenuez.com',  role: 'INTERNAL_ANALYST' },
  ],
}
```

**To add a new client:** append a new object to the `clients` array, add their env vars to Vercel, redeploy.

---

## Data Clients

### GA4 (`lib/ga4/client.ts`)
- Uses `@google-analytics/data` Node.js SDK
- Auth via a shared Google Service Account (`GOOGLE_SERVICE_ACCOUNT_KEY` env var)
- Property ID read from env var named in `clientConfig.ga4PropertyId`
- `ga4Query()` is the main helper — takes dimensions, metrics, date range, optional filters

### Google Search Console (`lib/gsc/client.ts`)
- Uses `googleapis` Node.js SDK, same service account
- Site URL read from env var named in `clientConfig.gscSiteUrl`

### HubSpot (`lib/hubspot/client.ts`)
- Uses `@hubspot/api-client`
- Access token read from env var named in `clientConfig.hubspotToken`
- React `cache()` wraps all functions — request-scoped memoization
- **Rate limit:** CRM Search API is throttled to ~4 req/s. All year-level cache queries run sequentially (not `Promise.all`)
- `getFormSubmissionCounts` has `[forms-debug]` console.log statements in place — these should be removed once the customer-column bug is resolved (see "Open Issues" below)

### PEEC AI (`lib/peec/client.ts`)
- Direct HTTP to PEEC AI API
- Brand data configured per-client in `clients.config.ts`

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

Copy this to `.env.local` for local development. All production values live in Vercel.

```env
# Auth.js
AUTH_SECRET=                          # openssl rand -base64 32
AUTH_GOOGLE_ID=                       # Google Cloud Console → OAuth 2.0 client
AUTH_GOOGLE_SECRET=                   # Same credential

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
APP_URL=http://localhost:3000

# Google service account (shared across all GA4 + GSC clients)
GOOGLE_SERVICE_ACCOUNT_KEY=           # JSON stringified service account key

# Per-client data connections (env var name must match value in clients.config.ts)
GA4_PROPERTY_ID_AVENUE_Z=            # "properties/XXXXXXXXX"
GSC_SITE_URL_AVENUE_Z=               # "https://avenuez.com/" or "sc-domain:avenuez.com"
HUBSPOT_ACCESS_TOKEN_AVENUE_Z=       # "pat-na1-..."

# Third-party APIs
PEEC_API_KEY=
PROFOUND_API_KEY=
NEWS_API_KEY=                         # newsapi.org
GLEAN_API_TOKEN=

# Supermetrics (add one per client)
SUPERMETRICS_API_KEY_AVENUE_Z=
```

---

## Immediate Fixes Needed Before Collaboration

### 🔴 Security: No Password Validation

`auth.ts` `authorize()` function currently accepts **any password** as long as the email exists in `clients.config.ts`. This is fine for internal-only preview but must be fixed before any client has login credentials.

**Fix:** Add a `passwordHash` field to the `users` array in `clients.config.ts` and validate with `bcrypt.compare()` in the `authorize()` callback. Or switch all internal users to Google OAuth and reserve credentials-only for specific client accounts.

### 🔴 Google OAuth Not Configured

`AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are blank. The "Sign in with Google" button on the login page currently throws a "Missing client_id" error.

**Fix:**
1. Go to [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create an OAuth 2.0 client (Web application)
3. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google` (dev) and `https://your-production-url.com/api/auth/callback/google` (prod)
4. Copy client ID and secret into `.env.local` and Vercel environment variables

### 🟡 `CLAUDE.md` Is Out of Sync

`CLAUDE.md` still describes a Supermetrics-first architecture in the present tense as if it's the current data layer. In reality, the live report sections (GA4, HubSpot, GSC, PEEC, Profound) all use direct API clients, not Supermetrics. Supermetrics is scaffolded but not wired to any live section.

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
