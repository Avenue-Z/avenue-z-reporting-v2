# Whole-number percent changes on the outline tiles: design

Status: REVIEWED (two fresh-eyed rounds, 2026-09-29; no blocker or major open). Every claim is read on `origin/dev` 8502f40 (2026-09-29).
The only dash characters here are in code spans: the flat mark the card draws today (`kpi-card.tsx:70,76`).
Plan: `docs/superpowers/plans/2026-09-29-whole-number-changes.md` (written first; reconciled to this spec after review,
and this spec wins where they differ).

## 1. Why
Jasmine's staging feedback table, row "ALL | ALL | ALL | Data": "Can all percent changes be rounded up?" Asked on Slack
2026-09-29, "should a 6.3% change show as 6% or 7%?"; her answer, 5:12 PM: "6% but if it was 6.57 it should show as
7%". So: the nearest whole number. Her answer does not cover an exact half or a drop; my decision is halves away
from zero by size (6.5 gives 7, -6.5 gives -7), the same half-up rule the tiles' rate values already use
(`lib/organic-social/pct-compact.test.ts:11`), so a rise and a drop of the same size read the same. "ALL" means the outline clients (clients on locked months), never
Renaissance (my standing rule).

## 2. What happens today
- Every tile is the shared `KpiCard` (`components/charts/kpi-card.tsx:23-84`), imported by 23 files across the report sections, among
  them Renaissance's Organic Social tiles (`components/report-sections/organic-social/platform-headlines.tsx:46-53`).
- Its change line (`kpi-card.tsx:61-72`): when `delta` is defined, the arrow and colour come from the sign of the RAW
  `delta` (`:65-70`) and the text is `Math.abs(delta).toFixed(1)` + "%" + the label (`:71`). So a +0.3% change shows a
  green up arrow and "0.3%". With `invertDelta` the colours swap (`:65-66`). No `delta` and `comparisonExpected` gives
  the greyed `— vs prior period` (`:73-76`).
- The outline tiles are `OutlineTiles` (`components/report-sections/organic-social/outline-tiles.tsx:15-33`), which pass
  `delta={k.delta}` to `KpiCard` (`:26`) and never pass `invertDelta`. They have exactly two callers: the outline Data
  block (`OutlineHeadlines`, `:43`) and the engagement breakdown (`parts/engagement-breakdown.tsx:14`).
- `k.delta` is `outlineDelta` (`lib/organic-social/outline-headlines.ts:41`; `lib/organic-social/outline-media.ts:29,34`):
  a signed percent against the size of the prior value, or `undefined` when there is no prior or the prior is 0
  (`lib/organic-social/outline-delta.ts:9-15`). It is a finite number whenever it is defined.
- Where the outline tiles render: the Data part draws them only on a channel with outline rows; Overview, or a channel no
  outline covers, falls back to the shared v1 tiles (`parts/outline-data.tsx:42-43`). Read-only on staging
  (2026-09-29): all five clients on locked months (A Place For Mom, Akara, Joy of Life, Piper, PIMCO) pin the outline
  Data part (platform-headlines 2, or 3 for Akara) and the engagement breakdown, and hide Overview; Renaissance has no
  pins. Production is unverified until launch. (The code names platform-headlines 3 Kenect's profileClicks variant,
  `parts/outline-data.tsx:55`, `lib/organic-social/outline-layout.ts:70`; which outline Akara follows is its config, not
  changed here.) So the only outline-client tab on the v1 tiles is Piper's X tab: neither variant has X rows
  (`lib/organic-social/outline-layout.ts:60-73`), so the Data part falls back to `platformHeadlinesV1.render`
  (`parts/outline-data.tsx:42-43`), which draws the shared `PlatformHeadlines` (`parts/platform-headlines.tsx:9-12`),
  whose cards pass no flag (`platform-headlines.tsx:46-53`). `PlatformHeadlines` has that one caller.
- The test that pins the shared tiles' change line with real values is
  `components/report-sections/organic-social/render-invariant.test.tsx` (deltas 5.2 and -1.1, `:17,22`; its snapshot
  holds the change text). The Organic Social parts goldens snapshot only the loading skeleton (`render-invariant.test.tsx:8-10`).
