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
- PDF export. `ExportPdfButton` renders only on the portal SPA route; the new page inherits whatever that route does and nothing is built for it.

**Deliberately deferred, and named so they are not mistaken for oversights:**
- **Tests.** This adds none. `npm test` runs on every PR (`.github/workflows/checks.yml:35`), so there is a place for them. The needs-connection path is the one behavior the whole design is organized around and is the obvious first case to cover. Decide before merge whether to add it here or track it.
- **Permissions.** Renaissance's seeded users are both `INTERNAL_ADMIN` (`scripts/seed.ts:122-125`), so there may be no `CLIENT_ADMIN` or `CLIENT_VIEWER` who can reach the portal surface at all. Confirm against the live DB before treating the portal route as delivered.
- **Mobile.** `DemandJourney`'s flow row is `flex items-start gap-0` with no breakpoint (`demand-journey.tsx:57`). The "renders cleanly" claim in §3 is a desktop claim. Four cards, two of them placeholders, on a phone is unverified.

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

**Peec date range: `year_to_date`.** `getPeecOverview` is range-parameterized and `weeklyVisibility` / `brandRankings` are both bound to the range passed (`lib/peec/client.ts:371`, `:685`). Avenue Z's Overview passes `year_to_date` (`demand-overview/index.tsx:110`). We match it, so the AEO card means the same thing on both pages and a client asking "why is this number different" has an answer. Note this makes the AEO card year-to-date while the other three cards are 30-day, which is inherited from Avenue Z rather than introduced here, and is recorded in §10.

Share of voice is the mean of per-row `share_of_voice` across the client's own brand rows (`lib/peec/client.ts:274-277`), where the raw field is a fraction scaled by 100.

### 4.4 GA4 reshaping is duplicated, deliberately

Roughly 226 lines of logic turning raw GA4 rows into chart props live inline in `components/report-sections/ga4/index.tsx`, not in `lib/`. Line ranges: KPI cards `:261-314` (+ `KPI_METRICS :78-87`), trend `:316-334`, channels `:336-403`, audience `:464-501`, shared formatters `:33-76`.

Extracting them to `lib/ga4/` would be cleaner and would leave one copy. It would also edit Avenue Z's file. **We duplicate.** Two copies that can diverge is the accepted cost of the zero-blast-radius constraint.

Three details when copying:

- `returningUserCount` is computed inline in JSX at `:564` and must be extracted to a variable.
- `channelConvData` depends on `channelColorMap` which depends on `channelData`, so `:336-403` must be copied as one block or the two tabs' colors desynchronize.
- **`compareDateLabel` sits at `:537-539`, outside every range listed above**, and feeds `compareLabel` on both `SessionsTrendChart` (`:558`) and `ChannelTabsChart` (`:572`). Copy only the listed ranges and both charts silently lose their compare-period label. `fmtISODate` is already inside `:33-76`; only the three-line derivation is missing.

Typing friction worth planning for: `TrendRow` is not exported (`sessions-trend-chart.tsx:16`), nor are `KpiCardProps` or `ChannelTabsChartProps`. The duplicated reshaping cannot be annotated against the components' own contracts, which is precisely how two copies drift without `tsc` noticing. `ChannelVolumeRow`, `ChannelConvRow`, `AudienceRow` and `DemandStage` are exported and should be used where available.

### 4.5 Needs-connection state

Zeros are the failure mode being avoided: absent or mismatched CRM identifiers produce plausible `$0` figures with no error anywhere. Nothing here renders `0`, `—`, or an error card in place of missing data.

**Blocks 3 and 4** get a new local block-level component: a card naming the source and stating it is not connected.

**Block 1 is different and needs its own answer.** The two dead cards live *inside* `DemandJourney`, which renders its own cards from `DemandStage[]`. `DemandStage` requires `metric: string` and `stats: {label,value}[]` and has no variant slot (`demand-journey.tsx:8-20`). Three options, and only one is viable:

- Edit `DemandJourney` to add a variant. **Forbidden by §4.2.**
- Drop to a 2-card row and render the dead cards outside the component. **Breaks the wireframe's single 4-card flow.**
- **Chosen:** pass `metric: 'Not connected'`, `stats: []`, and omit `delta`. `stage.delta != null` guards the delta (`:139`), so an omitted delta renders nothing rather than a false green arrow.

This is the weakest part of the design and is named as such: the copy lands in the `text-3xl font-extrabold` hero slot (`:113-116`) inside full card chrome, so it is a placeholder wearing a metric's clothes. It is still strictly better than `$0`, and it is the only option that neither edits Avenue Z's component nor breaks the wireframe. Revisit if `DemandJourney` ever gains a variant slot for reasons of its own.

### 4.6 Failure handling

Data fetching uses `Promise.allSettled`, following `demand-overview/index.tsx:73`. Not `Promise.all`, which `ga4/index.tsx:117` uses and which kills the entire section on any single query rejection.

