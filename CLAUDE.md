# Avenue Z Reporting Platform — CLAUDE.md

> Canonical reference for Claude Code. Read this fully before writing any code.

---

## What This Is

A white-labeled, multi-client marketing reporting platform. It is a
**presentation and routing layer** over multiple marketing data sources, and it
hosts **two products** that share one spine (Neon Postgres + Drizzle, Auth.js v5,
and the per-client `clients` row):

1. **Reports** (client-facing) — per-client, multi-section report pages
   (`components/report-sections/`) shown to the Avenue Z team at `/dashboard`
   and to clients at `/portal/[clientSlug]`, gated by the client's
   `enabledReports`. Onboarding guide: [`ENGINEERS.md`](./ENGINEERS.md).
2. **Configurable dashboard** (internal) — a JSON-configured, drag-and-arrange
   grid of data blocks stored in `clients.dashboard_config`, authored in the
   browser with no deploy. Architecture: [`lib/dashboard/ENGINEERS.md`](./lib/dashboard/ENGINEERS.md).

> **Which docs are canonical?** [`README.md`](./README.md) has the full
> Documentation Map. In short: this file, `README.md`, `ENGINEERS.md`, and
> everything under `lib/dashboard/` are **current**; `Guides/claude.md` and
> `Guides/progress.md` are **archived** and describe a superseded architecture —
> do not follow them.

**Data sources.** GA4, Google Search Console, HubSpot, Peec AI, and Profound AI
are queried via their **native APIs** (`lib/ga4`, `lib/gsc`, `lib/hubspot`,
`lib/peec`, `lib/profound`). The **Supermetrics Data API** (`lib/supermetrics`)
backs **only** the paid/social ad sections — Paid Search (`lib/paid-search`),
Meta (`lib/meta`), and LinkedIn (`lib/linkedin`) — plus the configurable
dashboard's Supermetrics adapter. Supermetrics is **not** the single data layer,
does **not** handle auth, and its Branded Authentication has been removed;
platform connection state is derived from environment variables.

**No external auth service fees.**

Two audiences:

1. **Internal (Avenue Z team)** — full access to all clients, all reports
2. **Clients** — permissioned, scoped view of their own data only

The **Authentication Hub** (a feature of the Reports product) shows per-platform
connection status (`CONNECTED` / `NOT_CONFIGURED`) driven by environment variables.

---

## Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16 (App Router)** | RSC, API routes, proxy.ts |
| Language | **TypeScript** | Strict mode |
| Auth | **Auth.js v5 (NextAuth)** | Free, no vendor, credentials + Google provider |
| UI | **shadcn/ui** | Copy-paste, Tailwind-native |
| Charts | **Tremor + shadcn/ui Charts** | Both on Recharts; Tremor for KPI cards, shadcn for time-series |
| Styling | **Tailwind CSS v4** | Required by both Tremor and shadcn |
| Database | **Neon Postgres + Drizzle ORM** | Stores clients + users; helpers in `lib/db/queries.ts` |
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
import { getClientByEmail } from '@/lib/db/queries'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google,               // Avenue Z internal team (@avenuez.com domain)
    Credentials({ ... }) // email/password fallback for clients
  ],
  callbacks: {
    async session({ session, token }) {
      const clientConfig = await getClientByEmail(token.email) // async — DB-backed
      session.user.role = clientConfig?.role ?? 'CLIENT_VIEWER'
      session.user.clientSlug = clientConfig?.slug ?? null
      return session
    }
  }
})
```

### Route Protection (`proxy.ts`)

`middleware.ts` has been removed. Route protection now happens in `proxy.ts`
combined with NextAuth's JWT callback. The conceptual model is the same:
unauthenticated requests redirect to `/login`, internal routes (`/dashboard`)
require `INTERNAL_ADMIN` or `INTERNAL_ANALYST` role, and client portal routes
(`/portal/[clientSlug]`) are scoped to the session's `clientSlug`. Role and
`clientSlug` are baked into the JWT at sign-in from the DB lookup — no DB hit
on subsequent requests.

---

## Client Configuration (Neon Postgres + Drizzle ORM)

Clients and users now live in a Neon Postgres database. There is no static
config file.

**Schema and types** — `lib/db/schema.ts` contains the Drizzle table
definitions for `clients` and `users`, the `clientRole` enum, and the inferred
TypeScript types (`Client`, `User`, `ClientRole`, `ReportSlug`, `PRConfig`).
These types are the source of truth — read them for field names and shapes.

**Query helpers** — `lib/db/queries.ts` exports the three primary async helpers:
`getClientBySlug`, `getClientByEmail`, and `getAllClients`. All are wrapped in
`React.cache()` for per-render deduplication.

**Identifiers vs. secrets** — GA4 property IDs and GSC site URLs are
identifiers stored directly in DB columns (`ga4_property_id`, `gsc_site_url`).
HubSpot access tokens are secrets: the DB column `hubspot_token_env_var` stores
only the _name_ of the env var; the value stays in the environment.

**To onboard a new client:** insert a row into the `clients` table and one or
more rows into the `users` table (via Drizzle Studio, the Neon dashboard SQL
editor, or a future admin UI). If the client uses HubSpot, also add the
`HUBSPOT_ACCESS_TOKEN_<CLIENT>` env var to Vercel and set `hubspot_token_env_var`
in the DB row to that var name. No code change, no redeploy required for the
data entry itself.

---

## Supermetrics Integration

Supermetrics provides data for the **paid/social ad channels only** — Paid
Search (Google Ads), Meta, and LinkedIn (plus Shopify at the data layer).
Everything else (GA4, GSC, HubSpot, Peec, Profound, News API) uses native APIs.
Only the **Data API** is used.

### Base URL

```
https://api.supermetrics.com/enterprise/v2
```

### Data API — `smQuery()`

`lib/supermetrics/client.ts` exposes one server-side helper, `smQuery()`. The
caller passes the per-client API key in — read from the env var named in the
client's `sm_api_key_env_var` column. `smQuery()` does **not** look the client
up itself.

```typescript
// lib/supermetrics/types.ts
export interface SmQueryParams {
  apiKey: string
  dsId: string               // a DS_IDS value
  dsAccounts: string         // the Supermetrics account id for this client
  fields: string[]
  dateRange: string          // 'YYYY-MM-DD,YYYY-MM-DD'
  filters?: string
  settings?: Record<string, unknown>
  maxRows?: number
}
export interface SmResult { header: string[]; rows: string[][] }
```

`smQuery()` POSTs to `/query/data/json`. Normal queries respond synchronously
with the data array; large/queued queries return a `schedule_id` without data,
and the helper polls `/query/data/json/{schedule_id}` until the data appears
(~60s ceiling via `maxPolls`) or throws `SmTimeoutError`. Each request has a
15s hang guard (`REQUEST_TIMEOUT_MS`, via `AbortController`; callers needing
more pass `timeoutMs`, as every Salesforce *pipeline* query does — the contact
queries in `lib/salesforce/contacts.ts` still take the default) and bounded retries for
the three transient cases: HTTP 429, HTTP 5xx, and socket-level failures. 429
and 5xx honor `Retry-After` when present; a 4xx is an answer and is never
retried, and neither is our own abort. Rows are keyed by canonical `field_id` (from
`meta.query.fields`), not the display-name header row; `parseSmRows(result)`
turns the `{ header, rows }` shape into objects.

Each channel wraps `smQuery()` in its own `base.ts` (which resolves the key +
account from the DB and applies field mapping); report sections call those
wrappers, never `smQuery()` directly. The real pattern:

```typescript
// lib/paid-search/base.ts
import { smQuery, parseSmRows, DS_IDS } from '@/lib/supermetrics/client'
import { getClientBySlug } from '@/lib/db/queries'

