# Renaissance Overview — design

**Asana:** Frankenstein the Executive Overview PDF mockup from pieces of the Ave Z dashboard and configure for the Ren dashboard

**Branch:** `Executive-Overview-Duplicate-Ren` off `dev` · **PR:** #207 (draft → dev)
**Wireframe:** `Executive Dashboard Demo.pdf` (demo data, "Prepared for Renaissance Benefits", Period: Last 30 days)

---

## 1. What this is

Renaissance has no overview page. Avenue Z has the pieces for one, spread across four separate report sections. This assembles those pieces into a single new page on the Renaissance side, laid out per the wireframe.

It is assembly, not construction. Every block already exists and runs on Avenue Z today. Nothing new is invented.

**The hard constraint, stated up front:** Avenue Z's rendered pages must be byte-identical after this ships. Every design decision below is subordinate to that.

---

## 2. Scope

**In:**
- A new report page for Renaissance containing the four wireframe blocks in wireframe order.
- Blocks fed by GA4 and Peec render live Renaissance data.
- Blocks fed by a CRM render an explicit "needs connection" state.

**Out:**
- Any change to Avenue Z's report components or their data.
- Any CRM integration work. Renaissance uses Salesforce; no Salesforce code exists in this repo and none is written here.
- Fixing the pre-existing bugs found during investigation. They are recorded in §10 as follow-ups, not addressed here.

---

## 3. The four blocks and where each comes from

Verified twice by independent adversarial passes.

| # | Wireframe block | Vendor | Renaissance | Treatment |
|---|---|---|---|---|
| 1 | Demand Journey (4 cards) | Peec, GA4, CRM ×2 | partial | 2 cards live, 2 needs-connection |
| 2 | Web Analytics (8 KPIs + 3 charts) | GA4 only | live | full data |
| 3 | Contact Creation | CRM only | none | needs-connection |
| 4 | Pipeline Performance | CRM only | none | needs-connection |

Renaissance's live config, read from the dev database: `ga4_property_id` set, `peec_customer_project_id` set, `peec_your_brand` = "Renaissance", `hubspot_token_env_var` NULL.

### Block 1 — Demand Journey

| Card | Source | Derivation |
|---|---|---|
| AEO / AI Visibility | Peec `getPeecOverview` | `(visibility_count / visibility_total) × 100` for the latest ISO week |
| ↳ share of voice | Peec `brandRankings` | mean of per-row `share_of_voice` for the client's own brand |
| Web Analytics / Site Sessions | GA4 `ga4Query` | raw `sessions`; sub-metric is GA4-native `sessionConversionRate` |
| Inbound Funnel / Online Contacts | CRM | needs-connection |
| Pipeline / Open Pipeline | CRM | needs-connection |

`DemandJourney` lays out cards with `flex-1`, so a 2-card live row plus 2 needs-connection cards renders cleanly.

### Block 2 — Web Analytics

All eight KPIs come from a single dimensionless `runReport`. Every rate is a GA4-native metric requested by name and formatted locally. We compute no rates ourselves; only deltas.

`sessions` · `activeUsers` · `newUsers` · `bounceRate` · `averageSessionDuration` · `screenPageViewsPerSession` · `conversions` · `sessionConversionRate`

Three charts: Sessions & Users Over Time (dimension `date`), New vs Returning (`newVsReturning`), Traffic by Channel (`sessionDefaultChannelGroup`, limit 10).

### Blocks 3 and 4

Both are CRM-only. Both render needs-connection. No CRM client is called, no CRM component is imported.

---

## 4. Architecture

### 4.1 New slug, not a variant

Slug `executive-overview`, display label **"Overview"** for consistency with Avenue Z's naming.

New folder `components/report-sections/executive-overview/` with a single orchestrator. Avenue Z's `demand-overview/index.tsx` is never opened.

