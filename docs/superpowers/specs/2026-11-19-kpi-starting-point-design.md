# KPI Check-In shows where we started the year

Date: 2026-11-19. Status: spec, before code. Organic Social only. Renaissance untouched (it has no `kpiSheets`, so no KPI
Check-In).

## Why

A Place For Mom asked on their reporting call to see where we started, next to their progress, on the Overview's KPI
Check-In. Jasmine confirmed it in Slack (2026-11-19 12:55 PM): add "where we ended in 2025" so "in one view they'd see
where we start, our progress, and our EOY target". She put the figures in the same KPI tracker, on a new tab.

Today each ring shows the year-to-date figure against the half's target and nothing else
(`components/report-sections/organic-social/parts/kpi-check-in.tsx:106-108`, `components/charts/progress-ring.tsx:12-34`).
The target row is "H<1|2> <year> Target" (`lib/organic-social/kpi-sheet.ts:26`); an H1 target is allowed only on a January
to June row (`:56`). From July the target is H2, which ends December 31: the end-of-year target. In January to June the
ring's target is the H1 target, and the start line is still last year's end (the start does not depend on the half).
Progress and target are already on screen; the start is what is missing.

## Measured (read only, 2026-11-19)

| Fact | Source |
|---|---|
| Her link is the spreadsheet production already reads for APFM's KPI Check-In (`kpiSheets["2026"] = { sheetId, byMonth: true }`, sheet id equal) | production probe `prod-apfm-kpi-2026-11-11.mts`, rerun 2026-11-19 |
| The app's service account reads it: tabs "Annual Growth", "September 2026", "October 2026" (status 200) | service-account probe |
| "Annual Growth", read as the app reads a tab (values endpoint, `rangeFor`, `lib/organic-social/ytd-sheet.ts:72-74`), run through `classifyCell` (`ytd-sheet.ts:39-46`): row 1 a title; row 2 empty; row 3 `C-E = Total Followers, Impressions, Engagements`; then per platform two rows, `[name, 2025, number, number, number]` and `["", 2026]` with C-E blank; Instagram, Facebook, LinkedIn; 9 rows | same probe (kinds only, no figures) |
| APFM shows Instagram, Facebook, LinkedIn; KPI Check-In is pinned on its Organic Social Overview (`extraParts: kpi-check-in v1`) | production probe |
| Production is unaffected by the new tab: month tabs are found by name only (`kpi-sheet.ts:121-126`); September and October still parse | service-account probe running `parseKpiGrid` |
| The monthly tabs are year to date: "End of October" with the badge "1/1/26 to 10/31/26" (`kpi-sheet.ts:25`, `:75-81`) | code |

## What the start figure means

The tracker's own convention decides it, no new question for the team: a monthly row "End of <Month>" is the figure at
the end of that month, year to date. So the "<year>" row on the start tab is the figure at the end of that year:
followers on December 31, impressions and engagements for the whole year. The label says which (Paul, #469 review, issue
470): **"End of 2025: 12,345"** on followers, a count; **"2025 total: 900,000"** on impressions and engagements, totals over
the year, so a client never reads this year's 10 months against last year's 12 as a drop.

The start is always last year's row: viewing 2026 reads the "2025" row; viewing 2027 will read the "2026" row (the row
the team left blank, ready). A row for any other year is ignored.

## What changes

1. **Setting, today-preserving.** `kpiSheets["<year>"]` gains an optional `startTab: "<tab title>"`, on either shape
   (`{ sheetId, byMonth: true }` or `{ sheetId, tab }`). Absent: exactly today. `kpiSheetFor` (`kpi-sheet.ts:104-117`)
   returns it as `startTab?: string` on the `fixed` and `byMonth` choices. A carried-forward month-tab entry (January,
   `kpi-sheet.ts:112-116`) carries its `startTab` too. A `startTab` that is not a non-empty string of at most 100
   characters is dropped: the choice carries `startTabInvalid: true` instead, the rest of the entry is still used (the
   rings never depend on it). `kpiSheetFor` stays pure and logs nothing; the part logs it once, with the slug and year,
   after its final lookup (`kpi-check-in.tsx:49`, `:52` may call `kpiSheetFor` twice). Today's
   code ignores an unknown key in both shapes (`byMonthEntry`, `kpi-sheet.ts:96-99`; `ytdSheetFor`, `ytd-sheet.ts:28-37`),
   so the setting can be written before or after the deploy without breaking anything.
2. **Parser.** `parseKpiStartGrid(grid, startYear): Partial<Record<DashChannel, KpiFigures>>` in `kpi-sheet.ts`:
   - row 3, columns C to E, must be the same header as the month tabs (`kpi-sheet.ts:24`, `:40`);
   - from row 4, a row with a platform name in column A starts that platform's block (same names as `kpi-sheet.ts:20`);
     rows after it with an empty column A belong to it;
   - only the block's row whose column B, trimmed, is `startYear` is read; it must have three numbers in C to E
     (`classifyCell`);
   - skipped, never errors (Paul, #469 review, issue 471): fully empty rows, rows whose column B is not `startYear` (another
     year, "YoY %", "2025.0"), and a block under a name that is not a platform ("Total"), rows and all;
   - a layout error (`KpiSheetLayoutError`, the same class) only on what would make a start figure ambiguous or
     unplaceable: wrong header, the same platform twice, two `startYear` rows in one block, a `startYear` row above every
     named block;
   - a platform whose `startYear` row is missing or not three numbers has no start (no error: the others still show).