export async function awQuery(slug: string, fields: string[], dateRange: string) {
  const client = await getClientBySlug(slug)
  const cfg = client?.paidSearchConfig
  const envVar = client?.smApiKeyEnvVar
  if (!cfg || !envVar) throw new Error(`paid_search_config / sm_api_key_env_var missing for ${slug}`)
  const apiKey = process.env[envVar]
  if (!apiKey) throw new Error(`Missing env var ${envVar}`)

  const result = await smQuery({
    apiKey,
    dsId: DS_IDS.GOOGLE_ADS,
    dsAccounts: cfg.googleAdsAccountId,
    fields,
    dateRange, // 'YYYY-MM-DD,YYYY-MM-DD'
  })
  return parseSmRows(result)
}
```

### Data Source IDs (`ds_id`)

Live values in `lib/supermetrics/constants.ts` — only the channels in use.
Never hardcode the raw strings in components. (`constants.ts` also exports
`SM_TIME_DIMENSION`, the per-DS day/week/month field-id map.)

```typescript
// lib/supermetrics/constants.ts
export const DS_IDS = {
  GA4:         'GAWA',
  GOOGLE_ADS:  'AW',
  META:        'FA',
  LINKEDIN:    'LIA',
  SHOPIFY:     'SHP',
} as const
```

### Branded Authentication — removed

Earlier versions used Supermetrics Branded Authentication (login links) so
clients could connect ad accounts under Avenue Z branding. **This has been
removed:** `lib/supermetrics/auth.ts` is now an empty deprecated stub, and the
`createLoginLink()` / `getConnectionStatus()` helpers no longer exist. Platform
connections are configured via **environment variables** — the Connections page
(`app/dashboard/connections`) and the per-client Auth Hub show a `CONNECTED` /
`NOT_CONFIGURED` status based on whether the relevant env var is set. The
`app/api/auth/supermetrics-callback` route remains but is vestigial. The
Supermetrics Management API is not used.

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
  /db/
    client.ts                                   # Drizzle client singleton (Neon serverless)
    schema.ts                                   # Table definitions + inferred TS types
    queries.ts                                  # Async helpers: getClientBySlug, getClientByEmail, getAllClients
  /supermetrics/
    client.ts                                   # smQuery() Data API helper + parseSmRows
    auth.ts                                     # deprecated empty stub (Branded Auth removed)
    constants.ts                                # DS_IDS (GA4, GOOGLE_ADS, META, LINKEDIN, SHOPIFY)
    types.ts                                    # SmQueryParams, SmResult, error classes

/drizzle/                                       # Auto-generated SQL migrations (committed to git)
/scripts/
  seed.ts                                       # One-time seed of initial client/user data

auth.ts                                         # Auth.js v5 config
proxy.ts                                        # Route protection (replaces middleware.ts)
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

The complete, annotated list is **[`.env.example`](./.env.example)** (the single
source of truth — `cp .env.example .env.local`). Per-integration notes and Vercel
Production/Preview scoping live in [`ENGINEERS.md`](./ENGINEERS.md#environment-variables).
Do not re-list env vars here — add new ones to `.env.example` so they aren't
documented in three places and left to diverge.

Key principle (see **Client Configuration** above): per-client **identifiers**
(GA4 property IDs, GSC site URLs) live in DB columns; per-client **secrets**
(HubSpot tokens) stay in env, and the DB stores only the env-var *name* pointer.

---

## Development Rules for Claude Code

1. **All Supermetrics API calls are server-side only.** Never call from a
   Client Component. Use Server Components, Server Actions, or API routes.

2. **`ds_id` values live in `lib/supermetrics/constants.ts`.** Never
   hardcode `"GAWA"`, `"FA"`, etc. in components.

3. **Client data lives in the database.** Use `lib/db/queries.ts` to read
   (always async — add `await`). To write, use Drizzle Studio or the Neon
   dashboard SQL editor. Schema and inferred TypeScript types are in
   `lib/db/schema.ts`. Never hardcode client names, slugs, or identifiers.

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

9. **Connection state is derived from environment variables**, not Supermetrics
   Branded Auth (removed). A platform shows `CONNECTED` when its configuring env
   var is set, otherwise `NOT_CONFIGURED`.

---

## Branch Flow & Promotion Pipeline (canonical, required every session)

Work flows `feature → dev → staging → main`. Each hop is a gate with a distinct
purpose. The one mistake we do NOT repeat: merging a feature straight into `dev`
before it has been code-reviewed on its own PR. FB-067 did exactly that (merged
to dev via PR #139 before the review PR), and that is what we are correcting.

**Stage 1: feature branch off `dev` (code review gate).**
Every feature is built on its own branch cut from `dev`, and every feature gets
its own PR for code review. ALL code changes and reviewer feedback happen on
that PR BEFORE anything reaches `dev`. Nothing merges to `dev` until the code
review is done on the PR and every piece of feedback is accounted for. Do NOT
merge to `dev` first and review after.

The reviewers on the Stage-1 PR are Paul and Thomas. CI (type-check, tests)
must be green on the PR before it merges to `dev`, and every reviewer comment
must be resolved on the branch first.

The code-review artifact is a standalone review-record doc, same format Paul
used for the FB-065/FB-066 review (template: PR #138 `docs(review): FB-065/FB-066
Profound sentiment code review record`). It is a markdown file at
`docs/qa/<feature>-code-review.md`, opened as its own PR off `dev`, titled
`docs(review): <feature> … code review record`. The review PR changes NO code;
fixes are follow-ups. It is written against the FEATURE BRANCH (it cites the
feature-branch diff range) and is the gate that must clear before the feature
merges to `dev`, not a record written after the fact. Faithful skeleton:
- **Header:** exact scope, meaning the feature PR(s)/commits under review and
  the precise diff range (e.g. `097b811^..2024b56`, "no unrelated code"), plus
  one line stating no code is changed in this doc.
- **§1 How it works:** comprehension summary. Where every number comes from
  (which endpoint, formula, filter), so a client question ("how is this sourced
  / ranked / calculated?") is answerable straight from the doc.
- **§2 Verification method:** how each finding was actually probed, not just
  read (static anchor confirmed at the stated line, logic executed in a
  throwaway probe spec, external-API triggers flagged rather than asserted).
- **§3 Findings table:** columns `# | Sev | Status | Location | Finding`.
  Sev legend: **●** correctness, **○** cleanup/convention. Status legend:
  CONFIRMED (proven in-tree) / PLAUSIBLE (code assumption confirmed, external
  trigger unverified). Location is `file:line`.
