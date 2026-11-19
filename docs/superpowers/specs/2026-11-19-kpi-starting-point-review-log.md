# Review log: KPI Check-In starting point spec

## Round 1 (2026-11-19), whole spec, fixed checklist

0 BLOCKER, 6 MAJOR (all fixed with targeted edits), 7 MINOR (for the plan, no further round).

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | MAJOR | `healthCritical: true` would turn a failed start read into a page-wide `down` | Fixed: `healthCritical: false`, reason cited (`lib/cache.ts:46-52`, `:191`) |
| 2 | MAJOR | A start read "in parallel" is dropped on the part's early returns, unhandled rejection | Fixed: read only after rows are known, awaited in try/catch, nothing on early returns |
| 3 | MAJOR | `kpiSheetFor` is pure and called twice, so it cannot log once with the slug | Fixed: `startTabInvalid` marker, the part logs once after its final lookup |
| 4 | MAJOR | "H2 target = end of year" is false January to June (H1 allowed, `kpi-sheet.ts:56`) | Fixed: Why says H1 Jan to June, start unchanged |
| 5 | MAJOR | Edge 6 contradicted the year rule | Fixed: trimmed four digits; `2025.0` is a layout error |
| 6 | MAJOR | Where staff notes render, and that the export leaves them out, was undefined | Fixed: staff live view only; block note under the heading, platform note in the card |
| 7 | MINOR | Is a blank row inside a block skipped or the end? | Plan |
| 8 | MINOR | Trim `startTab` like `tab` (`ytd-sheet.ts:34`); whitespace-only invalid | Plan |
| 9 | MINOR | `missing=` must be fixed tokens, never cell text | Plan (test it) |
| 10 | MINOR | The read covers `A1:Z40` only | Plan (state the limit) |
| 11 | MINOR | Citations: `readMonthTabImpl` is `ytd-sheet.ts:183-190`, `readMonthTab` `:194-196` | Plan |
| 12 | MINOR | Missing tests: edge 6, edge 8, health record, logs carry no tab or id, ring `aria-label`; capture the ring snapshot BEFORE the change | Plan |
| 13 | MINOR | Omit `startTab` when absent so existing `toEqual` tests hold | Plan |

## Round 2 (2026-11-19), changed lines only

3 MAJOR, 3 MINOR. No round 3.

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | MAJOR | Test line still said the start read runs alongside the month read | Fixed (one fix, no choice): test line now says no read on early returns, read after rows resolve |
| 2 | MAJOR | Invalid `startTab`: item 5 lists a staff note, the failure table says no note | Decided by me 2026-11-19: staff note (failure table updated) |
| 3 | MAJOR | Start-line rules ran into the notes paragraph, reading as if notes print for clients | Fixed (one fix, no choice): start-line rules moved above the notes paragraph |
| 4 | MINOR | Try/catch should wrap the read only; parse errors go to the layout row | Plan |
| 5 | MINOR | Serial read can delay the rings up to the reader's 10 s deadline; or start after `:59`, await after `:83` | Plan |
| 6 | MINOR | `healthCritical: false` also gates the negative-memo replay, `lib/cache.ts:162` | Plan (cite it) |