**Per-block error boundaries were in an earlier draft and are dropped.** Review established they buy nothing here: the orchestrator awaits `allSettled` up front, so every vendor rejection is already a settled result before any block renders, and blocks then render synchronously from resolved data. One await point means one failure domain. The comparison to `components/dashboard/block-grid.tsx:120-127` does not hold, because those blocks each fetch independently.

`allSettled` plus the route-level `ReportErrorBoundary` is the correct combination. A vendor failure degrades that block; only a bug in our own render code reaches the boundary.

**Known consequence, accepted:** a single await point means one skeleton until the slower of GA4 (four-plus queries) and Peec returns. There is no progressive loading. Splitting into independently-suspended blocks is a real option if the page feels slow, and is recorded as a follow-up rather than built speculatively.

---

## 5. Blast radius

### 5.1 Why Avenue Z's pages are unaffected

Avenue Z's `enabled_reports` will not contain `executive-overview`. Every registration below is additive and filters out for them:

- Sidebar filters `group.slugs` against the client's `enabledReports` and returns null for an empty group.
- Landing cards filter `NAV_SLUG_ORDER` the same way.
- `defaultSection` is `NAV_SLUG_ORDER.find(s => enabledReports.includes(s))`. The predicate is false for a slug the client lacks, so insertion position cannot change which element is found. Avenue Z's default stays `demand-overview`.
- Both MPA dispatchers `notFound()` on a slug absent from `enabledReports`.

Their components are imported, never edited. No `Record<ReportSlug, …>` exists anywhere, so extending the union breaks no mapped type. No test enumerates the slug list.

### 5.2 NAV_GROUPS insertion, and what Renaissance lands on

`defaultSection` is `NAV_SLUG_ORDER.find(s => enabledReports.includes(s))`. `NAV_SLUG_ORDER[0]` is `demand-overview`, which **Avenue Z has and Renaissance does not**. That asymmetry is what makes this safe to reason about per-client.

- **Index 0** — rejected. Prepending a group object shifts the React keys of every existing group (`sidebar.tsx:396`, `:422`), and it would place the slug ahead of `demand-overview` for any future client that has both.
- **Index 1**, a new label-less group immediately after `demand-overview`'s — **chosen.** Avenue Z's `find()` still returns `demand-overview` from index 0, so nothing about them changes. Renaissance, lacking `demand-overview`, gets `executive-overview` as their landing section and as their first sidebar item above the Reports heading. That is the correct outcome for a page whose entire purpose is to be the overview.
- **Appending after `Tools`** — rejected. It buries the Overview below AEO, Paid Media and Organic Social in the sidebar and leaves Renaissance landing on AEO, which contradicts the wireframe's intent.

**Stated explicitly: Renaissance's landing section changes from `peec-ai` (AEO) to `executive-overview`.** That is intended. Avenue Z's landing section is unchanged.

### 5.3 Cron concurrency: no change (reversed after review)

An earlier draft raised `CONCURRENCY` from 8 to 10 in `app/api/health/sweep/route.ts` and `app/api/cache-warm/route.ts`. **That change is dropped.** Adversarial review invalidated all three premises behind it, verified in source:

- **The Avenue Z risk runs the other way.** `getAllClientsImpl` orders by `asc(c.name)` (`lib/db/queries.ts:83-88`) and workers pull indices in order, so "Avenue Z" is warmed at the front. A 60s truncation drops the *tail*, which is late-alphabet clients including Renaissance. Avenue Z is the least exposed client, not the most.
- **There are no waves.** `mapWithConcurrency` is a rolling worker pool: long-lived loops each pulling `next++` until exhausted (`lib/concurrency.ts:20-38`). There is no barrier between groups of 8, so 2 extra units on ~40 adds roughly 2 renders of work spread across 8 workers, not a step change. The `ceil(units / CONCURRENCY) × render` formula in the cron review is an upper bound, not a threshold.
- **Raising it contradicts why the bound exists.** The limit was introduced because unbounded fan-out spiked Function CPU Duration and tripped Neon errors (`lib/concurrency.ts:5-12`). The cron review names validating `8` against production as the blocking follow-up and says to *lower* it if Neon strains (`docs/qa/cron-fanout-concurrency-code-review.md:154-157`). Raising it 25% with no production numbers, while monitoring only function duration and never Neon error rate, is a change aimed at every client to solve a problem we have not measured.

Enabling the slug still adds 2 units to each cron. That is accepted as-is and watched after deploy.

**Consequence: this PR touches zero shared operational files. Blast radius is now genuinely zero.**

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
| 11 | Date-picker allow-list in **both** SPA routes | see §6.1 |
| 12 | Settings-page exclusion array, `app/dashboard/settings/page.tsx:170-172` | cosmetic; otherwise the slug shows as an "Enabled Platform" chip |

