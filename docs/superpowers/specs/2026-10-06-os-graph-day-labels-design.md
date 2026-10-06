# Organic Social graph dates read like 9/16

**Date:** 2026-10-06. **Branch:** `fix/os-graph-day-labels`, off `dev` at `0b5a0a97`. **Status:** spec.
**Scope:** the daily graphs of the Organic Social report, for every client. No other report or department changes.

## 1. The request
From the stakeholder's review of Renaissance on staging (2026-10-05), verbatim: "For the graphs is it possible to update
the dates to read like this: 9/16, 10/20, 8/2, etc?" Asked whether this was for Renaissance or every client, the
answer was "all clients pls". The examples are month/day, no leading zeros, no year. This is the third of three points
in that message; the other two are separate PRs.

## 2. What happens today (read in the code on `dev`, and seen on staging on 2026-10-06)
- Every daily Organic Social graph is drawn by `ChannelTrendChart` (`components/report-sections/organic-social/trends.tsx:44-243`),
  which renders the shared `LineChart` with `xKey="date"` (`trends.tsx:223-237`):
  - `FollowerGraph` (`follower-graph.tsx:8-12`), used by `follower-graph` versions 1 and 2
    (`parts/follower-graph.tsx:22`, `:74-80`);
  - `EngagementTrend` (`trends.tsx:245-249`), used by `engagement-trend` versions 1 and 2, on platform tabs and on
    Overview (`parts/engagement-trend.tsx:18`, `:43`, `:61-67`).
- The `date` values are Dash's daily keys, copied unchanged (`lib/organic-social/trend-series.ts:22-41`). On staging
  (Renaissance, Instagram, 2026-10-06) the axis reads `2026-09-07 … 2026-10-05`.
- `LineChart` sets no formatter on the x-axis (`components/charts/line-chart.tsx:347-352`) or on the Tooltip's label
  (`:361-372`), so both print the raw key.
- Everything else on these graphs already reads `9/16`: callout labels and the dot and card names (`dayLabel`,
  `lib/organic-social/annotations.ts:120-123`, used at `:131` and `parts/chart-notes.ts:84`), and the add-note form
  (`note-form.tsx:28`, `:160`, `:173-209`).
- The YTD graphs plot month labels (`lib/organic-social/ytd.ts:12`, `:90`; `parts/ytd-review-sheet.tsx:80-87`;
  `parts/ytd-review.tsx`), not days.
- `LineChart` has one user outside Organic Social: Paid Media's trend (`components/report-sections/paid-media/overview/trend.tsx:3`).
  On staging its axis reads `2026-09-02 … 2026-09-30` and must keep doing so.

## 3. The change
1. `LineChart` gains one optional prop, `xFormat?: 'month-day'`, a string descriptor like its existing `valueFormat`
   (`line-chart.tsx:57-58`), so a server component can still render it. Absent, the chart passes no formatter and
   renders exactly as today.
2. With `xFormat="month-day"`, the x-axis ticks (`XAxis tickFormatter`) and the hover-box date (`Tooltip
   labelFormatter`) print `formatMonthDay(value)`:
   - a value matching `^\d{4}-\d{2}-\d{2}$` prints as `<month>/<day>` with no leading zeros and no year
     (`2026-09-16` → `9/16`, `2026-10-20` → `10/20`, `2026-08-02` → `8/2`);
   - anything else prints unchanged (never `NaN/NaN`).
   It splits the string and never builds a `Date`, so no time zone can shift a day (the same method as `dayLabel`).
3. `ChannelTrendChart` passes `xFormat="month-day"` (`trends.tsx:223`). Nothing else passes it.

Display only. The data, the x values, the callouts' and marks' x matching (`line-chart.tsx:186`, `:389`), and the
notes lookup (`:370`) all keep using the raw key. Recharts 3.7.0 passes every Tooltip prop into a custom hover box with
the raw `label` (`node_modules/recharts/lib/component/Tooltip.js:170-172`; default box at `:34-42`), and the default
box applies `labelFormatter` to it (`DefaultTooltipContent.js:123-124`). So `NotedTooltip` (`line-chart.tsx:118-126`)
shows the formatted date and still finds the note by the raw key.

## 4. Where it shows, per client
- **Every client's platform tabs** (all six pin `follower-graph` 2 and `engagement-trend` 2, staging data): both daily
  graphs, axis and hover box.
- **Renaissance's Overview** (the shared template's `engagement-trend` 1, staging data): the engagement graph, axis and
  hover box. It is drawn by the same `ChannelTrendChart`.
- **Unchanged:** the YTD graphs (they pass no `xFormat`; their month labels stay), Paid Media's trend (passes no
  `xFormat`), every other chart, the month picker, and the date picker.

