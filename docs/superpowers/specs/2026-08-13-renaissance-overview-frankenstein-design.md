# Renaissance Overview: design

**Asana:** Frankenstein the Executive Overview PDF mockup from pieces of the Ave Z dashboard and configure for the Ren dashboard

**Branch:** `Executive-Overview-Duplicate-Ren` off `dev` · **PR:** #207 (draft → dev)
**Wireframe:** `Executive Dashboard Demo.pdf`

**Revision note.** Rewritten after three adversarial passes (citations, completeness, safety), then revised again after a second sweep of three specialists plus a lead synthesis. The early rounds concentrated on what must not break and under-specified what must render; §§4.4-4.8 close that gap. One decision was reversed along the way and is flagged where it sits (§5.4). The architecture held through every pass.

---

## 1. What this is

Renaissance has no overview page. Avenue Z has the pieces for one, spread across four separate report sections. This assembles those pieces into a single new page on the Renaissance side, laid out per the wireframe.

It is assembly rather than construction: roughly 80% of the code is transplanted from components running on Avenue Z today. The new code is the orchestrator, the needs-connection treatment, and the variant that lets an unconnected card sit in the journey row.

**Hard constraint:** Avenue Z's rendered output must be unchanged after this ships. Strictly this means the rendered DOM, not the literal bytes: App Router HTML embeds a build id and content-hashed chunk URLs that move on any deploy. §5.1 names the two places output does change.

---

## 2. Scope

**In:**
- A new report page for Renaissance containing the four wireframe blocks in wireframe order.
- Blocks fed by GA4 and Peec render live Renaissance data, including period-over-period deltas.
- Blocks fed by a CRM render an explicit "needs connection" state.