- **§4 Detail:** one block per finding: the mechanism, then a suggested fix.
- **§5 Follow-ups:** the fixes, tracked separately (not applied in the review
  PR), bucketed (e.g. Correctness / Needs a live call first / Decide together /
  Cleanup), noting which block the ship and which is highest-value.

**Stage 2: `dev → staging` (integration testing).**
Once `dev` holds the reviewed changes with all feedback accounted for, it feeds
`staging`. Integration testing = do the features work together correctly on the
combined build (data flows, no cross-feature regressions), not just each one in
isolation.

**Stage 3: `staging` (stakeholder QA).**
`staging` is where the stakeholder (Tina) QAs the build and confirms it all
works as intended. If any feature or change is requested there, that feature
goes back to its feature branch, gets reworked, and must pass the upstream gates
again (code review, then dev, then integration testing) to return to `staging`.

**Stage 4: `staging → main` (functional testing).**
From `staging` the build promotes to `main`. Functional testing = does the whole
product do what the spec and stakeholder signed off on, end to end, on a
prod-like build. The `main`-merge self-review gate below still applies on top of
this, and we never merge to `main` without Thomas's explicit go-ahead.

**No hotfix fast lane.** Every fix, including a production-critical bug on
`main`, starts on a feature branch off `dev` and walks all four stages. There is
no shortcut straight to `main`.

---

## Code Review & Merge Process (required before anything merges to `main`)

Every change that goes into `main` must pass a self-review first. This is not a
line-by-line audit — it is a comprehension gate. The point is that whoever
merged the code can explain *why it works* when a client or teammate asks,
so we never end up in a "Tina asked how AIVX was ranked and we didn't know"
situation again.

**The process:**

1. **Understand the implementation.** Read through the code/implementation on
   the branch until you have a solid grasp of the general *why* — how the pieces
   fit together and the logic behind them. You do NOT need to be able to say
   "line 42 does X"; you DO need to explain how a metric is derived, where a
   number comes from, and why the approach was chosen. If a client could
   plausibly ask "how is this calculated / ranked / sourced?", you must be able
   to answer it from this review.

