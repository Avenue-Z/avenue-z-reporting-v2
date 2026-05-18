# Avenue Z Reporting Platform — Developer Progress Report

> Last updated: 2026-03-04

---

## Current Status: Tabbed Report UI Complete (Demo Data)

All 13 report sections are built with demo data and display one at a time in a tabbed view. The sidebar is context-aware — main view lists clients, client view lists report section tabs. Connections/Auth Hub is separated from the report flow. No live Supermetrics data is wired yet.

---

## What's Done

### Infrastructure

| Item | Status | Notes |
|---|---|---|
| Next.js 15 (App Router) | Done | Turbopack enabled, TypeScript strict |
| Tailwind CSS v4 | Done | Full brand token system in `globals.css` |
| shadcn/ui | Done | `components.json` configured, CSS variables overridden to brand |
| Tremor | Done | Installed with `--legacy-peer-deps` (React 19 peer conflict) |
| Auth.js v5 | Done | Config in `/auth.ts`, Google + Credentials providers |
| Middleware | Done | Route protection in `/middleware.ts` — internal vs client scoping |
| Environment template | Done | `.env.local` with all required vars stubbed |

### Brand System (`app/globals.css`)

| Item | Status |
|---|---|
| Dark theme (default) — `#000000` base | Done |
| Light theme (optional) — `data-theme="light"` | Done |
| shadcn/ui CSS variable overrides | Done |
| Nunito Sans (Google Fonts, 5 weights) | Done |
| 5 accent colors as Tailwind tokens | Done |
| 3 branded gradients (full, revenue, reputation) | Done |
| Gradient text utility classes | Done |
| Gradient divider lines | Done |
| Background glow effect | Done |
| KPI card top-border accent | Done |
| Chart color mapping (`lib/constants.ts`) | Done |

### Lib / Config

| File | Purpose | Status |
|---|---|---|
| `lib/clients.config.ts` | Flat client registry — the only "database" | Done |
| `lib/constants.ts` | `CHART_COLORS` (13 channels + pos/neg/neutral), `REPORT_NAMES` (13 reports) | Done |
| `lib/utils.ts` | `cn()` helper (clsx + tailwind-merge) | Done |
| `lib/supermetrics/constants.ts` | `DS_IDS` (12 platforms), `DS_NAMES`, `SM_BASE_URL` | Done |
| `lib/supermetrics/types.ts` | Typed interfaces for all SM responses | Done |
| `lib/supermetrics/client.ts` | `smQuery()` — server-side data fetch | Done |
| `lib/supermetrics/auth.ts` | `createLoginLink()`, `getConnectionStatus()` | Done |
| `types/next-auth.d.ts` | Session type augmentation (role, clientSlug) | Done |

### Chart Components (`components/charts/`)

| Component | File | Description |
|---|---|---|
| KPI Card | `kpi-card.tsx` | Branded card with gradient top accent, delta indicator |
| Area Chart | `area-chart.tsx` | Recharts area chart with gradient fills, brand tooltip |
| Bar Chart | `bar-chart.tsx` | Recharts bar chart with brand styling |
| Donut Chart | `donut-chart.tsx` | Recharts pie/donut chart with brand tooltip |
| Data Table | `data-table.tsx` | Branded table with uppercase tracking-widest headers |

### Report Sections (`components/report-sections/`)

All 13 sections are self-contained async RSCs with demo data. Each includes KPI cards, charts, and data tables.

| Section | Slug | KPIs | Charts | Table |
|---|---|---|---|---|
| Executive Summary | `exec-summary` | 8 | Sessions/conversions area | — |
| Web Analytics | `ga4` | 8 | Area + bar (channels) + donut (devices) | Top pages |
| Meta Ads | `meta-ads` | 11 | Spend/conv bar + CTR area | Campaigns |
| Google Ads | `google-ads` | 8 | Clicks/conversions area | Campaigns |
| Email Marketing | `email-marketing` | 6 | Sends vs opens bar + open rate area | Campaigns |
| Blended Performance | `blended-performance` | 4 | Spend by channel area + donut | Attribution |
| LinkedIn Ads | `linkedin-ads` | 8 | Impressions bar + clicks area | Campaigns |
| Snapchat Ads | `snapchat-ads` | 8 | Spend bar + swipe ups area | Campaigns |
| TikTok Ads | `tiktok-ads` | 10 | Spend bar + conversions area | Campaigns |
| Shopify Performance | `shopify-performance` | 8 | Revenue/orders area + traffic donut | Top products |
| HubSpot Performance | `hubspot-performance` | 8 | Pipeline funnel area + lead sources donut | Recent deals |
| Reddit Ads | `reddit-ads` | 8 | Spend bar + conversions area | Campaigns |
| Microsoft Ads | `bing-ads` | 8 | Clicks/conversions area | Campaigns |