The alternative considered was reusing the `demand-overview` slug with a `clientSlug === 'renaissance'` conditional in the dispatchers. Rejected: that conditional sits inside the branch Avenue Z executes on every render of the page they land on by default, and the branch would need duplicating across all four dispatchers, which the repo has already drifted on once (noted in the header comment at `app/portal/[clientSlug]/reports/page.tsx:62-67`).

### 4.2 Leaf components are imported, never copied or edited

These are pure, data-passed, free of context and providers, free of client-specific values, and free of import-time side effects. Importing them changes nothing about them.

| Component | Path |
|---|---|
| `DemandJourney` | `components/report-sections/demand-overview/demand-journey.tsx` |
| `KpiCard` | `components/charts/kpi-card.tsx` |
| `SessionsTrendChart` | `components/report-sections/ga4/sessions-trend-chart.tsx` |
| `NewReturning` | `components/report-sections/ga4/new-returning.tsx` |
| `ChannelTabsChart` | `components/report-sections/ga4/channel-tabs-chart.tsx` |

Cross-section imports are established precedent (`linkedin-ads/index.tsx:4` imports from `paid-search`; `profound-ai` imports from `peec-ai`).

Two components are deliberately **not** imported: `LeadSourceChart` hardcodes Avenue Z's HubSpot portal id in every deal link, and `WeeklyPerformance` requires a live HubSpot connection to produce its prop. Both belong to needs-connection blocks, so neither is needed. This also avoids the process-wide HubSpot rate limiter, which is a singleton shared with Avenue Z's live sections.

### 4.3 The orchestrator is new code

`components/report-sections/executive-overview/index.tsx`, an async RSC taking `{ clientSlug, dateRange, compareRange }`.

It fetches GA4 and Peec, reshapes into the props the leaf components expect, and renders the four blocks. Two things it does differently from Avenue Z's version, by writing them correctly rather than by fixing theirs:

- **Brand lookup** reads `BrandRanking.isYou`, computed from `clients.peec_your_brand`, instead of matching the literal string "avenue z". Without this, share of voice blanks for every client but Avenue Z.
- **Header** renders `client.name`, not a hardcoded literal.

### 4.4 GA4 reshaping is duplicated, deliberately

Roughly 226 lines of logic turning raw GA4 rows into chart props live inline in `components/report-sections/ga4/index.tsx`, not in `lib/`. Line ranges: KPI cards `:261-314` (+ `KPI_METRICS :78-87`), trend `:316-334`, channels `:336-403`, audience `:464-501`, shared formatters `:33-76`.

Extracting them to `lib/ga4/` would be cleaner and would leave one copy. It would also edit Avenue Z's file. **We duplicate.** Two copies that can diverge is the accepted cost of the zero-blast-radius constraint.

Two details when copying: `returningUserCount` is computed inline in JSX at `:564` and must be extracted to a variable; and `channelConvData` depends on `channelColorMap` which depends on `channelData`, so `:336-403` must be copied as one block or the two tabs' colors desynchronize.

### 4.5 Needs-connection state

A new local component renders a block-level card explaining that the source is not connected. It never renders zeros, dashes, or an error. Zeros are the failure mode we are specifically avoiding: wrong or absent CRM identifiers produce plausible-looking `$0` figures with no error anywhere.

### 4.6 Failure handling

Data fetching uses `Promise.allSettled`, following `demand-overview/index.tsx:73`. Not `Promise.all`, which `ga4/index.tsx:117` uses and which kills the entire section on any single query rejection.

Each block gets its own error boundary, following the per-block pattern at `components/dashboard/block-grid.tsx:123-125` rather than the single page-level boundary used by the report routes. A page aggregating three vendors has independent failure domains and one dead vendor must not blank the page.

---

## 5. Blast radius

### 5.1 Why Avenue Z's pages are unaffected

Avenue Z's `enabled_reports` will not contain `executive-overview`. Every registration below is additive and filters out for them:

- Sidebar filters `group.slugs` against the client's `enabledReports` and returns null for an empty group.
- Landing cards filter `NAV_SLUG_ORDER` the same way.
- `defaultSection` is `NAV_SLUG_ORDER.find(s => enabledReports.includes(s))`. The predicate is false for a slug the client lacks, so insertion position cannot change which element is found. Avenue Z's default stays `demand-overview`.
- Both MPA dispatchers `notFound()` on a slug absent from `enabledReports`.

Their components are imported, never edited. No `Record<ReportSlug, …>` exists anywhere, so extending the union breaks no mapped type. No test enumerates the slug list.

### 5.2 NAV_GROUPS insertion

Append to the existing `Reports` group, or append a new group after `Tools`. **Not index 0** — that position would change Renaissance's own default landing section, and prepending a new group object shifts the React keys of every existing group.

### 5.3 The one shared change: cron concurrency

Both `app/api/health/sweep/route.ts` and `app/api/cache-warm/route.ts` fan out over every client × every enabled report × 2 surfaces, bounded by `CONCURRENCY = 8` under a 60s `maxDuration`. Enabling one slug for one client adds exactly 2 units to each.

The repo's own review records the sizing basis as roughly 40 units ≈ 50s against that 60s ceiling, and flags validation against production metrics as open (`docs/qa/cron-fanout-concurrency-code-review.md:63-66`, `:154-157`). Two more units crosses into another wave, about +20% wall time.

If either function is killed at 60s the consequences reach Avenue Z: the health sweep never writes state or posts transitions, so monitoring stops silently for every client; and cache-warm drops URLs off the end in `getAllClients()` order, which can leave Avenue Z pages cold and measurably slower.

**Decision: raise `CONCURRENCY` from 8 to 10 in both routes, in this PR.** Two one-line constant changes. They touch no rendering code and no client data, so Avenue Z's pages remain byte-identical, but this is an edit to shared operational files and is called out rather than glossed.

---

## 6. Registration checklist

`ENGINEERS.md:412` states there are two dispatchers and names the two MPA routes. **That is wrong.** There are four, and the two it omits are the ones real users hit. Following the documented process ships a page that is blank on both primary surfaces.

Compounding this: `tsc` cannot catch a missing case (no exhaustiveness assertion, `noImplicitReturns` off, and the portal SPA switch has no `default` at all), and the health sweep reports a missed dispatcher as **green** — the route returns an empty Fragment, the probe collects no sources, and the derive step reads "no failures" as healthy.

| # | Location | Required |
|---|---|---|
| 1 | `ReportSlug` union, `lib/db/schema.ts` | yes |
| 2 | `REPORT_NAMES` → `'executive-overview': 'Overview'`, `lib/constants.ts` | yes |
| 3 | `NAV_GROUPS`, `lib/constants.ts` (drives dashboard sidebar + cards + default) | yes |
| 4 | `ALL_REPORT_SLUGS`, `lib/constants.ts` (drives **portal** sidebar; portal does not read NAV_GROUPS) | yes |
| 5 | Dashboard SPA dispatcher, `app/dashboard/[clientSlug]/reports/page.tsx` | yes |
| 6 | Portal SPA dispatcher, `app/portal/[clientSlug]/reports/page.tsx` | yes |
| 7 | Dashboard MPA dispatcher, `app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx` | yes |
| 8 | Portal MPA dispatcher, `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx` | yes (health sweep renders through this one) |
| 9 | `NON_CHANNEL_SLUGS` in `components/report-sections/report-generator/index.tsx` | yes, or the page is offered as a data channel |
| 10 | `clients.enabled_reports` for `renaissance` | yes, per environment |

---

## 7. Enablement

`enabled_reports` is data, not code. It does not travel with a git merge and must be set separately in the dev, staging, and production databases.

**Use a targeted update scoped to the one client:**

```sql
UPDATE clients
SET enabled_reports = array_append(enabled_reports, 'executive-overview')
WHERE slug = 'renaissance'
  AND NOT ('executive-overview' = ANY(enabled_reports));
```