2. **Write a review comment on the PR** outlining that understanding — a short
   plain-English summary of what the change does and the reasoning/data behind
   any non-obvious metric or logic. This is the artifact that proves the
   comprehension gate was met.

3. **Apply the `self-reviewed` label** to the PR once the comment is posted.

4. **Merge** — but only once the `self-reviewed` label is on AND all other
   correctness checks (type-check, tests, any CI) pass. The label without green
   checks is not enough; green checks without the label is not enough.

**Never merge to `main` without an explicit go-ahead from Thomas**, even when
the self-review and checks are green. The self-review is a prerequisite for
merging, not a license to merge on your own.

---

## Roles Reference

```
INTERNAL_ADMIN    → Full access: all clients, auth hub, all reports
INTERNAL_ANALYST  → All clients + all reports; read-only on the Reports product & admin actions.
                    Exception: MAY edit configurable dashboards (all internal staff can —
                    see canEditDashboard in lib/dashboard/permissions.ts).
CLIENT_ADMIN      → Full access to own client: auth hub + all enabled reports
CLIENT_VIEWER     → Read-only: own client's enabled reports only
```

Role is derived at sign-in from a DB lookup (`getClientByEmail` in `lib/db/queries.ts`)
and baked into the JWT. Subsequent requests decode role from the token — no DB hit
per request.

---

## Known Follow-ups: Organic Social annotations (from PR #252)

