# Paid Media v2: Implementation Design

**Date:** 2026-07-22
**Branch:** `ave-z-reporting-paid-media-v2`
**PR:** #164 (base `dev`)
**Companion:** [initial requirements](./2026-07-22-paid-media-v2-requirements.md)
**Status:** Design for review. No code written.

## What this document is

A programmatic map of how each of the six requirements gets implemented: what
exists now, what changes, and which files move. Every claim about current
behavior cites `file:line` and was verified in-tree, not assumed.

## What this document is not

It does not resolve open product questions. Decisions are surfaced as `D1`
through `D9` and left for the team. That list is the input to the
decisions-for-approval doc. Where a decision has an engineering-cost difference,
that difference is stated so the team is choosing with the cost visible.

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
| Spend | `cost` (`lib/paid-search/kpis.ts:40`) | `spend` (`lib/meta/kpis.ts:23`) | `spend` (`lib/linkedin/kpis.ts:33`) |
| Clicks | `clicks`, all clicks (`lib/paid-search/kpis.ts:41`) | `inline_link_clicks`, **link clicks only** (`lib/meta/kpis.ts:35`) | `clicks`, all clicks (`lib/linkedin/kpis.ts:42`) |
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
| 2 | `lib/constants.ts` | Add `PAID_MEDIA_SUBSECTION_NAMES` entry for the new Paid Search id |
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
  is roughly two files versus four.
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
cross the RSC boundary (`data-table.tsx:10-17`). Any filter must follow the same
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
| 2 | `components/charts/bar-chart.tsx:20` | Extend `valueFormat` union with a second descriptor |
| 3 | `meta-ads/geo-section.tsx:52` | Pass the new descriptor |

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
   iterates `client.enabledReports` and builds `?section=${report}` with no
   subsection parameter. For `paid-media` that resolves to the default
   subsection, which is Paid Search. The Meta and LinkedIn subpages are never
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

`D2` is the highest-value one to resolve first. It is the only decision that
determines whether Req 1 is buildable as specified, and it is the one the
stakeholder doc left open.

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

## Out of scope

Not addressed here, and not to be picked up without a separate decision:

- Backfilling Paid Media configuration for the six unconfigured clients.
- Any change to how Paid Search defines lead actions.
- The pre-existing lint baseline (59 errors, 80 warnings on `dev`), which is not
  a CI gate.
