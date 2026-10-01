# YTD Review from the team's YTD sheet: design

Status: DRAFT for review. Code read on `origin/dev` b48de420. Replaces `2026-09-29-ytd-from-january-design.md`
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
`clients.dash_social_config.ytdSheet = { sheetId: string, tab: string }`, typed `unknown` on `DashSocialConfig` and
validated at runtime, like `reportingMonths`. Valid: `sheetId` matches `/^[A-Za-z0-9_-]{20,100}$/`; `tab` is a
non-empty string of at most 100 characters after trimming. Next year's sheet is a config change.

### 4.2 Reader: `lib/organic-social/ytd-sheet.ts`
- `readYtdTab(sheetId, tab)`: one GET to `values/{tab}!A1:Z40` with a token from `GoogleAuth` (readonly scope, same key
  handling as content calendar), a 10 second timeout, wrapped in `cached('google-sheets', 'ytdTab', …,
  { ttlSeconds: 3600, negativeTtlSeconds: 30, version: '1' })`. Returns the raw grid (strings).
- `parseYtdGrid(grid)` (pure): finds the row whose first cell trimmed matches `/^follower growth$/i` and the row whose
  first cell trimmed matches `/^views$/i`; each block's header row is the next row; its months are the next 12 rows,
  matched by trimmed, case-insensitive month name (January to December). Returns, per block, a map from channel
  (`INSTAGRAM`, `FACEBOOK`, `LINKEDIN`, `TIKTOK`, `TWITTER` from headers Instagram, Facebook, LinkedIn, TikTok,
  X or Twitter, trimmed, case-insensitive) to 12 cells. Unknown headers are ignored.
- A cell is exactly one of: `number` (digits with optional thousands commas, optional decimal part, not negative),
  `na` (trimmed `N/A`, any case), `blank` (empty or only spaces), `invalid` (anything else).
- Throws `YtdSheetLayoutError` when either block, its header row, or any of its 12 month rows is missing.

### 4.3 Which months, and which number (`ytdSheetSeries`, pure, in `lib/organic-social/ytd.ts`)
Months: January of the year on screen through the month on screen, oldest first (at most 12). The month on screen
keeps the range and comparison its Data block sends, and its `(live)` label when partial, exactly as `ytdMonths` does
today. Each graph (Followers, Views) is decided separately, per month:

| Sheet cell | Month on or after `firstMonth` | Month before `firstMonth` |
|---|---|---|
| `number` | the sheet's number | the sheet's number |
| `blank` (not filled in yet) | our Data block's value (`getOutlineKpis`); a gap if that month is `noData` | a gap |
| `na` | a gap | a gap |
| `invalid` | a gap, plus a warning log | a gap, plus a warning log |
| no column for this channel | as `blank` for every month, plus one warning log | a gap |

A gap means the month is left off that graph and named under it ("No follower data for Jan, Feb"), never drawn as 0.
Months before `firstMonth` never call Dash, so they can never create a lock row (the problem section "The problem a
naive change creates" in the 2026-09-29 spec described). Dash is called only for months on or after `firstMonth`
whose cell is blank, at most 3 at a time (`mapWithConcurrency`, `lib/concurrency.ts:19`).

### 4.4 The part: `ytd-review@2`
New `YtdSheetReviewSection` in `parts/ytd-review-sheet.tsx`, registered as `'ytd-review': { 1: ytdReviewV1, 2:
ytdReviewV2 }`, unpublished. Same title, same two cards, same bars-for-one-point rule, same render gate (outline
channel and valid `reportingMonths`). Each graph gets its own point list. Version 1 is not edited.
- `ytdSheet` absent or invalid: renders exactly what version 1 renders (it calls `YtdReviewSection`), with one warning
  log when present but invalid. So pinning version 2 before the config is set changes nothing.

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
- `lib/organic-social/ytd.test.ts`: `ytdSheetSeries` for every row of the table in 4.3 and every edge case in 5;
  Dash is asked only for blank months on or after `firstMonth`.
- `parts/ytd-review-sheet.test.tsx`: renders both graphs from a stubbed sheet; gaps named per graph; error card on a
  read failure and on a layout error; falls back to version 1 output when `ytdSheet` is absent; at most 3 Dash
  requests in flight.
- `parts/ytd-parity.test.ts`: version 1 is still the same object; version 2 registered and unpublished.
- `lib/organic-social/lock-key-pin.test.ts` passes unchanged (no Dash request changes shape).

## 7. Rollout
1. PR into `dev` (#286), Paul's review, merge after the dependency scan is green (Paul, 2026-10-01).
2. Staging, guarded script kept privately (host guard, dry run, my go): for the five outline clients set `ytdSheet`
   (their tab) and change the `ytd-review` pin from 1 to 2. Reversal: set the pin back to 1.
3. Production with the October release, the same script against production with my written consent.

## 8. Not in this build
The source caption (held); Piper's X tab (no outline rows, so no YTD at all, `ytd-review.tsx:20`); any change to the
tiles' own null-as-0 (separate follow-up).
