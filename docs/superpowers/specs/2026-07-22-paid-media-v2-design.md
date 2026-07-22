# Paid Media v2: Technical Design

**Date:** 2026-07-22
**Branch:** `ave-z-reporting-paid-media-v2`
**PR:** #164 (base `dev`)
**Companion doc:** [decisions for approval](./2026-07-22-paid-media-v2-decisions-for-approval.md)
**Status:** For engineering review. No code written, nothing compiled.

## What this document is

The build design for all six requirements. For each: what exists today, what
changes, and how the new pieces are shaped. Three sections carry the actual design
work: **Rollup module design**, **Caching and performance**, and **Overview UI and
routing**.

## How far each claim has been verified

Three different levels, and the difference matters when reviewing.

| Claim type | Verification |
|---|---|
| Current behavior in the Req 1 to 6 sections and the constraints | **Swept.** A dedicated pass re-opened all 34 citations that existed before the design sections were added and checked each claim against the line. Six corrections were found and are applied |
| Current behavior cited in the three design sections | **Partially verified.** Roughly 115 further citations were added by those sections. All 149 unique references were confirmed to point at a real file and an in-range line, but the individual claims were not independently re-swept |
| The proposed types | **Compiled.** `MetricValue`, `ChannelRollup` and `toKpis` were written into a throwaway module and run through `tsc --noEmit` against the real `Kpi` type and the real `KpiGrid`. Clean. A negative control (feeding `Kpi.value` a boolean) produced the expected error, proving the check was reading the files rather than skipping them. This confirms the union compiles, `ChannelRollup` is exhaustive (an unhandled case fails the `never` check), `toKpis` returns valid `Kpi[]`, and `KpiGrid` consumes it with no change |
| The rest of the proposed design | **Unverified.** `getPaidMediaRollup` and its fetch orchestration, the caching design, the component tree beyond the `KpiGrid` handoff, and the blended arithmetic have not been executed. The arithmetic is stated with a worked example but has not been run against data |

The Cost / LPV defect under Req 4 is the one thing in this document proven by
execution rather than by reading.

Three further claims were explicitly out of the sweep's reach and remain unchecked:
the lint baseline under Out of scope, the PR reference in this header, and the `C3`
client-configuration table. `C3` came from a live database read and is load-bearing
for `D4`, so it should be re-run before that decision is taken.

## What is decided here, and what is not

Engineering decisions are **made** in this document and stated with their
rationale. Product decisions are **surfaced** as `D1` through `D10` and left for
the team, because they change what gets built rather than how. Five of them block
Requirement 1 outright.

Where a decision carries an engineering-cost difference, that difference is stated
so the team chooses with the cost visible.

---

## Sources

Two inputs, and they disagree in one place.

1. **Initial requirements** (six items, as given).
2. **"Questions for Paid Media Tab in Reporting"**, the stakeholder feedback doc.
   Dianna Gatto ran it, Amir Eldick answered for Paid Search, Greg Huepler for
   Paid Social. It covers Reqs 1 to 4 only. **Reqs 5 and 6 have no stakeholder
   input.**

The disagreement: the feedback doc assumes the three channels compute metrics
the same way. They do not. See "Cross-channel metric reality" below.

---

## Traceability

Each original question, what the stakeholders said about it, what that leaves
open, and where it is designed. The feedback doc is "Questions for Paid Media Tab
in Reporting"; quotes below are verbatim from it.