`ai-summaries` needs no entry: its `NON_CHANNEL_SLUGS` is double-gated by `&& CHANNEL_META[slug]` (`components/report-sections/ai-summaries/index.tsx:280`), so an unknown slug is already excluded. `report-generator`'s copy is single-gated (`:27`), so item 9 is required.

### 6.1 Date picker: the page has none

Both SPA dispatchers gate `GA4DatePicker` on an explicit allow-list of `activeSection` (`app/dashboard/[clientSlug]/reports/page.tsx:204-230`, `app/portal/[clientSlug]/reports/page.tsx:225-251`). Both MPA routes render one unconditionally.

Left alone, the page would have a picker on the deep-link routes and none on the two routes users actually hit, which is exactly the drift §4.1 cites as the reason to avoid the conditional approach.

**Decision: no date picker.** The wireframe specifies a fixed "Period: Last 30 days", and both comparable pages (`demand-overview`, `hubspot-performance`) already omit the picker. The orchestrator takes `dateRange` for signature parity with its siblings but resolves `last_30_days` internally. Nothing is added to either allow-list, and the MPA routes are deep-link-only so their unconditional picker is cosmetic there.

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

**Do not use `npm run db:seed`.** It upserts every client with `onConflictDoUpdate` over 22 columns including `enabled_reports`, `hidden_reports` and `hubspot_token_env_var`, plus a users upsert that rewrites `role` (`scripts/seed.ts:131-175`).

It is stale against the live database in both directions. Its Avenue Z row has `hiddenReports: ['exec-summary']` where dev has `["exec-summary","paid-media"]`, so running it un-hides Paid Media for Avenue Z. And its Renaissance row sets `enabledReports` to `['google-ads','meta-ads','peec-ai','request-a-report']` (`:115-120`), where dev has seven entries including `organic-social`, `paid-media` and `linkedin-ads`. Running it would strip three live sections from Renaissance.

The blast radius of that one command is larger than this entire PR.

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
- `npm run check:rsc` passes. It runs automatically on every pull request (`.github/workflows/checks.yml:23`) alongside `npm test` (`:35`), and enforces that a server component may not pass a function prop to a `'use client'` component. **`tsc` is not in any workflow**, so type errors are caught only locally. Run it by hand before pushing.
- Both cron routes still complete inside 60s. No concurrency change ships, so this is observation rather than validation of a change.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| A missed dispatcher renders blank and reports green | All four are in the checklist. The health sweep probes only the portal MPA and dashboard SPA routes (`app/api/health/sweep/route.ts:73-81`), so **the portal SPA and dashboard MPA are both unprobed** and must be checked by hand |
| Duplicated GA4 reshaping diverges from Avenue Z's | Accepted cost of the zero-blast-radius constraint; several of its prop types are unexported, so `tsc` will not catch drift. Recorded as a follow-up in §10 |
| Someone enables via `db:seed` and clobbers client config | §7 states the targeted UPDATE and the prohibition explicitly |
| Cron units grow by 2 per cron | No change ships; observe both functions' durations after deploy. The `CONCURRENCY = 8` bound has still never been validated against production numbers, which remains an open item owned by the cron review, not by this PR |
| Block 1's needs-connection cards read as metrics | Named openly in §4.5 as the design's weakest point; the only alternative edits Avenue Z's component |

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

- The AEO card is year-to-date while the three cards beside it are 30-day. Inherited from Avenue Z's Overview, not introduced here, but the row reads as one time period and is not.

**Convention and hygiene**
- `NewReturning` renders an "AI" badge over deterministic string templating and is not gated by `SHOW_AI_NARRATIVE`, unlike every other narrative block. This ships on the new page; decide before merge whether that is acceptable on a client-facing Overview.
- `ENGINEERS.md:412` documents two dispatchers where there are four, and names the wrong two.
- The health sweep cannot detect a missing dispatcher case; a blank page reports green. It also probes only two of the four routes, leaving the portal SPA (real client traffic) unmonitored.
- `tsc` runs in no CI workflow. `check:rsc` and `npm test` do.
- The dashboard MPA route has no `demand-overview` case at all today, so that deep link already renders a blank page for Avenue Z.
- `ChannelTabsChart.compareLabel` and `ChannelVolumeRow.pct` are declared but never read.
- Contact email addresses are written to server logs from a production path in the forms debug logging.
- `demand-overview/signal-card.tsx` and `hubspot-performance`'s `CLOSED_STAGE_IDS` are unreferenced.

**Structural**
- HubSpot is the only integration without a per-client config object. Pipeline id, ten stage ids, the ICP property name, the lead-source property and the portal id are all hardcoded in shared code. Any second CRM client renders silent zeros rather than an error.
- The GA4 reshaping this page duplicates should eventually live in `lib/`, with both pages reading it.