- A tile's VALUE for a rate (Engagement Rate, Effectiveness) is `pctCompact` (`outline-tiles.tsx:25`), already whole at
  or above 1% and one decimal below (`lib/organic-social/format.ts:12-14`). Its doc says 3.5% shows as "3%" (`:3`), but
  `Math.round(3.5)` is 4, and the tests pin half up (`lib/organic-social/pct-compact.test.ts:11`,
  `post-card.pct.test.tsx:30`).

## 3. The change

### 3.1 The rounding rule, `roundDelta(delta: number): number` (new, `lib/delta-rounding.ts`)
- Input: a finite signed percent change.
- Output: from 1%, the nearest whole number to it; under 1%, one decimal (Thomas, 2026-10-01, after Paul's review: so a
  small real move on a large account, 120,000 to 119,500 followers or -0.42%, shows 0.4% rather than a flat 0%). Halves
  round away from zero by size (so a rise and a drop round alike), the sign is kept, a size that rounds to 1.0 at one
  decimal (0.95 and up) is shown whole as 1, and it is plain `0` (never `-0`) when it rounds to zero (under 0.05).
- The real value is rounded, not the one-decimal display: 6.45 gives 6, not 7 (rounding to 6.5 first would give 7).
  Float noise is removed first by rounding the size to 9 decimals, so a true 6.5 computed as 6.4999999999 gives 7 (with
  priors up to 2,000, 310 true halves land just below .5 without it; all round correctly with it). Six decimals was too
  wide: a real 6.4999999675% (200,000,001 to 213,000,001, a large account's Views) showed 7% (Paul, #285). At nine, a
  real value would have to sit within 0.0000000005 of a half, which no realistic prior produces.
- Examples: 6.3 gives 6; 6.57 gives 7 (her two); 6.5 gives 7; 0.42 gives 0.4; 0.35 gives 0.4; 0.05 gives 0.1; 0.95
  gives 1; -6.3 gives -6; -6.57 gives -7; -0.42 gives -0.4; -0.04 gives 0; 123.5 gives 124. Checked against exact
  integer rounding over 4,839,831 pairs (priors 100 to 20,000, currents within 1.2%): no difference.
- In `lib/`, not under Organic Social, because the shared `KpiCard` imports it.

### 3.2 `KpiCard` gets an optional `wholeDelta?: boolean`
- Absent or false: the component renders exactly as today, byte for byte.
- True, with `delta` defined: `shown = roundDelta(delta)`. The arrow, the colour and the text all come from `shown`:
  up arrow and green when `shown > 0`, down arrow and red when `shown < 0`, the flat mark and muted when `shown` is 0
  (colours swapped under `invertDelta`, as today); the text is `Math.abs(shown)`, with one decimal when it is under 1
  and not 0, else none, then "%", then the label. So +0.3% shows "↑ 0.3% vs prior period", and +0.04% shows
  `— 0% vs prior period` in the muted colour, never a green arrow next to "0%".
- True, with `delta` undefined: unchanged (the placeholder when `comparisonExpected`, else nothing).

### 3.4 The change on an outline client's fallback tabs (after Paul's review, 2026-10-01)
- An outline client's tab with no outline rows (Piper's X; Overview, hidden for all five today) shows the v1 tiles. Those
  measured the change with the shared `delta()`, which divides by the signed prior, so -2 to +4 Net New Followers read
  as a red "↓ 300%". The fallback now asks for the size-based change (`outlineDelta`, as the outline tiles already use):
  `HeadlinesSection` takes one `outline` flag, which asks `getPlatformHeadlines` for `'size'` and turns on the rounding
  above, so the two cannot drift apart. It is worked out after Dash answers, so the request and every lock key are
  unchanged (`lock-key-pin.test.ts`).
