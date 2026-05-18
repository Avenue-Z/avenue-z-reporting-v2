# Avenue Z Reporting Platform — CLAUDE.md

> Canonical reference for Claude Code. Read this fully before writing any code.

---

## What This Is

A white-labeled, multi-client marketing reporting platform built on the
**Supermetrics "Build on Supermetrics" API suite**. Supermetrics handles all
data, connection state, workspace permissions, and OAuth flows. This app is
primarily a **presentation and routing layer** on top of those APIs.

**No database. No ORM. No external auth service fees.**

Two audiences:

1. **Internal (Avenue Z team)** — full access to all clients, all reports
2. **Clients** — permissioned, scoped view of their own data only

Two product areas:

- **Authentication Hub** — clients connect marketing platforms via Supermetrics Branded Authentication
- **Reports** — multi-section per-client dashboards (Exec Summary, GA4, Meta Ads, Email Marketing, Blended Performance, etc.)

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 15 (App Router)** | RSC, API routes, middleware |
| Language | **TypeScript** | Strict mode |
| Auth | **Auth.js v5 (NextAuth)** | Free, no vendor, credentials + Google provider |
| UI | **shadcn/ui** | Copy-paste, Tailwind-native |
| Charts | **Tremor + shadcn/ui Charts** | Both on Recharts; Tremor for KPI cards, shadcn for time-series |
| Styling | **Tailwind CSS v4** | Required by both Tremor and shadcn |
| Client Config | **`clients.config.ts`** | Flat config file — no database needed |
| Deployment | **Vercel Pro** | ~$20/month per dev seat |

**Total monthly cost: ~$40–60/month** (Vercel Pro for 2–3 devs). Everything else is free or open source.

---

## How Auth Works

Auth.js v5 handles **who can log in to this app**. It does not handle
Supermetrics permissions — those are managed by Supermetrics workspaces.

### Setup (`auth.ts`)

```typescript
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { getClientByEmail } from '@/lib/clients.config'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google,               // Avenue Z internal team (@avenuez.com domain)
    Credentials({ ... }) // email/password fallback for clients
  ],
  callbacks: {
    async session({ session, token }) {
      const clientConfig = getClientByEmail(token.email)
      session.user.role = clientConfig?.role ?? 'CLIENT_VIEWER'
      session.user.clientSlug = clientConfig?.slug ?? null
      return session
    }
  }
})
```

### Route Protection (`middleware.ts`)

```typescript
import { auth } from '@/auth'

export default auth((req) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  if (!session) return Response.redirect(new URL('/login', req.url))

  // Internal routes — Avenue Z team only
  if (pathname.startsWith('/dashboard')) {
    if (
      session.user.role !== 'INTERNAL_ADMIN' &&
      session.user.role !== 'INTERNAL_ANALYST'
    ) {
      return Response.redirect(new URL('/unauthorized', req.url))
    }
  }

  // Client portal — scoped to their own slug only
  if (pathname.startsWith('/portal')) {
    const slugInUrl = pathname.split('/')[2]
    if (session.user.clientSlug !== slugInUrl) {
      return Response.redirect(new URL('/unauthorized', req.url))
    }
  }
})

export const config = {
  matcher: ['/dashboard/:path*', '/portal/:path*']
}
```

---

## Client Configuration (`lib/clients.config.ts`)

This file is the only "database" this app needs. Add one object per client.

```typescript
export type ClientRole =
  | 'INTERNAL_ADMIN'
  | 'INTERNAL_ANALYST'
  | 'CLIENT_ADMIN'
  | 'CLIENT_VIEWER'

export type ReportSlug =
  | 'exec-summary'
  | 'ga4'
  | 'meta-ads'
  | 'google-ads'
  | 'email-marketing'
  | 'blended-performance'

export interface ClientConfig {
  slug: string               // URL slug: /portal/fun-spot
  name: string               // Display name
  logoUrl?: string           // Client logo for portal header
  smWorkspaceId: string      // Supermetrics workspace ID
  smApiKey: string           // Name of the env var holding their API key
  enabledReports: ReportSlug[]
  users: {
    email: string
    role: ClientRole
  }[]
}

export const clients: ClientConfig[] = [
  {
    slug: 'fun-spot',
    name: 'Fun Spot',
    logoUrl: '/logos/fun-spot.png',
    smWorkspaceId: 'ws_funspot_123',
    smApiKey: 'SUPERMETRICS_API_KEY_FUN_SPOT', // name of env var
    enabledReports: ['exec-summary', 'ga4', 'meta-ads'],
    users: [
      { email: 'bill@avenuez.com',     role: 'INTERNAL_ADMIN' },
      { email: 'contact@fun-spot.com', role: 'CLIENT_VIEWER' },
    ]
  },
  // Add more clients here...
]

// Helpers
export const getClientBySlug = (slug: string) =>
  clients.find(c => c.slug === slug)

export const getClientByEmail = (email?: string | null) =>
  email
    ? clients
        .flatMap(c => c.users.map(u => ({ ...u, slug: c.slug })))
        .find(u => u.email === email)
    : null
```

