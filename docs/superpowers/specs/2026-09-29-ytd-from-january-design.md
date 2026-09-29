# YTD Review from January 2026: design

Status: draft for review (spec step 2 of the regimen). Code read on `origin/dev` d4f4a42.

## Why
Jasmine's staging feedback, round 1, YTD Review row: "We need this to be from Year to Date starting January 2026."
Settled 2026-09-29 from her own guide: January to July appear on the YTD graphs only. The monthly reports clients can
open still start at the client's first reporting month (her guide: reports start with August 2026).

## What happens today
- `ytdConfig` reads `dash_social_config.reportingMonths` and returns `{ firstMonth, comparison }` (`lib/organic-social/ytd.ts:31-36`).
- `ytdMonths` starts at the later of January and `firstMonth` (`ytd.ts:48-49`) and adds the month on screen only if it
  is on or after `firstMonth` (`:55`). With `firstMonth` 2026-08, an August view shows August only.
- `YtdReviewSection` requests every month at once with `Promise.all`, all or nothing
  (`components/report-sections/organic-social/parts/ytd-review.tsx:30-32`), through `getOutlineKpis`, which is the
  Data block's own cached request (`lib/organic-social/outline-headlines.ts:60-91`).
- A null metric becomes 0 (`outline-headlines.ts:35`); a month is `noData` only when every metric is null (`:31`).
  `ytdSeries` leaves a `noData` month off and names it under the graphs (`ytd.ts:61-75`, `ytd-review.tsx:49`).
- Every request for a client on locked months goes through `lockingClient` (`lib/organic-social/base.ts:27-38`). A
  request whose dates are all on or before `settledThrough` is served from `dash_response_locks`, or captured from Dash
  uncached and stored on first read (`lib/organic-social/locking-client.ts:74-106`). `settledThrough` ignores
  `firstMonth` (`lib/organic-social/lock-day.ts:31-40`).
- After that, a stored prior-month answer replaces the answer's comparison values (`locking-client.ts:107-111`,
  `withLockedBaseline` at `:60-70`, `priorParams` in `lock-day.ts`).
- Measured 2026-09-29 (read-only): staging holds lock rows for August only, for the three outline clients. Production
  has no lock table yet (it ships with the October release).

## The problem a naive change creates
Moving the start to January makes an August view request January to July. Those requests end before `settledThrough`,
so they would be captured and locked forever on first view (all "late locks"), and July's stored answer would then
become August's comparison baseline. That changes August's percent changes, which clients already see on staging.
It was measured on staging data on 2026-09-28 (figures kept privately, not in this public repo). Months whose
account metrics are null in Dash would also be re-captured, uncached, on every view.

## Requirements
- R1. A client can set a YTD start month separately from `firstMonth`. Absent, YTD behaves exactly as today.
- R2. The month picker, month locking, lock days and what clients may open are unchanged by R1.
- R3. No number a client can already see changes: every August tile and delta, and every stored lock, stays
  byte-identical.
- R4. No Dash request changes shape (the lock key hashes the exact request, `lock-day.ts:84`;
  `lock-key-pin.test.ts` pins them).
- R5. A month whose Followers or Views value is null in Dash is left off that graph and named, never drawn as 0.
- R6. At most 3 YTD requests are in flight at once.
- R7. In a new year the graphs restart in January (her guide), without a config change.

## Design
1. **Config key.** `reportingMonths.ytdFrom`, a `YYYY-MM` string. `ytdConfig` returns `ytdFrom`: the key when it is a
   valid month, else `firstMonth`. An invalid key logs one warning and is ignored. `parseReportingMonths` already
   ignores unknown keys (`reporting-months.ts:104-129`), so R2 holds with no change there.
   `ytdMonths`: `from` = the later of January of the year on screen and `min(ytdFrom, firstMonth)`. The month-on-screen
   rule at `ytd.ts:55` stays on `firstMonth`. R7 follows from "the later of January".