## 5. Edge cases (all are tests)
| Input | Output |
|---|---|
| `2026-09-16`, `2026-10-20`, `2026-08-02` | `9/16`, `10/20`, `8/2` |
| `2026-01-01`, `2026-12-31`, `2028-02-29` | `1/1`, `12/31`, `2/29` |
| `Sep`, `Oct (live)`, `""`, `2026-9-16`, `2026-09-16T00:00:00Z` | printed unchanged |
| A number (Recharts can pass one) | `String(value)`, unchanged |
| A range across a year end (`2026-12-30 … 2027-01-02`) | `12/30 … 1/2`, no year, as in the examples |
| Any machine time zone | same output (no `Date` is built) |

Shorter labels may let Recharts show more ticks before thinning them (its default tick interval hides labels that
would overlap). That is an expected visual effect of the request, checked on staging, not a defect.

## 6. Failure behaviour
None new. The formatter cannot throw (string test, then split) and falls back to the raw value.

## 7. Blast radius
- `line-chart.tsx` is the only shared file. Its new prop is opt-in; Paid Media passes nothing, so its output is
  byte-identical (guarded by the existing golden `Paid Media shaped chart, no marks`,
  `components/report-sections/organic-social/v1-render.golden.test.tsx:79-81`).
- `trends.tsx` is imported only inside Organic Social (`git grep`).
- No database change, no Dash request change (lock keys are untouched), no server action change.

## 8. Files
- `components/charts/line-chart.tsx`: the `xFormat` prop, the exported `formatMonthDay`, and passing the formatter to
  `XAxis` and `Tooltip` only when `xFormat === 'month-day'`.
- `components/report-sections/organic-social/trends.tsx`: `xFormat="month-day"` on its `LineChart` (`:223`).
- Tests and the one golden snapshot file (section 9).

## 9. Tests (written first, watched fail, then made to pass)
`components/charts/line-chart.test.tsx`:
1. `formatMonthDay`: every row of the section 5 table.
2. Parity: for every day of 2026 and of 2028, `formatMonthDay(day) === dayLabel(day)` (`annotations.ts:120`), so the
   axis and the callouts can never disagree.
3. Rendered with `ResponsiveContainer` stubbed to a fixed size (the stub already in this file, `line-chart.test.tsx:15-16`): with
   `xFormat="month-day"` the axis ticks read `M/D`; without it they read the raw keys.
4. The hover box, through `LineChart` itself, using the file's existing Tooltip recorder (`line-chart.test.tsx:7-19`,
   `tooltipProps`):
   - without notes: `LineChart` with `xFormat="month-day"` hands `Tooltip` a `labelFormatter` that maps `2026-09-21` to
     `9/21`;
   - with notes (`notes={{ '2026-09-21': 'Influencer post went live' }}`): rendering the recorded `content` with
     `{ ...recordedProps, label: '2026-09-21', payload: [one series item] }` shows `9/21` in the header and the note
     text, so the note is still found by the raw key (`line-chart.tsx:370`). The payload must be non-empty, since the
     default box formats the label only when a payload is present (`DefaultTooltipContent.js:123`).
5. `LineChart` without `xFormat`: the recorded Tooltip props carry no `labelFormatter` (the axis half of "unchanged" is
   test 3's raw-key case).

`components/report-sections/organic-social/v1-render.golden.test.tsx`:
6. The `Paid Media shaped chart, no marks` snapshot stays byte-identical (not updated).
7. The five Organic Social v1 graph snapshots are updated, and their diff is only the tick text changing from
   `2026-08-DD` to `8/D` (checked line by line before committing).

`components/report-sections/organic-social/`:
8. `ChannelTrendChart` renders its `LineChart` with `xFormat="month-day"`.
9. A YTD block renders its `LineChart` with no `xFormat` (month labels unchanged).

The full suite, the type check (`tsc --noEmit`) and the linter must pass with the commands CI runs.

## 10. Verification after merge to staging
- Renaissance and each of the five clients, every platform tab: both daily graphs' axes and hover boxes read `M/D`.
- Renaissance's Overview engagement graph reads `M/D`.
- The YTD graphs still read `Jan … Sep`.
- The department gate (private snapshots of 2026-10-06): Paid Media's trend axis still reads `2026-09-02 … 2026-09-30`;
  the 24 non-Organic-Social staging pages and the staging database fingerprint are unchanged.

## 11. Out of scope
The YTD month labels, the month picker's "October 2026, through Oct 5" and "vs Sep 1 to Sep 5" text, the date picker,
Paid Media and every other chart, `BarChart`, merging `dayLabel` with `shortDay`, and notes on the YTD graphs.

## 12. Conflicts
- Open PR #320 (PDF export) and #321 touch none of these files.
- The sibling PR for Renaissance's YTD months touches none of these files.