3. **Reader.** `readKpiStartTab = cached('google-sheets', 'kpiStartTab', readMonthTabImpl, { version: '1', ttlSeconds: 300,
   negativeTtlSeconds: 30, healthCritical: false })` in `ytd-sheet.ts`, beside `readMonthTab`: the same read, its own key.
   `healthCritical: false` because the start is a garnish next to the rings: a failed start read must not put the page in
   the health beacon's failed set, which `deriveStatus` turns into a page-wide `down` and a Slack page (`lib/cache.ts:46-52`,
   `:191`). The failure is still logged. A 400 (tab renamed or deleted) is `'gone'`, not a failure (`readMonthTabImpl`).
4. **Display.** `ProgressRing` gains an optional `start?: { label: string; value: number }`, drawn as one muted line
   under the ring ("End of 2025: 12,345"), outside the hole so the two lines inside keep their room (K1,
   `progress-ring.tsx:17-19`). The arc, the value and "Target" are unchanged: the arc stays value over target. Without
   `start` the ring renders byte for byte as today.
5. **Part.** `KpiCheckInSection` reads the start tab only when the choice has `startTab` AND the rows are known (after
   `kpi-check-in.tsx:83`), never before: every early return (no setting `:57`, invalid `:59`, read failed `:75`, `:80`,
   month note `:81`) makes no start read and logs nothing about the start. The read is awaited in a try/catch that turns
   any throw into the "read failed" row below, so it can never reject unhandled. It costs one extra cached read (5
   minutes) only for clients with `startTab`. It passes `start` per ring for the platforms that have one. The start line
   follows today's rules for who sees what: a card a client sees only as the "updates with the <Month> report" note shows
   no start either (`kpi-check-in.tsx:89-100`); otherwise the start line is shown to clients and staff, and in the PDF
   export (each card stays one export block, `:93`).
   **Where the start notes go:** only in the staff live view (`view(true)`, `:119`), never in the client view or the PDF
   export (`PrintAsClient`, `print-as-client.tsx:9-10`). A block-wide note (read failed, gone, layout, setting invalid)
   is one line under the "KPI Check-In" heading, above the first card; a per-platform note is one line inside that card,
   under the badge row.

## Failure behaviour (the rings never depend on the start)

| Case | Client sees | Staff see | Log line (slug and year, never the sheet id or tab title) |
|---|---|---|---|
| No `startTab` | today's rings | today's rings | none |
| Start tab read fails (timeout, 403, 5xx) | rings, no start | rings, no start, note "Couldn't read the start figures." | `[organic-social] kpi start read failed slug= year= status=` |
| Start tab gone (400) | rings, no start | note "No start tab named in the setting was found." | `kpi start tab missing` |
| Layout error | rings, no start | note "The start tab's layout isn't recognised." | `kpi start layout not found missing=<what>` |
| A shown platform has no `startYear` row or not three numbers | rings, no start on that card | that card: note "No end of <startYear> figures for <Platform>." | `kpi start row missing platform=` |
| Invalid `startTab` value | today's rings | rings, no start, note "The start tab setting isn't valid." | `kpi start tab setting invalid` (once per render) |

## Edge cases

| # | Case | Expected |
|---|---|---|
| 1 | APFM, October 2026, `startTab: "Annual Growth"` | three cards, each ring with "End of 2025: <figure from the 2025 row>" |
| 2 | Viewing a 2027 month with the carried 2026 entry | reads the "2026" row; blank today, so staff get the per-platform note, clients see no start |
| 3 | A month tab not ready (staff note today) | unchanged: the note, no start |
| 4 | Fixed `{ sheetId, tab, startTab }` | same start behaviour as month tabs |
| 5 | Start tab has a platform the client doesn't show (TikTok) | ignored |
| 6 | Column B ` 2025 ` / `2025.0` / `YoY %` | ` 2025 ` reads as 2025; the others are skipped, so a platform whose only row is `2025.0` has no start (failure table row 5) |
| 7 | A figure "N/A" or blank on the 2025 row | that platform has no start (case table row 5) |
| 8 | Renaissance and every client without `kpiSheets` | untouched |

## Rollout (each step its own gate)

1. PR off `dev` (code and tests only, no setting), Paul reviews, I merge, then staging.
2. Staging: one guarded write adds `startTab: "Annual Growth"` to APFM's `kpiSheets["2026"]` (dry run first, rollback
   script); check October and September on staging against the sheet, staff and client view and PDF.
3. Production deploy, then the same one-key write in production with my go, then the same check.

## Tests (written first)

- `kpi-sheet.test.ts`: `parseKpiStartGrid` on the measured layout returns the three platforms' 2025 figures; each
  layout error in item 2; blank 2026 rows ignored; a platform whose start row is missing or "N/A" has no entry;
  `kpiSheetFor` returns `startTab` on both shapes, carries it into January, drops an invalid one and keeps the entry.
- `progress-ring` test: without `start` the markup is unchanged (snapshot); with it, the line reads "End of 2025: 12,345".
- `kpi-check-in.test.tsx`: followers read "End of 2025: <n>", impressions and engagements "2025 total: <n>", in text and `aria-label`.
- `kpi-check-in.test.tsx`: no `startTab` makes no extra read; with it, every row in the failure table and edge cases 1 to 5,
  including the client note-only card showing no start; no start read on any early return (`:57`, `:59`, `:75`, `:80`,
  `:81`), and the start read starts only after the rows resolve.