- [ ] **The Net New Followers tile and the v2 Follower Growth Graph use different windows for the
  same metric** (review of the annotations build, #252). The tiles send the Eastern window
  (`isoRangeTz`, `lib/organic-social/headlines.ts:20`; the outline tiles on #255 the same way),
  while the v2 graphs send the UTC month (`lib/organic-social/followers.ts:35`), which is the
  window Top Content uses so a day on the chart and the post behind it agree. So adding up the
  plotted daily gains does not always equal the tile above them. Measured on real August data for
  the three clients: 0 to 4 followers per channel, which is nothing on a large account and up to a
  third of the total on a small one. Fixing it means giving the tiles the same window, which
  changes what Renaissance requests, so it needs its own PR with a Renaissance proof; a
  client-scoped fix in the outline Data block alone would also work. Decide before the graphs go in
  front of a client.

- [ ] **The trend charts' per-view state is correct only because the report pages key the section by
  tab and month.** `ChannelTrendChart` seeds which channels are on and which days are hidden once,
  on mount, and re-seeds neither (`components/report-sections/organic-social/trends.tsx`). Both
  report pages wrap the section in a Suspense keyed on the resolved subsection and the date range
  (`app/dashboard/[clientSlug]/reports/page.tsx`, `app/portal/[clientSlug]/reports/page.tsx`), so a
  new tab or month is a new instance and both seeds are fresh. Verified by running it: through that
  key a tab switch and a month change both carry the right hides and the right legend. What is left
  is a new answer arriving under the SAME key, which takes an in-place refresh someone else caused
  and clears on any navigation. Closing that means `useOptimistic` (react 19 is installed) or an
  override held per day; a single hash over the whole answer looks right and is not, because it
  reverts a hide still in flight whose write then succeeds. `trends.identity.test.tsx` pins all of
  it, including that trap. No user-visible defect today, so this is a hardening item, not a fix.
  The note belongs at the key itself as well, which is not done here: #256 rewrites that exact line
  in both pages (the key takes the served locked range), so a comment there would be the one thing
  in this set that does not merge cleanly in any order. Add it once #256 has landed.

## Known Follow-ups — Configurable Dashboard (from PR #108 review)

> **Feature overview:** for how the configurable dashboard actually works
> (blocks → bindings → resolvers → adapters → UI, caching, sharing), see
> [`lib/dashboard/ENGINEERS.md`](lib/dashboard/ENGINEERS.md). This section is
> only the open bug/tech-debt list.

Tracked tech-debt / latent bugs surfaced reviewing the configurable dashboard.
Fixed in `fix/tw-cache-key-and-leaf-concurrency`: the Triple Whale grouped/series
cross-client cache-key collision and the sequential leaf current/compare fetches.
Still open:

- [ ] **Shopify grouped/series `GROUP BY` clause order** — `resolveShopifyGrouped`/
  `resolveShopifySeries` append `GROUP BY` to `b.query`, but catalog metrics like
  New Customers / Returning Customers / New Subscriptions already contain a `WHERE`,
  producing `…WHERE … GROUP BY …` which is invalid ShopifyQL. Any Shopify bar/line
  block on a `WHERE`-bearing metric errors. Build the query with correct clause order
  instead of string-appending. (`lib/dashboard/adapters/shopify.ts`)
- [ ] **`alignSeries` joins prior values by array index, not date** — when current and
  compare ranges have different bucket counts (e.g. 28- vs 31-day months, gap days),
  every prior point after a gap maps to the wrong date. Join by bucket date / gap-fill.
  (`lib/dashboard/group-join.ts`)
- [ ] **Supermetrics 15s request timeout also caps large synchronous queries** — a wide
  grouped/series query (`max_rows` 10000) that legitimately takes >15s now throws
  `SmTimeoutError`. Consider a higher cap for the submit call or only bounding the poll
  loop. (`lib/supermetrics/client.ts`, `REQUEST_TIMEOUT_MS`)
- [x] **Role-doc drift — RESOLVED.** The Roles Reference now states `INTERNAL_ANALYST`
  is read-only on the Reports product + admin actions but MAY edit configurable
  dashboards, matching `canEditDashboard` in `lib/dashboard/permissions.ts`. The
  wording in `README.md`, `ENGINEERS.md`, and `lib/dashboard/ENGINEERS.md` was
  reconciled to match.
- [ ] **`keyHash` duplicated in 4 files** (`adapters/{supermetrics,shopify,triplewhale}.ts`,
  `app/actions/dashboard.ts`) — extract one shared helper to avoid divergence.
- [ ] **`twSql` masks a malformed success payload as empty** — `{success:true, data:null}`
  returns `[]` → surfaces as "no-data" rather than an error worth alerting on.
  (`lib/triplewhale/client.ts`)

## Known Follow-ups: Organic Social outline tabs (from PR #255)

- [ ] **Validate the client's own Instagram handle when it is saved, instead of inferring trust
  from that month's post authors.** `handleMatchesNoAuthor`
  (`lib/organic-social/outline-top-content.ts:53`) distrusts a stored handle whenever the window's
  Instagram posts carry authors and none is that handle, then falls back to the `#ad` rule. Paul
  raised (PR #255, 2026-09-23) that this distrusts a CORRECT handle in any month whose only posts
  are partner collabs, which puts collab posts without `#ad` into the client's owned Top 5. He is
  right, and his suggested narrowing (distrust only when there is exactly one distinct author)
  **cannot be implemented**: a renamed account with one partner collab, and a correct handle in a
  month of partner collabs, need opposite answers and the rule cannot tell them apart, because it
  only ever compares an author name to the handle for equality, so renaming every name at once
  cannot change its answer, and renaming is the only difference between the two cases. (An earlier
  version of this entry said the two hand the function "identical input". They do not: what
  matched was a summary the test itself computed. Paul's correction, 2026-09-23. His narrowed rule
  did fix a collab month with several partners; it failed on a single partner, and on the rename
  case above.) The test
  `the own-handle rule cannot separate a rename from a month of partner collabs`
  (`lib/organic-social/outline-top-content.test.ts`) proves it, and `:38` in the same file is the
  existing case his rule would break. Validating at save time works because the handle can be
  checked against Dash directly rather than inferred from whoever happened to post. Write-path
  change in the switch-on script and the admin surface, so its own PR.

  **Before building that check, see whether Dash gives us a stable account id** (Paul, 2026-09-23).
  If `instagram_user` carries an id alongside the handle, store and match the id instead: a rename
  can then never make the stored value stale, and `handleMatchesNoAuthor` can be deleted outright
  rather than validated around. That removes this class of problem instead of managing it.

  It is genuinely unknown today, and here is why, so nobody re-derives it. `authorOf`
  (`lib/organic-social/post-author.ts`) reads only `instagram_user.handle` then `.username`,
  through a narrow cast, so the shape is never typed. Every `instagram_user` in the repo is a
  hand-written test fixture carrying `{ handle }` only (`fetch-top-content-author.test.ts:38`,
  `fetch-top-content-parity.test.ts:26`), so the tests cannot answer it. The one live probe that
  touched this object (`probes/collab-posts-authors.ts`, 2026-09-21) read the same two named fields
  and printed the derived handle, never the object or its keys, so its saved output does not
  contain the answer either.

  **The probe that settles it:** one read-only CONTENT call for a single Instagram post, printing
  `Object.keys(post.instagram_user)`. Do that before designing the save-time check, because the
  answer decides whether it is "validate a handle" or "store an id and stop caring".

- [ ] **The health sweep and cache warmer only reach the first platform tab for clients that hide
  Overview** (Paul, #255). The per-client loops in `app/api/health/sweep/route.ts:65` and
  `app/api/cache-warm/route.ts:114` build one Organic Social URL per client with no subsection, which
  for a client that hides Overview lands on its first platform tab only. Add the tabs from
  `organicSocialSubsections(client)` (`lib/constants.ts:207`) so every tab, and its outline Data
  request, is probed and warmed. Lock every number (#256) also edits the warmer; land this after it.
- [ ] **A single null metric still plots a zero on the YTD graphs** (review of the YTD build, #255).
  `buildOutlineKpis` (`lib/organic-social/outline-headlines.ts`) marks a month `noData` only when
  EVERY metric is null, and coerces each null to 0. So a month where Dash returns a null Total
  Followers but other metrics have values is not `noData`: the tile reads 0 and the YTD line drops
  to zero and back, which reads as a collapse rather than a gap. YTD cannot tell the difference (the
  null is gone before it sees it); the fix belongs in the tiles' builder, which the YTD work must
  not touch. Decide with the outline Data block, not here.
- [ ] **The YTD block fails all or nothing across up to 12 requests** (same review).
  `parts/ytd-review.tsx:30` fires one request per month in parallel and one rejection blanks the
  whole block (a partial graph is deliberately never drawn). In August that is one request; by
  December it is twelve, so the chance of hitting a timeout or a 429 grows with the year. Add a
  small concurrency cap rather than degrading the graph.
- [ ] **The timeout card tells a YTD viewer to shorten the date range** (same review), which they
  cannot do: the block picks its own months (`parts/shared.tsx` `Fallback`). Needs copy that fits
  both callers, or a per-block message.
- [ ] **One Organic Social title rule instead of four copies** (from my own #255 work). The tab title
  rule lives in the two SPA routes (`pageTitle`, `app/dashboard/[clientSlug]/reports/page.tsx:176`,
  `app/portal/[clientSlug]/reports/page.tsx:212`) and the two deep-link routes (`reportName`,
  `app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx:107`,
  `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx:127`), in two spellings held together by
  `lib/organic-social/deep-link-parity.test.tsx`. Hoist it into one helper next to
  `resolveOrganicSubsection` (`lib/constants.ts:220`). It edits routes on Renaissance's live path: its
  own PR, with the parity test as the guard.
- [ ] **UGC posts without #ad compete for the owned top 5 on outline tabs** (review of the outline
  fixes build, #255). `top-content@3` sorts Instagram UGC (posts that tag the client) with no author
  and no #ad into the owned rows, because UGC author fields are unproven, so the UGC line never
  attaches one (`lib/organic-social/top-content.ts:188`). The deck match (9 of 9) was checked on the
  owned feed only. Before the three clients go live, compare one month of their Instagram Top Content
  on staging with the deck; if a tagged post takes an owned slot, send UGC to Influencer Posts for
  pinned clients.
- [ ] **The Views on Reels failure log names only `kind=error` or `kind=timeout`** (same review).
  `components/report-sections/organic-social/parts/outline-data.tsx:24` does not say whether it was
  a 401, a 500 or a malformed answer. Add the error's name and status.

## Known Follow-ups — GA4 / Web Analytics (from PR #210 review)

Surfaced reviewing the Web Analytics ↔ Overview channel-parity fix (PR #210).
Across five files that PR ordered the three channel queries by sessions desc,
added the share-of-total denominator
(`components/report-sections/ga4/channel-share.ts`), and made a channel absent
from the compare fetch render `—` instead of a fabricated zero
(`components/report-sections/ga4/channel-tabs-chart.tsx`). The items below were
deliberately left out of its scope so it stayed reviewable.

- [ ] **Source/medium drilldown cap fills from the highest-volume channels** —
  the `sessionDefaultChannelGroup, sessionSource, sessionMedium` query takes
  `limit: 150` ordered by sessions desc, so the cap is consumed by the biggest
  channels first. A low-volume channel still shown in the chart can come back
  with zero rows and silently render an empty hover breakdown (the panel is
  gated on `smEntries.length > 0`). The *query* is identical on both pages
  (`components/report-sections/ga4/index.tsx:220-223`,
  `components/report-sections/executive-overview/index.tsx:77`); the *exposure*
  is not. Overview draws channels from a `limit: 25` pool
  (`executive-overview/index.tsx:68`) and its By Conversion tab ranks across all
  25 rows with ≥20 sessions (`executive-overview/reshape.ts:254-257`; its volume
  tab slices to 10 via `VOLUME_DISPLAY_LIMIT`, `reshape.ts:172`, applied at
  `:250`), while ga4 feeds both of its tabs from a single `limit: 10` pool
  (`ga4/index.tsx:144`, consumed at `:371`, `:385`, `:580-582`). So channels
  ranked 11–25 by volume get a hover panel on Overview and can never render on
  ga4 — and those are exactly the low-volume channels the 150-row cap drops. A
  fix has to touch both pages, but the asymmetry sits in the exposure rather
  than the query, so a symmetric fix under-fixes Overview: it has strictly more
  channels able to reach the bug.

- [ ] **Eight rankable GA4 queries still take an arbitrary N** — `limit` without
  `orderBys` lets GA4 return *any* N rows, not the top N by sessions. Highest
  value first:

  - The two compare fetches on `pagePath` / `landingPage`
    (`components/report-sections/ga4/index.tsx:232`, `:242`) drive the Top Pages
    and Entry Pages delta arrows off an arbitrary slice. A page missing from the
    compare fetch renders **nothing** — no prior line and no arrow — because
    both are gated on `hasPrior`
    (`components/report-sections/ga4/top-pages-chart.tsx:210`, applied at `:258`
    and `:260-264`). A delta that silently vanishes is harder to catch in QA
    than a number that reads wrong, since nothing on screen looks broken.
    **"Just add `orderBys`" is the wrong fix here.** #210's channel fix was
    ordering *plus* widening the compare `limit` 10→25 (see the comment at
    `ga4/index.tsx:153-160`); §4 of `docs/qa/ga4-channel-parity-code-review.md`
    puts it plainly — "before ordering, a given channel's absence was luck.
    After ordering, absence became a rule." These page compare fetches are
    *already* at `limit: 25`, the same as their main queries (`:169`, `:176`),
    over a high-cardinality dimension, so ordering them alone converts a latent
    bug into a guaranteed one. Keying the compare to the current period's page
    set needs either a second round-trip or a `dimensionFilter` inList
    (`GA4DimensionFilter` is supported, `lib/ga4/types.ts:38`) — and both
    compare fetches sit in the same `Promise.all` as the current-period query
    (`ga4/index.tsx:118`), so either route serialises two fetches that run in
    parallel today. That structural cost is the reason this was scoped out, not
    an oversight. Fix it together with the absent-vs-zero item below.
  - The main `pagePath` / `landingPage` / `eventName` queries (`limit: 25`) —
    but see the `eventName` exception below.
  - The two 90-day "perennially popular" lookbacks (`ga4/index.tsx:246-252`,
    `:254-260`, `limit: 10`, unordered), which become `stalePagePaths` /
    `staleEntryPaths` (`:443-445`) and are used by the Rising toggle to
    **exclude** rows (`top-pages-chart.tsx:80`, `:99`). An arbitrary 10 of every
    page seen in 90 days makes that exclusion set arbitrary for any site with
    more than 10 pages in 90 days — i.e. effectively every client.
  - `country` (`ga4/index.tsx:212-214`, `limit: 150`) last, since it only bites
    above 150 countries, which is rare.

  The other three **unordered** `limit`-bearing queries in that same
  `Promise.all` are already correctly bounded and need nothing: the two
  `dimensions: ['date']` trend queries (`:126-128`, `:134-136`, `limit: 90`) and
  `dayOfWeek, hour` (`:204-206`, `limit: 200` against 168 possible
  combinations). Of the 14 `limit`-bearing queries in that block, 3 are ordered
  (`:144`, `:160`, `:222`) and 11 unordered; 11 − 3 correctly bounded = the
  eight rankable ones above.

- [ ] **Top Pages / Entry Pages still conflate "absent from the compare fetch"
  with "observed zero"** — `components/report-sections/ga4/top-pages-chart.tsx:207`
  reads `compareMap[row.page] ?? 0` and `:210` gates on `prior > 0`, so a page
  that genuinely had zero prior sessions and a page that simply missed the
  compare fetch are indistinguishable — both render nothing. PR #210 fixed
  exactly this in the channel twin (`const hasPrior = row.name in compareMap`,
  absent renders `—`: `ga4/channel-tabs-chart.tsx:189`, `:228`); Top Pages and
  Entry Pages never got the port. This is the actual defect behind the delta
  arrows above, so fix it alongside the compare-fetch width — widening the fetch
  without fixing the render still shows nothing for a page whose prior really
  was zero.

- [ ] **`eventName` cannot take a sessions-desc order** — the events query
  requests `eventCount, eventCountPerUser, keyEvents` and no `sessions` metric
  (`components/report-sections/ga4/index.tsx:196-198`), yet it sits in the
  rankable list above while the item below proposes hoisting one shared
  `SESSIONS_DESC_ORDER`. Applied together those two produce an invalid GA4
  request. This query needs `eventCount` desc; the shared sessions constant does
  not fit it.

- [ ] **Sessions-desc `orderBys` literal duplicated three times** — the merged
  Overview section defines `SESSIONS_DESC_ORDER`
  (`components/report-sections/executive-overview/index.tsx:29`, used at `:68`,
  `:76`, `:77`); the ga4 section pastes the literal at each of its three call
  sites (`components/report-sections/ga4/index.tsx:145`, `:161`, `:223`). Left
  duplicated on purpose while PR #210 was stacked on #207 so the rebase stayed
  trivial; now that #207 has merged there is no reason not to hoist a single
  shared constant, with `lib/ga4/` the natural home — nothing there defines one
  today (`lib/ga4/order-by.test.ts` exists but tests `buildRunReportRequest` in
  `client.ts`, so it is not the home for it). Mind the `eventName` exception
  above when applying it.

## Known Follow-ups: staff dashboard sidebar (from PR #250 review)

- [ ] **The staff sidebar receives whole client rows.** `app/dashboard/layout.tsx:19` passes
  `getVisibleClients()` rows into the client component `components/layout/sidebar.tsx`, which reads
  only `name`, `slug`, `logoUrl`, `enabledReports` and `hiddenReports`. Props cross the
  server-to-client boundary whether they render or not, so every other field of each visible
  client is sent to the browser too. PR #250 fixed the portal's twin of this with a trimmed mapper;
  give the dashboard sidebar the same treatment (a mapper to exactly the fields it reads, and a test
  that fails if a full row is passed back). Staff-only today. Its own PR, off `dev`.

## Known Follow-ups: Organic Social (from the October set reviews, PRs #247, #254 and #256)

- [ ] **Overview's frozen Top Content key ignores the client's channel set** (Paul, #247).
  `lib/organic-social/frozen.ts:54` keys Overview's frozen Top Content as `'ALL'`, so once a client's
  channel allowlist changes (TikTok joining in #247, say), a window frozen earlier keeps serving the
  old channel mix and disagrees with the platform tabs, with nothing on screen looking wrong. Fold
  the sorted channel set into the key. `frozen.ts` is on Renaissance's path, so changing the key
  changes Renaissance's cache: its own PR, with a Renaissance proof. (Clients on locked months stop
  reading this table once lock every number ships on #256; every other client still does.)
- [ ] **A failed Organic Social graph is never logged** (Paul, #254). On a platform tab the graph
  parts wrap their getter in `safe()` (`components/report-sections/organic-social/parts/shared.tsx:3`),
  which renders "Couldn't load this section." and logs nothing. On Overview,
  `channelErrorPolicy` (`lib/organic-social/metrics.ts:58`) returns the degrade value and the
  channel's series silently drops out. Log both with the client, channel and view. It runs on
  Renaissance's Overview, and #247 edits `metrics.ts`: its own PR, off `dev`, once #247 is in.
- [ ] **Dash windows use a fixed 04:00 UTC offset all year** (from Paul's #256 review; spec edge 27).
  `isoRangeTz` and `resolveCompareIso` (`lib/organic-social/base.ts`) append a fixed `T04:00:00Z`,
  which is New York midnight only in daylight time. From November to March every Organic Social
  window starts and ends at 11 PM New York the evening before, so a post in a month's last hour
  counts toward the next month. It is on Renaissance's path (every tile and graph request), so
  fixing it changes Renaissance's numbers: its own PR, off `dev`, with a Renaissance proof. Locked
  months' "(in progress)" label follows the window as sent (#256), so it moves with the fix.

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
## Known Follow-ups: Organic Social locked months (from PR #256)

From the review of the lock every number build. None blocks the October set.

- [ ] **There is no way to undo a bad lock, and three paths lead to one.** Raised by Paul
  (PR #256, 2026-09-23) as the item to settle before the October clients' first real lock day. A
  locked month is served from storage forever, so any of these ends in a month a client sees that
  is permanently wrong:
  1. **A briefly empty Top Content answer.** An empty `data.content` array counts as complete
     (`lib/organic-social/locking-client.ts`, `completeContent`), so an empty panel locks.
  2. **A briefly empty but well-formed headline or graph answer.** All-null headline metrics and a
     graph whose `ALL_CHANNELS` is `{}` both count as complete, deliberately: that is also what a
     genuinely quiet month looks like (`lib/organic-social/headline-build.ts:48-51`, and
     `locking-client.test.ts:109` asserts the graph case). Treating either as incomplete would stop
     a quiet month ever locking, which is why the widening was declined. The cost of declining it
     is this row.
  3. **A malformed media answer captured on lock day.** The lock stores Dash's raw response before
     any builder parses it, and the media branch of `completeReportsData` accepts a media answer on
     the brand entry alone, so a malformed one is stored and PR #255's new throw then shows
     "Could not load" for that month for good. Only reachable once #255 and #256 are both on the
     deliverable branch.

  **The manual way out, as far as reading the code gets us.** Delete that client's rows for the
  month from `dash_response_locks` (`lib/db/schema.ts:421`: keyed by `client_id` + `request_key`,
  with `period_end` the column to filter the month on), then let the next render or the next lock
  sweep capture it again. Two things make that plausible rather than hopeful: `readLock`
  (`lib/organic-social/response-lock-store.ts`) is a plain database select with no persistent cache
  wrapper, so a deleted row is gone on the very next render; and the re-capture goes through the
  uncached capture client (`lib/organic-social/base.ts`), so the replacement numbers come from Dash
  now rather than from whatever Next's data cache still holds.

  **Unverified, and it is Paul's open question:** none of that has been executed end to end against
  a real deployment, so it is not known whether anything else in front of the page keeps serving
  the old numbers after the rows are gone. Confirm that on staging before relying on it, and only
  then decide whether a tool is needed or the SQL is enough.

- [ ] **Changing any getter's request shape orphans every lock already stored under the old key.**
  `requestKey` hashes the literal request (`lib/organic-social/lock-day.ts:83`), so a new date
  format, an added KPI or a different `limit` produces new keys, every existing lock for those
  months becomes unreachable, and the months silently recapture from live Dash. The only runtime
  signal is a `late lock` warning. **The edge-27 fix (raised by Paul on PR #250, now merged) does
  exactly this**, and so does adding a KPI to a tab. `lib/organic-social/lock-key-pin.test.ts`
  pins the five keys a scoped Instagram month produces, so a shape change now fails CI instead of
  passing silently. When it does fail, the decision is deliberate: recapture is fine for a month
  no client has seen, otherwise map the old keys forward first. Update the pinned hashes only
  after making that call.

- [ ] **On Overview, a lock store outage silently drops a platform instead of showing an error
  card.** The locking client throws (`lib/organic-social/locking-client.ts`), which is right, but
  Overview's per-channel policy swallows it: `channelErrorPolicy` (`lib/organic-social/metrics.ts:58`)
  returns the degrade value, and the graph getters drop the channel's series. So a locked month's
  Overview can render with a platform missing and no error on screen. The throw is now logged
  (`lock store read failed ...`), which is the signal until this is fixed. It needs a lock-specific
  error the getters rethrow, and those getters are on Renaissance's path: its own PR, with a
  Renaissance proof. The three October clients hide Overview, so they are not exposed today.
- [ ] **`settledThrough` ignores `firstMonth`**, so a custom range that ends before a client's first
  reporting month is lockable and writes a row nothing will ever read
  (`lib/organic-social/lock-day.ts:31`). Stray rows only: no number is wrong, and the lock sweep
  already filters by `firstMonth`. Clamp it, and change its unreachable final `return lastOf(key)`
  to `null` in the same pass (a lock day is at most the 28th, so the month before last has always
  locked). The plan's own test asserts today's behaviour, so changing it is a deliberate decision,
  not a silent fix.
- [ ] **The lock sweep runs on every hourly warmer run, not only on lock days**
  (`app/api/cache-warm/route.ts:133`). It adds two months times the client's tabs of full report
  renders per opted-in client to every run. Cheap once a month is captured (every read is a lock
  hit), but worth a ceiling before the opted-in client count grows.
- [ ] **The cache-warm `ok` count cannot show whether a month was captured.** A report page
  returns 200 even when one part of it errored, so the count the cron reports says nothing about
  whether the lock sweep actually stored anything (`app/api/lock-sweep/route.ts`, which reports
  through the shared runner in `lib/cache-warm/run.ts`). Raised by Paul on PR #256 alongside the
  scheduling fix, and not addressed by it: the capture-failure log
  (`lock capture failed ...`, added in the same PR) is the signal until this is fixed.

- [ ] **A transiently empty Top Content answer locks an empty panel** (`locking-client.ts:31`, an
  empty `data.content` array counts as complete). This matches the old freeze table's deliberate
  frozen-empty behaviour, without that path's re-freeze escape. Revisit with the unlock tool.
