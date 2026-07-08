# Avenue Z Reporting Platform

White-labeled, multi-client marketing reporting platform. Avenue Z team members
get a full internal dashboard across all clients; clients log in to a scoped
portal showing only their own data.

It's primarily a presentation and routing layer over **multiple marketing data
sources**: GA4, Google Search Console, HubSpot, Peec AI, and Profound AI via
their native APIs, plus the **Supermetrics Data API** for the paid/social ad
channels (Paid Search, Meta, LinkedIn).

> **New here? Read in this order:** [`ENGINEERS.md`](./ENGINEERS.md)
> (Reports-product onboarding) then [`CLAUDE.md`](./CLAUDE.md) (platform
> architecture). This README is the quick start; the full map is below.

## Documentation Map

This repo hosts **two products** over one shared spine. The docs below are
**current** — read these and ignore anything not listed as current.

| Doc | Covers | Status |
|---|---|---|
| `README.md` (this file) | Quick start + orientation | ✅ current |
| `ENGINEERS.md` | **Reports** product: auth, data clients, report-section build status, env vars, conventions | ✅ current |
| `CLAUDE.md` | Platform architecture / shared spine + Supermetrics reference | ✅ current |
| `lib/dashboard/ENGINEERS.md` | **Configurable dashboard** product: blocks → bindings → resolvers → adapters, caching, sharing | ✅ current |
| `lib/dashboard/CLAUDE.md` · `components/dashboard/CLAUDE.md` | Terse working rules for the dashboard engine + its UI | ✅ current |
| `TODO.md` | Standing task list | ✅ current |
| `Guides/brand.md` · `Guides/prplacements.md` | Topic guides (brand tokens, PR placements) | ✅ current |
| `Guides/gleansdk.md` | Glean meeting-prep feature guide — SDK usage is current; **ignore its "Existing Platform Context"** (stale Next 15 / `clients.config.ts`) | 🟡 mostly current |
| `docs/superpowers/{plans,specs}/**` | **Dated, point-in-time** design/plan docs for specific past PRs. Useful history, but **not** current architecture — where they differ, trust `CLAUDE.md` / `ENGINEERS.md` | 🟡 historical context |
| `Guides/claude.md` · `Guides/progress.md` | **ARCHIVED** — describe a superseded architecture (flat `clients.config.ts`, `middleware.ts`, Next 15, demo data). **Do not follow.** | ⛔ historical |

**The two products, one line each:**

- **Reports** (client-facing) — per-client report sections in `components/report-sections/`, shown to staff at `/dashboard` and to clients at `/portal/[clientSlug]`, gated by the client's `enabledReports`.
- **Configurable dashboard** (internal) — a JSON-configured, drag-and-arrange block grid stored in `clients.dashboard_config`, authored in the browser with no deploy.

Both share **Neon Postgres + Drizzle** (`lib/db/`), **Auth.js v5** (`auth.ts` + `proxy.ts`), and the per-client `clients` row.

## Tech Stack

- **Next.js 16** (App Router, React Server Components) · **React 19**
- **TypeScript** (strict mode)
- **Auth.js v5** (Google + Credentials providers)
- **Neon Postgres + Drizzle ORM** (clients & users)
- **Tailwind CSS v4** + **shadcn/ui** + **Tremor**, charts on **Recharts**
- **Vercel** (deployment)

## Getting Started

```bash
npm install

# Copy the env template and fill in values (secrets from the team or Vercel):
cp .env.example .env.local

# Set up the database (DATABASE_URL_UNPOOLED → dev Neon project)
npm run db:migrate     # apply Drizzle migrations
npm run db:seed        # seed the avenue-z + renaissance clients and users

npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with Google
(`@avenuez.com`) or a seeded client credential.

### Environment Variables

`.env.example` in the repo root is the complete, annotated list — copy it with
`cp .env.example .env.local`. A subset is shown below; see [`ENGINEERS.md`](./ENGINEERS.md)
for per-integration notes and Vercel scoping.

```env
# Auth.js
AUTH_SECRET=                          # openssl rand -base64 32
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
AUTH_TRUST_HOST=true

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
APP_URL=http://localhost:3000

# Database (Neon Postgres)
DATABASE_URL=                         # pooled (app runtime)
DATABASE_URL_UNPOOLED=                # direct (drizzle-kit migrations)

# Data sources (examples — see ENGINEERS.md for the rest)
GOOGLE_SERVICE_ACCOUNT_KEY=           # shared SA for GA4 + GSC
HUBSPOT_ACCESS_TOKEN_AVENUE_Z=        # per-client HubSpot token
PEEC_AI_CUSTOMER_TOKEN=
PROFOUND_AI_ACCESS_TOKEN=
# Supermetrics: per-client key, env-var name stored in clients.sm_api_key_env_var
```

## Architecture

### Two Audiences

- **Internal (Avenue Z team)** — `/dashboard` — full access to all clients and reports
- **Clients** — `/portal/[clientSlug]` — scoped view of their own data only

### Clients & Users (database)

Clients and users live in a **Neon Postgres** database accessed via Drizzle
(`lib/db/`). Schema and inferred types are in `lib/db/schema.ts`; read helpers
(`getClientBySlug`, `getClientByEmail`, `getAllClients`) are in
`lib/db/queries.ts`. To onboard a client, insert rows into the `clients` and
`users` tables (Drizzle Studio, Neon SQL editor, or `scripts/seed.ts`). No code
deploy required for routine data entry.

### Roles

| Role | Access |
|------|--------|
| `INTERNAL_ADMIN` | All clients, all reports, admin actions |
| `INTERNAL_ANALYST` | All clients, all reports; read-only on Reports + admin actions (but **may edit configurable dashboards**) |
| `CLIENT_ADMIN` | Own client: auth hub + enabled reports |
| `CLIENT_VIEWER` | Own client: enabled reports (read-only) |

Role is derived at sign-in from a DB lookup and baked into the JWT.

### Report Sections

Each section is a self-contained React Server Component in
`components/report-sections/[slug]/`, gated by the client's `enabledReports`.
Built sections include GA4, Google Search Console, HubSpot (performance +
inbound funnel), Peec AI, Profound AI, demand overview, PR placements, FFCI,
Paid Search, Meta Ads, LinkedIn Ads, organic social, and AI summaries. Several
other ad-channel sections (email marketing, TikTok, Snapchat, Reddit, Bing,
etc.) are placeholder scaffolds. See [`ENGINEERS.md`](./ENGINEERS.md) for the
full build-status table.

### Key Directories

```
app/
  login/                     # Auth.js sign-in
  dashboard/                 # Internal Avenue Z view
    [clientSlug]/reports/    # Tabbed report page
  portal/                    # Client-facing view
    [clientSlug]/reports/    # Tabbed report page
  tools/                     # Internal tools area
  api/                       # Auth.js + data proxies + health/perf

components/report-sections/  # One component per report section
components/layout/           # Sidebar, header, logo
lib/db/                      # Drizzle schema, client, queries
lib/{ga4,gsc,hubspot,peec,profound}/   # Native data-source clients
lib/{paid-search,meta,linkedin}/       # Supermetrics-backed ad clients
lib/supermetrics/            # smQuery() Data API helper
auth.ts                      # Auth.js v5 config
proxy.ts                     # Next.js 16 route protection
```

## Development

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run lint         # ESLint
npm run db:studio    # Drizzle Studio
```

## Deployment

Deploy to Vercel. Set all environment variables in the Vercel project settings
(separate Production and Preview scopes for `DATABASE_URL*`). `.env.local` is
gitignored.
