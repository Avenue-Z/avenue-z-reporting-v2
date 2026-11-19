# KPI Check-In starting point: plan

Spec: `docs/superpowers/specs/2026-11-19-kpi-starting-point-design.md` (review log beside it). Test-first, one commit per task.

## Rulings on the review log's minors

| Minor | Ruling |
|---|---|
| R1-7 blank row inside a block | Fully empty rows are skipped anywhere; a row with an empty column A belongs to the last named platform. |
| R1-8 trimming | `startTab` is trimmed like `tab` (`ytd-sheet.ts:34`); empty after trimming, over 100 characters, or not a string is invalid. |
| R1-9 log tokens | `missing=` is one of the fixed tokens `header`, `platform name`, `no platform`, `year`, `duplicate platform`, `duplicate year`: never cell text. |
| R1-10 range | The read covers `A1:Z40` (`rangeFor`, `ytd-sheet.ts:72-74`), as every tab read does; said in a code comment. |
| R1-11 citations | Code comments cite `readMonthTabImpl` `ytd-sheet.ts:183-190`. |
| R1-12 tests | Ring markup snapshot committed BEFORE the ring changes; edge 6 and 8; the start reader's health record; logs never carry the tab title or the sheet id; `aria-label` gains ", end of <year>: <n>" only when `start` is passed. |
| R1-13 shape | `startTab` and `startTabInvalid` are omitted when absent, so today's choices are `toEqual` unchanged. |
| R2-4 try/catch | Only the read is wrapped (read failed); parse errors are the layout row. |
| R2-5 latency | Kept serial (spec item 5): the read is cached 5 minutes and runs only for clients with `startTab`; a cold failing read can add up to the reader's 10 s deadline (`ytd-sheet.ts:96-103`). Everything start-related, including the invalid-setting warning, happens after the rows are known, so early returns log nothing about the start. |
| R2-6 citation | The health comment cites `lib/cache.ts:162` and `:191`. |

## Tasks

1. **Ring.** First commit a snapshot of today's `ProgressRing` markup (passes on today's code). Then `start?: { label; value }`:
   one muted line under the ring, `aria-label` extended only with `start`. The snapshot must still pass.
2. **Setting.** `kpiSheetFor` returns `startTab` / `startTabInvalid` on `fixed` and `byMonth` (carried into January).
3. **Parser.** `parseKpiStartGrid(grid, startYear)` per the spec and the rulings above.
4. **Reader.** `readKpiStartTab` (`healthCritical: false`) and a health test beside `kpi-month-tab.health.test.ts`.
5. **Part.** Wire it after the rows are known; staff notes (block under the heading, card under the badge row) only in
   the live staff view; logs per the failure table.
6. **Gate.** `make check` with CI's placeholder `DATABASE_URL`, ESLint, repo-template gates; then the PR off `dev`.