**Do not use `npm run db:seed`.** It upserts every client with `onConflictDoUpdate` over roughly 17 columns including `enabled_reports`, `hidden_reports`, `hubspot_token_env_var`, and user role assignments. It is already stale against production: its Avenue Z row has `hiddenReports: ['exec-summary']` while production has `["exec-summary","paid-media"]`. Running it would un-hide Paid Media for Avenue Z, which is a direct change to their rendered pages.

Note that `getClientBySlug` and `getAllClients` are cached for 5 minutes. Expect a lag after the update before the page appears; that is not a failed write.

---

## 8. Verification

Assertions checkable against each vendor's own reporting:

- Sessions equals GA4's Sessions for a 30-day window ending **yesterday**. Today is deliberately excluded.
- Bounce rate, pages/session, conversion rate and average session duration match GA4 to the decimal. We format but never compute these, so any difference means a wrong property or window, not a formula bug.
- Traffic by Channel shares will not match GA4 when the site has more than ten channel groups, because the denominator is the top-10 sum. Compare raw per-channel session counts instead.
- Share of voice renders a value, not a blank. A blank means the brand lookup regressed to string matching.
- The header reads "Renaissance", never "Avenue Z".
- Blocks 3 and 4 read "needs connection", never `$0` or `—`.
- Avenue Z's Overview, Web Analytics, Inbound Funnel and Pipeline Performance pages are visually identical before and after.
- `npm run check:rsc` passes. It enforces that a server component may not pass a function prop to a `'use client'` component, is invisible to `tsc` and `next build`, and is not wired into CI.
- Both cron routes complete inside 60s after the concurrency change.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| A missed dispatcher renders blank and reports green | All four are in the checklist and in the verification steps; check the portal SPA route explicitly since the health sweep never probes it |
| Duplicated GA4 reshaping diverges from Avenue Z's | Accepted cost of the zero-blast-radius constraint; recorded as a follow-up in §10 |
| Someone enables via `db:seed` and clobbers Avenue Z | §7 states the targeted UPDATE and the prohibition explicitly |
| Cron still exceeds 60s after the bump | Watch both functions' durations after deploy; the sizing has never been validated against production numbers |

---

## 10. Follow-ups, not addressed here

Found during investigation. All pre-existing, none introduced by this work.

**Correctness**
- The AEO card's delta compares the current incomplete ISO week against a full one, so it reads negative early in any week regardless of performance. Affects Avenue Z today.
- Contact loaders branch on hardcoded 2025 and 2026 only; any other year falls through to zeros silently. Everything CRM-fed stops working on 2027-01-01.
- Pipeline comparison years are integer literals duplicated across three files, with the same 2027 cliff.
- `closedate` year is parsed in server local time, so a UTC-midnight 1 January close date lands in the prior year west of UTC.
- The trend chart joins its compare series by array index rather than by date, so any gap or length mismatch shifts the whole overlay.
- Prior-year pacing shifts by calendar date rather than weekday, misaligning the week by one to two days, and returns 0 on any error, making a failure indistinguishable from a quiet week.
- The dashboard MPA route drops `dateRange`, so Inbound Funnel shows different numbers depending on which route reached it.

**Convention and hygiene**
- `NewReturning` renders an "AI" badge over deterministic string templating and is not gated by `SHOW_AI_NARRATIVE`, unlike every other narrative block.
- `ENGINEERS.md:412` documents two dispatchers where there are four, and names the wrong two.
- The health sweep cannot detect a missing dispatcher case; a blank page reports green.
- `ChannelTabsChart.compareLabel` and `ChannelVolumeRow.pct` are declared but never read.
- Contact email addresses are written to server logs from a production path in the forms debug logging.
- `demand-overview/signal-card.tsx` and `hubspot-performance`'s `CLOSED_STAGE_IDS` are unreferenced.

**Structural**
- HubSpot is the only integration without a per-client config object. Pipeline id, ten stage ids, the ICP property name, the lead-source property and the portal id are all hardcoded in shared code. Any second CRM client renders silent zeros rather than an error.
- The GA4 reshaping this page duplicates should eventually live in `lib/`, with both pages reading it.
