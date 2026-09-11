# Executive Overview (Renaissance) — Code Review Record

**Scope.** PR [#207](https://github.com/Avenue-Z/avenue-z-reporting-v2/pull/207)
— *Renaissance Overview: frankenstein build* (`Executive-Overview-Duplicate-Ren`
→ `dev`), author `thomaschang-avez`.

**Diff range reviewed.** `749b891..8096fa1` (52 commits, merge-base `749b891`),
spanning **four review rounds**. §1–§5 below are the round-1 record against
`265f004`; §6 carries the disposition of every finding through the final commit.
No unrelated code is in scope; the review covers the new
`components/report-sections/executive-overview/` section, the slug registration
in `lib/constants.ts` / `lib/db/schema.ts`, the four route dispatchers, the
`report-generator` exclusion, and the settings filter.

**This document changes no code.** It is the Stage-1 gate artifact per
`CLAUDE.md` § *Branch Flow & Promotion Pipeline*. Every fix listed in §5 is a
follow-up on the feature branch, not an edit made here.

---

## §1 — How it works

### What the page is

`executive-overview` is a new report slug rendering a single-page leadership
view for Renaissance. It is a **frankenstein build**: five presentational
components were copied wholesale out of the existing `ga4` section rather than
shared, so the two sections can diverge without regressions in either. The
copies are faithful — the only intentional deltas are export widening, removal
of the AI badge/callout, and a new unconnected-card variant on the journey row.

The page renders four blocks top to bottom:

1. **Demand Journey** (`demand-journey.tsx`) — a four-node horizontal flow:
   AEO → Web Analytics → Inbound Funnel → Pipeline.
2. **Web Analytics** — an eight-card KPI grid, the sessions/users trend chart,
   New vs. Returning, and Traffic by Channel.
3. **Contact Creation** — a `NeedsConnection` placeholder.
4. **Pipeline Performance** — a `NeedsConnection` placeholder.

### Where every number comes from

**Date range is fixed, not user-selected.** `index.tsx:30-31` resolves
`parseDateRange('last_30_days')` and
`deriveCompareRange('last_30_days', 'previous_period')` internally and never
reads a range from props. The inline comment explains why: every route passes
`compareRange` as `null` for a section with no picker, and a default parameter
does not fire for `null`, which would blank every delta on the page. The
consequence — the routes still render a picker that does nothing — is finding
**#4**.

**Ten fetches, all in one `Promise.allSettled`** (`index.tsx:39-50`): GA4 totals
and compare-totals over `KPI_METRICS`; a daily trend and its compare
(`dimensions: ['date']`, `limit: 90`); channel and compare-channel
(`sessionDefaultChannelGroup`, `limit: 10`); channel × source/medium
(`limit: 150`); `newVsReturning` audience and its compare; and
`getPeecOverview(clientSlug, 'year_to_date')`.

| Block | Metric | Derivation |
|---|---|---|
| KPI grid | Sessions, Active Users, New Users, Bounce Rate, Avg Duration, Pages/Session, Conversions, Conversion Rate | Straight from the GA4 totals row. Delta is `pct(current, compare)` = relative % change. Bounce Rate passes `invertDelta` so a decrease renders green. |
| Trend chart | Sessions / Active Users / New Users per day | `buildTrendRows` sorts both periods by date string and zips them **by array index**. `7d avg` toggle replaces every value with a trailing 7-point mean. |
| Traffic by Channel — Volume | Sessions per channel, share of total | Sorted once by sessions desc; `pct` = sessions ÷ channel total. Colors assigned by rank against a 9-entry ramp. |
| Traffic by Channel — Conversion | `sessionConversionRate` per channel | **Filtered to channels with ≥20 sessions, then top 5.** Colors reused from the volume ranking so the two tabs agree. Ties resolve by session volume because both derivations start from the one sessions-sorted array — deliberately reproducing the source's in-place sort. |
| Channel hover sub-rows | Top source/medium pairs | Aggregated per channel from the source/medium query, `(not set)` and empty sources dropped, sorted desc, sliced to 6. |
| New vs. Returning | Sessions, engagement rate, avg duration | `bucketAudience` collapses GA4's `newVsReturning` into exactly two buckets. Engagement rate and duration are **session-weighted** averages, not naive means. |
| Journey — AEO | Visibility %, share of voice | Peec `weeklyVisibility.at(-1)` vs `.at(-2)`; SoV from `brandRankings.find(b => b.isYou)`. `isYou` is computed from `clients.peec_your_brand` — matching a literal brand name would blank SoV for every client but one. **This card is year-to-date while the page header says "Last 30 days"**, which is why it carries a `YTD` badge. |
| Journey — Web Analytics | Sessions | GA4 totals; sparkline reuses `trendRows`. |
| Journey — Inbound / Pipeline | — | **Hardcoded `connected: false`** (finding **#2**). |

### Registry sweep

Verified complete: `REPORT_NAMES`, `NAV_GROUPS` / `NAV_SLUG_ORDER`,
`ALL_REPORT_SLUGS`, the `ReportSlug` union, the settings filter, the
`report-generator` `NON_CHANNEL_SLUGS` exclusion, and all four dispatchers
(dashboard × 2, portal × 2). `ai-summaries` needs no update because it also
gates on a `CHANNEL_META` entry, which this slug does not have.

---

## §2 — Verification method

| Claim | How it was probed |
|---|---|
| Copies are faithful | Diffed each of the five transplanted components against its `ga4` original; diffed `reshape.ts` against `ga4/index.tsx:33-76, 316-403, 464-483, 537-539`. |
| Registry sweep complete | Grepped every symbol above for the new slug; read all four dispatcher hunks in the PR diff. |
| Peec fallback (#1) | Read `getPeecOverviewImpl` and `peecPost`; both fall back to `PEEC_AI_PROJECT_ID` / `PEEC_AI_YOUR_BRAND`. Confirmed `peec-ai/index.tsx:72,87` guards on `peecCustomerProjectId` and `executive-overview/index.tsx:49` does not. **Static anchor confirmed; the cross-client render is PLAUSIBLE — not triggered against a live client with a null project id.** |
| Hardcoded CRM state (#2) | Static read of `stages.ts:63,68` and `index.tsx:91,96`. CONFIRMED in-tree. |
| Index-zip gap shift (#3) | Read `buildTrendRows:68`; confirmed `lib/ga4/client.ts:106` never sets `keepEmptyRows`, so GA4's default omission of all-zero rows applies. CONFIRMED by code path. **Upgraded to live-confirmed in round 4** — see §6.4. |
| Date picker no-op (#4) | Read both `[reportSlug]/page.tsx` files; the picker renders unconditionally while `index.tsx:30` hardcodes the range. CONFIRMED. |
| Responsive break (#5) | Grepped `demand-journey.tsx` for `sm:` / `md:` / `lg:` — **zero matches**, against 20+ in every sibling component. Width arithmetic done by hand at 375px. CONFIRMED structurally; not rendered in a device viewport. |
| Recharts null handling (#6) | `connectNulls` is unset on both `Area` stacks, so recharts' `false` default applies and the series breaks at `undefined`. CONFIRMED by API semantics. |
| Palette drift (#5, #9, #10) | Read `lib/constants.ts:6-29`; confirmed `#FF7A59` = `CHART_COLORS.hubspot`, `#60FF80` = `.positive`, `#FF4444` = `.negative`, and that `#22D3EE` matches no token. Counted `CHANNEL_COLORS` (9) against the channel query `limit` (10). CONFIRMED. |
| Unused `pct` (#13) | Grepped `channel-tabs-chart.tsx` for `row.pct` / `.pct` — no render site. CONFIRMED. |

---

## §3 — Findings

Sev: **●** correctness · **○** cleanup/convention
Status: CONFIRMED (proven in-tree) · PLAUSIBLE (code assumption confirmed, external trigger unverified)

| # | Sev | Status | Location | Finding |
|---|-----|--------|----------|---------|
| 1 | ● | PLAUSIBLE | `executive-overview/index.tsx:49` | `getPeecOverview` called without the `peecCustomerProjectId` guard — a client with no Peec project renders the **default project's** visibility and SoV as their own. |
| 2 | ● | CONFIRMED | `executive-overview/stages.ts:63` | `inbound`/`pipeline` hardcode `connected: false`; a HubSpot-configured client is told "CRM not connected" while the same data renders on their other tabs. |
| 3 | ● | CONFIRMED | `executive-overview/reshape.ts:68` | `buildTrendRows` zips the prior period by array index; GA4 omits zero-session days, so one gap offsets every later prior value, the overlay, and the tooltip delta. |
| 4 | ○ | CONFIRMED | `app/dashboard/…/[reportSlug]/page.tsx:46` (+ portal twin `:56`) | Both deep-link routes render a date picker, but the section hardcodes `last_30_days` — changing the range does nothing. |
| 5 | ● | CONFIRMED | `executive-overview/demand-journey.tsx:44` | Zero responsive breakpoints in the whole file. At 375px the four `flex-1` cards are ~74px wide and the `text-3xl` hero metrics clip against the card's `overflow-hidden`. |
| 6 | ● | CONFIRMED | `executive-overview/sessions-trend-chart.tsx:208` | `hasCompare` checks only `data[0]`, so the "Previous Period" legend renders above a dashed overlay that stops early wherever the compare period has fewer rows. |
| 7 | ● | CONFIRMED | `executive-overview/index.tsx:52` | `Promise.allSettled` + `val() → null` turns any single query failure into `rows: []`, rendering blank chart shells with no empty state — contrary to `CLAUDE.md` § *UI & UX Conventions*. |
| 8 | ○ | CONFIRMED | `executive-overview/channel-tabs-chart.tsx:218` | Hovering a row swaps two fixed-width spans for two auto-width two-line blocks, so row height and the `flex-1` bar resize on every hover. |
| 9 | ○ | CONFIRMED | `executive-overview/new-returning.tsx:20` | `#22D3EE` matches no `CHART_COLORS` token and sits next to `CHART_COLORS.primary` (`#60FDFF`) on the same page; `#FF7A59` / `#60FF80` / `#FF4444` re-inline existing tokens. |
| 10 | ○ | CONFIRMED | `executive-overview/reshape.ts:139` | Channel query uses `limit: 10`; `CHANNEL_COLORS` has 9 entries indexed `i % 9`, so channel #10 duplicates channel #1's blue. |
| 11 | ○ | CONFIRMED | `executive-overview/new-returning.tsx:81` | Split-bar segments sort by sessions desc while the stat cards below are hardcoded `[new, returning]` — the two orders disagree for any site where returning > new. |
| 12 | ○ | CONFIRMED | `executive-overview/channel-tabs-chart.tsx:47` | Tab tooltip says "the same channels ranked by conversion rate", but `convData` filters to ≥20 sessions and slices to top 5 with no on-screen note. |
| 13 | ○ | CONFIRMED | `executive-overview/reshape.ts:136` | `pct` (share of total) is computed and never rendered, while the volume tooltip promises "session count and share of total traffic". |
| 14 | ○ | CONFIRMED | `executive-overview/new-returning.tsx:148` | Relative % change of a rate renders adjacent to the rate itself (`44.0% ↑ 10.0%`) with no pp-vs-% marker. Same shape on AEO visibility, Conversion Rate, Bounce Rate. **Inherited convention from `ga4`, not a regression.** |
| 15 | ○ | CONFIRMED | `executive-overview/channel-tabs-chart.tsx:162` | Mobile column headers use `w-16`/`gap-3`, values use `w-14`/`gap-2` — "SESSIONS" sits 8px right of its numbers. |
| 16 | ○ | CONFIRMED | `executive-overview/stages.ts:32` | `connector: 'drives\ndiscovery'` renders without `whitespace-pre-line`, so the newline is inert. |
| 17 | ○ | CONFIRMED | `executive-overview/sessions-trend-chart.tsx:108` | `compareLabel` is threaded into `ChartTooltip` and never read; the body uses `row.prevDate`. |
| 18 | ○ | CONFIRMED | `executive-overview/sessions-trend-chart.tsx:186` | With `7d avg` on, the tooltip still prints `Prior: N` and `vs {date}` unmarked while every number shown is a trailing mean. |
| 19 | ○ | CONFIRMED | `executive-overview/channel-tabs-chart.tsx:192` | `smEntries[0]?.sessions ?? 1` guards `undefined` but not `0`, giving `width: Infinity%`. |
| 20 | ○ | CONFIRMED | `executive-overview/index.tsx:91` | The page states "CRM not connected" three times (two journey cards + two full sections), and those cards drop to `opacity-25` whenever a sibling is hovered. |

---

## §4 — Detail

### #1 — Peec project fallback leaks another client's numbers

`peec-ai/index.tsx` guards every Peec call on `client.peecCustomerProjectId`
before fetching. `executive-overview/index.tsx:49` calls
`getPeecOverview(clientSlug, 'year_to_date')` unconditionally. Inside,
`getPeecOverviewImpl` and `peecPost` both fall back to the `PEEC_AI_PROJECT_ID`
and `PEEC_AI_YOUR_BRAND` environment defaults when the client has no project
configured. The AEO journey card would then present the default project's
visibility and share of voice as that client's own.

The trigger is a **DB-only change with no deploy** — adding
`executive-overview` to another client's `enabled_reports`. That is the
highest-severity item in this review.

**Fix.** Mirror the `peec-ai` guard: resolve the client first, skip the Peec
fetch when `peecCustomerProjectId` is null, and let the AEO card fall through
to the unconnected variant that already exists in `demand-journey`.

### #2 — CRM state is hardcoded, not derived

`stages.ts:63,68` set `connected: false` as literals, and `index.tsx:91,96`
render `NeedsConnection` unconditionally. Nothing consults the client's HubSpot
configuration. Renaissance has no CRM today so the output is currently correct,
but the moment this slug is enabled for a HubSpot client the page contradicts
their own HubSpot tab.

**Fix.** Read the client's `hubspot_token_env_var` (per `CLAUDE.md` § *Client
Configuration*) and derive `connected` from it, the same way the Auth Hub
derives platform state from env.

### #3 / #6 — The prior-period series is joined by index, not date

`buildTrendRows` sorts both arrays by date string and then reads
`compareRows[i]` for row `i`. `lib/ga4/client.ts:106` never sets
`keepEmptyRows`, so GA4's default applies and any day with zero sessions is
absent from the response. Two symptoms follow:

- **Numeric (#3).** One missing day in the compare period shifts every
  subsequent prior value by one day. The dashed overlay, the tooltip's
  `Prior:` figure, and its delta % are all off by a day from that point on.
  This is the same defect class as the tracked `alignSeries` bug in `CLAUDE.md`
  § *Known Follow-ups*.
- **Visual (#6).** If the compare period ends up shorter, the tail rows get
  `prevSessions: undefined`. `connectNulls` is unset on the overlay `Area`, so
  recharts breaks the line and the dashed series stops mid-chart — while
  `hasCompare` (which only inspects `data[0]`) still renders the "Previous
  Period" legend.

**Fix.** Join on bucket date rather than index, gap-filling missing days to
zero on both sides. Setting `keepEmptyRows: true` on the trend query would also
remove the root cause. Derive `hasCompare` from the series, not `data[0]`.

### #5 — `demand-journey` has no responsive layout

The flow row is a hard `flex items-start gap-0` of four `flex-1` cards with
`w-10` connectors between them; the file contains no `sm:`, `md:` or `lg:`
variant anywhere, against 20+ in each sibling component. At 375px each card is
roughly `(375 − 48 padding − 30 connectors) / 4 ≈ 74px`, less `p-5` leaves
~34px of content — into which the card renders a `text-3xl font-extrabold`
metric and an `uppercase tracking-widest` source label, inside a container with
`overflow-hidden`. Numbers clip mid-digit; labels stack vertically.

This is the first block on the page.

**Fix.** Stack to `grid-cols-1 sm:grid-cols-2 lg:flex-row`, hide the connectors
below `lg`, and step the hero metric down (`text-xl sm:text-2xl lg:text-3xl`).

### #7 — Partial failures render blank shells

`val()` maps a rejected settled result to `null`, and every reshape helper
returns empty collections for null input. A single failed GA4 query therefore
yields `rows: []`, and each consumer renders its chrome with no content:
`NewReturning` emits a title, a subtitle and an empty split bar (both cards
`return null`); `ChannelTabsChart` emits a header, tabs and sortable column
headers above nothing; `SessionsTrendChart` emits bare axes.

`CLAUDE.md` § *UI & UX Conventions* requires an empty/prompt state rather than
a silent blank. The commit `333cb8d fix(exec-overview): honest partial-failure
rendering` addressed the KPI cards (the `comparisonExpected` placeholder) but
not the three charts.

**Fix.** Give each chart the same treatment the KPI cards got — an explicit
"no data for this period" state when its input array is empty.

### #8 — Channel rows reflow on hover

Unhovered, the right-hand cluster is two fixed spans (`sm:w-20` + `w-16`, one
line each). Hovered with compare data present, it becomes two auto-width blocks
of two lines each plus a divider. Row height grows and the adjacent `flex-1`
bar resizes. `Delta` additionally returns `null` when prior is `0`
(`channel-tabs-chart.tsx:68`), so a channel that is new this period collapses
back to one line while its neighbours stay at two. Sweeping the cursor down the
chart makes the bars pump.

**Fix.** Reserve the hovered layout's width and height in the unhovered state
(fixed-width columns, `min-h`), so hover only changes opacity and content.

### #9 / #10 — Palette

Three separate cyans carry three separate meanings on one page:
`CHART_COLORS.primary` (`#60FDFF`) is "Active Users" in the trend chart and
channel #3 in the bar chart, while `NewReturning` hardcodes `#22D3EE` for
"Returning". Separately, `#FF7A59`, `#60FF80` and `#FF4444` are inlined across
all four components despite being exactly `CHART_COLORS.hubspot`, `.positive`
and `.negative` — the rule in `CLAUDE.md` § *UI & UX Conventions* is one
palette constant used across all charts.

`CHANNEL_COLORS` holds 9 entries and is indexed `i % 9`, but the channel query
requests `limit: 10`, so a tenth channel repeats the first channel's blue. The
ramp also places `#FF7A59`, `#FF6B8A` and `#FF4500` in one categorical set;
those three are not separable as adjacent 8px bars.

**Fix.** Route every colour through `CHART_COLORS`; add a 10th entry (or drop
the query to `limit: 9`); space the warm hues apart in the ramp order.

### #11 / #13 / #12 — Chart says one thing, code does another

- **#11.** The split bar sorts segments by sessions desc
  (`new-returning.tsx:81`) while the cards beneath are the fixed tuple
  `[newRow, returningRow]`. Any site with more returning than new traffic shows
  cyan-then-orange in the bar and orange-then-cyan in the cards. The two
  `share` values also round independently, so they can total 99% or 101%.
- **#12.** The "By Conversion" tooltip claims "the same channels ranked by
  conversion rate"; `reshape.ts:144-147` filters to ≥20 sessions and slices to
  five. Channels vanish on tab switch with no explanation.
- **#13.** `pct` — share of total sessions — is computed for every volume row
  and rendered nowhere, while that tab's tooltip promises "session count and
  share of total traffic".

**Fix.** Render the volume tab's `pct`; reword the conversion tooltip and add a
"top 5, ≥20 sessions" caption; order the stat cards to match the bar (or fix
the bar to match the cards) and derive the second share as `100 − first`.

### #14 — Percentage points vs. percent

`delta(r.engagementRate, prior.engagementRate)` is a relative change rendered
immediately beside the absolute rate: `44.0% ↑ 10.0%`. A reader cannot tell
+10pp from +10% relative. The same shape appears on AEO visibility
(`stages.ts:30`), Conversion Rate and Bounce Rate.

This is **inherited from the `ga4` section**, not introduced here — but this
page is the leadership leave-behind, which is where the ambiguity costs most.
Flagged for a decision rather than an automatic fix.

---

## §5 — Follow-ups

Tracked separately; none applied in this document.

### Correctness — block the ship
- **#1** Peec project guard. Highest-value item in the review: a DB-only change
  leaks another client's AEO numbers.
- **#3 / #6** Join the prior period by date, gap-fill, and derive `hasCompare`
  from the series.
- **#5** Give `demand-journey` a responsive layout.
- **#7** Empty states for the three charts.

### Needs a live call first
- **#1** verification — confirm against a client with a null
  `peec_customer_project_id` that the default project's numbers actually render.
  Everything else in §3 is proven in-tree.

### Decide together
- **#2** Should `connected` be derived from HubSpot config now, or does the
  hardcode stand until a CRM client is actually enabled on this slug?
- **#4** Hide the date picker for this slug, or wire the section to accept a
  range? Hiding is the smaller change and matches what the section does.
- **#12 / #13** Show `pct` on the bars and caption the conversion filter, or
  reword both tooltips down to what is rendered?
- **#14** Percentage-point vs. percent labelling — a convention decision across
  `ga4` and this section, not a fix scoped to this PR.
- **#20** Three "CRM not connected" treatments on one page is a design call.

### Cleanup
- **#8** hover reflow · **#9 / #10** palette · **#11** bar/card order and share
  rounding · **#15** mobile header alignment · **#16** inert `\n` ·
  **#17** dead `compareLabel` prop · **#18** unlabelled smoothing ·
  **#19** `smMax` zero guard.

---

---

## §6 — Disposition through rounds 2–4

§1–§5 record the first pass. Three further rounds followed on the same PR. This
section is the gate artifact for the **merged** state, `8096fa1`.

### §6.1 Round-by-round

| Round | Commits | Findings | Outcome |
|---|---|---|---|
| 1 | `265f004` and earlier | 21 posted (20 recorded in §3) | 19 fixed, 2 conscious "leave" (#14 pp-vs-%, #20 three CRM treatments) |
| 2 | `17f4874` | 6 | All fixed. Three were *consequences of round-1 fixes*, not new code. |
| 3 | `e891ff3`, `0514532`, `bb80f68` | 6 | All fixed. |
| 4 | `2f05d21`, `8096fa1` | 6 | All fixed. Posted as 8 inline comments (some findings span two files). |

Rounds 2 and 3 are notable for what they say about round 1: **three of round 2's
six findings were introduced by round 1's own fixes.** Deriving `connected` from
`hubspotTokenEnvVar` (the fix for #2) gave the CRM stages `connected: true` with
no `metric`, rendering a blank hero — the page then asserted the same source was
both connected and not connected. That is the standing argument for re-reviewing
a fix round rather than trusting it.

### §6.2 Process note — round 4 was authored by the reviewer

Round 4's two commits were written and pushed **by the reviewer (Paul Ramirez)
directly onto the author's branch**, not filed as review comments for the author
to action. This is a deviation from Stage 1 as written, recorded here rather than
smoothed over.

It was mitigated, not ignored: the commits were posted as an eight-comment
inline review on PR #207 explicitly flagging that they were unreviewed and naming
the one change whose premise most needed independent challenge, and
`thomaschang-avez` then reviewed all eight and signed off. So the work did clear
a second pair of eyes — after landing rather than before.

### §6.3 Round 4 findings and fixes

| # | Sev | Status | Location | Finding |
|---|---|---|---|---|
| 21 | ● | CONFIRMED | `channel-tabs-chart.tsx:127` | Empty-state guard tests only `volumeData`, but `convData` carries an extra ≥20-sessions floor. A low-traffic client gets a populated By Volume tab and a By Conversion tab of column headers above zero rows. |
| 22 | ● | CONFIRMED | `index.tsx:61` | Channel query capped at 10 — the volume tab's *display* limit — while `convData` ranks that same set by conversion rate. A channel 11th by sessions and 1st by CVR could never surface, contradicting the tab's tooltip. |
| 23 | ● | CONFIRMED | `sessions-trend-chart.tsx:199` | The 7-day rolling average averaged the last 7 *returned* days, not calendar days, on both series — excluding the zero days that should drag it down, by a different amount per series. |
| 24 | ● | CONFIRMED | `index.tsx:50` | `peecConfigured` gates on `peecCustomerProjectId`, but identifying the client's own visibility also needs `peecYourBrand`. Unresolved, `filterYou` keeps every brand and the hero showed an all-brands average as the client's own rate. |
| 25 | ○ | CONFIRMED | `demand-journey.tsx:114` | `stage.badge` rendered above the connected check — a "LAST FULL WEEK" pill above "Not connected". |
| 26 | ○ | CONFIRMED | `sessions-trend-chart.tsx:282` | `compareLabel` carried the real compare window but was used only as a truthiness gate; the legend printed a bare "Previous Period". Round 3 recorded this as fixed, but that fix landed on the sibling chart only. |

### §6.4 #23 / #3 — the zero-day question, finally answered live

Findings #3 and #23 both turn on one factual claim: **does GA4 omit zero-session
days?** Round 1 confirmed it by code path only (`keepEmptyRows` unset ⇒ default
`false`), which §2 flagged as short of proof. Round 4's fix — application-level
gap-filling in `buildTrendRows` — rests on the same claim, so it was flagged for
independent challenge rather than asserted.

`thomaschang-avez` resolved it against the live Renaissance GA4 property,
read-only:

> a date-only query over 120 days returned **114 rows, with 6 interior days
> missing** (zero-session days), and **`keepEmptyRows:true` recovered 0 of them**
> (same 114 rows) for this property.

Two conclusions, both load-bearing:

1. GA4 does omit zero-session days, so the premise holds.
2. `keepEmptyRows` would **not** have fixed it on this property, so the
   application-level gap-fill is the correct remedy rather than a workaround
   papering over an unset API flag. Had this come back the other way, the right
   fix would have been a one-line query change, not the reshape rewrite.

The behavioral consequence, measured: seven current days at 100 sessions against
a compare period identical but for one zero day gives a true prior 7-day average
of 86 — a real **+17%**. Before the fix the chart rendered the prior as **100**
and the move as flat.

This also justified rewriting two existing test expectations: an interior gap
inside the compare span is a real `0` (filled), a day beyond the span stays
`undefined` (overlay ends). Both were confirmed correct in review.

### §6.5 How a client question is answered, post-merge

Deltas to §1 from the later rounds:

- **AI Visibility hero** is the last **complete** ISO week's visibility, with the
  current partial week dropped (`dropPartialWeek`), delta against the prior
  complete week. The badge reads `LAST FULL WEEK`. Share of Voice on the same
  card is year-to-date and says so inline — the two numbers deliberately do not
  share a window.
- **AI Visibility dashes**, rather than reading "Not connected", when the Peec
  project is configured but the fetch failed *or* the client's brand cannot be
  identified. "Not connected" now means only *unconfigured*.
- **Traffic by Channel** fetches 25 channel groups; the By Volume tab displays
  the top 10 (`VOLUME_DISPLAY_LIMIT`), while By Conversion ranks from all 25,
  filtered to ≥20 sessions and sliced to 5. Share-of-total uses the
  undimensioned totals query as denominator, not the truncated row sum.
- **Prior-period absence** renders `—`, distinct from an observed prior of `0`.
- **A failed query** renders "Couldn't load this data.", never "No data for this
  period."

### §6.6 Follow-ups still open at merge

Neither blocks this PR; both are tracked.

- **`peec-ai` shares finding #24's exposure.** `filterYou` degrades to a
  pass-through there too, so that section still renders an all-brands average as
  the client's own visibility when the brand is unresolved. Round 4 added the
  `yourBrandResolved` signal to `getPeecOverview` but consumed it only in this
  section, to bound blast radius. The source fix is one line.
- **`ga4/index.tsx` channel query is still unordered** (`limit: 10`, no
  `orderBys`), so a client with more than 10 channel groups can see different
  numbers on Web Analytics vs Overview. Pre-existing, not a 207 regression;
  the ordering work is staged on the 210 branch.

### §6.7 Operational note

`8096fa1` bumps the `getPeecOverview` cache from `v10` to `v11` (the response
now carries `yourBrandResolved`; v10 entries lack it and would read as resolved).
All Peec overview entries evict on deploy — first load per client is cold. This
is a cache eviction, not a migration-ordering hazard: no deploy sequencing is
required.

---

*Reviewer: Paul Ramirez. Rounds 1–4 posted inline on PR #207; round-4 commits
independently reviewed by Thomas Chang. Record current as of `8096fa1`,
2026-08-21.*