| # | The question as asked | What stakeholders settled | Left open | Designed in |
|---|---|---|---|---|
| 1 | Add an Overview subpage showing a rollup across Paid Search, Meta and LinkedIn | Metrics are Spend, Clicks, Leads, Cost per lead in that order (Greg's reorder). CTR dropped (Amir, Greg). Conversions dropped as duplicative (Greg). Both blended and stacked, all three "preferably both"; Greg: *"If it's not possible, all channels should be the default"*. Dianna on errors: a broken input feeding a formula must render NA *"so that it is not accidentally reported to the client with missing data"* | `D1` default landing · `D2` Meta lead definition · `D3` blended Clicks · `D4` missing-channel totals · `D5` commentary owner · `D10` blended CPL denominator | Rollup module · Caching · Overview UI |
| 2 | Total Leads at the top of Leads by Action and the bottom of Region to DMA, summing the subtotals | Amir widened it: *"for this and all tables on the Paid Search reporting tab, the table should have a total at the table"*. Amir also ruled the Req 3 filter out of scope for Leads by Action: *"The LEAD BY ACTION table does note feature any click data"* | `D6` scope · `D7` region total basis · `D8` plain sum vs de-duplicated. `D8` was formally assigned to Amir and never answered | Req 2 |
| 3 | Default the keyword table to Clicks >= 10 | Empty state: Dianna *"My thought would be a message but I'll defer to Amir"*; Amir aligned, offering *"keywords with more than 50 impressions"* only *"if it;s easier to implement logic"* | `D9` user-adjustable vs fixed cutoff | Req 3 |
| 4 | Investigate and verify Cost / LPV | Greg confirmed the formula: *"This metric is calculated as amount spent divided by landing page views"* | Nothing. Defect confirmed by execution, fix is one line | Req 4 |
| 5 | Top Regions by Spend should format as $X,XXX.XX | **No stakeholder input.** The feedback doc has no Req 5 section | Whether two-decimal currency is local to this chart or shared | Req 5 |
| 6 | Check LinkedIn for API issues | **No stakeholder input.** The feedback doc has no Req 6 section | Nothing. Resolved 2026-07-22: the Supermetrics connection had de-authed and was re-authenticated | Req 6 |

The feedback doc stops mid-Requirement 4. There is no Req 5 or Req 6 section in
it, so those two carry no stakeholder input at all.

One assumption in the feedback doc does not survive contact with the code. Asked
how metrics are reconciled across channels, Dianna answered *"I can't think of
anything that would be different here for how the metrics are calculated so I
don't think this will be an issue. Is there something specific you have in
mind?"* Three things are different. See `C4`.

---

## Cross-cutting constraints

These apply to more than one requirement and shape several decisions.

### C1. Two routes, not one

Every Paid Media change lands twice:

- `app/dashboard/[clientSlug]/reports/page.tsx` (internal)
- `app/portal/[clientSlug]/reports/page.tsx` (client-facing)

Both dispatch on `activeSection === 'paid-media'` and both carry their own page
title logic. A change applied to only one produces a section that behaves
differently for staff and clients.

### C2. The RSC boundary is CI-enforced

`npm run check:rsc` (`scripts/check-rsc-props.ts`) is a required check on every
PR. It fails the build when a function prop crosses from a Server Component to a
Client Component, because that is a render-time crash `tsc` and `next build` do
not catch on dynamically-rendered routes.

This is not theoretical for this work. `components/report-sections/meta-ads/geo-section.tsx`
is a Server Component (no `'use client'`), while
`components/report-sections/paid-search/geo-section.tsx` is a Client Component.
Req 5 sits in the Server one. Formatting must be passed as a serializable
descriptor, never a function.

### C3. Only one client is configured

Verified read-only against the dev database:

| Client | paid_search_config | meta_config | linkedin_config | leadActions |
|---|---|---|---|---|
| `renaissance` | yes | yes | yes | 8 |
| `avenue-z` | no | no | no | 0 |
| `begin-health` | no | no | no | 0 |
| `elix` | no | no | no | 0 |
| `elix-healing` | no | no | no | 0 |
| `kind-patches` | no | no | no | 0 |
| `love-bug` | no | no | no | 0 |

Renaissance is the only client with all three channels. Two consequences:

- Every change here is built and QA'd against a single client.
- "A channel has no data" is the **normal** case for six of seven clients, not
  an edge case. This materially changes Req 1's error handling (see `D4`).

### C4. Cross-channel metric reality

The feedback doc asked how metrics are reconciled across channels. Dianna
answered *"I can't think of anything that would be different here."* Three
things are:

| Metric | Paid Search | Meta | LinkedIn |
|---|---|---|---|
| Spend | field `Cost` (`lib/paid-search/kpis.ts:40`) | field `cost`, KPI key `spend` (`lib/meta/kpis.ts:23`, fetched at `:80`) | field `spend` (`lib/linkedin/kpis.ts:33`) |
| Clicks | `clicks`, all clicks (`lib/paid-search/kpis.ts:41`) | `inline_link_clicks`, **link clicks only** (`lib/meta/kpis.ts:37`) | `clicks`, all clicks (`lib/linkedin/kpis.ts:42`) |
| Leads | `Conversions` filtered to configured `leadActions[]` | **does not exist** | `oneClickLeads`, LinkedIn Lead Gen Forms only (`lib/linkedin/kpis.ts:65`) |
| Cost per lead | `cpl` (`lib/paid-search/kpis.ts:46`) | **does not exist** | `costPerLead` (`lib/linkedin/kpis.ts:66`) |

Three distinct problems, each with its own decision:

1. **Meta has no lead metric at all.** Its Supermetrics field list
   (`lib/meta/kpis.ts:79-91`) requests eleven fields, none a lead or conversion.
   `MetaConfig` is `{ metaAdAccountId }` only (`lib/db/schema.ts:57`), with no
   lead-action configuration. See `D2`.
2. **Clicks are not the same measure.** Meta reports link clicks; the other two
   report all clicks. Summing them produces a number with two definitions inside
   it. See `D3`.
3. **Leads are not the same event.** Paid Search leads are per-client configured
   conversion actions (`isLeadAction`, `lib/paid-search/base.ts:42`) tagged
   employer/broker/contact. LinkedIn leads are native Lead Gen Form submissions
   and exclude website conversions. See `D2`.

---

## Req 1: Paid Media Overview subpage

### Settled by stakeholders

- **Metrics: Spend, Clicks, Leads, Cost per lead**, in that order (Greg's
  explicit reorder).
- **CTR removed.** Amir: *"wouldn't include CTR"*. Greg: *"Remove CTR"*.
- **Conversions removed.** Greg: *"just use the 'leads' event, & remove
  'Conversions' to Amir's point"*.
- **Both blended and stacked.** All three said "preferably both". Greg's
  fallback if both is not feasible: all-channels blended is the default.
- Overview is for *"a holistic look of the brands lead volume and costs"*
  (Greg). Channel-specific events belong on channel pages.

### Current state

There is no Overview. `PAID_MEDIA_SUBSECTIONS` (`lib/constants.ts:174`) is:

```ts
{ id: null,       label: 'Paid Search'          },
{ id: 'meta',     label: 'Meta Advertising'     },
{ id: 'linkedin', label: 'LinkedIn Advertising' },
```

`id: null` is Paid Search. For `AEO_SUBSECTIONS` (`:159`) and `GA4_SUBSECTIONS`
(`:167`), `id: null` is Overview. Paid Media is the outlier.

Dispatch today (`app/dashboard/[clientSlug]/reports/page.tsx:72-75`):

```ts
case 'paid-media':
  if (subsection === 'meta')     return <MetaAdsReport ... />
  if (subsection === 'linkedin') return <LinkedInAdsReport ... />
  return <PaidSearchReport ... />   // fallthrough default
```

### The collision nobody has flagged yet

`lib/commentary/views.ts:38` maps commentary by the same key:

```ts
case 'paid-media':
  if (!subsection) return 'paid-search'
```

So `paid-media` with no subsection means **Paid Search** to the commentary
system. Putting Overview at `id: null` silently re-points Paid Search's
commentary block at the Overview. Existing `report_commentary` rows are keyed to
the `'paid-search'` view key, so they would surface on the wrong page.

`COMMENTARY_VIEWS` (`views.ts:48`) has seven canonical keys, each with an owner:
Paid Search is Amir, Meta and LinkedIn are Greg. An Overview has no key and no
owner. See `D5`.

### Implementation map

| # | File | Change |
|---|---|---|
| 1 | `lib/constants.ts:174` | Add Overview entry; move Paid Search to its own id |
| 2 | both route files | `PAID_MEDIA_SUBSECTION_NAMES` is **not** in `lib/constants.ts`. It is a local const duplicated at `app/dashboard/[clientSlug]/reports/page.tsx:99` and `app/portal/[clientSlug]/reports/page.tsx:136`. Add the new Paid Search id to both. A third instance of `C1` |
| 3 | `app/dashboard/[clientSlug]/reports/page.tsx:72` | Replace fallthrough with explicit Overview branch |
| 4 | `app/portal/[clientSlug]/reports/page.tsx:87` | Same, portal route (C1) |
| 5 | both route files | Page title: the hardcoded `'Paid Search'` default becomes `'Overview'` |
| 6 | `lib/commentary/views.ts:38` | Re-map `!subsection` per `D5` |
| 7 | `lib/meta/kpis.ts` | Add lead field to the Supermetrics fetch, per `D2` |
| 8 | `lib/paid-media/rollup.ts` (new) | Fetch all three channels, normalize, aggregate |
| 9 | `components/report-sections/paid-media-overview/` (new) | Blended KPI row + per-channel table |

Sidebars (`components/layout/sidebar.tsx:582`,
`components/layout/portal-sidebar.tsx:239`) render from
`PAID_MEDIA_SUBSECTIONS` directly, so they update from change 1 with no edit.

### Proposed module boundary

A new `lib/paid-media/rollup.ts` owning one job: call the three existing KPI
functions, normalize to a common shape, aggregate. It does not re-implement any
channel fetch. Each channel keeps owning its own data access.

```
getPaidMediaRollup(slug, dateRange, compareRange)
  → { blended: {spend, clicks, leads, cpl},
      channels: [{ channel, spend, clicks, leads, cpl, status }] }
```

`status` per channel is one of `ok | unconfigured | error`, which is what drives
`D4`. Deriving `cpl` as `spend / leads` at the rollup level rather than summing
per-channel CPLs is required for the blended figure to be correct; averaging
CPLs across channels is mathematically wrong when spend is uneven.

### Decisions

- **`D1`** Does Overview become the default landing for Paid Media, or does Paid
  Search stay the default with Overview as a sibling tab? Changes where existing
  bookmarks and links land.
- **`D2`** How is a Meta "lead" defined? Options: (a) mirror Paid Search with a
  `leadActions[]` array on `MetaConfig`, most architecturally consistent but adds
  a schema change plus a per-client config task; (b) adopt a single fixed Meta
  field for all clients, cheapest but assumes every client bids the same action;
  (c) ship Overview without Meta leads and show `NA`, unblocking everything else.
  Amir flagged this and it was never closed: *"Just depends of Meta is using any
  conversions actions in bidding other than Form Submissions."*
- **`D3`** Blended Clicks mixes Meta link clicks with all clicks elsewhere.
  Options: switch Meta to its `clicks` field for the rollup only; keep link
  clicks and footnote it; or label the column "Link Clicks" across the board.
- **`D4`** How does a channel that is unconfigured or erroring appear? Dianna
  answered only the derived-metric half: a broken input feeding a formula must
  render `NA` or erroring *"so that it is not accidentally reported to the client
  with missing data"*. That governs CPL. It does not say whether a blended Spend
  total excludes the channel, shows `NA` entirely, or renders zero. Per `C3`,
  six of seven clients hit this path immediately.
- **`D5`** Does the Overview get its own commentary block? If yes it needs a new
  `CommentaryViewKey` and a named owner. If no, `views.ts:38` must return `null`
  for the no-subsection case while Paid Search moves to its new id. Either way
  `views.ts` changes, and getting it wrong misfiles existing commentary.

---

## Req 2: Total Leads rows

### Settled by stakeholders

- The Clicks filter from Req 3 does **not** affect these totals. Amir: it *"was
  only for the Keywords table ... and not the LEAD BY ACTION table"*, and Leads
  by Action carries no click data.
- Amir widened the ask: *"for this and all tables on the Paid Search reporting
  tab, the table should have a total at the table."* That is broader than the two
  tables the original requirement named. See `D6`.

### Current state

**Leads by Action** (`components/report-sections/paid-search/leads-section.tsx:32`)
renders three category groups, each with a Subtotal row, and no grand total.

The math is already available and unambiguous. `transformLeads`
(`lib/paid-search/leads.ts:17-19`) builds `categoryTotals` and `totalLeads` from
the same `byAction` array, so `totalLeads` equals the sum of the three subtotals
exactly. No new computation, no new query.

**Region → DMA Breakdown**
(`components/report-sections/paid-search/geo-section.tsx:49`) renders
`rows.slice(0, 10)` (same file, `:14`) while `rows` holds every region. The KPI
card directly above shows the true `Total Regions` count (same file, `:33`). A total summing only
the ten visible rows would sit beneath a card advertising that more regions
exist. See `D7`.

### Implementation map

| # | File | Change |
|---|---|---|
| 1 | `components/report-sections/paid-search/leads-section.tsx:32` | Add a total row above the category groups, using existing `data.totalLeads` |
| 2 | `components/report-sections/paid-search/geo-section.tsx:49` | Add a `<tfoot>` total row, summing per `D7` |
| 3 | `lib/paid-search/leads.test.ts` | Assert total equals the sum of subtotals |

Both files are already Client Components (`'use client'` at line 1), so no RSC
constraint applies here.

### Decisions

- **`D6`** Does "all tables on the Paid Search tab" get totals, or only the two
  named? Taken literally it also covers the campaign table
  (`campaign-table.tsx`) and the keyword table (`keywords.tsx`). Scope difference
  is two files versus three, not four: `campaign-table.tsx:42-60` already builds a
  `totalsRow` and is the only `totalsRow` consumer in `components/report-sections/`.
  It is also the precedent for the shape: it re-derives rate columns (CTR, CPC, CPL,
  conversion rate) from the summed totals rather than averaging the per-row rates
  (`campaign-table.tsx:48-52`). `D7` and `D8` should be answered consistently with that.
- **`D7`** Does the Region → DMA total sum the ten visible rows or all regions?
  The requirement says "sum of the subtotals in the tables", which reads as the
  ten shown. The KPI card above showing a larger region count makes that look
  wrong to a client. A third option is showing both, for example
  `1,240 (top 10 of 34 regions)`.
- **`D8`** The feedback doc asked whether Total Leads is a plain sum or a
  de-duplicated count, flagging that one lead could appear across multiple
  DMAs or actions. Amir described the current table and requested totals but
  never addressed double-counting. Still genuinely unanswered. Note that for
  Leads by Action the risk is nil, since `totalLeads` and the subtotals derive
  from one array. For Region → DMA the concern is real, because a conversion
  attributed to multiple metro areas would be counted in each.

---

## Req 3: Default Clicks filter on the keyword table

### Settled by stakeholders

Empty-state behavior when nothing clears the threshold. Dianna preferred a
message. Amir aligned, then offered an alternative *"if it's easier to implement
logic"*: fall back to keywords with more than 50 impressions. Amir called the
case *"highly unlikely"*. The choice was explicitly handed to engineering.

### Current state

`components/report-sections/paid-search/keywords.tsx` renders `DataTable` with
`defaultSort` only. `components/charts/data-table.tsx` supports sorting and a
`totalsRow` prop, and has **no filtering of any kind**.

`keywords.tsx` is a Server Component. It already passes declarative `sortKey`
values rather than `sortValue` functions specifically because functions cannot
cross the RSC boundary (`data-table.tsx:10-16`). Any filter must follow the same
declarative pattern.

### Implementation map

Two viable shapes, and the requirement's wording decides between them.

**Option A, user-adjustable (matches "default filter view"):** add a declarative
filter prop to `DataTable`, for example
`defaultFilter?: { key: string; op: 'gte'; value: number }`, plus a small control
so the viewer can clear or change it. Touches a shared component used across the
app, so it needs a regression pass on other `DataTable` consumers.

**Option B, fixed cutoff:** filter `rows` inside `keywords.tsx` before passing
them down. Three lines, zero shared-component risk, but the viewer cannot see
sub-10-click keywords at all.

Option A matches the phrase "default filter view", which implies a default that
can be changed. Option B is cheaper and lower risk.

### Decisions

- **`D9`** Option A or Option B. And if A, does the control live on this table
  only or become a general `DataTable` capability?
- Empty-state behavior: message, or Amir's >50-impressions fallback. This is
  engineering's call per Amir, but it should be recorded rather than chosen
  silently, because the fallback changes what the client sees.

---

## Req 4: Cost / LPV

### Settled by stakeholders

Greg confirmed the formula in a comment: *"This metric is calculated as amount
spent divided by landing page views."* So expected is Spend ÷ Landing Page Views.

### Current state: confirmed defective

`lib/meta/kpis.ts:51-57` applies `Math.round()` to
`cost_per_landing_page_view`. That value is a small dollar figure, so rounding
destroys it. Verified by executing `transformMetaKpis` directly, not by reading:

| API value | Cost / LPV renders | CPC, identical input |
|---|---|---|
| `1.92` | `$2` | `$1.92` |
| `0.42` | `$0` | `$0.42` |
| `3.50` | `$4` | `$3.50` |
| `0.08` | `$0` | `$0.08` |
| `12.75` | `$13` | `$12.75` |

A real cost of 42 cents displays as `$0`.

CPM (`:42`) and CPC (`:43`) both use `+n(...).toFixed(2)`. Cost / LPV is the only
per-unit cost KPI using `Math.round`. It is also the only one the test file never
asserts on: `lib/meta/kpis.test.ts` covers spend, reach, engagement rate and CTR,
and its fixture carries `cost_per_landing_page_view: '1.92'` without checking the
output. That is why it survived.

### Implementation map

| # | File | Change |
|---|---|---|
| 1 | `lib/meta/kpis.ts:53` | `Math.round(...)` becomes `+(...).toFixed(2)`, matching CPM and CPC |
| 2 | `lib/meta/kpis.test.ts` | Add the missing assertion so it cannot regress |

### Open item

Greg confirmed the **semantics**, not the **source**. The code reads Meta's
`cost_per_landing_page_view` field rather than computing
`cost / landing_page_views`. Both inputs are already fetched (`lib/meta/kpis.ts:80` and `:88`).
Normally these agree. They can diverge on attribution-window differences. Worth a
one-time comparison against the live account before deciding whether to keep the
field or derive the value. Supermetrics access now exists (see Req 6), so this
comparison should be run before the fix ships.

---

## Req 5: Top Regions by Spend formatting

**No stakeholder input exists for this requirement.** The target format
`$X,XXX.XX` comes from the original requirements only.

### Current state

`components/report-sections/meta-ads/geo-section.tsx:52-57` renders `BarChart`
without any `valueFormat`, so Spend renders unformatted.

`BarChart` already accepts `valueFormat?: 'currency'`, a string descriptor
written specifically to survive the RSC boundary
(`components/charts/bar-chart.tsx:15-24`). Wiring it up is not sufficient on its
own: `usd()` (`lib/supermetrics/format.ts:1`) is
`'$' + Math.round(n).toLocaleString('en-US')`, which yields whole dollars. **No
two-decimal currency formatter exists in the codebase.**

### Implementation map

| # | File | Change |
|---|---|---|
| 1 | `lib/supermetrics/format.ts` | Add a two-decimal currency helper |
| 2 | `components/charts/bar-chart.tsx:21` | Extend `valueFormat` union with a second descriptor |
| 3 | `components/report-sections/meta-ads/geo-section.tsx:52` | Pass the new descriptor |

Per `C2`, the descriptor must stay a string. Passing a function from this Server
Component would fail `check:rsc` in CI.

### Open item

Whether two-decimal currency applies only to this chart or becomes shared. The
KPI card above it (`components/report-sections/meta-ads/geo-section.tsx:37`) uses whole-dollar `usd()`, so changing
only the chart makes one card and one chart on the same screen disagree on
precision.

---

## Req 6: LinkedIn API investigation (RESOLVED)

**Resolved 2026-07-22.** The LinkedIn connection on Supermetrics had de-authed
and was re-authenticated. Not a code defect, so nothing in `lib/linkedin/`
changes. Live Supermetrics access now exists.

Two consequences worth carrying forward.

### The failure was invisible to every monitoring surface we have

A stale Supermetrics connection is exactly the class of fault the platform
should surface, and it surfaced nowhere. It was found by a person opening the
page.

1. **The Connections page cannot report it.** `app/dashboard/connections/page.tsx:31-45`
   builds `connectionMap` from environment variables, and hardcodes
   `META`, `GOOGLE_ADS` and `LINKEDIN` to `false` under a "not yet integrated"
   comment. All three render `NOT_CONFIGURED` permanently, including for
   Renaissance where all three are live. The page cannot show a paid media
   connection as broken because it never shows one as working.
2. **The health sweep never reaches the subpages.** `app/api/health/sweep/route.ts:60-70`
   iterates `client.enabledReports` and never passes a subsection. The dashboard
   unit builds `?section=${report}` (`:68`); the portal unit uses a path segment,
   `/portal/<slug>/reports/<report>` (`:64`), with no `section` param at all.
   Either way `paid-media` resolves to the default subsection, which is Paid Search. The Meta and LinkedIn subpages are never
   probed, on either surface, so a fault confined to one of them is silent.

This also applies to the new Overview: unless the sweep is taught to enumerate
subsections, it will probe the Overview and nothing beneath it. Given `D1` moves
the default subsection, note that the sweep's coverage silently *changes* when
Overview takes `id: null`. It will begin probing the Overview and stop probing
Paid Search.

Tracked as a follow-up, not part of this work.

### Cost / LPV source comparison is now unblocked

Live Supermetrics access existing removes the blocker recorded under Req 4. The
one-time comparison of Meta's `cost_per_landing_page_view` field against a
locally computed `cost / landing_page_views` can now be run, and should be, before
the Req 4 fix ships. If the two agree, keep reading Meta's field. If they diverge,
Greg's confirmed definition (spend divided by landing page views) is authoritative
and we compute it ourselves.

---

## Rollup module design

The Overview needs one server-side module that fetches the four agreed metrics (Spend, Clicks, Leads, Cost per lead, in that order) from all three channels, normalizes them, and returns both the per-channel (stacked) rows and the blended top line. New directory `lib/paid-media/`, two files: `types.ts` and `rollup.ts`, plus `rollup.test.ts` for the pure transform. It follows the shape already used by `getPaidSearchKpis` / `getMetaKpis` / `getLinkedInKpis`: an exported pure transform plus a thin async fetcher, so the arithmetic is unit-testable without hitting Supermetrics (`lib/paid-search/kpis.ts:14`, `lib/meta/kpis.ts:13`, `lib/linkedin/kpis.ts:19`).

#### 1. Types

```ts
// lib/paid-media/types.ts
export type PaidChannel = 'paid-search' | 'meta' | 'linkedin'

/** A single metric. Never a bare number: an input can be missing (Dianna's rule). */
export type MetricValue =
  | { state: 'ok'; value: number }
  | { state: 'unavailable'; reason: string }

/** The four agreed metrics, in stakeholder order. */
export interface ChannelMetrics {
  spend: MetricValue
  clicks: MetricValue
  leads: MetricValue
  costPerLead: MetricValue
}

/** Per-channel status discriminant. `unconfigured` is the common case: only
 *  'renaissance' has all three configs set (lib/db/schema.ts:136-139). */
export type ChannelRollup =
  | { channel: PaidChannel; label: string; status: 'ok'; current: ChannelMetrics; compare: ChannelMetrics | null }
  | { channel: PaidChannel; label: string; status: 'unconfigured' }
  | { channel: PaidChannel; label: string; status: 'error'; error: 'timeout' | 'error' }

export interface PaidMediaRollup {
  /** Always length 3, always in fixed order: paid-search, meta, linkedin. */
  channels: ChannelRollup[]
  blended: ChannelMetrics
  blendedCompare: ChannelMetrics | null
  /** 'YYYY-MM-DD,YYYY-MM-DD' or null. Same window for all three channels. */
  compareIso: string | null
}
```

`ChannelRollup` is a discriminated union rather than a nullable-fields object so the UI cannot render a "0 spend" row for a client that simply has no Meta account. All fields are plain data (no functions), so passing a `PaidMediaRollup` from the Overview Server Component into a client table satisfies `scripts/check-rsc-props.ts`.

#### 2. Signatures

```ts
// lib/paid-media/rollup.ts

/** Pure. Given already-fetched channel results, produce the rollup. Unit-tested. */
export function buildRollup(
  channels: ChannelRollup[],
  compareIso: string | null,
): PaidMediaRollup

/** Fetcher. Same (slug, dateRange, compareRange) shape as every get*Kpis. */
export async function getPaidMediaRollup(
  slug: string,
  dateRange: string,
  compareRange: string | null,
): Promise<PaidMediaRollup>

/** Adapter for the KPI grid. Returns the four metrics in stakeholder order. */
export function toKpis(m: ChannelMetrics, compare: ChannelMetrics | null): Kpi[]
```

`toKpis` returns the existing `Kpi` type (`lib/paid-search/types.ts:3`), so the Overview reuses `KpiGrid` (`components/report-sections/paid-search/kpi-grid.tsx:4`) unchanged, exactly as the Meta and LinkedIn sections already do (`components/report-sections/meta-ads/index.tsx:4`, `components/report-sections/linkedin-ads/index.tsx:4`).

#### 3. Metric to source field mapping

| Metric | Paid Search (`AW`) | Meta (`FA`) | LinkedIn (`LIA`) |
|---|---|---|---|
| Spend | `Cost` (`lib/paid-search/kpis.ts:21`) | `cost` (`lib/meta/kpis.ts:23`, requested at `:80`) | `spend` (`lib/linkedin/kpis.ts:33`, requested at `:78`) |
| Clicks | `Clicks`, all clicks (`lib/paid-search/kpis.ts:21`) | `inline_link_clicks`, link clicks only, **depends on D3** (`lib/meta/kpis.ts:37`) | `clicks`, all clicks (`lib/linkedin/kpis.ts:42`) |
| Leads | `Conversions` rows filtered by `ConversionTypeName` against `paidSearchConfig.leadActions` (`lib/paid-search/kpis.ts:5-7`, `lib/paid-search/base.ts:42-44`) | none exists, **blocked on D2** (the 11 requested fields at `lib/meta/kpis.ts:79-91` contain no lead or conversion field; `MetaConfig` is `{ metaAdAccountId }` only, `lib/db/schema.ts:57-60`) | `oneClickLeads`, native Lead Gen Form submissions (`lib/linkedin/kpis.ts:65`) |
| Cost per lead | derived: `Cost / leads` | **blocked on D2** (no denominator) | derived: `spend / oneClickLeads` |

Two deliberate choices worth Paul's attention:

- Cost per lead is **derived in the rollup for every channel**, never taken from a vendor field. LinkedIn does expose `oneClickLeadsCost` and the LinkedIn page uses it (`lib/linkedin/kpis.ts:66`), but if the Overview took the vendor value while the blended line divides summed spend by summed leads, the stacked rows would not reconcile with the top line. Deriving everywhere keeps rows and total internally consistent. Expect small (cents-level) divergence between the Overview LinkedIn row and the LinkedIn page; call it out in the doc for Paul rather than hiding it.
- Rounding happens at render, not in the rollup. `getPaidSearchKpis` rounds CPL to whole dollars (`lib/paid-search/kpis.ts:25`); the rollup keeps full precision so summation is exact, and `toKpis` applies the same `Math.round` / `toFixed(2)` presentation the channel pages use.

#### 4. Blended figures

```ts
const contributing = channels.filter((c) => c.status === 'ok')
blended.spend  = sum(contributing, (c) => c.current.spend)
blended.clicks = sum(contributing, (c) => c.current.clicks)
blended.leads  = sum(contributing, (c) => c.current.leads)
blended.costPerLead = ratio(blended.spend, blended.leads) // total spend / total leads
```

Blended cost per lead is **total spend divided by total leads**, never the mean of the three channel CPLs. An unweighted mean answers a different question and is wrong whenever channel volumes differ, which they always do. Concretely: Paid Search $9,000 / 300 leads = $30, LinkedIn $1,000 / 5 leads = $200. Mean of CPLs is $115. The correct blended figure is $10,000 / 305 = $32.79. The mean would tell the client their real cost per lead is roughly 3.5x what it actually is.

`ratio(a, b)` returns `{ state: 'unavailable' }` when either input is unavailable or when the denominator is 0, matching the existing guard style where a zero denominator yields `undefined` rather than `Infinity` (`lib/paid-search/kpis.ts:24-26`).

#### 5. Dianna's error rule

Rule as stated: a metric whose input is missing must render NA, not silently contribute zero. Implementation is the `MetricValue` union plus two propagation rules.

1. **Sum propagation.** `sum()` over contributing channels returns `unavailable` if any contributing channel's value for that metric is `unavailable`. It does not skip and keep going, because a skipped channel is arithmetically identical to contributing zero, which is the exact failure mode Dianna described.
2. **Ratio propagation.** `ratio()` returns `unavailable` if either operand is `unavailable`. So if D2 resolves to "Meta has no leads metric" and Meta is configured for the client, blended Leads is `unavailable`, and blended Cost per lead is therefore `unavailable` too, while blended Spend and Clicks stay `ok`. That is the correct outcome: we can honestly total spend across three channels but we cannot honestly total leads across a channel that does not report them.

Status interacts with propagation as follows:

| Channel status | Contributes to blended? | Effect on blended |
|---|---|---|
| `unconfigured` | no | none. Absence of a configured account is not missing data, it is no account. |
| `ok` with an `unavailable` metric | yes | that blended metric becomes `unavailable`, and anything derived from it does too |
| `error` | yes, as a taint | the four blended metrics become `unavailable` with reason naming the channel |

The `error` row is the conservative reading of Dianna's rule: a channel that failed to load may well have had spend and leads, so a total that silently omits it is understated in exactly the way she asked us to prevent. Flagged as an open question in case Paul prefers a partial total with an explicit "excludes Meta (failed to load)" caveat line.

Rendering an `unavailable` metric through `toKpis`:

```ts
{ key: 'costPerLead', label: 'Cost / Lead', value: 'NA', delta: undefined, tooltip: reason }
```

Note the `prefix` and `suffix` must be **omitted**, not passed. `KpiCard` renders `prefix` unconditionally ahead of the value (`components/charts/kpi-card.tsx:50-51`), so leaving `prefix: '$'` on an NA metric renders `$NA`. The LinkedIn Reach card already handles this correctly by conditionally dropping `suffix` when reach is unavailable (`lib/linkedin/kpis.ts:50-54`), and the same conditional applies here.

#### 6. Compare-period deltas

All three channels already resolve compare ranges **identically**: `resolveCompareIso` in `lib/paid-search/base.ts:37-40`, `lib/meta/base.ts:31-34`, and `lib/linkedin/base.ts:31-34` are three byte-identical wrappers around the single `deriveCompareRange` in `lib/ga4/client.ts:54-81`. There is no per-channel divergence to reconcile. The rollup therefore resolves the compare window **once**, importing `deriveCompareRange` directly rather than picking one channel's wrapper (which would imply a dependency that does not exist), and passes the resulting `'YYYY-MM-DD,YYYY-MM-DD'` string to all three fetchers. That guarantees the stacked rows and the blended line all compare against the same window.

Default compare mode is `previous_period` when the caller passes null, matching the existing paid media sections (`components/report-sections/paid-search/index.tsx:45`, `components/report-sections/meta-ads/index.tsx:37`).

Deltas are computed from blended totals per period, not by averaging per-channel deltas, for the same weighting reason as blended CPL. The delta helper matches the existing one (`lib/paid-search/kpis.ts:9-12`): `undefined` when the prior value is missing or 0, so a delta card simply does not render. Two additional guards:

- If the current or the compare `MetricValue` is `unavailable`, delta is `undefined`. Never show a percentage change computed against a partial base.
- Channel membership must match across periods. If a channel is `ok` in the current period and `error` in the compare period, the blended compare metrics are `unavailable` under rule 3 above, so no delta renders. This prevents a "spend up 40%" reading that is really just one channel dropping out of the denominator.

Delta direction: Cost per lead carries `invertDelta: true`, consistent with `cpl` on Paid Search (`lib/paid-search/kpis.ts:46`) and `costPerLead` on LinkedIn (`lib/linkedin/kpis.ts:66`).

#### 7. Concurrency and failure isolation

`getPaidMediaRollup` never throws (except on an unknown slug). Structure:

```ts
export async function getPaidMediaRollup(slug, dateRange, compareRange) {
  const client = await getClientBySlug(slug)
  if (!client) throw new Error(`Unknown client: ${slug}`)

  const compare = compareRange ?? 'previous_period'
  const r = deriveCompareRange(dateRange, compare)
  const compareIso = r ? `${r.startDate},${r.endDate}` : null

  const [ps, meta, li] = await Promise.all([
    safeChannel('paid-search', client, () => fetchPaidSearch(slug, dateRange, compareIso)),
    safeChannel('meta',        client, () => fetchMeta(slug, dateRange, compareIso)),
    safeChannel('linkedin',    client, () => fetchLinkedIn(slug, dateRange, compareIso)),
  ])

  return buildRollup([ps, meta, li], compareIso)
}
```

`safeChannel` is the `safe()` wrapper from the section index files (`components/report-sections/paid-search/index.tsx:16-22`, identical at `components/report-sections/meta-ads/index.tsx:10-16` and `components/report-sections/linkedin-ads/index.tsx:10-16`) with the `unconfigured` branch added, discriminating timeout via `SmTimeoutError` (re-exported from `lib/supermetrics/client.ts:16`):

```ts
async function safeChannel(
  channel: PaidChannel,
  client: Client,
  run: () => Promise<{ current: ChannelMetrics; compare: ChannelMetrics | null }>,
): Promise<ChannelRollup> {
  if (!isConfigured(channel, client)) return { channel, label: LABEL[channel], status: 'unconfigured' }
  try {
    return { channel, label: LABEL[channel], status: 'ok', ...(await run()) }
  } catch (e) {
    return { channel, label: LABEL[channel], status: 'error', error: e instanceof SmTimeoutError ? 'timeout' : 'error' }
  }
}
```

`isConfigured` checks `client.smApiKeyEnvVar` plus the channel's config column: `paidSearchConfig`, `metaConfig?.metaAdAccountId`, `linkedinConfig?.linkedinAdAccountId` (`lib/db/schema.ts:136-139`). This check must run **before** the base wrapper is called, for two reasons. First, the base wrappers throw a generic `Error` on a missing config (`lib/paid-search/base.ts:15`, `lib/meta/base.ts:14`, `lib/linkedin/base.ts:14`), which `safe()` classifies as `'error'` and the UI renders as "Couldn't load this section", the wrong message for the common case. Second, `getPaidSearchKpis` reaches the config through a double non-null assertion (`lib/paid-search/kpis.ts:53`), which throws a bare TypeError for an unconfigured client. Checking first turns six of seven clients from an error state into a clean "not connected" state.

Fan-out: three channels in parallel, each internally running `Promise.all` over current and compare, so at most 8 Supermetrics requests in flight (Paid Search issues two per period: a totals query and a `ConversionTypeName` breakdown, mirroring `lib/paid-search/kpis.ts:55-60`). Meta and LinkedIn issue one per period. Each request already carries its own 15s hang guard and retry logic inside `smQuery`.

The Overview section component then wraps `getPaidMediaRollup` in the same `safe()` it uses for everything else, so even a bug in the rollup itself degrades to the existing `Fallback` card rather than taking down the page.

---

## Caching and performance

The Overview fans out to three vendors in one render, so it is the slowest page in the section by construction. None of the three paid media libraries caches anything today. This subsection states what the shared cache helper gives us, what the current state actually is, and what the Overview should do.

#### What `lib/cache.ts` provides

`cached()` (`lib/cache.ts:42-104`) wraps an async fetcher in Next's `unstable_cache` and adds PERF logging.

```ts
cached<TArgs, TRet>(vendor: string, fn: string, impl: (...a: TArgs) => Promise<TRet>, options?)
```

| Option | Default | Behavior |
|---|---|---|
| `version` | `'v1'` (`lib/cache.ts:53`) | Bumped when response shape or fetch logic changes; part of the key |
| `ttlSeconds` | `3600` (`lib/cache.ts:54`) | Passed as `revalidate` to `unstable_cache` (`lib/cache.ts:68`) |
| `tags` | none | Next cache tags for `revalidateTag()` invalidation |
| `extractTags` | none | PERF-log labels only; does NOT affect the cache key |

Key derivation has two halves. The static half is the `keyParts` array `[vendor, fn, version]` (`lib/cache.ts:67`). The dynamic half is the serialized argument list. The wrapper prepends a `today` value, `new Date().toISOString().slice(0,10)`, as an extra leading argument (`lib/cache.ts:73`, `lib/cache.ts:86`), and `implWithMarker` strips it back off before calling the real impl (`lib/cache.ts:61-62`). Net effect: every cache entry is scoped to a calendar day. That matters here because date range values are relative tokens like `last_30_days` that resolve to a different window each day inside the fetcher (`lib/paid-search/base.ts:18`), so without the `today` arg the same key would return yesterday's window.

Bypass: setting `CACHE_DISABLE=1` makes `cached()` return `timed()` instead, so PERF logs still emit and the cache layer disappears entirely (`lib/cache.ts:26`, `lib/cache.ts:49-51`). Hit/miss is reported honestly via an `AsyncLocalStorage` marker flipped only when the impl actually runs (`lib/cache.ts:29`, `lib/cache.ts:59-60`, `lib/cache.ts:90`).

Convention across existing consumers: wrap the lowest-level vendor call, name it `<thing>Impl`, export the wrapped version. `ga4Query` wraps `ga4QueryImpl` with `extractTags: ([params]) => ({ client: params.clientSlug, dateRange: params.dateRange })` (`lib/ga4/client.ts:149-156`). `getGSCOverview` does the same keyed on `clientSlug` (`lib/gsc/client.ts:201-208`). HubSpot wraps eighteen fetchers with a shared `byClient` extractor (`lib/hubspot/client.ts:1340-1357`).

#### Current situation for paid media

No file under `lib/paid-search`, `lib/meta`, or `lib/linkedin` imports `@/lib/cache`. A repo-wide grep for `lib/cache` returns hits in screaming-frog, pr-proof, bigquery, hubspot, ga4, profound (x2), content-calendar, gsc, sitebulb, db/queries, organic-social, and peec (x6), and nothing in the three paid media libraries. Every Supermetrics request the paid media section makes goes to the vendor on every render.

Call volume per render today:

| Surface | Supermetrics calls | Evidence |
|---|---|---|
| Paid Search KPIs | 4 (totals + conversions-by-type, each x current/compare) | `lib/paid-search/kpis.ts:56-59` |
| Meta KPIs | 2 (current + compare) | `lib/meta/kpis.ts:96-97` |
| LinkedIn KPIs | 2 (current + compare) | `lib/linkedin/kpis.ts:95-96` |

Across all of `lib/paid-search` there are 15 non-test `awQuery` call sites, 6 `metaQuery` sites in `lib/meta`, and 5 `linkedinQuery` sites in `lib/linkedin`, so the existing channel pages are already uncached at meaningful volume. The Overview adds a page that touches all three vendors at once.

#### Recommended design: cache the leaves, not the rollup

Wrap the three channel query functions, not the assembled rollup:

- `awQuery` (`lib/paid-search/base.ts:6`)
- `metaQuery` (`lib/meta/base.ts:5`)
- `linkedinQuery` (`lib/linkedin/base.ts:5`)

Each becomes `<x>QueryImpl` plus a `cached('paid-search' | 'meta' | 'linkedin', '<x>Query', impl, { version: 'v1', extractTags: ([slug, , dateRange]) => ({ client: slug, dateRange }) })` export, matching `ga4Query`. Default TTL of 3600s stands; it lines up with the hourly cache-warm cron.

Cache key composition falls out of the existing signatures, which are all `(slug, fields, dateRange, opts)`:

| Key component | Source | Why it is needed |
|---|---|---|
| `vendor` + `fn` + `version` | `cached()` keyParts, `lib/cache.ts:67` | Separates channels and busts on logic change |
| `today` | prepended arg, `lib/cache.ts:73` | Relative range tokens resolve per-day |
| `slug` | arg 0 | Client isolation |
| `fields` | arg 1 | Distinguishes totals vs breakdown queries |
| `dateRange` | arg 2 | Covers both current and compare windows |
| `opts` (filters/settings/maxRows) | arg 3 | Distinguishes filtered variants, e.g. the keyword table's clicks filter |

Compare range needs no separate key dimension. `resolveCompareIso` turns the compare mode into an ISO range string and the caller passes it into the same `dateRange` parameter (`lib/paid-search/base.ts:36-39`, `lib/paid-search/kpis.ts:58-59`). Compare is just another value of an argument already in the key.

One efficiency wrinkle worth knowing: the current window is passed as the raw token (`last_30_days`) while the compare window is passed already resolved to ISO. Yesterday's `last_30_days` entry and today's explicit ISO entry for the same dates are two entries. That is duplicated work, not wrong data. Normalizing both to ISO before the cached boundary would collapse them; it is optional and can be a follow-up.

#### Cross-client key collisions

CLAUDE.md records a previous cross-client cache-key collision in the Triple Whale grouped/series adapter. The root cause there is structural: `twDataKey` takes `apiKey` and `shopId` as explicit arguments and must remember to fold both into the key, hashing the key with `keyHash` (`lib/dashboard/adapters/triplewhale.ts:11`, `:14-15`, `:109`, `:113`). Anything the author forgets to append is a silent collision across tenants.

The paid media wrappers do not have that shape. `slug` is argument 0 and the credentials are resolved from it inside the impl: `getClientBySlug(slug)` then `cfg.googleAdsAccountId` and `process.env[client.smApiKeyEnvVar]` (`lib/paid-search/base.ts:12-17`, same pattern at `lib/meta/base.ts:11-15` and `lib/linkedin/base.ts:11-15`). Because the account id and API key are derived downstream of a key component rather than passed alongside it, two clients cannot share a key. This is also why the API key must never be hoisted into the wrapper's arguments as a refactor: doing so would recreate the Triple Whale failure mode and would put a secret into a cache key. If a client's ad account id is ever changed in the DB, bump `version` (or use a tag) rather than relying on key structure.

#### Rollup vs leaves: the trade-off

Caching the leaves is better here, for three reasons.

1. Sharing. The Overview and the Meta page both go through `metaQuery`. A leaf cache means the Overview's fetch warms the channel page and the reverse. A rollup cache is a separate key space that duplicates the same vendor bytes.
2. Partial failure. Stakeholder direction is that a broken input metric must surface as NA rather than silently reaching the client. A cached rollup would either persist an error hole for a full hour or have to be skipped on any partial failure, which means it barely caches on exactly the days it matters. With leaf caching, the two healthy channels are still served from cache and only the broken one re-attempts.
3. Unconfigured channels are the common case. Only `renaissance` has all three configured; the wrappers throw synchronously on missing config before any fetch, so there is nothing worth caching at rollup level for six of seven clients.

The cost of leaf caching is that the assembly work (summing spend and leads, dividing for cost per lead) reruns on every request. That is arithmetic over a handful of rows, sub-millisecond, and not worth a second cache layer.

#### Cache-warm cron

`vercel.json` schedules `/api/cache-warm` at `30 * * * *`, hourly. The route builds its URL list from `client.enabledReports` and pushes exactly two URLs per report, the portal page and the dashboard page, plus subsection URLs only for reports listed in `DASHBOARD_SUBSECTIONS` (`app/api/cache-warm/route.ts:96-110`). That map currently contains only `peec-ai` (`app/api/cache-warm/route.ts:32-34`).

Consequences, all of which need action:

- The Overview would not be warmed by default. If it follows the AEO and GA4 convention and takes `id: null` in `PAID_MEDIA_SUBSECTIONS` (`lib/constants.ts:174-178`), the bare dashboard URL will start resolving to the Overview instead of Paid Search. That silently swaps which paid media page gets warmed, and it makes the slowest page the warmed one, which is fortunate but accidental.
- Paid Search, Meta, and LinkedIn subsections are warmed by nobody once Overview takes the null slot. Fix by adding `'paid-media': ['paid-search', 'meta', 'linkedin']` to `DASHBOARD_SUBSECTIONS`.
- The portal surface never gets a `subsection` param at all (`app/api/cache-warm/route.ts:101`), so portal paid media subsections stay cold regardless. If clients land on the portal Overview, the portal URL push needs the same subsection loop as the dashboard one.
- Warm cost scales. With leaf caching in place, warming Overview plus three subsections mostly hits already-warm leaves, so the added wall time is small. The route runs all URLs through one `Promise.all` and sets `maxDuration = 60` (`app/api/cache-warm/route.ts:27`, `:112`).

#### Worst-case latency

From `lib/supermetrics/client.ts`: per-request hang guard `REQUEST_TIMEOUT_MS = 15000` enforced with `AbortController` (`:25`, `:35`), async polling at `pollMs = 1500` with `maxPolls = 40` for a stated ~60s ceiling (`:63-64`), and HTTP 429 retry up to 3 attempts sleeping `min(Retry-After, 10)` seconds each (`:39-43`). The in-code note says a healthy query responds in about 3s (`:20-22`).

A cold Overview issues roughly 8 concurrent Supermetrics calls if it reuses the existing KPI fetchers: 4 for Paid Search, 2 for Meta, 2 for LinkedIn. They run concurrently, so wall time is the slowest single call, not the sum.

| Scenario | Estimated page latency | Basis |
|---|---|---|
| Warm (all leaves cached) | render only, no vendor round trip | `lib/cache.ts:86` returns from the data cache |
| Cold, all channels healthy | ~3 to 5s | ~3s per call, concurrent (`lib/supermetrics/client.ts:20-22`) |
| Cold, one channel hung | ~15s | abort at `REQUEST_TIMEOUT_MS`, and `Promise.all` waits for it |
| Cold, one channel rate limited | up to ~45s | 3 retries x up to 10s sleep plus request time (`:39-43`) |
| Cold, one channel on the async path | 60s or more, then `SmTimeoutError` | 40 polls x 1500ms of sleeps alone (`:63-64`), plus per-poll request time |

The async-path row is the real risk. 8 concurrent calls on a single per-client API key is exactly the traffic shape that provokes 429s and queued responses, and neither report page sets a `maxDuration` route segment config, so the platform default applies rather than anything we chose. Two mitigations, both cheap:

1. Pass tighter `opts` to `smQuery` for the Overview's fetches. The helper already accepts `{ pollMs, maxPolls, timeoutMs }` (`lib/supermetrics/client.ts:60`), so the Overview can fail fast to NA instead of hanging while the channel pages keep the generous budget.
2. Keep the existing per-fetch `safe()` wrapper pattern so one rejected channel renders a fallback rather than crashing the page (`components/report-sections/meta-ads/index.tsx:10`, `:38-41`). Note this bounds blast radius, not latency: `Promise.all` still waits for the abort.

---

## Overview UI and routing

The Overview is a new Paid Media subsection rendered by a new section folder,
`components/report-sections/paid-media-overview/`. It follows the three sibling
sections exactly: one async RSC entry point, `safe()` + `Fallback` around every
fetch, `SharedPartsHeader` first, presentational children below.

#### 1. Component tree

```
components/report-sections/paid-media-overview/
  index.tsx                  RSC entry (PaidMediaOverviewReport). Fetches the three channels in
                             one Promise.all, renders header, blended row, breakdown table, notes.
  blended-kpis.tsx           The combined top line: 4 KpiCards (Spend, Clicks, Leads, Cost / Lead).
  channel-breakdown-table.tsx The stacked view: one DataTable row per channel plus a totals row.
  channel-notes.tsx          Per-channel footnotes: not-configured, errored, or metric-not-available.
  overview-empty.tsx         All-three-unconfigured state, wraps the shared EmptyState.
```

Data assembly (`getPaidMediaOverview`) lives in `lib/paid-media/overview.ts` and is
the data section's contract, not a component. This section only consumes it.

Why these five files and not fewer: the three existing sections each keep the entry
point free of markup beyond composition (`components/report-sections/meta-ads/index.tsx:44-51`),
and each visual unit is its own file (`kpi-grid.tsx`, `creative-table.tsx`,
`geo-section.tsx`). Same split here.

#### 2. Server vs client boundaries

| File | Kind | Why |
|---|---|---|
| `index.tsx` | Server (async) | Awaits `getPaidMediaOverview`, same shape as `MetaAdsReport` (`components/report-sections/meta-ads/index.tsx:28-42`). |
| `blended-kpis.tsx` | Server | Pure markup over `KpiCard`, which is itself a Server Component (`components/charts/kpi-card.tsx` has no `'use client'`). |
| `channel-breakdown-table.tsx` | Server | Renders the already-client `DataTable` (`components/charts/data-table.tsx:1`). Formatting is done server-side into strings, so nothing but serializable props crosses. |
| `channel-notes.tsx` | Server | Static text. |
| `overview-empty.tsx` | Server | `EmptyState` is a Server Component (`components/report-sections/empty-state.tsx:9`) rendering a `next/link`. |

No new Client Component is needed. The Overview has no interactive state of its own:
sorting is owned by `DataTable`, and the date range is owned by the existing
`GA4DatePicker` in the route header (`app/dashboard/[clientSlug]/reports/page.tsx:202-206`).

**Where `check:rsc` bites.** `scripts/check-rsc-props.ts` (wired as `check:rsc` in
`package.json:10`) fails the build if a non-`'use client'` file passes a function prop
to a Client Component. Two live hazards here:

1. `DataTable` accepts `sortValue?: (row) => number | string`
   (`components/charts/data-table.tsx:16`). A Server Component must never set it. Use
   the declarative pair instead: `sortKey` plus `sortType: 'number' | 'string'`
   (`components/charts/data-table.tsx:10-14`), which `columnSortAccessor` turns back
   into a comparator inside the client bundle
   (`components/charts/data-table.tsx:24-37`). This is exactly what
   `components/report-sections/paid-search/campaign-table.tsx:7-14` and `components/report-sections/paid-search/keywords.tsx:5-13` already do:
   display strings in `key`, raw numbers in a parallel `_`-prefixed field named by `sortKey`.
2. If a bar or line chart is ever added to the Overview, `components/charts/bar-chart.tsx:1`
   is `'use client'` and takes formatter-shaped props. The current design avoids charts
   entirely, which keeps the Overview off that path.

Formatting therefore happens server-side with the shared helpers `usd`, `num`, `pct`
from `lib/supermetrics/format.ts`, producing strings before they cross.

#### 3. Props

Types consumed from the data layer (`lib/paid-media/overview.ts`):

```ts
export type PaidMediaChannel = 'paid-search' | 'meta' | 'linkedin'

export interface ChannelTotals {
  spend: number
  clicks: number
  /** null when the channel cannot report leads at all (Meta). */
  leads: number | null
  /** null when leads is null or 0. Never a divide-by-zero artifact. */
  costPerLead: number | null
  /** Prior-period percent deltas, undefined when there is no comparison. */
  delta?: { spend?: number; clicks?: number; leads?: number; costPerLead?: number }
}

export type ChannelResult =
  | { status: 'ok'; totals: ChannelTotals }
  | { status: 'not_configured' }
  | { status: 'error'; kind: 'timeout' | 'error' }

export interface BlendedTotals {
  /** null means "NA": at least one contributing channel failed (Dianna's rule). */
  spend: number | null
  clicks: number | null
  leads: number | null
  costPerLead: number | null
  /** Channels that errored, so the UI can name them in the tooltip. */
  degraded: PaidMediaChannel[]
  /** Channels excluded from leads / cost-per-lead because they cannot report leads. */
  leadExcluded: PaidMediaChannel[]
}

export interface PaidMediaOverviewData {
  channels: Record<PaidMediaChannel, ChannelResult>
  blended: BlendedTotals
}
```

Component props:

```ts
// index.tsx
export async function PaidMediaOverviewReport(props: {
  clientSlug: string
  dateRange?: string          // default 'last_30_days'
  compareRange?: string | null // default null, coerced to 'previous_period'
}): Promise<React.ReactElement>

// blended-kpis.tsx
export function BlendedKpis({ blended }: { blended: BlendedTotals }): React.ReactElement

// channel-breakdown-table.tsx
export function ChannelBreakdownTable({
  channels,
  blended,
}: {
  channels: Record<PaidMediaChannel, ChannelResult>
  blended: BlendedTotals
}): React.ReactElement

// channel-notes.tsx
export function ChannelNotes({
  channels,
  blended,
}: {
  channels: Record<PaidMediaChannel, ChannelResult>
  blended: BlendedTotals
}): React.ReactElement | null

// overview-empty.tsx
export function OverviewEmpty({
  clientSlug,
  isPortal,
}: { clientSlug: string; isPortal?: boolean }): React.ReactElement
```

`index.tsx` signature matches the siblings byte for byte
(`components/report-sections/linkedin-ads/index.tsx:28-36`), so both route files can
call it with the same argument list they already pass to `PaidSearchReport`.

`BlendedKpis` maps straight onto the existing `Kpi` shape
(`lib/paid-search/types.ts:3`) and can reuse `KpiGrid`
(`components/report-sections/paid-search/kpi-grid.tsx:4`), which both Meta and
LinkedIn already import from the paid-search folder
(`components/report-sections/meta-ads/index.tsx:4`). Building four `Kpi` objects and
passing them to `KpiGrid` gives the four-across grid for free and keeps the "NA" case
expressible, since `Kpi.value` is `number | string` and `tooltip` already exists
(rendered at `components/charts/kpi-card.tsx:36-46`). That is the same trick LinkedIn
already uses: when Reach is unavailable it sets `value` to the single-character dash
placeholder rather than a number (`lib/linkedin/kpis.ts:38`, and again for Frequency
at `:50`). The Overview should reuse that exact placeholder so an unavailable metric
looks identical across the section.

#### 4. Routing changes

| File | Change |
|---|---|
| `lib/constants.ts:174-178` | `PAID_MEDIA_SUBSECTIONS` becomes `[{ id: null, label: 'Overview' }, { id: 'paid-search', label: 'Paid Search' }, { id: 'meta', ... }, { id: 'linkedin', ... }]`. Matches `AEO_SUBSECTIONS` (`lib/constants.ts:158`) and `GA4_SUBSECTIONS` (`lib/constants.ts:166`), which both use `id: null` for Overview. |
| `app/dashboard/[clientSlug]/reports/page.tsx:72-75` | In the `case 'paid-media'` branch add `if (subsection === 'paid-search') return <PaidSearchReport .../>` and change the fallthrough return to `<PaidMediaOverviewReport clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />`. Add the import next to line 12. |
| `app/dashboard/[clientSlug]/reports/page.tsx:99-102` | `PAID_MEDIA_SUBSECTION_NAMES` gains `'paid-search': 'Paid Search'`. |
| `app/dashboard/[clientSlug]/reports/page.tsx:167-168` | Title fallback flips from `'Paid Search'` to `'Paid Media'` (or `'Overview'`; pick one and use it in both routes). Today a bare `?section=paid-media` titles the page "Paid Search". |
| `app/dashboard/[clientSlug]/reports/page.tsx:202-206` | No change. The date picker is already rendered for every `paid-media` subsection, Overview included. |
| `app/portal/[clientSlug]/reports/page.tsx:87-90` | Same dispatch change as the dashboard route. Import next to line 12. |
| `app/portal/[clientSlug]/reports/page.tsx:136-139` | Same `PAID_MEDIA_SUBSECTION_NAMES` addition. |
| `app/portal/[clientSlug]/reports/page.tsx:204-205` | Same title fallback change. |
| `app/portal/[clientSlug]/reports/page.tsx:218-222` | No change, date picker already unconditional for `paid-media`. |
| `components/layout/sidebar.tsx:582` | **No edit.** It maps `PAID_MEDIA_SUBSECTIONS` and derives active state with `sub.id === null ? !activeSubsection : activeSubsection === sub.id` (`components/layout/sidebar.tsx:588-590`), so the new item and the new `paid-search` id work unchanged. |
| `components/layout/portal-sidebar.tsx:239` | **No edit**, same derivation at `components/layout/portal-sidebar.tsx:244`. |

Two consequences worth calling out to Paul:

- The bare URL `?section=paid-media` (what the sidebar parent link emits,
  `components/layout/sidebar.tsx:568`) now lands on the Overview instead of Paid Search.
  That is the intended behavior and it matches AEO and GA4, but any bookmark or
  saved deep link that assumed "no subsection means Paid Search" moves.
- `visibleSubsections` always keeps the `id: null` item (`lib/constants.ts:149-156`),
  so Overview cannot be hidden per client, while Paid Search becomes hideable via
  `hiddenReports`. `hiddenReports` is typed `ReportSlug[]` (`lib/db/schema.ts:142`) and
  `'paid-search'` is not a member of `ReportSlug` (`lib/db/schema.ts:8-37`). The route
  comparison casts (`app/dashboard/[clientSlug]/reports/page.tsx:118`) so it works at
  runtime, but writing that value into the DB will not typecheck until `'paid-search'`
  is added to the union. Only do that if we actually want per-client hiding of the
  Paid Search tab.

#### 5. Commentary consequence

`resolveCommentaryView` currently returns `'paid-search'` for `paid-media` with no
subsection (`lib/commentary/views.ts:38`). After the routing change that coordinate
addresses the Overview, not Paid Search, so leaving it alone would put the Paid Search
commentary on the Overview page.

Important detail: `resolveCommentaryView` is not called anywhere in app code. The only
references are its own definition and `lib/commentary/views.test.ts` (grep across the
repo returns nothing else). The real binding is the hardcoded `viewKey` prop each
section passes to `SharedPartsHeader`
(`components/report-sections/paid-search/index.tsx:58`,
`components/report-sections/meta-ads/index.tsx:46`, `components/report-sections/linkedin-ads/index.tsx:46`), and the `view_key` text column
on `report_commentary` (`lib/db/schema.ts:249`). So the mapping function is documentation
plus a guard, and fixing it is cheap, but fixing it is not sufficient by itself.

**Option A (recommended): Overview gets no commentary.**

```ts
case 'paid-media':
  if (!subsection) return null                      // Overview: out of scope
  if (subsection === 'paid-search') return 'paid-search'
  if (subsection === 'meta') return 'meta-ads'
  if (subsection === 'linkedin') return 'linkedin-ads'
  return null
```

No new `CommentaryViewKey`, no new `COMMENTARY_VIEWS` entry, and
`PaidMediaOverviewReport` simply does not render `SharedPartsHeader`. Existing
`report_commentary` rows keyed `'paid-search'` keep resolving to the Paid Search
subpage, which still renders `viewKey="paid-search"`. Zero data migration.

**Option B: Overview gets its own commentary stream.** Add `'paid-media'` to the
`CommentaryViewKey` union (`lib/commentary/views.ts:4-11`), add a
`COMMENTARY_VIEWS['paid-media']` entry with a label and owner
(`lib/commentary/views.ts:48-56`, required or `isCommentaryViewKey` rejects writes at
`lib/commentary/views.ts:60-62`), return it for the no-subsection case, and render
`<SharedPartsHeader viewKey="paid-media" ... />` in the Overview. Also needs a
`reportSectionConfig['paid-media'].sharedParts` opt-in per client, since
`SharedPartsHeader` renders nothing without it
(`components/report-sections/shared/shared-parts-header.tsx:17-18`). Costs an owner
decision; the feedback doc does not name one.

**What breaks if done wrong.** The failure mode is reusing the string `'paid-search'`
for the Overview view key. `view_key` is a plain text column and reads are a straight
`(client_id, view_key)` lookup (`lib/db/schema.ts:267`,
`getCommentaryForView` in `lib/db/queries.ts`). Every existing approved Paid Search
entry would immediately surface on the Overview page, in front of clients, with no
error and nothing to alert on. Rows are never rewritten, so recovery means an UPDATE
over `report_commentary` and a re-approval pass. The rule: the string `'paid-search'`
stays bound to the Paid Search subpage forever. A new page gets a new key or no key.

#### 6. Empty and error states

Per-channel state resolution, since six of seven clients have no paid media configured
at all:

| Channel condition | Detection | Overview renders |
|---|---|---|
| Not configured | `client.paidSearchConfig` / `metaConfig` / `linkedinConfig` is null (`lib/db/schema.ts:137-139`). The `base.ts` wrappers throw a config error today (`lib/paid-search/base.ts:15`, `lib/meta/base.ts:14`, `lib/linkedin/base.ts:14`), so the data layer must check config before querying and return `{ status: 'not_configured' }` rather than letting it surface as a generic error. | Channel row omitted from the breakdown table; a muted note in `ChannelNotes` ("LinkedIn is not connected"). No `Fallback` card, no scary red. |
| Configured, query timed out | `SmTimeoutError` (`lib/supermetrics/client.ts`), same discrimination the siblings do at `components/report-sections/paid-search/index.tsx:20`. | Channel row present with `NA` in every cell; `ChannelNotes` says the channel timed out and suggests a shorter range, matching the existing copy at `components/report-sections/paid-search/index.tsx:27-29`. |
| Configured, query errored | any other throw | Channel row present with `NA` in every cell; note says the channel could not be loaded. |
| Configured, metric not applicable | Meta has no lead or conversion field (`lib/meta/kpis.ts` requests none) | Leads and Cost / Lead cells show `NA` with a note that Meta reports no lead metric. This is a permanent state, not an error, and it is worded differently from a failure. |

**Dianna's rule applied to the blended line.** If any channel that contributes to a
blended metric is in `error` or `timeout`, that blended metric renders `NA`, not a
partial sum. `BlendedTotals.spend | clicks | leads | costPerLead` are therefore
`number | null`, and `null` means NA. The KPI card shows `NA` as the value with the
tooltip naming the channels responsible ("Excludes LinkedIn: data could not be
loaded"), using the existing `Kpi.tooltip` path (`components/charts/kpi-card.tsx:36-46`).
Cost / Lead is null whenever spend or leads is null, so a broken input never quietly
produces a plausible-looking derived number.

**All-unconfigured Overview.** For the six clients with no paid media config, the
Overview renders `OverviewEmpty` only: a single `EmptyState`
(`components/report-sections/empty-state.tsx:9`) with `platformName="Paid Media"`
linking to that client's auth hub. No KPI grid, no empty table, no error card. This
matches the UI convention in `CLAUDE.md` ("When a platform is not connected, show a
prompt card linking to the Auth Hub, never show an error"). Note those clients do not
have `paid-media` in `enabledReports` today, so in practice the Overview is unreachable
for them, but the state must exist because a partially configured client (Paid Search
only, no Meta or LinkedIn) is the realistic near-term case.

#### 7. Blended and stacked layout

Greg asked for both, with all channels as the default if only one is possible. Both are
possible on one page, top to bottom:

**Blended top line.** `KpiGrid` with exactly four `Kpi` objects in Greg's order: Spend,
Clicks, Leads, Cost / Lead. It renders `grid-cols-2 md:grid-cols-4`
(`components/report-sections/paid-search/kpi-grid.tsx:6`), which is exactly four across
on desktop. Each card gets its prior-period delta through the existing `delta` /
`invertDelta` props (`components/charts/kpi-card.tsx:55-67`), with `invertDelta` set on
Cost / Lead so cheaper reads green, matching `lib/paid-search/kpis.ts:45`. No CTR card,
no Conversions card.

Two caveats the cards must carry in their tooltips, because they are real and a client
will ask:
- Clicks is not one metric across channels. Meta's clicks value is `inline_link_clicks`
  (`lib/meta/kpis.ts:33-37`), while Paid Search and LinkedIn use all clicks
  (`lib/paid-search/kpis.ts:40`, `lib/linkedin/kpis.ts:42`). The blended Clicks tooltip
  states this.
- Leads excludes Meta entirely, since Meta exposes no lead metric. The Leads and
  Cost / Lead tooltips name the excluded channels from `BlendedTotals.leadExcluded`.

**Stacked per-channel breakdown.** One `DataTable`
(`components/charts/data-table.tsx:69`) directly below, columns
`Channel | Spend | Clicks | Leads | Cost / Lead`, one row per configured channel, and
the blended figures in `totalsRow` (`components/charts/data-table.tsx:42`, rendered with
its own top border and bold weight at `components/charts/data-table.tsx:112-118`). That
gives Greg the blended line and the per-channel rows in one component, with the totals
visually tied to the rows they sum.

Columns are declared exactly like `components/report-sections/paid-search/campaign-table.tsx:7-14`: display
strings in the visible key, raw numbers in a parallel `_spend` / `_clicks` / `_leads` /
`_cpl` field, and `sortable: true` plus `sortKey: '_spend'`, `sortType: 'number'` so the
client-side comparator is rebuilt inside the bundle. No `sortValue`, so `check:rsc`
stays green.

**Below that,** `ChannelNotes` renders the muted footnotes for unconfigured, errored,
and not-applicable channels. Nothing else. Channel-specific events stay on the channel
pages, per Greg.

---

## Decisions requiring approval

| ID | Decision | Owner | Blocks |
|---|---|---|---|
| `D1` | Overview as default landing, or Paid Search stays default | Dianna | Req 1 |
| `D2` | How a Meta "lead" is defined | Greg + Amir | Req 1 |
| `D3` | Blended Clicks: Meta link clicks vs all clicks | Greg + Amir | Req 1 |
| `D4` | Unconfigured or erroring channel in the rollup | Dianna | Req 1 |
| `D5` | Does Overview get its own commentary block, and who owns it | Dianna | Req 1 |
| `D6` | Totals on all Paid Search tables, or only the two named | Amir | Req 2 |
| `D7` | Region → DMA total: top 10 or all regions | Amir | Req 2 |
| `D8` | Total Leads: plain sum or de-duplicated | Amir | Req 2 |
| `D9` | Keyword filter user-adjustable or fixed | Engineering | Req 3 |
| `D10` | Blended Cost per lead when a channel has spend but no leads | Greg + Dianna | Req 1 |

`D2` is the highest-value one to resolve first. It is the only decision that
determines whether Req 1 is buildable as specified, and it is the one the
stakeholder doc left open.

`D10` surfaced while designing the rollup and is not in the feedback doc. If `D2`
resolves such that Meta still contributes Spend but no Leads, blended Cost per lead
has no honest denominator: including Meta's spend inflates it, excluding Meta's spend
understates it, and reporting it at all implies a completeness we do not have. The
three options are to show it as unavailable whenever a contributing channel lacks
leads (the conservative reading of Dianna's rule, and the design's default), to
compute it only over channels that report leads and label it accordingly, or to
suppress the metric entirely until `D2` is implemented. This is a reporting-truth
question, not an engineering one.

### Engineering decisions already made here

These did not go to the team because they do not change what is built, only how.
Each is stated with its rationale in the section named.

| Decision | Made | Where |
|---|---|---|
| Cost per lead is derived in the rollup for every channel, never taken from a vendor field | So stacked rows reconcile with the blended top line. Accepts a cents-level difference between the Overview LinkedIn row and the LinkedIn page, which uses `oneClickLeadsCost` | Rollup module design |
| Blended Cost per lead is total spend over total leads, never a mean of channel CPLs | A mean answers a different question and is wrong whenever channel volumes differ. Worked example in the section | Rollup module design |
| Full precision in the rollup, rounding at render | Summation stays exact; `toKpis` applies the same presentation the channel pages use | Rollup module design |
| An unconfigured channel does not contribute to blended totals; an errored one taints them | Absence of an account is not missing data. A failed load is | Rollup module design |
| `ChannelRollup` is a discriminated union, not nullable fields | Stops the UI rendering a "0 spend" row for a client with no Meta account | Rollup module design |
| Unavailable metrics reuse the existing single-character dash placeholder | Matches how LinkedIn already renders unavailable Reach and Frequency | Overview UI and routing |

---

## Sequencing

Reqs 4 and 5 are independent of every decision above and can proceed
immediately. Req 3 needs only `D9`. Req 2 needs `D6` through `D8`. Req 1 needs
`D1` through `D5`. Req 6 is resolved.

Suggested order, each its own PR against `dev` per the Stage 1 gate:

1. **Req 4** (Cost / LPV): one line plus a test. Confirmed defect, formula
   confirmed by Greg, zero open decisions. Highest value per unit of effort, and
   it is currently showing clients `$0` for real costs.
2. **Req 5** (Spend formatting): three files, no open decisions beyond precision
   consistency.
3. **Req 3** (keyword filter): after `D9`.
4. **Req 2** (totals): after `D6` to `D8`.
5. **Req 1** (Overview): after `D1` to `D5`. Largest by a wide margin.
6. ~~Req 6 (LinkedIn)~~: resolved, connection re-authed on Supermetrics.

## Verification

Beyond `check:rsc` and `npm test`, which gate every PR:

- Req 4: assert the exact rendered value for a sub-dollar input, the case the
  current test omits.
- Req 2: assert the total equals the sum of subtotals, and separately assert the
  Region → DMA total matches whichever rule `D7` picks.
- Req 1: `lib/paid-media/rollup.ts` gets unit tests per channel `status`
  (`ok`, `unconfigured`, `error`), since per `C3` the unconfigured path is the
  common one.
- Req 5: `check:rsc` is the real gate. It fails if the formatter is passed as a
  function.

## Open risks

Recorded rather than hidden. None blocks starting, all are worth knowing before
review.

**Unmeasured performance.** The roughly 3 second healthy-query figure used in the
caching section is an in-code comment (`lib/supermetrics/client.ts:20-22`), not a
measurement. `PERF_LOG=1` exists and would produce real per-vendor numbers, but no
data has been captured. The latency estimates are reasoned, not observed.

**Supermetrics rate limits are undocumented in the repo.** The Overview issues up to
eight concurrent calls on a single API key (three channels plus compare periods).
Whether that is within limits is a guess. The 429 retry path honors `Retry-After`
and can add roughly 30 seconds, so being wrong here is slow rather than broken.

**The data layer cannot distinguish "not configured" from "error" today.** All three
`base.ts` wrappers throw an indistinguishable generic `Error` when config is missing
(`lib/paid-search/base.ts`, `lib/meta/base.ts`, `lib/linkedin/base.ts`). The rollup's
`unconfigured` versus `error` discriminant, which `D4` depends on, requires that
distinction to be made before querying rather than inferred from a thrown error.

**Cache invalidation is TTL only.** A mid-hour correction in an ad platform stays
invisible for up to the TTL. `cached()` supports tags for `revalidateTag()`, but
nothing triggers them and no decision has been taken.

**Reuse versus narrower queries is unresolved.** The rollup can call the existing
`get*Kpis` functions, which caches well and shares warm entries with the channel
pages but pulls eleven Meta fields to use two. Or it can issue narrower queries,
which is leaner per call but creates a second cache population that never shares with
the channel pages.

**Route duplication is already recognized tech debt.** Both route files duplicate the
dispatch, the title map and the header controls, and the portal route carries an
in-file note saying so. Every Requirement 1 change lands twice, and the sweep found a
third instance beyond the two originally documented.

**Three claims were not re-verified by the sweep.** The lint baseline under Out of
scope, the PR reference, and the `C3` client-configuration table. `C3` came from a
live read against the dev database and could not be re-checked in a read-only tree
audit. It is load-bearing for `D4`, so it should be re-run before that decision is
taken.

---

## Out of scope

Not addressed here, and not to be picked up without a separate decision:

- Backfilling Paid Media configuration for the six unconfigured clients.
- Any change to how Paid Search defines lead actions.
- The pre-existing lint baseline (59 errors, 80 warnings on `dev`), which is not
  a CI gate.
