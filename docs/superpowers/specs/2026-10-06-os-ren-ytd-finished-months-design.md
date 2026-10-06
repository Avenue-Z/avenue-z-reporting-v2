# Renaissance's YTD Review shows finished months only

**Date:** 2026-10-06. **Branch:** `fix/os-ren-ytd-finished-months`, off `dev` at `0b5a0a97`. **Status:** spec.
**Scope:** Renaissance only (the only client on `ytd-review@3`). No other client, report or department changes.

## 1. The request
From the stakeholder's review of Renaissance on staging (2026-10-05), verbatim: "for Ren the YTD graphs are showing
october which is making the trend line look like it drastically dropped, can we fix this?" This is the first of three
points in that message; the other two (notes on the YTD graphs, and graph dates as `9/16`) are separate PRs.

## 2. What happens today (read in the code on `dev`, and seen on staging on 2026-10-06)
- Renaissance pins `ytd-review` version 3 (staging data). It renders `YtdLiveReviewSection`
  (`components/report-sections/organic-social/parts/ytd-review-live.tsx:23-69`), which ignores the date picker and
  refuses any client with `reportingMonths` (`:36-39`).
- Its months come from `ytdLiveMonths(requestClock())` (`ytd-review-live.tsx:40`; `lib/organic-social/ytd.ts:118-127`):
  - `day` is the last complete UTC day, or the day before it while that day's Dash window is still open
    (`ytd.ts:119`; `clockFor`, `lib/organic-social/reporting-months.ts:82-93`: `lastCompleteUtcDay` = UTC date minus
    one, `liveDayInProgress` = UTC hour < 4, matching the fixed `T04:00:00Z` window in `base.ts`).
  - The list is January of `day`'s year through `day`'s month. Every earlier month is whole; the last runs from the
    1st to `day` and is `partial` unless `day` is its last day (`ytd.ts:122-125`).
- A `partial` month is labelled `"<Mon> (live)"` (`ytd.ts:90`), and when the YTD sheet has no number for it, its value is
  Dash's for the 1st to `day` (`ytd.ts:130-135`, `:157-161`; `ytd-review-live.tsx:55-62`).
- Views is a monthly sum (`lib/organic-social/metrics.ts:110, 123, 147, 160, 184`), so a few days of a month plotted
  next to whole months reads as a collapse. Seen on staging (Renaissance, Instagram, 2026-10-06): both graphs end with
  an "Oct (live)" point, the Views line drops sharply there, the Followers line does not.
- The existing test fixture shows the same shape (`parts/ytd-review-live.test.tsx:142`).

## 3. The change
`ytdLiveMonths` returns January through the **last finished month**, never a partial month.