- Every client on the outline Data part gets it (on staging 2026-10-01: A Place For Mom, Akara, Joy of Life, PIMCO and
  Piper; Piper's X is the one fallback tab they show).
- Renaissance is unchanged: the v1 part asks with exactly its four arguments and keeps the signed change, still with the
  flipped arrow after a negative prior. Fixing it for Renaissance is deferred, a decision for Thomas and Paul together.

### 3.3 Who sets it
- `OutlineTiles`: every card it draws with a value passes `wholeDelta` (`outline-tiles.tsx:22-29`). The flagged blank card
  (`:20`) has no `delta`, so nothing changes there.
- The outline Data part's fallback, so an outline client's tab with no outline rows (today Piper's X tab) rounds too,
  as Jasmine's "ALL" asks: `PlatformHeadlines` gets an optional `wholeDelta?: boolean` (default false) that it passes to
  every card; the v1 part's `HeadlinesSection` (`parts/platform-headlines.tsx:9-12`, not exported today) is exported with
  props `OrganicSocialCtx & { wholeDelta?: boolean }` and passes the flag on; and the outline Data part
  (`parts/outline-data.tsx:42-43`) renders `<Suspense fallback={<HeadlinesSkeleton />}><HeadlinesSection {...ctx} wholeDelta /></Suspense>`
  instead of calling `platformHeadlinesV1.render`. The v1 part itself (`parts/platform-headlines.tsx:14-24`) never passes
  it and stays the same object (the registry and `ytd-parity.test.ts` hold it by identity).
- A Dash failure, a timeout and no data render exactly as v1 on that fallback: the same `HeadlinesSection`, `Fallback`
  (`parts/platform-headlines.tsx:11`) and `NoData` (`platform-headlines.tsx:41-42`).
- Nothing else passes it. Renaissance renders the v1 part and pins no outline part, so it never gets the flag.
- The v1 tiles' change is the shared `delta()`, which divides by the signed prior (the known Renaissance-path follow-up
  in CLAUDE.md); rounding it does not fix that, and nothing here changes how it is computed.
- Comments that become false are updated: `outline-tiles.tsx:12-13` ("drawn exactly as the shared tiles draw them") and
  `:35-37` ("the same markup as the shared PlatformHeadlines"): true now only when a tile has no prior.

### 3.4 Doc fix
`format.ts:3`: "(3.5% -> \"3%\")" becomes "(3.5% -> \"4%\")". Comment only.

### 3.5 What does not change
- Every other `KpiCard` caller, and Renaissance's tiles (the v1 part, which never passes the flag).
- Tile values: rates keep `pctCompact`; counts keep `num`. Only the change line rounds.
- How the change is computed (`outlineDelta`). A rate's change is relative (2% to 3% reads "up 50%"), as today; it is a
  percent change, so it is rounded like any other.
- No request, lock key or data shape: this is display only.

## 4. Failure handling
- `delta` undefined: unchanged (section 3.2).
- A change that rounds to zero (under 0.05%): muted flat mark and "0%", no arrow.
- A non-finite `delta` cannot come from `outlineDelta` (`outline-delta.ts:13-14` returns undefined for a missing or zero
  prior). If one ever reached the card it would print "NaN%" with or without the prop, as `toFixed` does today: out of
  scope.

## 5. Edge cases
| # | Case | Expected | Test |
|---|---|---|---|
| 1 | her examples, 6.3 and 6.57 | 6% and 7% | R1, K2 |
| 2 | exact halves, 6.5 and 0.5 | 7% and 1% | R2 |
| 3 | 6.45 | 6%, not 7% | R3 |
| 4 | float noise, 6.4999999999 and 5.0000000001 | 7% and 5% | R4 |
| 5 | a small change, 0.3 or -0.42; a tiny one, 0.04 or -0.04 | "↑ 0.3%", "↓ 0.4%"; `— 0%`, muted, no arrow, never -0 | R5, K2, K3 |
| 6 | drops, -6.3 and -6.57 | down arrow, 6% and 7% | R2, K2 |
| 7 | large changes, 123.5 and -1000.4 | 124% and 1000% | R6 |
| 8 | no prior | the placeholder, unchanged | K4 |
| 9 | `invertDelta` with the prop | colours follow the rounded value, swapped | K5 |
| 10 | card without the prop | one decimal, byte for byte | K1, the goldens |
| 11 | outline tiles | whole numbers; a tiny change has no arrow | O1 |
| 12 | Data block markup parity with the shared tiles | unchanged (its fixture has no prior, so no change line) | O2 |
| 13 | Renaissance's tiles | unchanged, change text byte for byte | O3 |
| 14 | an outline client's tab with no outline rows (Piper's X) | the v1 tiles, with whole-number changes | O4 |
| 15 | the v1 part rendered directly | no flag, one decimal | O3, O4 |

