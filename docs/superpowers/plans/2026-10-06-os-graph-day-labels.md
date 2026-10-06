# Organic Social graph dates read like 9/16: plan

**Spec:** `docs/superpowers/specs/2026-10-06-os-graph-day-labels-design.md` (two review rounds closed). **Executor:**
inline, test first. **Baseline on `dev` 0b5a0a97:** `npm run typecheck` clean; `npx vitest run` 205 files, 2067 tests,
all pass.

## Global constraints
- `LineChart`'s new prop is opt-in; with it absent the chart passes no new prop to Recharts, so Paid Media and the YTD
  graphs render byte for byte as today.
- Touch none of the files the sibling PR (Renaissance YTD months) touches: `lib/organic-social/ytd.ts`,
  `ytd.test.ts`, `parts/ytd-review-live.tsx`, `parts/ytd-review-live.test.tsx`, `CLAUDE.md`.
- No names other than Renaissance, no client figures, no em or en dashes.

## Task 1: tests, RED
- `components/charts/line-chart.test.tsx`: `formatMonthDay` table (spec section 5, plus `2026-13-45` and `2026-00-00`
  pinned as `dayLabel` prints them, round 1 B4); a number prints unchanged; parity with `dayLabel` for every day of 2026
  and 2028; axis ticks with and without `xFormat` (stub at `:15-16`); the Tooltip recorder (`:7-19`): a `labelFormatter`
  mapping `2026-09-21` to `9/21`, the notes box showing `9/21` and the note (non-empty payload), and no
  `labelFormatter` without `xFormat`.
- `components/report-sections/organic-social/annotation-callouts.test.tsx`: `ChannelTrendChart`, `FollowerGraph` and
  `EngagementTrend` hand `LineChart` `xFormat="month-day"` (its `LineChart` mock, `:6`, `:27-28`).
- `parts/ytd-review-sheet.test.tsx` and `parts/ytd-review.test.tsx`: both YTD renderers pass no `xFormat`.
- `components/report-sections/paid-media/overview/trend.test.tsx`: Paid Media passes no `xFormat` (B5).
Run them. Expected: the new `xFormat` and `formatMonthDay` tests fail; the "no `xFormat`" ones already pass.

## Task 2: the change, GREEN
`line-chart.tsx`: `xFormat?: 'month-day'` with its doc comment; exported `formatMonthDay(value: string | number): string`
(string test, then split, no `Date`); pass `tickFormatter` to `XAxis` and `labelFormatter` to `Tooltip` only when
`xFormat === 'month-day'` (conditional spread, so the props are absent otherwise). `trends.tsx`: `xFormat="month-day"`
on its `LineChart`. Run the files, then update `v1-render.golden.test.tsx` snapshots and check the diff: the five
Organic Social graph entries change only tick text `2026-08-DD` to `8/D`; `Paid Media shaped chart, no marks` and the
three no-data entries are byte-identical (B7). Then the full suite, type check, `check:rsc`, eslint on changed files.

## Task 3: commit, push, prove
Commit with the edge-case list in the body; push. Prove clean merges with the sibling PR, #314, #320 and #321 in both
orders, and the full suite on the combined tree. Fresh-eyed review of the whole branch against the spec. Then the PR to
`dev`, with its description stating that every `ChannelTrendChart` render of any version changes (B9).
