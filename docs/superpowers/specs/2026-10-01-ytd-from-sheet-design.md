# YTD Review from the team's YTD sheet: design

Status: REVIEWED (two fresh-eyed rounds; the three round 2 MAJORs fixed on my go, 2026-10-01). Code read on `origin/dev` b48de420. Replaces `2026-09-29-ytd-from-january-design.md`
(kept for the record). Public repo: no sheet id, no tab names, no client figures here; those live in the database
and in my private records.

## 1. Why, and what is decided
- Jasmine's round 1 feedback, YTD Review row: "We need this to be from Year to Date starting January 2026."
- 2026-10-01: Jasmine sent the team's YTD tracker, one tab per client, "for our YTD graphs on Dashboard! We'll update
  this monthly moving forward".
- Decided (me, 2026-10-01): **the sheet is the source of truth for the two YTD graphs.** This replaces the 2026-09-29
  rule (sheet to August, our locked months from September).
- Decided (me, 2026-10-01): **a month the sheet has not filled in yet shows our own number for that month** (the Data
  block's value), until the sheet has it.
- Held (me, 2026-10-01): a caption naming the source under the graphs. Not in this build.
- Everything else on the page (tiles, changes, graphs, Top Content, notes, month picker, locks) is untouched.

## 2. What happens today (cited)
- `ytd-review@1` (`components/report-sections/organic-social/parts/ytd-review.tsx`) renders only on a channel with
  outline Data rows (`:20`), needs `reportingMonths` (`:23-27`), and plots each month's Total Followers and Views tile
  through `getOutlineKpis` (`:30`), all months at once, all or nothing (`safe`, `:30-32`).
- `ytdMonths` starts at the later of January and `firstMonth` (`lib/organic-social/ytd.ts:48-49`), so with `firstMonth`
  2026-08 nothing before August is drawn. A `noData` month is left off both graphs and named (`ytd.ts:61-75`,
  `ytd-review.tsx:49`). One point is drawn as bars, two or more as lines (`ytd-review.tsx:39-41`).
- Clients pin parts in `clients.report_section_config['organic-social'].extraParts` (`lib/report-sections/types.ts:23`,
  `lib/db/schema.ts:232`); unpublished pins are allowed there (`lib/report-sections/validate.ts:78`). On staging the
  five outline clients pin `ytd-review` version 1; Renaissance pins none.
- The app already reads Google Sheets read-only with the shared service account
  (`lib/content-calendar/client.ts:33-45`, scope `spreadsheets.readonly`, key `GOOGLE_SERVICE_ACCOUNT_KEY`). That key
  exists in Vercel Production, Preview and staging (names checked 2026-10-01; values are sensitive, so which account
  each holds is UNVERIFIED).
- `cached()` (`lib/cache.ts`) wraps a fetcher in Next's `unstable_cache`, 1-hour default TTL, failures not stored
  unless `negativeTtlSeconds` is set.

## 3. Measured (2026-10-01, read-only probe, figures kept privately)
- All six tabs share one layout: a "CLIENT: …" row; a "FOLLOWER GROWTH" title row, a platform header row, then January
  to December; a "VIEWS" title row, a header row, then January to December. Headers are platform names (Instagram,
  Facebook, LinkedIn, TikTok, X). Month labels include "July " with a trailing space.
- 290 filled cells January to September. Followers: 141 of 141 within 2% of our Total Followers tile (118 exact), so
  the sheet's "Follower Growth" is total followers, the same thing the graph plots today. Views: 92 of 142 within 2%;
  the rest differ by up to about 2.5x, mostly lower than ours. The sheet wins (section 1).
- Cell kinds seen: numbers (some with thousands commas), the text "N/A" (7 cells; Dash reports 0 for all 7), blanks
  (months not reached; Akara Instagram January to May). No other text. Nothing after September.
- Some tabs carry a column the dashboard does not show (Akara Facebook, Piper X). One tab is Renaissance's; it is
  never read (no config points at it).

## 4. Design
### 4.1 Config (per client, no code per client)
`clients.dash_social_config.ytdSheets = { "<year>": { sheetId: string, tab: string } }`, keyed by the four-digit
year (for example `"2026"`), typed `unknown` on `DashSocialConfig` and validated at runtime, like `reportingMonths`.
Valid entry: `sheetId` matches `/^[A-Za-z0-9_-]{20,100}$/`; `tab` is a non-empty string of at most 100 characters
after trimming. `ytdSheetFor(value, year)` returns the valid entry for the year on screen, or null. The month picker
reaches back up to 36 months (`lib/organic-social/reporting-months.ts:6`), so a year with no entry (or an invalid one)
renders exactly what version 1 renders; the sheet for one year is never read for another. Next year's sheet is one
more entry.

### 4.2 Reader: `lib/organic-social/ytd-sheet.ts`
- `readYtdTab(sheetId, tab)`: one GET to `values/<range>` where the range is the tab in single quotes with each `'`
  doubled, then `!A1:Z40`, and the whole range passed through `encodeURIComponent`; a token from `GoogleAuth` (readonly scope, same key
  handling as content calendar), a 10 second timeout, wrapped in `cached('google-sheets', 'ytdTab', …,
  { ttlSeconds: 3600, negativeTtlSeconds: 30, version: '1' })`. Returns the raw grid (strings).
- `parseYtdGrid(grid)` (pure): finds the row whose first cell trimmed matches `/^follower growth$/i` and the row whose
  first cell trimmed matches `/^views$/i`; each block's header row is the next row; its months are the next 12 rows,
  matched by trimmed, case-insensitive month name (January to December). Returns, per block, a map from channel
  (`INSTAGRAM`, `FACEBOOK`, `LINKEDIN`, `TIKTOK`, `TWITTER` from headers Instagram, Facebook, LinkedIn, TikTok,
  X or Twitter, trimmed, case-insensitive) to 12 cells. Unknown headers are ignored.
- A cell is exactly one of: `number` (digits with optional thousands commas, optional decimal part, not negative),
  `na` (trimmed `N/A`, any case), `blank` (empty, only spaces, or absent because the month row is shorter than this
  column), `invalid` (anything else).
- Throws `YtdSheetLayoutError` when either block, its header row, or any of its 12 month rows is missing.

### 4.3 Which months, and which number (pure functions in `lib/organic-social/ytd.ts`)
Types: `YtdCell = { kind: 'number'; value: number } | { kind: 'na' | 'blank' | 'invalid' }`;
`YtdTab = { followers: Partial<Record<DashChannel, YtdCell[]>>; views: Partial<Record<DashChannel, YtdCell[]>> }`
(12 cells, January first, from `parseYtdGrid`); `YtdGraph = { points: { key: string; label: string; value: number }[];
gaps: string[] }` (gap labels, oldest first).
- `ytdSheetMonths(dateRange, compareRange, cfg): YtdMonth[] | null`. First calls `ytdMonths` and returns null when it
  returns null or `[]` (so version 2 draws nothing wherever version 1 draws nothing, `ytd.ts:43-47,55`). Otherwise:
  January of the year on screen through the month on screen, oldest first (at most 12). Every month on or after
  `firstMonth` is `ytdMonths`'s entry for it, unchanged in every field (range, comparison, `partial`), so each Dash
  request is byte-identical to version 1's and to the Data block's (`ytd.ts:51-55`) and hits the same lock rows; the
  month on screen keeps its `(live)` label. Months before `firstMonth` are built the way `ytdMonths` builds an earlier
  month (whole month, `partial: false`) and are never requested.
- `monthsNeedingDash(months, tab, channel, firstMonth): YtdMonth[]`: months on or after `firstMonth` where the
  Followers or the Views cell is `blank`, or the channel has no column.
- `ytdSheetSeries(months, tab, channel, firstMonth, built: Record<string, OutlineKpis | undefined>)`
  returns `{ followers: YtdGraph; views: YtdGraph; invalid: { month: string; graph: 'followers' | 'views' }[];
  missingColumn: ('followers' | 'views')[] }`. `built` holds the Data block's answer for each month from
  `monthsNeedingDash`. Labels as version 1 (`Jan`, ..., `Oct (live)`). Each graph is decided separately, per month:

| Sheet cell | Month on or after `firstMonth` | Month before `firstMonth` |
|---|---|---|
| `number` | the sheet's number | the sheet's number |
| `blank` (not filled in yet) | our Data block's value (`getOutlineKpis`); a gap if that month is `noData` | a gap |
| `na` | a gap | a gap |
| `invalid` | a gap, plus a warning log | a gap, plus a warning log |
| no column for this channel | as `blank` for every month, plus one warning log | a gap |

A gap means the month is left off that graph and named under it ("No follower data for Jan, Feb" and "No views data
for Mar"; version 1's shared line, `ytd-review.tsx:49`, stays as it is in version 1), never drawn as 0. A graph with
no points shows the existing `NoData` component in place of its chart, inside its card, with its gap line; when both
graphs have no points the block renders `<NoData />` alone, as version 1 does (`ytd-review.tsx:33`).
Months before `firstMonth` never call Dash, so they can never create a lock row (the problem section "The problem a
naive change creates" in the 2026-09-29 spec described). Dash is called only for months on or after `firstMonth`
whose cell is blank, at most 3 at a time (`mapWithConcurrency`, `lib/concurrency.ts:19`).

### 4.4 The part: `ytd-review@2`
New `YtdSheetReviewSection` in `parts/ytd-review-sheet.tsx`, registered as `'ytd-review': { 1: ytdReviewV1, 2:
ytdReviewV2 }`, unpublished. Same title, same two cards, same bars-for-one-point rule, same render gate (outline
channel and valid `reportingMonths`). Each graph gets its own point list. Version 1 is not edited.
- No valid `ytdSheets` entry for the year on screen: renders exactly what version 1 renders (it calls
  `YtdReviewSection`), with one warning log when an entry is present but invalid. So pinning version 2 before the config
  is set changes nothing.

### 4.5 Failure behaviour (the rest of the page is never affected)
| Failure | What the viewer sees | Log line (never the sheet id or any value) |
|---|---|---|
| Google returns non-200, times out, or the key is missing | the block's "Couldn't load this section." card | `[organic-social] ytd sheet read failed slug=… status=…` |
| Layout not found (`YtdSheetLayoutError`) | the same card | `[organic-social] ytd sheet layout not found slug=… missing=…` |
| A cell is `invalid` | that month is a gap on that graph | `[organic-social] ytd sheet cell invalid slug=… channel=… month=… graph=…` |
| A blank month's Dash request fails | the same card (all or nothing, as version 1) | the existing Dash error path |

## 5. Edge cases
| Case | Expected |
|---|---|
| August on screen, firstMonth 2026-08, sheet filled January to August | eight points per graph, all from the sheet |
| September on screen, sheet stops at August | January to August from the sheet, September from our Data block |
| Team's live October (partial), sheet blank for October | last point from our Data block, labelled `Oct (live)` |
| January on screen | one point, drawn as bars |
| `N/A` in January, numbers after | January is a gap on that graph and named; the rest drawn |
| Blank January to May before firstMonth | gaps, named; no Dash call |
| Followers filled, Views blank, same month after firstMonth | Followers from the sheet, Views from our Data block |
| Header has an extra column the dashboard does not show | ignored |
| "July " with a trailing space, "1,234" with commas | parsed |
| A cell such as "12k" or "-5" | invalid: a gap and a warning |
| Renaissance | never pinned, never configured: unchanged |
| Client with version 1 pinned | unchanged (version 1 not edited) |

## 6. Tests (written before code; made-up numbers only)
- `lib/organic-social/ytd-sheet.test.ts`: cell kinds; layout found with "July " and extra columns; layout errors name
  what is missing; header mapping (X and Twitter both map to `TWITTER`); `readYtdTab` sends one GET with the readonly
  scope and a timeout, and throws on non-200 without logging the sheet id.
- `lib/organic-social/ytd-sheet.test.ts` also: the range is quoted, `'` doubled and URL-encoded; a month row shorter
  than a column reads as `blank` there, and a missing month row throws `YtdSheetLayoutError`; `ytdSheetFor` accepts a valid entry and rejects a bad id, an empty or over-long tab, a
  non-object, and returns null for a year with no entry.
- `lib/organic-social/ytd.test.ts`: `ytdSheetMonths` (null wherever `ytdMonths` is null or empty, including a
  multi-month custom range; January start; the live month carried over); `monthsNeedingDash` (only blank months on or
  after `firstMonth`, and every such month when the column is missing); `ytdSheetSeries` for every row of the table in
  4.3 and every edge case in 5, including a sheet number on a partial month keeping `(live)`, and `invalid` and
  `missingColumn` filled.
- `parts/ytd-review-sheet.test.tsx`: renders both graphs from a stubbed sheet; Dash asked only for
  `monthsNeedingDash`, at most 3 in flight; the per-graph gap lines; error card on a read failure and on a layout
  error; version 1 output when there is no entry, an invalid entry (one warning), or the year on screen has no entry;
  nothing rendered for a multi-month range; one empty graph shows `NoData` in its card while the other draws; both
  empty renders `<NoData />` alone; every Dash request for a month from `firstMonth` equals version 1's for that month; the warning lines for an invalid cell and a missing column; no log line
  contains the sheet id or a value.
- `parts/ytd-parity.test.ts`: version 1 is still the same object; version 2 registered and unpublished.
- `lib/organic-social/lock-key-pin.test.ts` passes unchanged (no Dash request changes shape).

## 7. Rollout
1. PR into `dev` (#286), Paul's review, merge after the dependency scan is green (Paul, 2026-10-01).
2. Staging, guarded script kept privately (host guard, dry run, my go): for the five outline clients set `ytdSheets.2026`
   (their tab) and change the `ytd-review` pin from 1 to 2. Reversal: set the pin back to 1.
3. Production with the October release, the same script against production with my written consent.

## 8. Review round 1 MINOR items, for the plan
State `healthCritical` explicitly; keep the sheet id, tab and values out of every thrown error message (`cached()` logs
and memoizes them, `lib/cache.ts:161-193`); accept or stop `mapWithConcurrency` scheduling after a failure
(`lib/concurrency.ts:13-33`); add failure rows for `getClientBySlug`, a malformed key and the missing-column warning,
and define the `status` values; define a header row (at least one known platform), first column wins on duplicates,
comma groups of three; log or dry-run-print the tab's CLIENT row so a wrong tab is caught at rollout; the bars rule
per graph on its own point count.
Round 2 MINOR items: `ytdSheetFor`'s year is `dateRange`'s start year as a string, called only after `ytdSheetMonths`
returns non-null; the trimmed tab is what is quoted into the range; a month from `monthsNeedingDash` with no `built`
entry throws (error card, as `ytd.ts:68`); a missing column is judged per block, as `blank` for that graph only; one
warning when `ytdSheets` is present but not an object.

## 9. Not in this build
The source caption (held); Piper's X tab (no outline rows, so no YTD at all, `ytd-review.tsx:20`); any change to the
tiles' own null-as-0 (separate follow-up).