- `day` is computed exactly as today (`ytd.ts:119`).
- `end` = `day`'s month if `day` is that month's last day, otherwise the month before it.
- Return January of `end`'s year through `end`, each `{ key, dateRange: custom:<key>-01,<last day>, compareRange: null,
  partial: false }`. The return type is unchanged.
- The list is never empty (January of `end`'s year is never after `end`) and has at most 12 entries.

Nothing else changes. `ytdSheetSeries`, `monthsNeedingDash`, `labelOf`, `ytdReviewBlock`, the sheet read, the
logging, and versions 1 and 2 stay exactly as they are. With no partial month, version 3 never labels a month
"(live)" and never asks Dash for a month in progress.

Two visible consequences, deliberate and for sign-off before code:
- **January (from 04:00 UTC on January 2 to 04:00 UTC on February 1):** the block shows the whole previous year, read
  from that year's sheet entry (`ytd-review-live.tsx:41-43`), instead of a one-month "Jan (live)". The titles carry no
  year (`ytd-review-sheet.tsx:70-71`). Today Renaissance already shows the previous year until 04:00 UTC on January 2
  (`ytd.test.ts:192`, `:206-210`). This matches the five outline clients by default: their version 2 YTD runs January
  through the month on screen (`ytd.ts:100-109`), and in January their default month on screen is a finished month of
  the previous year (`reporting-months.ts:176-184`, default at `:210`); their clients see November until December opens
  on the 12th (`:178-179`), and their team can pick the live January on purpose (`:171-172`).
- **February (from 04:00 UTC on February 2 to 04:00 UTC on March 1):** only January is finished, so a graph with a
  January value has one point and is drawn as a single bar, not a line (`ytd-review-sheet.tsx:84-86`); a January gap
  shows that graph's "No data" (`:85`). Today it is a line through January and "Feb (live)".

## 4. Inputs and outputs
- **Input:** the request clock (`Pick<Clock, 'lastCompleteUtcDay' | 'liveDayInProgress'>`), as today. Nothing new.
- **Output:** `YtdMonth[]` as today, with `partial` always `false` and every `dateRange` a whole month.
- **Downstream, in `ytd-review-live.tsx`:** `year` (`:41`) is `end`'s year; the sheet entry read is that year's
  (`:43`); `monthsNeedingDash` (`:55`) can only ask for whole months; Dash is asked for whole months only (`:58`),
  with the same request shape as today's whole months, so no new Dash request shape and no new cache key.

## 5. Edge cases (all are tests)
| Clock (UTC) | `day` | Months shown | Today |
|---|---|---|---|
| 2026-10-15 12:00 | 10-14 | Jan to Sep 2026 | Jan to Oct (Oct partial) |
| 2026-10-15 02:00 | 10-13 | Jan to Sep 2026 | Jan to Oct (Oct partial) |
| 2026-10-15 04:00 | 10-14 | Jan to Sep 2026 | Jan to Oct (Oct partial) |
| 2026-11-01 12:00 | 10-31 | Jan to Oct 2026 (Oct whole) | same |
| 2026-11-01 02:00 | 10-30 | Jan to Sep 2026 | Jan to Oct (Oct partial) |
| 2026-10-02 02:00 | 09-30 | Jan to Sep 2026 | same |
| 2026-10-01 02:00 (Sep 30, 10 PM New York) | 09-29 | Jan to Aug 2026 | Jan to Sep (Sep partial) |
| 2026-12-15 12:00 | 12-14 | Jan to Nov 2026 (11) | Jan to Dec (Dec partial) |
| 2027-01-01 12:00 | 12-31 | Jan to Dec 2026 (12) | same |
| 2027-01-01 02:00 | 12-30 | Jan to Nov 2026 | Jan to Dec (Dec partial) |
| 2027-01-02 12:00 | 2027-01-01 | Jan to Dec 2026 (12) | Jan 2027 only (partial) |
| 2027-02-01 12:00 | 2027-01-31 | Jan 2027 only (whole) | same |
| 2027-02-15 12:00 | 2027-02-14 | Jan 2027 only: one point, drawn as a bar | Jan + Feb (live): a line |
| 2028-03-01 12:00 | 2028-02-29 | Jan to Feb 2028, Feb ends 02-29 | same |
| Every hour, 2026-09-29 to 10-03 and 2026-12-30 to 2027-01-03 | | no month is partial; every range is whole | |

So a month appears at 04:00 UTC on the 1st of the next month (the same moment it turns whole today). The January and
February consequences are the two listed in section 3.

## 6. Failure behaviour
Unchanged. A sheet read failure, a layout error, a missing column, a Dash failure for a needed month, a missing client
row, and a client with `reportingMonths` all behave and log exactly as today (`ytd-review-live.tsx:29-66`). There are
fewer Dash requests (the month in progress is never asked for), so no new failure path.

## 7. Blast radius
- `ytdLiveMonths` has one caller, `ytd-review-live.tsx:40` (`git grep`). Version 3 is pinned by Renaissance only
  (staging data), and refuses any client with `reportingMonths` (`:36-39`).
- Versions 1 and 2 (the five outline clients) use `ytdMonths` / `ytdSheetMonths` (`ytd.ts:52-67, 100-109`): untouched.
- No file outside `lib/organic-social/`, `components/report-sections/organic-social/`, `CLAUDE.md` and this spec changes.
- No database change, no lock change (version 3 never runs for a locked client), no new Dash request shape.

## 8. Files
- `lib/organic-social/ytd.ts`: `ytdLiveMonths` (`:118-127`) and its doc comment (`:111-117`); the `YtdMonth` comment
  (`:15`) stops saying "live months".
- `components/report-sections/organic-social/parts/ytd-review-live.tsx`: the doc comment at `:19-22` only.
- `CLAUDE.md`: the two "Known behaviour" bullets that describe version 3's live month (`:1031` "(in practice the live
  month)", and `:1034-1036`). Line `:1037` is left as it is, so this PR cannot conflict with open PR #314, which edits
  the next bullet (`:1038`).
- Tests: `lib/organic-social/ytd.test.ts` and `parts/ytd-review-live.test.tsx` (section 9).

## 9. Tests (written first, watched fail, then made to pass)
`lib/organic-social/ytd.test.ts`, replacing the version-3 tests at `:167-223` that pin the partial month:
1. Every row of the section 5 table, as an exact `toEqual` on keys and on the last month's full object.
2. The every-hour sweep (`:194-205`) tightened: no month is ever `partial`, and every `dateRange` is the whole month.
3. A property check: for every hour of 2026 and of 2028 (leap), the result is non-empty, at most 12 long, starts in
   January of the last month's year, has consecutive keys, and its last month's last day is on or before `day`.

`parts/ytd-review-live.test.tsx` (clock 2026-10-15T12:00Z, `:53`), updated where they pin October:
4. `:66-81`: Dash is asked only for September (`custom:2026-09-01,2026-09-30`); labels are Jan to Sep; no "(live)".
5. `:83-99`, `:154-165`, `:211-227`: counts become 9 months; "ten months" wording becomes nine.
6. `:131-144` (X tab): a sheet that fills Jan to Sep asks Dash nothing; labels Jan to Sep; the last point is September.
7. `:229-244`: the timeout case moves from October (no longer requested) to a finished month.
8. New: no rendered label anywhere in the block contains "(live)" at the default clock.
9. New, the stakeholder's case: at 2026-10-06T12:00Z the last point of both graphs is September, and no Dash request
   is made for any October range.
9a. New, the two section 3 consequences, with a fixture holding a 2026 and a 2027 sheet entry on different tabs: at
    2027-01-15T12:00Z the block shows 2026 January to December and `readYtdTab` is called with the 2026 entry; at
    2027-02-15T12:00Z, with the 2027 sheet filling January on both graphs, each graph is a single `BarChart` with the one
    point "Jan" and Dash is asked nothing.
10. Unchanged and still passing: Overview renders nothing; a `reportingMonths` client is skipped; the January 1 test
    (`:183-190`); the concurrency and failure-logging tests.

The full suite, the type check (`tsc --noEmit`) and the linter must pass with the commands CI runs.

## 10. Verification after merge to staging
- Renaissance, each of Instagram, Facebook, LinkedIn and X: both YTD graphs end at September; no "(live)" label.
- The department gate (private snapshots of 2026-10-06): the 24 non-Organic-Social staging pages, the Paid Media trend
  axis, and the staging database fingerprint are all unchanged.
- The five outline clients' YTD Review is unchanged.

## 11. Out of scope
The five outline clients' YTD (including the team-only live month they can pick on purpose), the `(live)` label used by
versions 1 and 2, the fixed `T04:00:00Z` window, the tiles, comparisons, notes on the YTD graphs, and date formats.

## 12. Conflicts
- Open PR #320 and its review record #321 (PDF export) touch none of these files.
- Open PR #314 edits the `CLAUDE.md` bullet after the one changed here; line `:1037` is kept as a buffer, and the merge
  is proven both ways before review.
- The sibling PR for graph date labels touches none of these files.