**To onboard a new client:** add an entry to `clients.config.ts`, add their
API key to Vercel environment variables, redeploy. Done.

---

## Supermetrics API Integration

### Base URL

```
https://api.supermetrics.com/enterprise/v2
```

### Auth Pattern

All Supermetrics calls are **server-side only**. Use the `Authorization` header.
Never expose any API key to the browser.

```typescript
// lib/supermetrics/client.ts
import { getClientBySlug } from '@/lib/clients.config'

export async function smQuery(params: {
  clientSlug: string
  dsId: string
  fields: string[]
  dateRange: string      // e.g. "last_30_days" or "2025-01-01,2025-01-31"
  filters?: string[]
  maxRows?: number
}) {
  const client = getClientBySlug(params.clientSlug)
  if (!client) throw new Error(`Unknown client: ${params.clientSlug}`)

  const apiKey = process.env[client.smApiKey]
  if (!apiKey) throw new Error(`Missing env var: ${client.smApiKey}`)

  const queryJson = {
    ds_id: params.dsId,
    fields: params.fields,
    date_range_type: params.dateRange,
    max_rows: params.maxRows ?? 1000,
    ...(params.filters ? { filter_by: params.filters } : {}),
  }

  const res = await fetch(
    `https://api.supermetrics.com/enterprise/v2/query/data/json` +
    `?json=${encodeURIComponent(JSON.stringify(queryJson))}`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 3600 }, // 1-hour cache
    }
  )

  if (!res.ok) throw new Error(`Supermetrics query failed: ${res.status}`)
  return res.json()
}
```

For large date ranges or high row counts, use the Supermetrics **async query**
pattern: submit the query, receive a job ID, poll until complete.
See: https://docs.supermetrics.com/apidocs/async-queries

### Three Supermetrics API Surfaces

#### 1. Data API

Pull metrics and dimensions from connected data sources.

- **Endpoint:** `GET /query/data/json`
- **Key params:** `ds_id`, `fields`, `date_range_type`, `start_date`, `end_date`, `filter_by`, `max_rows`
- **Features:** async queries, date range comparison, pivoting, relative dates, pagination

#### 2. Management API

Programmatic control of workspaces, users, data sources, API keys, saved
queries, and team lists. Requires elevated permissions — contact your
Supermetrics representative to get access.

**Supported features:**
- API keys — issue and rotate per-client keys
- Saved queries — store and retrieve report queries
- Team settings — configure workspace-level settings
- Data source logins — read connection state (replaces need for a local DB)
- Data source login links — generate single-use branded auth links
- Table groups — manage team table groups
- Team lists — manage centralized query lists

#### 3. Branded Authentication (Login Links)

Clients connect their ad/analytics accounts inside our app, under Avenue Z
branding. Supermetrics handles the OAuth consent, connection state, and
token renewal in the background.

```typescript
// lib/supermetrics/auth.ts
import { getClientBySlug } from '@/lib/clients.config'

export async function createLoginLink(params: {
  clientSlug: string
  dsId: string
  description: string
}) {
  const client = getClientBySlug(params.clientSlug)
  const apiKey = process.env[client!.smApiKey]

  const res = await fetch(
    'https://api.supermetrics.com/enterprise/v2/ds/login/link',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ds_id: params.dsId,
        description: params.description,
        expiry_time: '48 hours',
        redirect_url: `${process.env.APP_URL}/api/auth/supermetrics-callback`,
      }),
    }
  )

  // Returns { data: { login_url: string, link_id: string, status_code: string } }
  return res.json()
}

