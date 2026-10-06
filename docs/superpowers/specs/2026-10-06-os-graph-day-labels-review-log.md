# Review log: Organic Social graph dates read like 9/16

Spec: `2026-10-06-os-graph-day-labels-design.md`. Fixed checklist: scope against the request; inputs and outputs; every
citation opened and checked; parity with today; every caller; failure behaviour; edge cases; a test for every output.
At most two rounds; round 2 reviews only the changed lines.

## Round 1 (fresh reviewer, read only, 2026-10-06)
Citations checked and correct (one range off by two lines, B8). No caller outside Organic Social is affected; the tests
that mock `LineChart` read single props. No BLOCKER.

| # | Sev | Finding | Outcome |
|---|---|---|---|
| B1 | MAJOR | No test proved `LineChart` itself hands the Tooltip a `labelFormatter`, or that the notes hover box shows `9/21` and still finds the note by the raw key. | Fixed: test 4 now goes through `LineChart` with the existing Tooltip recorder (`line-chart.test.tsx:7-19`), with and without notes; test 5 checks the absent case. |
| B2 | MINOR | State `formatMonthDay`'s signature; it is exported from a `'use client'` module. | Plan: `formatMonthDay(value: string \| number): string`, used by `LineChart` and tests only. |
| B3 | MINOR | The "any time zone" row is not a vitest case. | Plan: assert behaviour only; the implementation builds no `Date` (code review checks it); the row is marked as a property, not a test. |
| B4 | MINOR | The pattern accepts impossible dates (`2026-13-45` gives `13/45`), as `dayLabel` does. | Plan: pin it on purpose with a test row (parity with `dayLabel`). |
| B5 | MINOR | Nothing tests that Paid Media passes no `xFormat`. | Plan: in `paid-media/overview/trend.test.tsx`, assert the recorded props have no `xFormat` (test-only edit). |
| B6 | MINOR | Name the files for tests 8 and 9. | Plan: test 8 in `annotation-callouts.test.tsx` (its `LineChart` recorder); test 9 covers both YTD renderers, `parts/ytd-review.tsx` and `parts/ytd-review-sheet.tsx`, with their `charts()` helpers. |
| B7 | MINOR | Say the three no-data snapshots stay byte-identical. | Plan: assert in the snapshot review. |
| B8 | MINOR | `v1-render.golden.test.tsx:5-13` is `:5-15`; `line-chart.test.tsx` already has the same stub. | Plan: reuse that stub. |
| B9 | MINOR | The change reaches every `ChannelTrendChart` render of any version, including clients still on v1 graphs. | Plan: say so in the PR description (within "all clients"). |