## 6. Tests (written before the code)
- `lib/delta-rounding.test.ts` (new; add it to the explicit vitest include list next to `lib/concurrency.test.ts`):
  - R1 `roundDelta(6.3)` is 6 and `roundDelta(6.57)` is 7.
  - R2 `[6.5, 0.4, 0.5, -6.3, -6.57, -6.5, 0]` map to `[7, 0, 1, -6, -7, -7, 0]`.
  - R3 6.45 gives 6 and -6.45 gives -6.
  - R4 6.4999999999 gives 7 and 5.0000000001 gives 5.
  - R5 `Object.is(roundDelta(-0.04), 0)`; under 1%, one decimal (0.42 gives 0.4, 0.95 gives 1).
  - R6 123.5 gives 124 and -1000.4 gives -1000.
- `components/charts/kpi-card.test.tsx` (in the include list already):
  - K1 without the prop, `delta` 6.34 reads "↑ 6.3% vs prior period".
  - K2 with the prop: 6.34 "↑ 6% vs prior period", 6.57 "↑ 7% ...", -6.57 "↓ 7% ...", 0.3 "↑ 0.3% ...", -0.42
    "↓ 0.4% ...", 0.96 "↑ 1% ...", 0.04 `— 0% ...`.
  - K3 with the prop, 0.04 is muted (`text-text-muted`), not green.
  - K4 with the prop and no `delta`, `comparisonExpected` still reads `— vs prior period`.
  - K5 with the prop and `invertDelta`, -6.57 reads "↓ 7% ..." in green.
- `components/report-sections/organic-social/parts/outline-parts.test.tsx`:
  - O1 `OutlineTiles` with Views `delta` 6.34 shows "↑ 6% vs prior period" and not "6.3%"; Likes `delta` 0.04 has no up arrow.
  - O2 the existing parity test (`:132-141`) passes unchanged; it now holds only because its fixture has no prior
    (`:34-35`), so it no longer covers the change line (O1 does).
  - O4 (replaces `:105-113`, "on Overview or an uncovered channel the Data part is v1", on purpose): on Overview and on
    a TWITTER tab, `v2.render(ctx, r)` `toEqual`s `<Suspense fallback={<HeadlinesSkeleton />}><HeadlinesSection {...ctx} wholeDelta /></Suspense>`,
    and the child of `platformHeadlinesV1.render(ctx, r)` has no `wholeDelta` prop; the engagement breakdown is still
    nothing there. And `PlatformHeadlines` with `wholeDelta` and a `delta` of 5.2 reads "↑ 5% vs prior period".
- O3 Renaissance: `components/report-sections/organic-social/render-invariant.test.tsx` passes with its snapshot
  unchanged (it renders the shared tiles with real deltas and no flag); the goldens (`v1-render.golden.test.tsx`,
  `parts/platform-headlines.golden.test.tsx`) pass too, as a secondary check.
- The `pctCompact` tests (`pct-compact.test.ts`, `post-card.pct.test.tsx`) pass unchanged; the doc fix is a comment.

## 7. Other open PRs
Checked 2026-09-29 against #281 to #292: none touches `kpi-card.tsx`, `outline-tiles.tsx`, `platform-headlines.tsx`,
`parts/platform-headlines.tsx`, `parts/outline-data.tsx`, `format.ts`, `delta-rounding.ts` or the test files here.
`vitest.config.ts` is also edited by the open #281 and #287 at other lines (the closed #290's branch edits it too; it will
not merge); the plan's last task proves every merge.

## 8. Out of scope
Rounding anywhere else (other sections, the v1 part as Renaissance renders it, `capsule-column-chart.tsx`,
`metric-delta.tsx`, `trend-area-chart.tsx`), how changes are computed, tile values, and Renaissance.