export async function getConnectionStatus(clientSlug: string) {
  const client = getClientBySlug(clientSlug)
  const apiKey = process.env[client!.smApiKey]

  const res = await fetch(
    'https://api.supermetrics.com/enterprise/v2/ds/login',
    { headers: { Authorization: `Bearer ${apiKey}` } }
  )
  return res.json()
}
```

Login link lifecycle: `OPEN` → *(client completes OAuth)* → `CLOSED`

### Data Source IDs (`ds_id`)

All values live in `lib/supermetrics/constants.ts`. Never hardcode strings
in components.

```typescript
// lib/supermetrics/constants.ts
export const DS_IDS = {
  GA4:         'GAWA',
  META:        'FA',
  GOOGLE_ADS:  'AW',
  MAILCHIMP:   'MC',
  KLAVIYO:     'KLAVIYO',
  LINKEDIN:    'LI',
  TIKTOK:      'TIKTOK',
  HUBSPOT:     'HS',
} as const
```

Verify exact values against the Supermetrics data sources reference before use.

---

## Directory Structure

```
/app
  /login                                        # Auth.js sign-in page
  /unauthorized                                 # Access denied

  /dashboard                                    # Internal Avenue Z view
    /page.tsx                                   # Client list
    /[clientSlug]/page.tsx                      # Per-client overview
    /[clientSlug]/auth/page.tsx                 # Manage platform connections
    /[clientSlug]/reports/[reportSlug]/page.tsx

  /portal                                       # Client-facing view
    /[clientSlug]/page.tsx                      # Their report home
    /[clientSlug]/auth/page.tsx                 # Connect their accounts
    /[clientSlug]/reports/[reportSlug]/page.tsx

  /api
    /auth/[...nextauth]/route.ts                # Auth.js handler
    /auth/supermetrics-callback/route.ts        # Post-OAuth redirect

/components
  /charts/                                      # Tremor + shadcn chart wrappers
  /report-sections/                             # One folder per report section
  /auth-hub/                                    # Platform connection card grid
  /layout/                                      # Shell, sidebar, nav, header

/lib
  clients.config.ts                             # Client registry — edit to add clients
  /supermetrics/
    client.ts                                   # smQuery() helper
    auth.ts                                     # Login link + connection status helpers
    constants.ts                                # DS_IDS and other constants
    types.ts                                    # Typed response interfaces

auth.ts                                         # Auth.js v5 config
middleware.ts                                   # Route protection
```

---

## Report Section Specs

All report pages share a common shell:

- Client logo + name in header
- Global date range picker (passed as prop to all sections)
- Section navigation tabs (only showing `enabledReports` from client config)
- Export button (PDF/CSV)
- "Data as of [timestamp]" from last Supermetrics query

Each report section is a self-contained React Server Component in
`/components/report-sections/[slug]/`. It receives `clientSlug: string` and
`dateRange: string` as props and fetches its own data server-side.

---

### `exec-summary` — Executive Summary

The one-page leave-behind for leadership.

**Metrics:** Total Impressions, Clicks, Spend (paid channels), Sessions,
Users, Conversions (GA4), Email Opens & Revenue, Blended ROAS or CPA,
MoM / prior period comparison for each KPI

**Components:** Tremor `Metric` + `BadgeDelta` KPI card grid, `AreaChart`
trend lines, summary comparison table

---

### `ga4` — Web Analytics

Full website performance view.

**Metrics:** Sessions, Users, New Users, Bounce Rate, Avg Session Duration,
Pages/Session, Goal Completions, Conversion Rate, Top Pages, Traffic by
Channel, Device breakdown

**Components:** Line chart (sessions over time), bar chart (channel
breakdown), data table (top pages), donut chart (device split)

**Supermetrics:** `ds_id: DS_IDS.GA4`

---

### `meta-ads` — Meta Ads

Facebook/Instagram paid media performance.

**Metrics:** Impressions, Reach, CPM, Clicks, CTR, CPC, Spend, Conversions,
CPA, ROAS, Frequency

**Components:** Bar chart (spend vs conversions), line chart (CTR over
time), KPI cards, campaign-level data table

**Supermetrics:** `ds_id: DS_IDS.META`

---

### `google-ads` — Google Ads

Search/Display/PMax campaign performance.

**Metrics:** Impressions, Clicks, CTR, CPC, Spend, Conversions, CPA,
Conversion Rate

**Supermetrics:** `ds_id: DS_IDS.GOOGLE_ADS`

---

### `email-marketing` — Email Marketing

Mailchimp, Klaviyo, or HubSpot channel performance.

**Metrics:** Sends, Deliveries, Open Rate, Click Rate, Unsubscribes,
Revenue (e-commerce), Top Campaigns

**Components:** Bar chart (sends vs opens), line chart (open rate trend),
campaign table

---

### `blended-performance` — Blended / Cross-Channel

Full-funnel unified view across all active channels.

**Metrics:** Total Spend by channel, Blended CPA, Blended ROAS, Impression
share by channel, Conversion attribution by channel

**Components:** Stacked area chart (spend by channel over time), donut
(spend share), funnel chart (impressions → clicks → conversions)

---

## UI & UX Conventions

- **Chart palette:** Define a single `CHART_COLORS` constant in
  `lib/constants.ts` and use it across all charts for consistency
- **Loading states:** Every report section must have a skeleton loader
  (Tremor has these built in)
- **Empty states:** When a platform is not connected, show a prompt card
  linking to the Auth Hub — never show an error
- **Error states:** Wrap each report section in a React Error Boundary;
  a failed Supermetrics query must never crash the full report page
- **Date range:** Default to `last_30_days`; persist in `localStorage`
  per client slug
- **Component split:** Use Tremor `Card`, `Metric`, `BadgeDelta`, `Text`
  for KPI cards. Use shadcn/ui `AreaChart`, `BarChart` for time-series data.

---

## Environment Variables

```env
# Auth.js
AUTH_SECRET=                         # Generate: openssl rand -base64 32
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