Supporting components:
- `error-boundary.tsx` — React class component wrapping each section
- `empty-state.tsx` — "Platform not connected" prompt with CTA to Auth Hub

### Auth Hub Components (`components/auth-hub/`)

| Component | File | Status |
|---|---|---|
| Platform Card | `platform-card.tsx` | Done — status badge (Connected/Expired/Not Connected) |
| Connect Button | `connect-button.tsx` | Done — calls `generateLoginLink` server action |

### Layout & Navigation

| Component | Path | Status |
|---|---|---|
| Sidebar | `components/layout/sidebar.tsx` | Done — two modes: **Main** (All Clients + Connections + client list) and **Client** (back link, client name, report section tabs via `?section=` param) |
| Header | `components/layout/header.tsx` | Done — two-line heading pattern |
| Date Range Picker | `components/layout/date-range-picker.tsx` | Done — 8 presets, persisted via URL search params |
| Dashboard Layout | `app/dashboard/layout.tsx` | Done — flex layout, sidebar fixed with Suspense boundary, main scrolls |

**Navigation flow:**
1. `/dashboard` — All Clients grid. Sidebar shows client list + Connections link.
2. Click a client → `/dashboard/[slug]/reports` — Sidebar switches to client mode with report section tabs.
3. Click a section tab in sidebar → `?section=ga4` etc. — Single section renders in main area. Header updates to show section name.
4. Connections (Auth Hub) is a top-level admin item in the main sidebar, separate from the report flow.

### Routes

| Route | Type | Status | Notes |
|---|---|---|---|
| `/` | Static | Done | Brand landing page with gradient CTA |
| `/login` | Static | Done | Google + email/password form |
| `/unauthorized` | Static | Done | Access denied page |
| `/dashboard` | Static | Done | Client card grid — links to full reports |
| `/dashboard/[clientSlug]` | Dynamic | Done | Client overview |
| `/dashboard/[clientSlug]/auth` | Dynamic | Done | Auth Hub — platform grid |
| `/dashboard/[clientSlug]/reports` | Dynamic | Done | **Tabbed report — one section at a time via `?section=` param** |
| `/dashboard/[clientSlug]/reports/[reportSlug]` | Dynamic | Done | Direct link to individual report section |
| `/portal/[clientSlug]` | Dynamic | Done | Client portal home |
| `/portal/[clientSlug]/auth` | Dynamic | Done | Client self-service platform connection |
| `/portal/[clientSlug]/reports` | Dynamic | Done | **Tabbed report — portal version with pill tab bar** |
| `/portal/[clientSlug]/reports/[reportSlug]` | Dynamic | Done | Client report viewer |
| `/api/auth/[...nextauth]` | API | Done | Auth.js route handler |
| `/api/auth/supermetrics-callback` | API | Done | Post-OAuth redirect (stub) |

### Server Actions (`app/actions/`)

| Action | File | Status |
|---|---|---|
| `signInWithGoogle` | `auth.ts` | Done |
| `signInWithCredentials` | `auth.ts` | Done |
| `signOutAction` | `auth.ts` | Done |
| `generateLoginLink` | `supermetrics.ts` | Done |

---

## What's NOT Done Yet

### Priority 1 — Live Data Integration

- [ ] **Wire Supermetrics API keys** — add real keys to `.env.local`, test data fetching
- [ ] **Replace demo data in each report section** — call `smQuery()` with real `ds_id` + fields
- [ ] **Auth Hub connect flow** — call `createLoginLink()`, handle OAuth callback, update connection status
- [ ] **Connection status display** — real badges from `getConnectionStatus()`
- [ ] **Wire login form to Auth.js actions** — Google sign-in and credentials

### Priority 2 — Polish & UX

- [ ] **PDF / CSV export** — per report or full report
- [ ] **"Data as of" timestamp** — from Supermetrics query metadata
- [ ] **Skeleton loaders** — per-section loading states (basic skeleton already exists)
- [ ] **Date comparison** — MoM / previous period delta calculations from real data
- [ ] **Connections page** — `/dashboard/connections` top-level page (sidebar link exists, page not yet built)

### Priority 3 — Future / Roadmap

- [ ] Scheduled PDF email delivery
- [ ] AI-generated narrative summaries (Claude API)
- [ ] White-label domain per client
- [ ] Client annotations on charts
- [ ] Custom report builder (drag-and-drop)
- [ ] SEO section (Google Search Console)
- [ ] Automated workspace provisioning via SM Management API

---

## Known Issues / Gotchas

1. **Tremor + React 19** — Tremor's peer dep requires React 18. `.npmrc` has `legacy-peer-deps=true`. Works at runtime but watch for edge cases.

2. **Next.js 16 middleware deprecation** — Build warns: `The "middleware" file convention is deprecated. Please use "proxy" instead.` Not blocking; middleware still works.

3. **Middleware currently bypassed** — Auth redirect is temporarily disabled for UI preview. Must re-enable before deploy.

