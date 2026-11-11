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
   `lib/organic-social/kpi-sheet.ts` validates it and returns `{ kind: 'fixed'; sheetId; tab }`, `{ kind: 'byMonth'; sheetId }`,
   `{ kind: 'none' }` or `{ kind: 'invalid' }`. **January:** when the year has no entry, the newest earlier year's entry is
   used if (and only if) it is `byMonth`, so a "January 2027" tab in the same tracker works with no change; a fixed entry
   never carries over (today's "No KPI sheet configured for <year>." stays). A new tracker for a new year still needs its
   entry. `ytdSheetFor`, the tab reader and the YTD graphs are unchanged; `ytd-sheet.ts` only gains the titles reader (3).
2. **Which month.** The month on screen is the month of the served range's last day. A locked month is served as
   `custom:<first>,<last>` (`app/dashboard/[clientSlug]/reports/page.tsx:187-189`, `reporting-months.ts:160,184`), so
   picking October serves `custom:2026-10-01,2026-10-31` and the month is October. The year rule is today's
   (`kpi-check-in.tsx:20,43`). In `byMonth` the month AND year come from the range's end day for every range:
   `resolveDateRange(dateRange).endDate` (`lib/date-range.ts:43`), the helper the rest of the page uses. So a locked month
   gives that month, the team's in-progress month (`custom:<first>,<lastCompleteUtcDay>`, `reporting-months.ts:160`) gives
   the current month, `last_month` gives last month, and `last_30_days`, `this_month` or a free custom range give the month
   of their last day. **Clients without reporting months** (rolling ranges such as `last_30_days`, which end in the
   current month, whose tab is filled only after it ends): the block shows the newest month tab that exists and is ready,
   searching back from the end day's month to January of that year (my decision, 2026-11-11). Clients on reporting months
   get exactly the picked month. Fixed mode keeps today's year rule exactly. **Which year's entry:** the entry is looked up with
   today's year rule (`kpi-check-in.tsx:20,43`); if that gives `byMonth` (direct or carried forward), it is looked up again
   with the end day's year, and that year is the one used for the tab name, `parseKpiGrid`'s target-year check
   (`kpi-sheet.ts:50`) and the release key (`kpi-check-in.tsx:73`).
3. **Which tab.** The tab whose title is `"<Month> <Year>"` with the full English month name, matched after trimming and
   ignoring case ("October 2026", " october 2026 "). No other spelling matches ("Oct 2026", "10/2026"). The titles come
   from `readSheetTabTitles(sheetId): Promise<string[]>`, a new export in `ytd-sheet.ts` beside the tab reader: one
   `GET spreadsheets/<id>?fields=sheets.properties.title` with the same service account, scope and 10 second deadline
   (`ytd-sheet.ts:76-120`; this URL answered 200 for the tracker in a read-only probe on 2026-11-11), wrapped in
   `cached('google-sheets', 'sheetTabTitles', ..., { version: '1', ttlSeconds: 300, negativeTtlSeconds: 30, healthCritical: true })`.
   A body without a `sheets` array, or a title that is not a string, is `YtdSheetReadError('malformed')`, as the tab
   reader does (`ytd-sheet.ts:117-118`). A tab added or renamed shows within about 5 minutes (the cache serves the old list
   once after it expires: Next's `unstable_cache` behaviour, called at `lib/cache.ts:128-132`, not verified in this repo).
   A tab already read stays cached for an hour (`ytd-sheet.ts:139-140`), so a tab fixed after it was read as "not ready"
   can keep the note up to an hour; checked on staging. The raw title (untrimmed) is what is passed to `readYtdTab`. Two titles
   that both match the month are ambiguous: staff note, client nothing (never a guess). The matcher is
   `monthTabFor(titles: string[], year: string, month: number): { kind: 'one'; title: string } | { kind: 'none' } | { kind: 'ambiguous' }`
   (`month` 0 to 11; `title` is the raw title). Fixed mode never reads titles. The
   titles read and the tab read run one after the other, so a slow sheet can hold the loading state up to 20 seconds.
4. **A month tab that is not ready is treated like a missing one, never an error card.** In `byMonth`, every SHOWN
   platform row must say `End of <that month>` and parse (`kpi-sheet.ts:37-63`). A tab copied from last month and not yet
   relabelled, a part-filled tab, or any other layout problem in the month tab (the parser checks every platform row in
   the tab, shown or not, `kpi-sheet.ts:41-58`; the month-mismatch check covers shown rows only) shows staff "The <Month>
   <Year> KPI tab isn't ready yet." and clients nothing, logged with `console.warn` as
   `kpi month tab not ready ... missing=<item>` (a relabel miss is
   `<Platform> month mismatch`, distinct from the parser's `<Platform> month`). Fixed-tab mode keeps today's rules exactly
   (each row its own month, a layout error is the error card).
5. **No tab for the month yet.** Staff see "No KPI tab for <Month> <Year> yet." (the same style as today's
   "No KPI sheet configured for <year>.", `kpi-check-in.tsx:49`, printed through `PrintAsClient` with `client={null}`, so a
   staff PDF prints nothing there); clients see nothing; one warning is logged. A tab read that answers 400 in `byMonth`
   (the tab was renamed or deleted after the titles were cached; Google's answer for a missing tab, unverified, checked on
   staging) is handled the same way. When the entry was carried forward from last year, the staff note and the log say
   so ("carried from <year>"), so a forgotten new tracker is visible. This keeps the team's rule that
   the block stays on and forces the tracker to be filled (team call 2026-10-06, private notes S3-D5).
6. **Release rule unchanged.** A client can only pick opened months (`reporting-months.ts:166-181`). A month that has not
   opened still shows staff the rings and the note "KPI Check-In updates with the <Month> report."
   (`kpi-check-in.tsx:54,74-75`); the row month now equals the picked month, so the note names it.
7. **Nothing else moves.** Same parser for the layout (`kpi-sheet.ts:37-63`), same rings, badge, PDF blocks
   (`export-layout.ts:22`), same Fallback on a failed read (`kpi-check-in.tsx:63-66`). No Dash request, nothing locked.

## Inputs and outputs

- In: `ctx.clientSlug`, `ctx.dateRange`, `ctx.role` (`ctx.ts:4-22`); the client row's `dashSocialConfig.kpiSheets` and
  `channels`; the clock; the sheet's tab titles; the chosen tab's cells `A1:Z40`.
- Out: the same JSX as today; in `byMonth` the staff note / nothing (missing, not ready or ambiguous tab); the error card
  for a failed read (and, in fixed mode only, a layout failure).
- Logs (slug, year, month key, status or layout item; never the sheet id, a tab title or a value):
  `kpi month tab missing slug= year= month=YYYY-MM`, `kpi month tab not ready slug= year= month=YYYY-MM missing=` (warn; ambiguous titles use `missing=month tab ambiguous`), `kpi sheet read failed ... status=`, `kpi sheet layout not found ... missing=`.

## Edge cases

| Case | Behaviour |
|---|---|
| `byMonth`, tab for the picked month exists, rows say that month | rings for that month |
| tab missing | staff note, client nothing, warning logged |
| team's in-progress month (tab usually missing or part-filled) | staff note, as missing or not ready |
| tab copied, rows still say last month | staff "isn't ready" note, client nothing, `month mismatch` logged |
| tab part-filled (a blank or text cell) | staff "isn't ready" note, client nothing |
| tab renamed or deleted after the titles were cached (read answers 400) | as tab missing |
| `last_month` / `this_month` / free custom range | the month of the range's last day |
| January, no entry for the new year, last year's entry is `byMonth` | last year's tracker, "January <year>" tab |
| two tabs match the month (case or spaces) | staff note, client nothing, `missing=month tab ambiguous` logged |
| metadata read fails (403, 404, timeout) | error card, `status=` logged |
| `last_30_days` in November, client without reporting months | the newest ready tab: October if November is not ready |
| same, client on reporting months | n/a: these clients are served whole months |
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
   pin `kpi-check-in@1` on its Overview. No code change. The `kpiSheets` comment in `lib/db/schema.ts:151-153` and the January comment at `kpi-check-in.tsx:47` are updated
   in this PR to document both shapes.

## Tests (written first)

`kpi-sheet.test.ts`: `kpiSheetFor` (fixed, byMonth, both, neither, `byMonth` not `true`, bad id, missing year);
`monthTabFor` (exact, case, spaces, missing, two matches, abbreviations refused, raw title returned).
`kpi-check-in.test.tsx`: byMonth reads the picked month's tab (September range reads "September 2026", October range
reads "October 2026"); missing tab (staff note, client nothing, one warning, no sheet id in it); row month mismatch is the
"isn't ready" note (relabel miss, blank cell); a 400 tab read is the missing note; metadata failure is the error card with
the status; ambiguous titles; a client without reporting months on `last_30_days`, `this_month` and a free custom range
shows the newest ready tab (skipping a not-ready current month); `last_month` on reporting months is not served; the team's in-progress month; the
release note names the picked month; January carry-forward; the raw title reaches `readYtdTab`; fixed mode never reads
titles; staff PDF prints nothing for a missing tab; no log line holds the sheet id or a tab title; every fixed-tab test
unchanged. Cache timing (5 minutes, the stale read once) cannot be unit tested: checked on staging. `ytd-sheet.test.ts`: the metadata reader's URL, deadline and error mapping, mirroring the tab reader's tests.