**Out:**
- Any change to Avenue Z's report components or their data.
- Any CRM integration work. Renaissance uses Salesforce; no Salesforce code exists in this repo and none is written here.
- Fixing the pre-existing bugs found during investigation. Recorded in §10.
- PDF export. `ExportPdfButton` renders only on the portal tab-navigation route (§6.1 #2); this page inherits whatever that route does and nothing is built for it.
- **The mockup's presentation chrome.** The "DEMO DATA" pill, the "Prepared for … sample view of the live dashboard" line and the footer disclaimer are artifacts of a sales mock. Demo mode was deliberately removed from this product (`docs/superpowers/specs/2026-06-25-remove-demo-mode-design.md`). None of it is built. §4.7 states what the header actually renders.

**Decided during review, recorded so it is not relitigated:**
- **No AI commentary on this page**, of any kind. See §4.7.1 for what is removed and the scoping note on why AI *metrics* stay.

**Deliberately deferred:**
- **Tests.** This adds none. `npm test` runs on every PR (`.github/workflows/checks.yml:35`). The needs-connection path is the obvious first case. Decide before merge whether to add it here or track it.
- **Mobile.** `DemandJourney`'s flow row is `flex items-start gap-0` with no breakpoint (`demand-journey.tsx:53`). §3's single-row layout claim is a desktop claim.

**Resolved, previously listed as a risk:**
- **Permissions.** Confirmed against the dev database: Renaissance has one `CLIENT_ADMIN` and two `CLIENT_VIEWER` accounts on an `@renaissance.test` domain, plus two internal admins. The client-facing portal is testable end to end and the page is genuinely reachable by client-role users. That makes the portal the surface where a wrong number or an "Avenue Z" label would actually be seen by a client, which is why §4.3 puts the brand-lookup correction in the new code.

---

## 3. The four blocks and where each comes from

Sources traced independently three times. No mapping changed between passes.

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
| ↳ share of voice | Peec `brandRankings` | mean of per-row `share_of_voice` **for the client's own brand**, raw field being a fraction scaled by 100 |
| Web Analytics / Site Sessions | GA4 | raw `sessions`; sub-metric is GA4-native `sessionConversionRate` |
| Inbound Funnel / Online Contacts | CRM | needs-connection |
| Pipeline / Open Pipeline | CRM | needs-connection |

All four cards stay in one flow row, laid out `flex-1`. The two unconnected ones use the `connected: false` variant added to our copy (§4.6), not a shortened row.

### Block 2: Web Analytics

Eight KPIs from a single dimensionless query. Every rate is a GA4-native metric requested by name and formatted locally. We compute no rates, only deltas.

`sessions` · `activeUsers` · `newUsers` · `bounceRate` · `averageSessionDuration` · `screenPageViewsPerSession` · `conversions` · `sessionConversionRate`

Three charts: Sessions & Users Over Time, New vs Returning, Traffic by Channel. Exact queries in §4.4.

### Blocks 3 and 4

Both CRM-only. Both render needs-connection. No CRM client is called, and no CRM component is copied or imported.

---

## 4. Architecture

### 4.1 New slug, not a variant

Slug `executive-overview`, display label **"Overview"**.

New folder `components/report-sections/executive-overview/`, holding an orchestrator plus this page's own copies of the components it renders (§4.2). Avenue Z's `demand-overview/index.tsx` is never opened.

The alternative was reusing the `demand-overview` slug with a `clientSlug === 'renaissance'` conditional in the dispatchers. Rejected: that conditional sits inside a branch Avenue Z executes on every render of the page they land on by default, and it would need duplicating across all four dispatchers, which this repo has already drifted on once (`app/portal/[clientSlug]/reports/page.tsx:62-67`).

### 4.2 Everything is copied, nothing is imported from an Avenue Z section

| Source | Copied to |
|---|---|
| `components/report-sections/demand-overview/demand-journey.tsx` | `executive-overview/demand-journey.tsx` |
| `components/charts/kpi-card.tsx` | `executive-overview/kpi-card.tsx` |
| `components/report-sections/ga4/sessions-trend-chart.tsx` | `executive-overview/sessions-trend-chart.tsx` |
| `components/report-sections/ga4/new-returning.tsx` | `executive-overview/new-returning.tsx` |
| `components/report-sections/ga4/channel-tabs-chart.tsx` | `executive-overview/channel-tabs-chart.tsx` |
| `components/report-sections/empty-state.tsx` | `executive-overview/needs-connection.tsx` (§4.6) |

Importing would also have been safe, since importing modifies nothing. Copying is chosen for consistency: "this page copies everything" is a rule nobody has to remember the shape of, where "copies logic but shares five primitives" has to be re-derived every time someone touches it.

Three things it buys beyond that:

- **It resolves the Block 1 variant problem.** Owning the `DemandJourney` copy means adding a real needs-connection variant instead of overloading `metric` with placeholder text.
- **Prop types stop being friction.** `TrendRow` (`sessions-trend-chart.tsx:16`), `KpiCardProps` (`kpi-card.tsx:3`) and `ChannelTabsChartProps` (`channel-tabs-chart.tsx:28`) are unexported in the originals. Our copies export every prop type, so `tsc` catches drift between the reshaping and the components it feeds.
- **Isolation.** A future redesign of Avenue Z's KPI card cannot reach this page.

Accepted cost: six duplicated UI files plus ~233 lines of reshaping. They will drift silently. Recorded in §10.

`LeadSourceChart` and `WeeklyPerformance` are not copied because they are not used: both belong to needs-connection blocks. `LeadSourceChart` additionally hardcodes Avenue Z's HubSpot portal id in every deal link (`lead-source-chart.tsx:98`). Skipping them also avoids the process-wide HubSpot rate limiter (`lib/hubspot/client.ts:16`).

### 4.3 The orchestrator

`components/report-sections/executive-overview/index.tsx`, an async RSC taking `{ clientSlug }`.

Three things it does differently from Avenue Z's version, written correctly here rather than fixed there:

- **Brand lookup** reads `BrandRanking.isYou`, computed from `clients.peec_your_brand` (`lib/peec/client.ts:132`, `:381`, `:472`), instead of matching the literal string "avenue z". Without this, share of voice blanks for every client but Avenue Z.
- **Ranges are resolved internally**, per §4.4.

It renders **no header of its own**. See §4.7.

**Journey card 1 (AEO) is reshaped from Peec, not GA4**, so §4.5's reshaping table does not cover it. Its source is `demand-overview/index.tsx:194-205`: visibility is the last entry of `weeklyVisibility`, and the delta is derived from the last two entries. Copy that block, substituting the `isYou` lookup above. Note §10 records a known bug in that derivation (the current week is incomplete), inherited not introduced.

**Peec range: `year_to_date`**, matching Avenue Z's Overview (`demand-overview/index.tsx:110`), so the AEO card means the same thing on both pages. This makes that one card year-to-date while the other three are 30-day. Inherited, not introduced, and recorded in §10.

### 4.4 Date ranges are resolved internally, not taken from props

**This is load-bearing. Get it wrong and every delta in the wireframe renders blank.**

`compareRange` is `null` on all four routes for a section with no date picker. Each route does `compareRangeParam ?? null` (`app/portal/[clientSlug]/reports/page.tsx:173` and the three equivalents), the parameter only ever enters the URL from the date picker, and no navigation path supplies it: the dashboard sidebar builds `linkParams` with `section` only for a generic slug (`components/layout/sidebar.tsx:437-438`), and the portal sidebar never sets it for any slug (`portal-sidebar.tsx:72-74`).

A TypeScript default parameter does not fire for `null`, only for `undefined`. So a signature defaulting to `'previous_period'` would still receive `null`, `deriveCompareRange` would return `null` (`lib/ga4/client.ts:58`), and the page would ship with no KPI deltas, no trend overlay, no channel compare bars, no New vs Returning badges and no journey-card delta pills. The wireframe shows all of them.

**The orchestrator therefore takes no range props and resolves both internally**, exactly as `demand-overview/index.tsx:62-63` does:

```ts
const resolved = parseDateRange('last_30_days')
const compare  = deriveCompareRange('last_30_days', 'previous_period')
const mainIso  = `${resolved.startDate},${resolved.endDate}`
const cmpIso   = compare ? `${compare.startDate},${compare.endDate}` : null
```

The last two lines are not optional. `ga4Query` takes `dateRange` as a single comma-joined string, so the join is what actually reaches the API.

### 4.5 Data fetching: nine GA4 queries and one Peec call

Fetched with `Promise.allSettled` (§4.8). Compare-range queries are unconditional here, because §4.4 guarantees a compare range exists.

| # | Range | metrics | dimensions | limit | Feeds |
|---|---|---|---|---|---|
| 1 | main | `KPI_METRICS` (the eight in §3) | none | n/a | 8 KPI cards, journey card 2 |
| 2 | compare | `KPI_METRICS` | none | n/a | all 8 KPI deltas, journey card 2 delta |
| 3 | main | `sessions, activeUsers, newUsers` | `date` | 90 | trend chart, journey card 2 sparkline |
| 4 | compare | `sessions, activeUsers, newUsers` | `date` | 90 | trend compare overlay |
| 5 | main | `sessions, conversions, sessionConversionRate` | `sessionDefaultChannelGroup` | 10 | Traffic by Channel, both tabs |
| 6 | compare | `sessions` | `sessionDefaultChannelGroup` | 10 | channel compare bars |
| 7 | main | `sessions` | `sessionDefaultChannelGroup, sessionSource, sessionMedium` | 150 | channel drill-down (`sourceMediumMap`) |
| 8 | main | `sessions, engagementRate, averageSessionDuration` | `newVsReturning` | n/a | New vs Returning |
| 9 | compare | `sessions, engagementRate, averageSessionDuration` | `newVsReturning` | n/a | New vs Returning deltas |
| P | year_to_date | Peec `getPeecOverview` | n/a | n/a | journey card 1 |

Two traps this table exists to prevent:

- **Query 7 is easy to miss, and the reshaping below tells you to copy the code that consumes it.** The `channelSourceMediumMap` builder lives inside the `:336-403` block, reading `channelSMRes` (`ga4/index.tsx:389`). Copy the block without issuing query 7 and the drill-down is silently empty.
- **Query 5's metric list matters.** `channelConvData` filters on `sessions >= 20` and sorts by `sessionConversionRate` (`ga4/index.tsx:373-385`). Issue it with `metrics: ['sessions']` only, as `demand-overview` does, and the **By Conversion** tab renders empty with no error.

The journey sparkline reuses query 3 rather than issuing `demand-overview`'s separate `limit: 31` call. Shapes match after `fmtDate`.

**The reshaping that turns these rows into props is copied, not extracted.** Roughly 233 lines of it live inline in `components/report-sections/ga4/index.tsx` rather than in `lib/`. Extracting would be cleaner and would leave one copy; it would also edit Avenue Z's file, so we duplicate.

**Adapt every result access when you copy it.** `ga4/index.tsx` fetches with `Promise.all` (`:118`), so its reshaping dereferences results directly: `totalsRes.rows[0]` (`:261`), `trendRes.rows` (`:316`), `channelRes.rows` (`:348`), `audienceRes.rows` (`:468`). §4.8 mandates `Promise.allSettled`, under which every one of those is a `PromiseSettledResult` with no `.rows`. Each needs unwrapping before use, following the idiom already in `demand-overview/index.tsx:125`:

```ts
const ga4 = ga4Res.status === 'fulfilled' ? ga4Res.value : null
```

This is the single most likely way a verbatim copy goes wrong. `strict: true` catches the bare cases, but the ranges also contain optional-chained forms (`compareChannelRes?.rows ?? []`, `channelSMRes?.rows ?? []`) which compile fine against a settled result and yield **silently empty compare bars and an empty drill-down**. `tsc` is in no CI workflow, so nothing catches it automatically.

| Consumer | Lines in `ga4/index.tsx` |
|---|---|
| 8 KPI cards | `:261-314`, plus `KPI_METRICS` at `:78-87` |
| Sessions & Users trend | `:316-334` |
| Traffic by Channel, both tabs and the drill-down | `:336-403` |
| New vs Returning | `:464-501` |
| Shared formatters (`fmtNum`, `fmtPct`, `fmtDuration`, `fmtDate`, `fmtISODate`, `pct`) | `:33-76` |

Three things that bite when copying:

- `returningUserCount` is computed inline in JSX at `:564` and must be lifted to a variable.
- `channelConvData` depends on `channelColorMap`, which depends on `channelData`, so `:336-403` must be copied as one block or the two channel tabs' colors desynchronize.
- **`compareDateLabel` sits at `:537-539`, outside every range above**, and feeds `compareLabel` on both the trend chart (`:558`) and the channel chart (`:572`). Copy only the listed ranges and both charts silently lose their compare-period label.

### 4.6 Needs-connection state

Zeros are the failure mode being avoided: absent CRM identifiers produce plausible `$0` figures with no error. **No block renders `0` or a dash to mean "we have no source for this."**

That rule is about *absent configuration*, not about *failed fetches*, and the two must be handled differently:

| Situation | Treatment |
|---|---|
| Source not configured for this client (CRM, today) | needs-connection card |
| Source configured but the fetch failed or returned empty | the copied components' own empty behavior: dashes on KPIs, empty charts |

The distinction matters because the copied reshaping produces dashes on failure by design (`fmtNum`, `fmtPct` and `fmtDuration` each return a dash on null, `ga4/index.tsx:34`, `:39`, `:44`). Do not try to route GA4 failures into the needs-connection card. A dash there is honest: the source exists and this render did not get data.

One consequence worth stating, because staging and production GA4 credentials are not yet available (§7): if `ga4_property_id` is unset or the service account lacks access, `ga4Query` throws (`lib/ga4/client.ts:92`) and Block 2 renders eight dashes and three empty charts rather than a needs-connection card. That is correct behavior under the table above, and it is what the first render outside this machine will look like if credentials are wrong.

**The component.** `components/report-sections/empty-state.tsx` is the closest existing thing and is copied to `executive-overview/needs-connection.tsx`. Note it has zero call sites today, so it is an unused component being adapted rather than a proven pattern being reused. The original takes `{ platformName, clientSlug, isPortal }` and renders a dashed-border card reading "{platformName} not connected" with a CTA to the auth hub.

Two changes in our copy:

- **The CTA is removed.** The original links to `/{portal|dashboard}/{clientSlug}/auth`. Salesforce has no auth route and no integration, so the link would go nowhere. Removing it also drops the `isPortal` prop, which the orchestrator cannot supply: nothing in its signature or in any route tells a section which surface it is rendering on.
- **Props reduce to `{ sourceName: string }`.** Passed as `'Salesforce'` for both blocks. Naming the client's actual CRM is more useful than "CRM" and more honest than "HubSpot", which is Avenue Z's.

**Blocks 3 and 4** render it at block scale beneath their section heading.

**Block 1's two cards** need a card-scale treatment, not the block component. `empty-state.tsx` is a centered full-width panel (`px-8 py-12`, `text-lg`) and cannot drop into a `flex-1` quarter-width card. Render inside the existing card frame, in place of the metric and stat rows: the source eyebrow stays, the metric slot shows `Not connected` at the card's normal muted body size rather than the `text-3xl` hero size, and a single line reads `Connect Salesforce to see this`. No border, no CTA; the card frame and connector already provide the container.

Our `DemandStage` copy makes `metric` and `stats` optional and adds `connected?: boolean`:

```ts
connected?: boolean   // omitted or true renders exactly as the original
```

When `false`, the card renders the treatment above in place of the metric and stat rows, keeping the connector, the source label and the card frame. `stage.delta != null` already guards the delta (`demand-journey.tsx:140`), so no false arrow appears. Hover-expand is disabled for unconnected cards; expanding into an empty panel is worse than not expanding.

Three places in the copy need a branch, and one is a hard compile error rather than a choice:

| Location | Change |
|---|---|
| `demand-journey.tsx:115-117` | hero metric slot: branch on `connected` |
| `demand-journey.tsx:192` | `stage.stats.length` becomes `stage.stats?.length`. **Required under `strict` the moment `stats` is optional**, independent of the variant |
| `demand-journey.tsx:69-70` | `onMouseEnter` / `onMouseLeave`: no-op when `connected === false` |

Nothing else in that component reads `metric` or `stats`.

### 4.7 Page composition

The route already renders `StickyReportHeader title={pageTitle} subtitle={client.name}`, where `pageTitle` falls through to `REPORT_NAMES[activeSection]` (`app/portal/[clientSlug]/reports/page.tsx:220-224`). Once §6 item 2 lands that reads **"Overview" over "Renaissance"**.

**The section therefore renders no header of its own.** Adding one would print the client name twice.

Note the order that component actually renders: `subtitle` sits in a `<p>` **above** the `<h1>{title}` (`components/layout/sticky-report-header.tsx:102-107`). So the page reads **"RENAISSANCE" over "OVERVIEW"**, client name first. That is the existing convention on every report page, and it is what §8 checks for.

Routes #3 and #4 use different header components (`Header` and hand-rolled markup respectively) but reach the same conclusion: the route owns the header, the section does not.

Consequences for the wireframe's masthead: the eyebrow, the large "DEMAND OVERVIEW" title and the gradient treatment are all provided by the sticky header in plainer form. The rest of that masthead is mock chrome and is out of scope per §2.

Below the header, four blocks in wireframe order, separated by `space-y-8` to match both siblings (`demand-overview/index.tsx:373`, `ga4/index.tsx:542`):

| Block | Heading | Notes |
|---|---|---|
| 1 | none | Our `DemandJourney` copy drops the original's hardcoded "Full-Funnel View / Demand Journey / From AI visibility to closed pipeline" card header (`demand-journey.tsx:44-48`). The wireframe shows a bare 4-card panel |
| 2 | `WEB ANALYTICS` | uppercase eyebrow, matching the wireframe |
| 3 | `CONTACT CREATION` | same |
| 4 | `PIPELINE PERFORMANCE` | same |

The trend chart's "7d avg" toggle, the Traffic by Channel tab switching and the journey cards' hover-expand all come with the copied components and need no work.

### 4.7.1 No AI commentary on this page. Decided.

**This page carries no AI-generated or AI-labelled commentary of any kind.**

Concretely, in our copy of `new-returning.tsx`: delete the `AiBadge` component (`:54-66`) and the engagement-gap callout it annotates (`:131-178`). Both go. Nothing replaces them; the block keeps its two visitor-type cards and its stats.

Two reasons, and either alone is sufficient:

- **The label is false.** The sentence under that badge is deterministic string templating with three fixed branches selected by a numeric comparison. No model produces it. The badge's tooltip nonetheless reads "This insight is generated by AI based on your analytics data."
- **It would be the only one.** `SHOW_AI_NARRATIVE` is `false` (`lib/constants.ts:229`) and every other narrative block in the product respects it. This component does not. Shipping it would make this page the single client-facing surface showing AI-labelled copy while the feature is switched off everywhere else, and Renaissance's own client users can reach it.

Copying rather than sharing (§4.2) is what makes this a local change. Avenue Z's `new-returning.tsx` is untouched and keeps rendering the badge exactly as it does today.

**Scoping note, so this is not over-applied.** "AI Visibility" and "share of voice" on journey card 1 are **measured Peec metrics**, not commentary. They are the entire point of the AEO card and of the wireframe's first block. This decision removes generated prose and the AI label; it does not remove AI-related *data*.

Worth raising with Paul: Avenue Z's page carries the same false badge today, and it is ungated where every sibling is gated. Out of scope here per §2, recorded in §10.

**Skeleton.** All four routes already supply a Suspense fallback (`app/portal/[clientSlug]/reports/page.tsx:262` and equivalents). The section provides none.

### 4.8 Failure handling

`Promise.allSettled`, following `demand-overview/index.tsx:73`. Not `Promise.all`, which `ga4/index.tsx:117` uses and which kills the whole section on any single rejection.

**No per-block error boundaries.** They buy nothing here: the orchestrator awaits `allSettled` up front, so every rejection is a settled result before any block renders. One await point, one failure domain. The `components/dashboard/block-grid.tsx:120-127` comparison does not hold, because those blocks each fetch independently.

`allSettled` plus the route-level `ReportErrorBoundary` is correct. A vendor failure degrades that block; only a bug in our own render code reaches the boundary.

Accepted consequence: one skeleton until the slowest of nine GA4 queries and one Peec call returns. No progressive loading. Recorded in §10.

Worth knowing: `allSettled` does not hide failures from monitoring. `recordFetch({ok:false})` fires inside the `cached()` wrapper (`lib/cache.ts:96`) regardless of how the caller settles, so a degraded block still reports `down`.

---

## 5. Blast radius

### 5.1 Why Avenue Z's rendered pages are unaffected

Avenue Z's `enabled_reports` will not contain `executive-overview`. Every registration is additive and filters out:

- Sidebar filters group slugs and returns `null` before producing DOM for an empty group (`sidebar.tsx:421-424`), so the React key never reaches the document.
- Landing cards filter `NAV_SLUG_ORDER`; filtering preserves relative order (`app/dashboard/[clientSlug]/page.tsx:54-56`).
- `defaultSection` is `NAV_SLUG_ORDER.find(...)` over a predicate that is false for an absent slug, so insertion position is irrelevant (`app/dashboard/[clientSlug]/reports/page.tsx:134`, portal `:180`).
- **All four dispatchers gate on `enabledReports`, not just the two deep-link ones.** The tab routes fall back to `defaultSection` for a section the client lacks (`:152-155`, portal `:196-200`), so `/dashboard/avenue-z/reports?section=executive-overview` renders Avenue Z's own Overview.
- Cache keys include call arguments (`lib/cache.ts:65-83`), so Renaissance fetches cannot collide with Avenue Z's entries.
- No `Record<ReportSlug, …>` exists anywhere. No exhaustiveness assertion. No test enumerates the slug list.

**Two honest caveats.**

The **client JS bundle is not byte-identical**. Four of the six copied components carry `'use client'`, and all four route files import sections statically. Adding the orchestrator import pulls the duplicated client components into the client manifest of routes Avenue Z loads. Rendered HTML is unaffected; payload grows.

**`/dashboard/settings` output changes.** It renders every client's row (`app/dashboard/settings/page.tsx:168-198`), so Renaissance's chip list and report count change on a page that is not Renaissance-specific. Cosmetic and internal.

### 5.2 NAV_GROUPS and ALL_REPORT_SLUGS insertion

**The invariant is `NAV_SLUG_ORDER[1] === 'executive-overview'`**, immediately after `demand-overview`, and the same position in `ALL_REPORT_SLUGS`. State it that way rather than as an index, because `NAV_GROUPS` is an array of groups rather than slugs: appending to group 0's `slugs` and splicing a new group at position 1 both satisfy it.

The general rule, stated properly: **index 1 is safe for every client lacking `executive-overview`, and changes the landing section for exactly those clients that have `executive-overview` and lack `demand-overview`.** Today that is Renaissance alone. Verified against all seven rows in the dev database. `avenue-z` and `begin-health` both hold `demand-overview`, so their `find()` still returns it from index 0. The remaining four (`elix`, `elix-healing`, `kind-patches`, `love-bug`) have an empty `enabled_reports`, so `defaultSection` resolves to `undefined` both before and after and the redirect never fires. None of the seven changes.

Index 0 is rejected because it would order the slug ahead of `demand-overview` for any future client holding both. (An earlier draft also cited React key shifts. That reasoning was wrong: inserting at index 1 shifts keys too, and `NAV_GROUPS` is a module constant so the keys never differ between server and client. The ordering argument is the real one.)

**`ALL_REPORT_SLUGS` needs the same index**, and this is the one that matters most. It, not `NAV_GROUPS`, drives the portal sidebar (`portal-sidebar.tsx:65`), which is the surface Renaissance's client users actually load. Appending would bury Overview below AEO, Paid Media and Organic Social for exactly the audience the page is for.

**Renaissance's landing section changes from `peec-ai` (AEO) to `executive-overview`.** Intended. Avenue Z's is unchanged.

### 5.3 A latent dependency worth naming: SHOW_LOCKED_REPORT_TEASERS

`portal-sidebar.tsx:65` iterates `ALL_REPORT_SLUGS` for **every** client, and returns `null` for slugs a client lacks only because `SHOW_LOCKED_REPORT_TEASERS` is `false` (`lib/constants.ts:221`, filter at `portal-sidebar.tsx:93-95`). The comment above the flag advertises flipping it as needing "no other change."

Flip it and "Overview" appears as a locked upsell entry in every other client's portal sidebar, and in Renaissance's own: they would see a locked `demand-overview` directly above their live `executive-overview`, both labelled "Overview". Worse, `REPORT_NAMES['demand-overview']` is already the string `'Overview'`, so Avenue Z and Begin Health would show two adjacent entries both reading "Overview", one live and one locked.

Adding to `ALL_REPORT_SLUGS` is still required, since it is what gives Renaissance a portal sidebar entry at all. This is recorded so that whoever flips that flag knows to check it, not to block the change.

### 5.4 Cron concurrency: no change (reverses an explicit instruction)

I asked for `CONCURRENCY` to be raised from 8 to 10 in the two cron routes, on the strength of an earlier draft's argument. **That is reversed here**, because review showed all three premises behind it were wrong:

- **The Avenue Z risk ran the other way.** `getAllClientsImpl` orders by `asc(c.name)` (`lib/db/queries.ts:83-88`) and workers pull in order, so Avenue Z is first and the *tail* is dropped. Renaissance sorts last of seven.
- **There are no waves.** `mapWithConcurrency` is a rolling worker pool (`lib/concurrency.ts:28-33`), no barrier between groups. The `ceil(units / CONCURRENCY) × render` formula is an upper bound, not a threshold.
- **Raising it contradicts why the bound exists.** It was introduced because unbounded fan-out spiked CPU and tripped Neon errors (`lib/concurrency.ts:5-12`), and the cron review says to validate before changing and to *lower* it if Neon strains (`docs/qa/cron-fanout-concurrency-code-review.md:154-157`).

**But the risk model in that draft was also wrong, and the corrected version is worth stating.** `diffHealth`, `upsertHealthState` and the Slack post all run *after* the fan-out completes (`app/api/health/sweep/route.ts:85-99`). If the function hits its 60s ceiling, nothing is written and no transition posts **for any client**, so a genuine Avenue Z outage goes unannounced. The question is not which units get dropped; it is whether the sweep finishes at all.

This page adds exactly 2 units per cron (sweep 40→42, cache-warm 49→51; verified, and §6.2's no-picker decision generates no subsection URLs). It is also one of the heavier renders on the sweep: nine GA4 queries plus a Peec call behind a single await point.

**Decision: ship without the concurrency change and watch both functions' durations after deploy.** If either trends toward 60s, that is a cron-owned problem to fix with measurements, not a constant to raise blind from this PR.

---

## 6. Registration checklist

Twelve items. The four route dispatchers are the ones most easily missed and have their own section, because `ENGINEERS.md:412` is wrong about them.

| # | Location | Required |
|---|---|---|
| 1 | `ReportSlug` union, `lib/db/schema.ts` | yes |
| 2 | `REPORT_NAMES` → `'executive-overview': 'Overview'`, `lib/constants.ts` | yes |
| 3 | `NAV_GROUPS` at index 1, `lib/constants.ts` (dashboard sidebar, cards, default) | yes |
| 4 | `ALL_REPORT_SLUGS` at index 1, `lib/constants.ts` (portal sidebar order, see §5.2) | yes |
| 5-8 | **All four route dispatchers.** See §6.1. Do not rely on `ENGINEERS.md` | yes, all four |
| 9 | `NON_CHANNEL_SLUGS` in `components/report-sections/report-generator/index.tsx` | yes, or the page is offered as a data channel |
| 10 | `clients.enabled_reports` for `renaissance` | yes, per environment, **after deploy** (§7) |
| 11 | Date-picker allow-list in both tab-navigation routes | **no change**, see §6.2 |
| 12 | Settings-page exclusion array, `app/dashboard/settings/page.tsx:170-172` | cosmetic, and note it is a global page |

Two switches that correctly need **no** entry, recorded so nobody rediscovers them as misses: `ai-summaries`' `NON_CHANNEL_SLUGS` is double-gated by `&& CHANNEL_META[slug]` (`ai-summaries/index.tsx:280`), and `resolveCommentaryView` has `default: return null` (`lib/commentary/views.ts:35-61`), which yields no commentary block, the intended outcome.

### 6.1 The four route dispatchers

A dispatcher is the `switch` that turns a report slug into a component. **There are four and a new page must be added to all four.**

`ENGINEERS.md:412` states there are two and names only the two deep-link routes. The two it omits are the ones real users hit.

| # | File | Serves | Reached by |
|---|---|---|---|
| 1 | `app/dashboard/[clientSlug]/reports/page.tsx` | internal, tab navigation | staff clicking the sidebar or a landing card. Also the sweep's dashboard probe |
| 2 | `app/portal/[clientSlug]/reports/page.tsx` | client portal, tab navigation | **clients clicking their sidebar. Real client traffic.** Not probed by the sweep |
| 3 | `app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx` | internal, direct link | deep links only. Not probed by the sweep |
| 4 | `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx` | client portal, direct link | deep links, and the sweep's portal probe |

Adding a `case` to each is purely additive. Every case returns unconditionally, no fallthrough exists in any of the four, and the `default` arms are unreachable for a handled slug.

**Nothing catches a missed one:**

- `tsc` cannot see it. No exhaustiveness assertion anywhere, `noImplicitReturns` off, and route #2 has no `default` arm at all.
- `tsc` is not in CI either. `check:rsc` and `npm test` do run on every PR (`.github/workflows/checks.yml:23`, `:35`).
- The sweep reports a miss as **green**. The route returns an empty Fragment, `HealthProbe` skips it because a Fragment's type is a Symbol not a function (`lib/health/probe.tsx:27-30`), the beacon emits an empty `sources` array, and `deriveStatus` returns `'ok'` (`lib/health/derive.ts:29-33`).

The sweep probes only #1 and #4 (`app/api/health/sweep/route.ts:73-81`), so #2 and #3 must be opened by hand. #2 matters most.

**This is a real failure mode, not hypothetical:** route #3 has no `demand-overview` case today, so that URL already renders blank for Avenue Z.

### 6.2 Date picker: the page has none

Both tab-navigation routes gate their date control on an allow-list of `activeSection` (`app/dashboard/[clientSlug]/reports/page.tsx:204-226`, `app/portal/[clientSlug]/reports/page.tsx:225-246`). Both deep-link routes render one unconditionally.

**No picker on the two tab-navigation routes.** The wireframe specifies a fixed 30-day period, and both comparable pages (`demand-overview`, `hubspot-performance`) omit it. Nothing is added to either allow-list. §4.4 explains why this makes internal range resolution mandatory rather than optional.

**The two deep-link routes render a picker unconditionally**, and that is a real defect, not cosmetic. `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx:143-145` renders `PortalReportDateRange` with no allow-list, and route #3 does the same. Since §4.4 makes the orchestrator ignore `dateRange`, a client on `/portal/renaissance/reports/executive-overview` can select "last 7 days", watch the URL change and the page remount, and see identical numbers. A control that moves and changes nothing is worse than no control.

**Decision: the page displays its period as static text and the deep-link picker is left alone.** Adding an allow-list to routes #3 and #4 would mean editing shared route code to suppress a control for one slug, which is the conditional-in-a-shared-branch pattern §4.1 rejects. Instead:

- The section renders `Last 30 days` as a small muted label above Block 1, matching the wireframe's period indication.
- The mismatch on routes #3 and #4 is recorded in §10. Those routes are deep-link only; no navigation in the product produces them.

This also closes a gap the wireframe cares about: without the label the page shows four blocks of 30-day numbers with nothing on screen naming the period, next to an AEO card that is year-to-date (§4.3).

---

## 7. Enablement

`enabled_reports` is data, not code. It does not travel with a git merge and must be run against each environment's database separately.

**Order matters: deploy the code first, then run the UPDATE.** The portal landing page maps `client.enabledReports` **raw**, not through `NAV_SLUG_ORDER`, and falls through to the bare slug when `REPORT_NAMES` has no entry (`app/portal/[clientSlug]/page.tsx:37-45`). Enable before deploying and a card reading literally `executive-overview` appears on Renaissance's client-facing landing page, linking to a section that renders nothing.

| Environment | Neon endpoint | Run when |
|---|---|---|
| dev | `ep-still-tree` | after local build, credentials in place |
| staging | `ep-restless-union` | after the branch deploys to staging. **Credentials not yet available locally** |
| production | `ep-green-violet` | after sign-off, with my explicit go-ahead. **Credentials not yet available locally** |

**If the staging UPDATE is skipped the page simply will not appear for the team reviewing there, which reads as a broken build rather than a missing data step.** That is the most likely way this goes wrong.

```sql
UPDATE clients
SET enabled_reports = array_append(enabled_reports, 'executive-overview')
WHERE slug = 'renaissance'
  AND NOT ('executive-overview' = ANY(enabled_reports));
```

Verified correct, idempotent and scoped: `enabled_reports` is `NOT NULL` with no default, so `array_append(NULL, …)` cannot occur; the guard makes a rerun a no-op; the `WHERE` touches one row.

Note `array_append` puts the slug **last**, so the portal landing card grid (which uses raw array order) shows Overview at the bottom. If that matters, write the ordered array explicitly instead.

**Do not use `npm run db:seed`.** It upserts each of its two seeded clients over 22 columns including `enabled_reports`, `hidden_reports` and `hubspot_token_env_var`, plus a users upsert that rewrites `role` (`scripts/seed.ts:131-177`). It is stale in both directions: its Avenue Z row would un-hide Paid Media, and its Renaissance row would strip `linkedin-ads`, `organic-social` and `paid-media`. The blast radius of that one command is larger than this entire PR.

`getClientBySlug` and `getAllClients` are cached 5 minutes with tag `db`. A raw SQL update bypasses `revalidateTag`, so expect a lag. That is the only consequence; no additional invalidation is needed.

Credential values go into the local gitignored `.env.local`, never into chat, a commit, or a doc.

---

## 8. Verification

- Sessions equals GA4's Sessions for a 30-day window ending **yesterday**. Today is deliberately excluded.
- Bounce rate, pages/session, conversion rate and average session duration match GA4 to the decimal. We format but never compute these.
- **Every KPI shows a delta.** A page of bare numbers means §4.4 was not followed.
- Traffic by Channel's **By Conversion** tab has rows. An empty tab means query 5 was issued without its full metric list.
- The channel drill-down expands. Empty means query 7 was not issued.
- Traffic by Channel shares will not match GA4 above ten channel groups, because the denominator is the top-10 sum. Compare raw per-channel counts instead.
- Share of voice renders a value. A blank means the brand lookup regressed to string matching.
- The header reads "RENAISSANCE" over "OVERVIEW", in that order, once. Two client names means the section rendered its own header.
- A period label reading "Last 30 days" is visible above Block 1.
- No "AI" badge and no generated-sounding sentence appears anywhere on the page (§4.7.1).
- Blocks 3 and 4 read "Salesforce not connected", never `$0` and never a dash.
- Open route #2 (portal tab navigation) by hand. The sweep never probes it and a blank page there reports green.
- Avenue Z's four pages are visually identical before and after.
- `npm run check:rsc` passes. It runs on every PR. **`tsc` is in no workflow**, so run it locally before pushing.
- Both cron functions still complete inside 60s.

---

## 9. Risks

| Risk | Mitigation |
|---|---|
| Deltas render blank, page does not match wireframe | §4.4 makes internal range resolution explicit and §8 checks for it. This was found by review, not by testing, and would have shipped |
| A missed dispatcher renders blank and reports green | All four listed in §6.1. #2 and #3 are unprobed and must be opened by hand |
| Copies drift from Avenue Z's originals | Accepted deliberately. Our copies export their prop types so `tsc` catches drift *within* this page; drift *from* the originals is silent. §10 lists the filenames to grep |
| Enable runs before deploy | §7 states the ordering and the exact client-visible symptom |
| Staging UPDATE skipped | §7 names it as the most likely failure and what it looks like |
| Health sweep exceeds 60s | Not caused by this PR, but this page is a heavy unit at the tail. §5.4 corrects the risk model: a timeout kills reporting for every client, not just the tail |
| `SHOW_LOCKED_REPORT_TEASERS` flipped later | §5.3 names the dependency and the duplicate-label problem it would create |

---

## 10. Follow-ups, not addressed here

Most are pre-existing and were found during investigation. The items marked **[introduced]** are consequences of decisions in this document, accepted deliberately rather than discovered.

**Correctness**
- The AEO card's delta compares the current incomplete ISO week against a full one, so it reads negative early in any week regardless of performance. Affects Avenue Z today.
- Contact loaders branch on hardcoded 2025 and 2026 only; any other year falls through to zeros silently. Everything CRM-fed stops working on 2027-01-01.
- Pipeline comparison years are integer literals duplicated across three files, same cliff.
- `closedate` year is parsed in server local time, so a UTC-midnight 1 January close date lands in the prior year west of UTC.
- The trend chart joins its compare series by array index rather than by date.
- Prior-year pacing shifts by calendar date rather than weekday, and returns 0 on any error.
- The dashboard deep-link route drops `dateRange`, so Inbound Funnel shows different numbers depending on which route reached it.
- The AEO card is year-to-date while the three beside it are 30-day. The row reads as one period and is not.
- `begin-health` has `demand-overview` and `peec-ai` enabled with `peec_customer_project_id` NULL, and `lib/peec/client.ts:380` falls back to `process.env.PEEC_AI_PROJECT_ID`, which is Avenue Z's project. That is the same class of bug §4.3 fixes for this page, live on another client today.

**Convention and hygiene**
- `NewReturning` renders an "AI" badge over deterministic string templating, ungated by `SHOW_AI_NARRATIVE` unlike every other narrative block. **Resolved for this page** by §4.7.1, which deletes both from our copy. Still live on Avenue Z's page, where the label is equally false and equally ungated. Worth raising with Paul; out of scope to fix here.
- `ENGINEERS.md:412` documents two dispatchers where there are four, and names the wrong two.
- The health sweep cannot detect a missing dispatcher case, and probes only two of four routes.
- `tsc` runs in no CI workflow.
- Route #3 has no `demand-overview` case, so that URL already renders blank for Avenue Z.
- Both deep-link routes are missing far more than one case. Route #3 lacks `demand-overview`, `peec-ai`, `paid-media` and `request-a-report`; route #4 lacks `paid-media` and several others. Whoever adds `executive-overview` to all four will notice the neighbours are missing. Fixing them is out of scope here.
- **[introduced]** Routes #3 and #4 render a date control this page ignores, so a selection there changes the URL and nothing else. §6.2 explains why suppressing it would mean editing shared route code for one slug. Deep-link only; no navigation in the product produces those URLs.
- `ExportPdfButton` on the portal tab route is `window.print()`. This page's journey cards keep their stats and sparkline collapsed until hover, so a printed copy shows four collapsed cards plus three charts. The Asana ticket says "PDF mockup" and the button sits in the header, so someone will click it early. Scope it or set expectations.
- Two slugs now map to the display name `Overview` (`demand-overview` and `executive-overview`). Nothing breaks, but any future reverse lookup from display name to slug is ambiguous.
- `components/report-sections/empty-state.tsx` has zero call sites and has never rendered.
- `ChannelTabsChart.compareLabel` and `ChannelVolumeRow.pct` are declared but never read.
- Contact email addresses are written to server logs from a production path.
- `demand-overview/signal-card.tsx` and `hubspot-performance`'s `CLOSED_STAGE_IDS` are unreferenced.

**Structural**
- HubSpot is the only integration without a per-client config object. Pipeline id, stage ids, the ICP property and the portal id are hardcoded in shared code, so any second CRM client renders silent zeros rather than an error.
- **[introduced]** The GA4 reshaping this page duplicates should eventually live in `lib/`, with both pages reading it.
- **[introduced] Copy drift.** Six UI files and ~233 lines of reshaping now exist twice, and nothing warns when one side is fixed. Whoever changes `ga4/sessions-trend-chart.tsx`, `ga4/new-returning.tsx`, `ga4/channel-tabs-chart.tsx`, `charts/kpi-card.tsx`, `demand-overview/demand-journey.tsx` or `empty-state.tsx` should grep `executive-overview/` for the same filename. Worth a note in `ENGINEERS.md` once this ships.
- **[introduced]** No progressive loading: one skeleton until all ten fetches settle. Splitting into independently-suspended blocks is an option if the page feels slow.
