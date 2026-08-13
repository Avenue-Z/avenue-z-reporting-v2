# Renaissance Overview: design

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
- PDF export. `ExportPdfButton` renders only on the portal tab-navigation route (§6.1 #2); the new page inherits whatever that route does and nothing is built for it.

**Deliberately deferred, and named so they are not mistaken for oversights:**
- **Tests.** This adds none. `npm test` runs on every PR (`.github/workflows/checks.yml:35`), so there is a place for them. The needs-connection path is the one behavior the whole design is organized around and is the obvious first case to cover. Decide before merge whether to add it here or track it.
- **Permissions, resolved and no longer a risk.** Confirmed against the dev database: Renaissance has one `CLIENT_ADMIN` and two `CLIENT_VIEWER` accounts on an `@renaissance.test` domain, alongside two internal admins. The client-facing portal is therefore testable end to end, and the new page is genuinely reachable by client-role users. That makes the portal the surface where a wrong number or an "Avenue Z" label would actually be seen by a client, which is why §4.3 puts the header and brand-lookup corrections in the new code rather than inheriting them. (`scripts/seed.ts` shows only the two internal admins and is stale here, as it is elsewhere.)
- **Mobile.** `DemandJourney`'s flow row is `flex items-start gap-0` with no breakpoint (`demand-journey.tsx:57`). §3's single-row layout claim is a desktop claim. Four cards, two of them unconnected, on a phone is unverified.

---

## 3. The four blocks and where each comes from

Sources traced independently three times: four block-level passes, two adversarial verification passes, and one external review of this document. No mapping changed between them.

| # | Wireframe block | Vendor | Renaissance | Treatment |
|---|---|---|---|---|
| 1 | Demand Journey (4 cards) | Peec, GA4, CRM ×2 | partial | 2 cards live, 2 needs-connection |
| 2 | Web Analytics (8 KPIs + 3 charts) | GA4 only | live | full data |
| 3 | Contact Creation | CRM only | none | needs-connection |
| 4 | Pipeline Performance | CRM only | none | needs-connection |

Renaissance's live config, read from the dev database: `ga4_property_id` set, `peec_customer_project_id` set, `peec_your_brand` = "Renaissance", `hubspot_token_env_var` NULL.

### Block 1: Demand Journey

| Card | Source | Derivation |
|---|---|---|
| AEO / AI Visibility | Peec `getPeecOverview` | `(visibility_count / visibility_total) × 100` for the latest ISO week |
| ↳ share of voice | Peec `brandRankings` | mean of per-row `share_of_voice` for the client's own brand |
| Web Analytics / Site Sessions | GA4 `ga4Query` | raw `sessions`; sub-metric is GA4-native `sessionConversionRate` |
| Inbound Funnel / Online Contacts | CRM | needs-connection |
| Pipeline / Open Pipeline | CRM | needs-connection |

All four cards stay in the single flow row. Cards are laid out `flex-1`, and the two unconnected ones use the `connected?: false` variant added to our copy of the component (§4.5), not a shortened row.

### Block 2: Web Analytics

All eight KPIs come from a single dimensionless `runReport`. Every rate is a GA4-native metric requested by name and formatted locally. We compute no rates ourselves; only deltas.

`sessions` · `activeUsers` · `newUsers` · `bounceRate` · `averageSessionDuration` · `screenPageViewsPerSession` · `conversions` · `sessionConversionRate`

Three charts: Sessions & Users Over Time (dimension `date`), New vs Returning (`newVsReturning`), Traffic by Channel (`sessionDefaultChannelGroup`, limit 10).

### Blocks 3 and 4

Both are CRM-only. Both render needs-connection. No CRM client is called, and no CRM component is copied or imported.

---

## 4. Architecture

### 4.1 New slug, not a variant

Slug `executive-overview`, display label **"Overview"** for consistency with Avenue Z's naming.

New folder `components/report-sections/executive-overview/`, holding an orchestrator plus this page's own copies of the components it renders (§4.2). Avenue Z's `demand-overview/index.tsx` is never opened.

The alternative considered was reusing the `demand-overview` slug with a `clientSlug === 'renaissance'` conditional in the dispatchers. Rejected: that conditional sits inside the branch Avenue Z executes on every render of the page they land on by default, and the branch would need duplicating across all four dispatchers, which the repo has already drifted on once (noted in the header comment at `app/portal/[clientSlug]/reports/page.tsx:62-67`).

### 4.2 Leaf components are copied into the new folder

Every visual component this page uses gets its own copy under `components/report-sections/executive-overview/`. Nothing is imported from an Avenue Z section.

| Source | Copied to |
|---|---|
| `components/report-sections/demand-overview/demand-journey.tsx` | `executive-overview/demand-journey.tsx` |
| `components/charts/kpi-card.tsx` | `executive-overview/kpi-card.tsx` |
| `components/report-sections/ga4/sessions-trend-chart.tsx` | `executive-overview/sessions-trend-chart.tsx` |
| `components/report-sections/ga4/new-returning.tsx` | `executive-overview/new-returning.tsx` |
| `components/report-sections/ga4/channel-tabs-chart.tsx` | `executive-overview/channel-tabs-chart.tsx` |

Importing them would also have been safe, since importing modifies nothing and Avenue Z's pages render identically either way. Copying is chosen for a different reason: **one rule with no exceptions.** "This page copies everything" is a rule nobody has to remember the shape of. "This page copies logic but shares five specific primitives" is a rule that has to be re-derived every time someone touches it. The duplication is the price of not carrying that exception around.

Three things this buys beyond consistency:

- **It resolves §4.5.** Owning the `DemandJourney` copy means adding a proper needs-connection variant to `DemandStage` instead of overloading `metric` with placeholder text. That was the weakest part of the previous draft and it goes away.
- **Prop types stop being friction.** `TrendRow`, `KpiCardProps` and `ChannelTabsChartProps` are unexported in the originals, so duplicated reshaping could not be typed against them. In our own copies we export them, and `tsc` catches drift between the reshaping and the components it feeds.
- **Full isolation going forward.** A future redesign of Avenue Z's KPI card cannot reach this page.

The accepted cost is five duplicated UI files plus the reshaping in §4.4. They will drift. That is recorded in §10.

`LeadSourceChart` and `WeeklyPerformance` are not copied either, because they are not used at all: both belong to needs-connection blocks. `LeadSourceChart` additionally hardcodes Avenue Z's HubSpot portal id in every deal link, and `WeeklyPerformance` requires a live CRM to produce its prop. Skipping them also avoids the process-wide HubSpot rate limiter, a singleton shared with Avenue Z's live sections.

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

Typing: `TrendRow`, `KpiCardProps` and `ChannelTabsChartProps` are unexported in the originals. Because §4.2 copies the components, our copies export every prop type, so the duplicated reshaping is annotated against the contracts it feeds and `tsc` catches drift between them.

### 4.5 Needs-connection state

Zeros are the failure mode being avoided: absent or mismatched CRM identifiers produce plausible `$0` figures with no error anywhere. Nothing here renders `0`, a dash, or an error card in place of missing data.

**Blocks 3 and 4** get a new block-level component: a card naming the source and stating it is not connected.

**Block 1's two dead cards render inside `DemandJourney`.** In the original, `DemandStage` requires `metric: string` and `stats: {label,value}[]` with no variant slot (`demand-journey.tsx:8-20`), which would have forced placeholder text into the `text-3xl font-extrabold` hero slot, a placeholder wearing a metric's clothes.

Because §4.2 copies the component, this is no longer a constraint. Our copy's `DemandStage` gains an explicit variant:

```ts
connected?: false        // absent or true renders exactly as today
```

When false the card renders the needs-connection treatment in place of the metric and stat rows, keeping the four-card flow, the connectors and the source label intact. `stage.delta != null` already guards the delta (`:139`), so no false green arrow appears.

The wireframe's single 4-card row survives, and nothing about Avenue Z's copy changes.

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
- Both deep-link dispatchers (§6.1 #3 and #4) `notFound()` on a slug absent from `enabledReports`.

Their component files are never opened. Per §4.2 this page copies rather than imports, so there is not even a shared import edge. No `Record<ReportSlug, …>` exists anywhere, so extending the union breaks no mapped type. No test enumerates the slug list.

### 5.2 NAV_GROUPS insertion, and what Renaissance lands on

`defaultSection` is `NAV_SLUG_ORDER.find(s => enabledReports.includes(s))`. `NAV_SLUG_ORDER[0]` is `demand-overview`, which **Avenue Z has and Renaissance does not**. That asymmetry is what makes this safe to reason about per-client.

- **Index 0.** Rejected. Prepending a group object shifts the React keys of every existing group (`sidebar.tsx:396`, `:422`), and it would place the slug ahead of `demand-overview` for any future client that has both.
- **Index 1**, a new label-less group immediately after `demand-overview`'s. **Chosen.** Avenue Z's `find()` still returns `demand-overview` from index 0, so nothing about them changes. Renaissance, lacking `demand-overview`, gets `executive-overview` as their landing section and as their first sidebar item above the Reports heading. That is the correct outcome for a page whose entire purpose is to be the overview.
- **Appending after `Tools`.** Rejected. It buries the Overview below AEO, Paid Media and Organic Social in the sidebar and leaves Renaissance landing on AEO, which contradicts the wireframe's intent.

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

Twelve items. The four route dispatchers are the ones most easily missed and have their own section (§6.1), because `ENGINEERS.md:412` is wrong about them.

| # | Location | Required |
|---|---|---|
| 1 | `ReportSlug` union, `lib/db/schema.ts` | yes |
| 2 | `REPORT_NAMES` → `'executive-overview': 'Overview'`, `lib/constants.ts` | yes |
| 3 | `NAV_GROUPS`, `lib/constants.ts` (drives dashboard sidebar + cards + default) | yes |
| 4 | `ALL_REPORT_SLUGS`, `lib/constants.ts` (drives **portal** sidebar; portal does not read NAV_GROUPS) | yes |
| 5-8 | **All four route dispatchers.** See §6.1. Do not rely on `ENGINEERS.md` for this | yes, all four |
| 9 | `NON_CHANNEL_SLUGS` in `components/report-sections/report-generator/index.tsx` | yes, or the page is offered as a data channel |
| 10 | `clients.enabled_reports` for `renaissance` | yes, per environment |
| 11 | Date-picker allow-list in both tab-navigation routes | **no change**, see §6.2 |
| 12 | Settings-page exclusion array, `app/dashboard/settings/page.tsx:170-172` | cosmetic; otherwise the slug shows as an "Enabled Platform" chip |

`ai-summaries` needs no entry: its `NON_CHANNEL_SLUGS` is double-gated by `&& CHANNEL_META[slug]` (`components/report-sections/ai-summaries/index.tsx:280`), so an unknown slug is already excluded. `report-generator`'s copy is single-gated (`:27`), so item 9 is required.

### 6.1 The four route dispatchers

A "dispatcher" is the `switch` that turns a report slug into a component. **There are four of them and a new page must be added to all four.**

`ENGINEERS.md:412` states there are two and names only the two deep-link routes. That is wrong, and the two it omits are the two that real users actually hit. Following the documented process ships a page that is blank everywhere it matters. Do not trust that section; use this table.

| # | File | Serves | Reached by |
|---|---|---|---|
| 1 | `app/dashboard/[clientSlug]/reports/page.tsx` | internal dashboard, tab navigation (`?section=`) | **staff clicking the sidebar or a landing card.** Also the health sweep's dashboard probe |
| 2 | `app/portal/[clientSlug]/reports/page.tsx` | client portal, tab navigation (`?section=`) | **clients clicking their sidebar. Real client traffic.** Not probed by the health sweep |
| 3 | `app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx` | internal dashboard, direct link | deep links only. Not probed by the health sweep |
| 4 | `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx` | client portal, direct link | deep links, and the health sweep's portal probe |

Adding a `case` to each is purely additive. Every `case` returns unconditionally, there is no fallthrough in any of the four, and the `default` arms return `null` and are unreachable for a handled slug.

**Nothing catches a missed one.** Three compounding reasons:

- **`tsc` cannot see it.** No `Record<ReportSlug, …>` exists anywhere, there is no exhaustiveness assertion, `noImplicitReturns` is off, and the portal tab route (#2) has no `default` arm at all. All four switches are already non-exhaustive over `ReportSlug`.
- **`tsc` is not in CI either.** No workflow runs a type check. `check:rsc` and `npm test` do run on every PR (`.github/workflows/checks.yml:23`, `:35`).
- **The health sweep reports a miss as green.** The route returns an empty Fragment, `HealthProbe` skips it because a Fragment's type is a Symbol rather than a function, the beacon emits with an empty `sources` array, and `deriveStatus` finds no failed source and returns `'ok'` (`lib/health/derive.ts:32-33`). A blank page monitors as healthy.

The sweep also only probes #1 and #4 (`app/api/health/sweep/route.ts:73-81`), so #2 and #3 must be opened by hand during verification. #2 is the one that matters most: it is what Renaissance's client users will actually load.

**Evidence this is a real failure mode, not a hypothetical:** the dashboard deep-link route (#3) has no `demand-overview` case today, so `/dashboard/avenue-z/reports/demand-overview` already renders a blank page with a header. Pre-existing, harmless because nothing links there, and recorded in §10.

### 6.2 Date picker: the page has none

Both tab-navigation routes (§6.1 #1 and #2) gate `GA4DatePicker` on an explicit allow-list of `activeSection` (`app/dashboard/[clientSlug]/reports/page.tsx:204-230`, `app/portal/[clientSlug]/reports/page.tsx:225-251`). Both deep-link routes (#3 and #4) render one unconditionally.

Left alone, the page would have a picker on the deep-link routes and none on the two routes users actually hit, which is exactly the drift §4.1 cites as the reason to avoid the conditional approach.

**Decision: no date picker.** The wireframe specifies a fixed "Period: Last 30 days", and both comparable pages (`demand-overview`, `hubspot-performance`) already omit the picker. The orchestrator takes `dateRange` for signature parity with its siblings but resolves `last_30_days` internally. Nothing is added to either allow-list, and #3 and #4 are deep-link-only so their unconditional picker is cosmetic there.

---

## 7. Enablement

`enabled_reports` is data, not code. It does not travel with a git merge and must be run separately against each environment's database.

| Environment | Neon endpoint | Run the UPDATE when |
|---|---|---|
| dev | `ep-still-tree` | building, credentials in place |
| staging | `ep-restless-union` | the branch reaches staging for team review. **Credentials not yet available locally** |
| production | `ep-green-violet` | after sign-off, with Thomas's explicit go-ahead. **Credentials not yet available locally** |

Only the dev credentials exist on the working machine today. Staging and production credentials are needed at their respective promotion steps and not before. **If the staging UPDATE is skipped, the page will simply not appear for the team reviewing on staging, which reads as a broken build rather than a missing data step.** That is the most likely way this goes wrong.

Credential values go straight into the local gitignored `.env.local`, never into chat, a commit, or a doc.

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
- Blocks 3 and 4 read "needs connection", never `$0` and never a dash.
- Avenue Z's Overview, Web Analytics, Inbound Funnel and Pipeline Performance pages are visually identical before and after.
- `npm run check:rsc` passes. It runs automatically on every pull request (`.github/workflows/checks.yml:23`) alongside `npm test` (`:35`), and enforces that a server component may not pass a function prop to a `'use client'` component. **`tsc` is not in any workflow**, so type errors are caught only locally. Run it by hand before pushing.
- Both cron routes still complete inside 60s. No concurrency change ships, so this is observation rather than validation of a change.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| A missed dispatcher renders blank and reports green | All four are listed in §6.1. The health sweep probes only #1 and #4 (`app/api/health/sweep/route.ts:73-81`), so **#2 and #3 are both unprobed** and must be opened by hand. #2 matters most: it is what Renaissance's client users load |
| Copied components and reshaping diverge from Avenue Z's over time | Accepted, and the reason is deliberate: one copy-everything rule beats a rule with remembered exceptions. Our copies export their prop types so `tsc` catches drift *within* this page; drift *from* Avenue Z's originals is silent and is recorded in §10 |
| Someone enables via `db:seed` and clobbers client config | §7 states the targeted UPDATE and the prohibition explicitly |
| Cron units grow by 2 per cron | No change ships; observe both functions' durations after deploy. The `CONCURRENCY = 8` bound has still never been validated against production numbers, which remains an open item owned by the cron review, not by this PR |
| Block 1's needs-connection cards misread as metrics | Resolved by §4.2's copy decision. Our `DemandStage` copy carries an explicit `connected?: false` variant rather than overloading the metric slot with placeholder text |

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
- The dashboard deep-link route drops `dateRange`, so Inbound Funnel shows different numbers depending on which route reached it.
- The AEO card is year-to-date while the three cards beside it are 30-day. Inherited from Avenue Z's Overview, not introduced here, but the row reads as one time period and is not.

**Convention and hygiene**
- `NewReturning` renders an "AI" badge over deterministic string templating and is not gated by `SHOW_AI_NARRATIVE`, unlike every other narrative block. This ships on the new page; decide before merge whether that is acceptable on a client-facing Overview.
- `ENGINEERS.md:412` documents two dispatchers where there are four, and names the wrong two.
- The health sweep cannot detect a missing dispatcher case; a blank page reports green. It also probes only two of the four routes, leaving the portal tab-navigation route (real client traffic) unmonitored.
- `tsc` runs in no CI workflow. `check:rsc` and `npm test` do.
- The dashboard deep-link route has no `demand-overview` case at all today, so that URL already renders a blank page for Avenue Z.
- `ChannelTabsChart.compareLabel` and `ChannelVolumeRow.pct` are declared but never read.
- Contact email addresses are written to server logs from a production path in the forms debug logging.
- `demand-overview/signal-card.tsx` and `hubspot-performance`'s `CLOSED_STAGE_IDS` are unreferenced.

**Structural**
- HubSpot is the only integration without a per-client config object. Pipeline id, ten stage ids, the ICP property name, the lead-source property and the portal id are all hardcoded in shared code. Any second CRM client renders silent zeros rather than an error.
- The GA4 reshaping this page duplicates should eventually live in `lib/`, with both pages reading it.
- **Copy drift.** Five UI components and ~226 lines of reshaping now exist twice. A bug fixed on Avenue Z's copy will not reach this page, and nothing warns about it. This is the accepted cost of copy-only, taken deliberately in §4.2. Whoever fixes a bug in `ga4/sessions-trend-chart.tsx`, `ga4/new-returning.tsx`, `ga4/channel-tabs-chart.tsx`, `charts/kpi-card.tsx` or `demand-overview/demand-journey.tsx` should grep `executive-overview/` for the same file name. Worth a note in `ENGINEERS.md` once this ships.