2. **Months before `firstMonth` are never locked (chosen).** `lockingClient` takes `firstDay` (the first day of
   `firstMonth`, from `base.ts`). A request whose `startDate` is before `firstDay` is served live through the ordinary
   cached client, never captured or stored. The locked baseline is applied only when the prior request's `startDate`
   is on or after `firstDay`. August's prior (July) is before `firstDay`, so August keeps Dash's own comparison, exactly
   as today (no July lock exists). This also closes the stray-row half of the "settledThrough ignores firstMonth"
   follow-up.
   - Rejected: keep locking history but skip the baseline before `firstMonth`. It still writes permanent rows for
     months nobody can open and re-captures null months uncached on every view.
   - Cost of the choice: the YTD history line can move if Dash revises a month before `firstMonth`. Those months are
     not reports clients open; the graph states them as they are in Dash.
3. **Gaps.** `OutlineKpis` gains `nulls: string[]`, the tile keys whose Dash value was null. It is additive, so the
   tiles do not change (the tiles' own null-as-0 stays a separate follow-up). `ytdSeries` returns one point list per
   graph plus the months left off each. The section names them under the graphs.
4. **Cap.** `ytd-review.tsx` requests with `mapWithConcurrency(months, 3, ...)` (`lib/concurrency.ts:19-36`). It is
   still all or nothing.

## Failure behaviour
- A month request fails: the block shows its error card, as today.
- Invalid `ytdFrom`: YTD behaves as today, with one warning log line: `[organic-social] ytd-review ytdFrom is invalid slug=...`.
- A pre-`firstMonth` request with null account metrics: served from the cached live client and shown as a gap.
  Nothing is stored.

## Edge cases
| Case | Expected |
|---|---|
| `ytdFrom` absent | Identical to today |
| `ytdFrom` later than `firstMonth` | Floor stays `firstMonth` |
| `ytdFrom` in a previous year | Graph starts in January of the year on screen |
| January on screen | January only |
| Followers null in March, Views present | March is off the Followers graph and named; on the Views graph |
| Every metric null in a month | Off both graphs, named (today's `noData`) |
| Team's live month | Unchanged: `(live)` label, month-to-date request |
| A request spanning `firstDay` | Served live, not stored (clients cannot select one) |

## Tests (written before code)
- `ytd.test.ts`: `ytdFrom` parsing and fallback; the floor and restart rules; per-graph gaps.
- `locking-client.test.ts`: a pre-`firstDay` request goes to `inner`, never to `capture` or `write`; the baseline is
  skipped when the prior is before `firstDay`; everything already tested is unchanged with `firstDay` absent.
- `ytd-review.test.tsx`: at most 3 requests in flight; gap names rendered; unchanged markup when `ytdFrom` is absent.
- `outline-headlines` tests: `nulls` lists exactly the null keys; tiles unchanged.
- `lock-key-pin.test.ts` passes unchanged (R4).

## Scratch trial (before the plan is final; ask first)
Question: with `ytdFrom: '2026-01'`, does every August tile, delta and YTD point stay identical, and are zero lock
writes attempted? Run on staging data with a recording lock store that never writes, comparing `ytdFrom` absent and
present for the three outline clients. Budget: 30 minutes, about 150 lines, throwaway.

## Rollout
Set `ytdFrom: '2026-01'` on staging for the three outline clients (and any client switched on later) with a
guarded, dry-run staging script. Production gets it with the October release.

## Decision update, 2026-09-29 (call with Jasmine, 27:10 to 27:29): this changes the design above
- The YTD history must match what clients were already shown, so it comes from Jasmine's own numbers, not Dash.
  She is sending a Google Sheet: one tab per client, January through August, followers and views per platform per
  month (impressions for LinkedIn).
- From September on, the YTD points come from our own locked months, as the Data block does.
- Consequences for this spec (to be reworked before any code): design point 2 (locking months before `firstMonth`) may
  no longer be needed, since months before August would not be read from Dash at all; the graphs need a store for the
  supplied history. That store holds client figures, so it lives in the database, never in this public repo, and the
  import gets a data check (contract-core) and a guarded staging script.
- Still to settle with her: nothing on the design; waiting only on the sheet.
- The target is this month's cycle (the September report, which clients see from Oct 12).
- Renaissance never gets YTD (standing rule).