4. **Supermetrics API keys** — `.env.local` has placeholder values. Real keys needed before any data fetching works.

5. **All report data is demo/random** — Every report section generates random data on each render. Will be replaced with real Supermetrics queries.

---

## How to Run

```bash
# Install
npm install

# Dev server
npm run dev

# Build
npm run build

# Start production
npm start
```

Dev server runs at `http://localhost:3000`.

Key URLs for preview:
- `/dashboard` — All clients list
- `/dashboard/fun-spot/reports` — Report (defaults to Executive Summary)
- `/dashboard/fun-spot/reports?section=meta-ads` — Meta Ads tab
- `/dashboard/fun-spot/reports?section=tiktok-ads` — TikTok Ads tab
- `/dashboard/fun-spot/auth` — Auth Hub

---

## File Tree (key files only)

```
├── auth.ts                          # Auth.js v5 config
├── middleware.ts                     # Route protection (currently bypassed)
├── .env.local                       # Environment variables (not committed)
├── .npmrc                           # legacy-peer-deps=true
│
├── app/
│   ├── globals.css                  # Full brand design system
│   ├── layout.tsx                   # Root layout
│   ├── page.tsx                     # Landing page
│   ├── login/page.tsx
│   ├── unauthorized/page.tsx
│   ├── actions/
│   │   ├── auth.ts                  # signIn/signOut server actions
│   │   └── supermetrics.ts          # generateLoginLink server action
│   ├── dashboard/
│   │   ├── layout.tsx               # Flex layout — sidebar (Suspense) + scrollable main
│   │   ├── page.tsx                 # Client list → links to reports
│   │   └── [clientSlug]/
│   │       ├── page.tsx             # Client overview
│   │       ├── auth/page.tsx        # Auth Hub
│   │       └── reports/
│   │           ├── page.tsx         # Tabbed report (?section= param)
│   │           └── [reportSlug]/
│   │               ├── page.tsx     # Individual report (direct link)
│   │               └── report-date-range.tsx
│   ├── portal/
│   │   └── [clientSlug]/
│   │       ├── page.tsx             # Client portal home
│   │       ├── auth/page.tsx        # Client auth
│   │       └── reports/
│   │           ├── page.tsx         # Tabbed report (portal)
│   │           ├── report-nav.tsx   # Pill tab bar for portal
│   │           └── [reportSlug]/
│   │               ├── page.tsx     # Individual report
│   │               └── report-date-range.tsx
│   └── api/
│       └── auth/
│           ├── [...nextauth]/route.ts
│           └── supermetrics-callback/route.ts
│
├── components/
│   ├── layout/
│   │   ├── sidebar.tsx              # Context-aware sidebar (main + client/tabbed views)
│   │   ├── header.tsx               # Two-line heading
│   │   └── date-range-picker.tsx    # Date range dropdown
│   ├── charts/
│   │   ├── kpi-card.tsx             # Branded KPI card with gradient accent
│   │   ├── area-chart.tsx           # Recharts area chart
│   │   ├── bar-chart.tsx            # Recharts bar chart
│   │   ├── donut-chart.tsx          # Recharts donut/pie chart
│   │   └── data-table.tsx           # Branded data table
│   ├── report-sections/
│   │   ├── error-boundary.tsx       # React error boundary
│   │   ├── empty-state.tsx          # "Not connected" prompt
│   │   ├── exec-summary/index.tsx
│   │   ├── ga4/index.tsx
│   │   ├── meta-ads/index.tsx
│   │   ├── google-ads/index.tsx
│   │   ├── email-marketing/index.tsx
│   │   ├── blended-performance/index.tsx
│   │   ├── linkedin-ads/index.tsx
│   │   ├── snapchat-ads/index.tsx
│   │   ├── tiktok-ads/index.tsx
│   │   ├── shopify-performance/index.tsx
│   │   ├── hubspot-performance/index.tsx
│   │   ├── reddit-ads/index.tsx
│   │   └── bing-ads/index.tsx
│   ├── auth-hub/
│   │   ├── platform-card.tsx        # Platform status card
│   │   └── connect-button.tsx       # OAuth connect button
│   └── ui/                          # shadcn components
│
├── lib/
│   ├── clients.config.ts            # Client registry (Fun Spot, 13 reports)
│   ├── constants.ts                 # CHART_COLORS, REPORT_NAMES
│   ├── utils.ts                     # cn() helper
│   └── supermetrics/
│       ├── client.ts                # smQuery()
│       ├── auth.ts                  # createLoginLink(), getConnectionStatus()
│       ├── constants.ts             # DS_IDS (12 platforms), DS_NAMES
│       └── types.ts                 # Typed interfaces
│
├── types/
│   └── next-auth.d.ts               # Session type augmentation
│
└── Guides/
    ├── brand.md                     # Brand guidelines
    ├── claude.md                    # Architecture spec
    └── progress.md                  # This file
```
