# KPI Check-In reads the tab for the month on screen

Date: 2026-11-11. Status: spec, before code. Organic Social only. Renaissance untouched (it has no KPI Check-In).

## Why

KPI Check-In (`components/report-sections/organic-social/parts/kpi-check-in.tsx`) reads ONE tab per client per year,
named in `dash_social_config.kpiSheets["<year>"] = { sheetId, tab }` (`kpi-check-in.tsx:45`, validated by `ytdSheetFor`,
`lib/organic-social/ytd-sheet.ts:28-37`). The month picked on screen plays no part (`kpi-check-in.tsx:36-37`).

The team now keeps one tab per month in the tracker ("September 2026", "October 2026"). With a fixed tab name the block
showed the last good read of a tab that no longer existed until the setting was changed by hand (2026-11-11: production
was moved from "Sheet1" to "October 2026" by a guarded one-field write). That repeats every month for every client set up
this way. The team approved (2026-11-11): pick a month and the block shows that month's tab; each new month works with no
change on our side; past months stay viewable; the same for any client whose tracker is linked.

## What changes

1. **A new per-client setting, today-preserving.** `kpiSheets["<year>"]` accepts a second shape:
   `{ "sheetId": "<id>", "byMonth": true }`. The existing `{ sheetId, tab }` keeps today's behaviour exactly (a fixed tab,
   the month on screen plays no part). Anything else (both `tab` and `byMonth`, `byMonth` not exactly `true`, a bad id) is
   `invalid`, handled as today (`kpi-check-in.tsx:51`: logged, nothing drawn). A new `kpiSheetFor(value, year)` in
   `lib/organic-social/kpi-sheet.ts` validates it; `ytdSheetFor` and the YTD graphs are not touched.
2. **Which month.** The month on screen is the month of the served range's last day. A locked month is served as
   `custom:<first>,<last>` (`app/dashboard/[clientSlug]/reports/page.tsx:187-189`, `reporting-months.ts:203-210`), so
   picking October serves `custom:2026-10-01,2026-10-31` and the month is October. The year rule is today's
   (`kpi-check-in.tsx:20,43`). A preset range (`last_30_days` and the like, a client without reporting months) names no
   month: it uses the newest month tab of that year whose month is not after today's month (`requestClock().today`).
3. **Which tab.** The tab whose title is `"<Month> <Year>"` with the full English month name, matched after trimming and
   ignoring case ("October 2026", " october 2026 "). No other spelling matches ("Oct 2026", "10/2026"). The titles come
   from one metadata read per sheet (`GET spreadsheets/<id>?fields=sheets.properties.title`) with the same service account,
   scope, 10 second deadline and 1-hour cache as the tab read (`ytd-sheet.ts:76-141`), so a tab added later shows within
   the hour. Two titles that both match the month are a layout error (never a guess).
4. **The tab's rows must name the same month.** In `byMonth`, every platform row must say `End of <that month>`; a tab
   copied from last month and not relabelled is a layout error naming the platform. Fixed-tab mode keeps today's rule
   (each row its own month, `kpi-check-in.test.tsx` "each row with its own period").
5. **No tab for the month yet.** Staff see "No KPI tab for <Month> <Year> yet." (the same style as today's
   "No KPI sheet configured for <year>.", `kpi-check-in.tsx:49`); clients see nothing; one warning is logged. This keeps
   the team's rule that the block stays on and forces the tracker to be filled (10/6 call, S3-D5).
6. **Release rule unchanged.** A client can only pick opened months (`reporting-months.ts:166-181`). A month that has not
   opened still shows staff the rings and the note "KPI Check-In updates with the <Month> report."
   (`kpi-check-in.tsx:54,74-75`); the row month now equals the picked month, so the note names it.
7. **Nothing else moves.** Same parser for the layout (`kpi-sheet.ts:37-63`), same rings, badge, PDF blocks
   (`export-layout.ts:22`), same Fallback on a failed read (`kpi-check-in.tsx:63-66`). No Dash request, nothing locked.

## Inputs and outputs

- In: `ctx.clientSlug`, `ctx.dateRange`, `ctx.role` (`ctx.ts:4-22`); the client row's `dashSocialConfig.kpiSheets` and
  `channels`; the clock; the sheet's tab titles; the chosen tab's cells `A1:Z40`.
- Out: the same JSX as today, or the staff note / nothing (missing tab), or the error card (read or layout failure).
- Logs (slug, year, month key, status or layout item; never the sheet id, a tab title or a value):
  `kpi month tab missing slug= year= month=`, `kpi sheet read failed ... status=`, `kpi sheet layout not found ... missing=`.

## Edge cases

| Case | Behaviour |
|---|---|
| `byMonth`, tab for the picked month exists, rows say that month | rings for that month |
| tab missing | staff note, client nothing, warning logged |
| two tabs match the month (case or spaces) | error card, `missing=month tab ambiguous` |
| tab exists, a row says another month | error card, `missing=<Platform> month` |
| metadata read fails (403, 404, timeout) | error card, `status=` logged |
| preset range, tabs for Sep and Oct, today in Nov | October tab |
| preset range, no month tab at or before today's month | as tab missing |
| picked month in another year | that year's `kpiSheets` entry, as today |
| `{ sheetId, tab }` (fixed) | exactly today's behaviour, every existing test unchanged |
| both `tab` and `byMonth`, or `byMonth: "yes"` | invalid, as today |
| staff picks a month not yet open to clients | rings plus the note, as today |
| PDF export | the same output (same section) |

## Rollout (each step its own gate)

1. PR off `dev`, standalone. Merge only on my go.
2. Staging: set A Place For Mom's staging `kpiSheets["2026"]` to `{ sheetId, byMonth: true }` (guarded write, dry run
   first), check September and October on staging as team and as a client.
3. Production, after the team approves on staging: deploy, then the same one-field change (guarded, `--rollback` puts
   `{ sheetId, tab: "October 2026" }` back). The code accepts both shapes, so deploy and switch are independent.
4. A new client: share the tracker with the app's service account, set `kpiSheets["<year>"] = { sheetId, byMonth: true }`,
   pin `kpi-check-in@1` on its Overview. No code change.

## Tests (written first)

`kpi-sheet.test.ts`: `kpiSheetFor` (fixed, byMonth, both, neither, `byMonth` not `true`, bad id, missing year);
`monthTabFor` (exact, case, spaces, missing, two matches, abbreviations refused, newest-not-after for presets).
`kpi-check-in.test.tsx`: byMonth reads the picked month's tab (September range reads "September 2026", October range
reads "October 2026"); missing tab (staff note, client nothing, one warning, no sheet id in it); row month mismatch is the
error card; metadata failure is the error card with the status; preset picks the newest tab not after today; every fixed-tab
test unchanged. `ytd-sheet.test.ts`: the metadata reader's URL, deadline and error mapping, mirroring the tab reader's tests.
