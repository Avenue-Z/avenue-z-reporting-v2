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
15s hang guard (`REQUEST_TIMEOUT_MS`, via `AbortController`) and retries HTTP
429 honoring `Retry-After`. Rows are keyed by canonical `field_id` (from
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
- **§5 Blast radius:** REQUIRED, never omit. Which clients this actually reaches
  and by what mechanism, whether any client needs telling before a changed
  number ships, and if the change is per-client, why that is correct. See
  **Blast Radius Check** below for why this is its own section: a ticket named
  after one client is not evidence the fix is scoped to that client.
- **§6 Follow-ups:** the fixes, tracked separately (not applied in the review
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

0. **Run the Blast Radius Check** (own section below). Which clients does this
   reach, and does a changed number need flagging before it ships? Required in
   every review, at every stage.

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

## Blast Radius Check (required in EVERY code review, every stage)

**Almost nothing in this repo is per-client. Assume a change ships to every client
until you have proven otherwise, and say so explicitly in the review.**

This is easy to get wrong because tickets arrive named after one client ("Renaissance
Focus", "Bristol is seeing…"), which reads as if the fix is scoped to that client. It
almost never is. A change reviewed as if it were one-client, then shipped to all, is how
a client sees numbers move without warning.

### Why: the platform is shared by construction

| Surface | Shared or per-client | Proof |
|---|---|---|
| Section templates | **Global.** One row per section for the whole platform | `section_slug` is the PRIMARY KEY of `section_templates` (`lib/db/schema.ts`). No client column exists, so per-client templates are not representable. |
| Template lookup | **Global** | `getSectionTemplate(section)` takes no client argument (`lib/db/queries.ts`). |
| Template fallback | **Global** | `const template = dbTemplate ?? PEEC_TEMPLATE`, a single constant. |
| Bespoke parts | Escape hatch exists, **currently unused** | `BESPOKE_PARTS` is `{}` (`parts/bespoke/registry.ts`). |
| Per-client overrides | Real, but **layout only** | `clients.report_section_config` controls order, hidden, labels, thresholds, extraParts. It has **no lever for business or matching logic**. |
| `lib/**` helpers | **Global, and below the template layer entirely** | Not parts, not template entries, not overridable. |

The trap: a defect in `lib/**` is invisible to the override system. You cannot fix it for
one client, and you cannot get it right for one client and wrong for another. It lands
everywhere at once.

Genuinely per-client surfaces are narrow: DB columns on the `clients` row (`pr_proof_sheet_id`,
`pr_proof_column_map`, `ga4_property_id`, `gsc_site_url`, the `*_config` jsonb columns,
`enabled_reports`), and `report_section_config` for layout. If your change is not in one
of those, it is global.

### What every review must state

Answer these in the review comment. Not implied, written down:

1. **Which clients does this actually reach?** Name the mechanism (shared `lib/`,
   global template, per-client column), do not assert it from the ticket title.
2. **If it changes a number a client already saw, does anyone need telling before it
   ships?** A metric that silently drops is a client-trust problem, not just a diff.
3. **If it is genuinely per-client, why is that correct?** Truth and correctness
   requirements should never be per-client configurable. Styling and layout can be.

Worked example: `docs/official-feedback/tina-2026-07-20-pr-changes.md` §8. Ticket was
filed as "Renaissance Focus"; the defect was in `lib/pr-proof/matchback.ts` and affected
every client with a PR Proof sheet.

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