# App
NEXT_PUBLIC_APP_URL=                  # e.g. https://reports.avenuez.com
APP_URL=

# Supermetrics — one per client (name must match smApiKey in clients.config.ts)
SUPERMETRICS_API_KEY_FUN_SPOT=
SUPERMETRICS_API_KEY_CLIENT_TWO=
# ...add one per client
```

---

## Development Rules for Claude Code

1. **All Supermetrics API calls are server-side only.** Never call from a
   Client Component. Use Server Components, Server Actions, or API routes.

2. **`ds_id` values live in `lib/supermetrics/constants.ts`.** Never
   hardcode `"GAWA"`, `"FA"`, etc. in components.

3. **Client config lives in `lib/clients.config.ts`.** Never hardcode
   client names, slugs, or workspace IDs elsewhere.

4. **Each report section is a self-contained RSC** in
   `/components/report-sections/[slug]/`. Props: `clientSlug` and
   `dateRange`. Data fetching happens inside the component.

5. **Wrap every report section in a React Error Boundary.** One failed
   Supermetrics query must never take down the whole report.

6. **Type all Supermetrics responses** in `lib/supermetrics/types.ts`.
   No `any`.

7. **Check `enabledReports` from client config** before rendering a report
   tab. Don't show sections a client hasn't been configured for.

8. **Build one section at a time.** Scaffold the shell first (layout,
   nav, date picker), then wire in real data section by section.

9. **Connection state comes from Supermetrics**, not local storage. Use
   `getConnectionStatus()` to show whether a platform is connected.

---

## Roles Reference

```
INTERNAL_ADMIN    → Full access: all clients, auth hub, all reports
INTERNAL_ANALYST  → Read-only: all clients, all reports, no admin actions
CLIENT_ADMIN      → Full access to own client: auth hub + all enabled reports
CLIENT_VIEWER     → Read-only: own client's enabled reports only
```

Role is derived at session time from `clients.config.ts` — no database lookup
required.

---

## Roadmap / Future Considerations

- [ ] Scheduled PDF email delivery of reports
- [ ] AI-generated narrative summaries per section (Claude API)
- [ ] White-label domain per client (`reports.clientdomain.com`)
- [ ] Client annotations on charts
- [ ] Custom report builder (drag-and-drop section order)
- [ ] SEO section via Google Search Console
- [ ] Automated client workspace provisioning via Supermetrics Management API

---

## References

- Supermetrics API Getting Started: https://docs.supermetrics.com/apidocs/getting-started
- Supermetrics Authentication: https://docs.supermetrics.com/apidocs/authentication
- Supermetrics Login Links: https://docs.supermetrics.com/apidocs/ds-login-links
- Supermetrics Async Queries: https://docs.supermetrics.com/apidocs/async-queries
- Supermetrics Management API: https://docs.supermetrics.com/apidocs/management-api
- Build on Supermetrics: https://supermetrics.com/blog/build-on-supermetrics
- Auth.js v5: https://authjs.dev
- shadcn/ui: https://ui.shadcn.com
- Tremor: https://tremor.so
- Next.js App Router: https://nextjs.org/docs/app