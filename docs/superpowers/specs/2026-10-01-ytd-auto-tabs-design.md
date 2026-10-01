# YTD sheet: find each client's tab automatically: design

Status: DRAFT for review. Builds on #286 (`ytd-review@2`, head `5a4e63c1`, not yet merged); code here is cited at that
head. Built only after #286 merges, on this branch off `dev` (no PR stacked on an open PR). Public repo: no sheet id,
no figures; the sheet id lives in an environment variable and the database, never here.

## 1. Why, and what is decided
- Me, 2026-10-01: "if a new tab is added we never do anything manually. it should auto add".
- Decided (me, 2026-10-01): when a client's dashboard name does not match its tab, use a one-line override for that
  client. Never looser matching (a tab name contained in a client name), because a wrong match would show one client
  another client's numbers.
- Decided (me, 2026-10-01): its own PR after #286 merges, not a change to #286 while it is under review.

## 2. What happens on #286 today (cited at `5a4e63c1`)
- Each client names its sheet and tab per year: `dash_social_config.ytdSheets = { "<year>": { sheetId, tab } }`,
  validated by `ytdSheetFor` (`lib/organic-social/ytd-sheet.ts:28`), which needs both fields (`SHEET_ID`, `:19`).
- `YtdSheetReviewSection` reads it (`components/report-sections/organic-social/parts/ytd-review-sheet.tsx:36`); with
  no valid entry it renders version 1 (`:37-39`), else reads the tab (`readYtdTab`, `:43`; cached per sheet and tab
  for an hour, `ytd-sheet.ts:123`).
- So every client needs its own `{ sheetId, tab }` written into the database: a manual step per client per year.
- Listing a sheet's tabs is already done in the app: `?fields=sheets.properties.title` (`lib/content-calendar/client.ts:62`).
- `getAllClients` returns every client row, cached for 5 minutes (`lib/db/queries.ts:97-99`).
- Settings are documented in `.env.example`, one line each (for example `CHART_NOTES_APPROVERS`, `.env.example:88`).

## 3. Measured (2026-10-01, read-only)
- The sheet has 6 tabs, none hidden. One `values:batchGet` request for `A1` of every tab returned each tab's CLIENT
  row (HTTP 200).
- Tabs and CLIENT rows: "A Place for Mom" / "CLIENT: A Place for Mom"; "Renaissance" / "CLIENT: Renaissance";
  "Piper Aircraft" / "CLIENT: Piper Aircraft"; "PIMCO" / "CLIENT: PIMCO"; "Joy of Life" / "CLIENT: Joy of Life";
  "Kenect Nashville" / "CLIENT: Akara – Kenect Nashville" (the sheet's own text).
- Staging client names: "A Place For Mom", "Akara Living, Kenect Nashville", "Joy of Life", "PIMCO", "Piper Aircraft",
  "Renaissance". With the normalization in 4.4, four outline clients match their tab exactly; Akara matches none (it
  needs the override); "Renaissance" matches the Renaissance tab, so Renaissance's protection is that it never pins
  `ytd-review@2` (section 4.7).
- Production's client names are UNVERIFIED (production reads are blocked); its rows are copied from staging at launch.

## 4. Design
### 4.1 The year's sheet: one setting, not per client
Environment variable `ORGANIC_SOCIAL_YTD_SHEETS`: comma-separated `YEAR=sheetId` pairs, for example `2026=<id>`.
`ytdSheetForYear(raw, year): string | null` (pure): splits on commas, trims each pair, accepts a pair only when the
year matches `/^\d{4}$/` and the id matches `SHEET_ID`; returns the id for `year`, or null. A malformed pair is
ignored and `ytdYearsInvalid(raw)` reports it so the part can warn once per render. Documented in `.env.example`
(name only). Set in Vercel for Production and staging, with the same value in the local `.env.local`,
`.env.staging` and `.env.production` copies.

### 4.2 The override (the existing key, widened)
`ytdSheets["<year>"] = { tab: string, sheetId?: string }`. `ytdSheetFor` keeps its tab rules (trimmed, 1 to 100
characters) and now accepts an entry without `sheetId`; when present, `sheetId` must still match `SHEET_ID`. An entry
written for #286 (`{ sheetId, tab }`) keeps working unchanged.

### 4.3 The tab index (`lib/organic-social/ytd-sheet.ts`)
`readYtdTabIndexImpl(sheetId): Promise<{ title: string; clientRow: string }[]>`, under one 10 second deadline (as
`readYtdTabImpl`): one GET of `spreadsheets/{id}?fields=sheets.properties(title,hidden)`, then one GET of
`values:batchGet` with `ranges=` each title quoted and `'` doubled (as `rangeFor`) plus `!A1`, URL-encoded. Hidden tabs
are left out (an absent `hidden` means visible). More than 100 visible tabs is a
`YtdSheetReadError('too-many-tabs')`. The batch answer pairs with the titles by position: `valueRanges` must have
exactly one entry per title requested. A body that is not JSON, a metadata answer without a `sheets` array or with a
tab missing its `title`, or a `valueRanges` count that differs is a `YtdSheetReadError('malformed')`. A missing A1 is
`clientRow: ''`.
Wrapped as `readYtdTabIndex = cached('google-sheets', 'ytdTabIndex', ..., { version: '1', ttlSeconds: 3600,
negativeTtlSeconds: 30, healthCritical: true })`, so a new tab is found within an hour and the index is shared by
every client on that sheet. Errors follow #286's rule: no sheet id, tab title or value in a message.

### 4.4 Matching (pure, `matchYtdTab`)
`normalizeName(s)`: Unicode NFKD, combining marks removed, lowercase, `&` to `and`, a leading `client:` (any case,
optional spaces) removed, then every character other than `a-z` and `0-9` removed.
`matchYtdTab(clientSlug, clients: { slug: string; name: string }[], index): { kind: 'ok'; tab: string } | { kind:
'none' } | { kind: 'ambiguous'; count: number }`. `clients` is every client row from `getAllClients()`, on purpose,
including dashboard-only and hidden rows (`lib/db/queries.ts:88-99`; free-form names come from "Add new report",
`app/actions/reports.ts:87-93`): a name another row shares makes the match ambiguous, which fails safe. The part
always puts the current client in the list from its own row (`getClientBySlug`), replacing any entry with the same
slug, so a client missing from the 5-minute `getAllClients` cache, or renamed since, is matched by its current name.
1. A tab's names are `normalizeName(title)` and `normalizeName(clientRow)`, ignoring empty ones.
2. A tab claims a client when one of its names equals `normalizeName(client.name)` (a client whose normalized name
   is empty claims nothing).
3. The client's candidates are the tabs that claim it and claim no other client.
4. If another client has the same normalized name: `ambiguous`. Else one candidate: `ok` with its exact title; none:
   `none`; more than one: `ambiguous`.
So a tab whose title and CLIENT row name two different clients is used for neither, and two tabs for one client stop
both: it never guesses.

### 4.5 Which sheet and tab, in order (the part)
1. A valid override for the year on screen: its tab, on its `sheetId`, or on the year's sheet from 4.1 when it has
   none. No sheet either way: version 1, with warning `ytd sheet override without sheet slug=… year=…`. The override
   is checked against that sheet's index (4.3) before it is read: if the tab is not in the index, or it claims (4.4)
   any client other than this one, version 1, with warning `ytd sheet override refused slug=… year=…`. So a typo such
   as Piper's override naming the PIMCO tab can never show Piper PIMCO's numbers. Akara's override passes: the
   "Kenect Nashville" tab claims no client.
2. Else, when the year has a sheet (4.1): read the index (4.3) and `getAllClients()` names, then `matchYtdTab`. `ok`:
   that tab. `none`: version 1, with log `ytd sheet no tab slug=… year=…`. `ambiguous`: version 1, with warning
   `ytd sheet tab ambiguous slug=… year=… count=…`.
3. Else: version 1, silently (as #286 with no entry).
An invalid override warns as #286 does and renders version 1. An index read failure shows the block's error card
with `ytd sheet read failed slug=… status=…`, as a tab read failure does.
The index and each tab read are cached separately for an hour, so after a rename the index can name a title that no
longer exists, or a cached grid can outlive its match. Two checks close this: a tab read that answers HTTP 400 (the
range names no tab) renders version 1 with warning `ytd sheet tab gone slug=… year=…`, not the error card; and the
read grid's A1 must normalize (4.4) to the matched index entry's `clientRow`, else version 1 with warning
`ytd sheet tab changed slug=… year=…`. Everything after these checks (the months, the series, the graphs) is #286's
code, unchanged.

### 4.6 What still needs a person, and when
- Once a year: add `YEAR=sheetId` to `ORGANIC_SOCIAL_YTD_SHEETS` in Vercel and the local copies (then deploy).
- Once per new client, as part of onboarding that already happens: its `ytd-review` pin set to version 2 (the
  standard outline setup).
- Only when a client's dashboard name and its tab do not match after normalization: one override line (Akara today).
- A new tab for an onboarded client needs nothing: found within an hour.

### 4.7 Renaissance
Unchanged. It pins neither YTD version, so this code never runs for it, and its tab is never read for it. The
Renaissance tab still counts in matching for other clients, where it claims only Renaissance.

## 5. Failure behaviour
| Failure | Viewer sees | Log (never the sheet id, a tab title or a value) |
|---|---|---|
| Index read fails, times out, is malformed, or has more than 100 tabs | error card | `ytd sheet read failed slug=… status=…` |
| Tab read answers 400 after a match (stale index) | version 1 | `ytd sheet tab gone slug=… year=…` |
| Read grid's A1 differs from the matched CLIENT row | version 1 | `ytd sheet tab changed slug=… year=…` |
| Override tab missing from the index, or claims another client | version 1 | `ytd sheet override refused slug=… year=…` |
| `getAllClients` fails | error card | `ytd sheet client list failed slug=…` |
| No tab matches | version 1 | `ytd sheet no tab slug=… year=…` |
| Several tabs, or a shared client name | version 1 | `ytd sheet tab ambiguous slug=… year=… count=…` |
| Malformed `ORGANIC_SOCIAL_YTD_SHEETS` pair | that pair ignored | `ytd sheet setting has an invalid pair` |
| Override without any sheet | version 1 | `ytd sheet override without sheet slug=… year=…` |

## 6. Edge cases
| Case | Expected |
|---|---|
| Jasmine adds a tab for an onboarded client whose name matches | used within an hour, nothing else to do |
| Tab renamed | up to an hour on the old index: version 1 and `tab gone` (or `tab changed`); then matching follows the new name, or version 1 and `no tab` if it no longer matches |
| Index answer with fewer `valueRanges` than titles | error card, `malformed`; no CLIENT row is paired with the wrong tab |
| Override names a tab that claims another client | version 1, `override refused` |
| A dashboard-only row shares the client's name | version 1, ambiguous (fails safe) |
| A hidden copy of a tab | ignored |
| Two visible tabs for one client | version 1, ambiguous |
| A tab titled for one client with another client's CLIENT row | used for neither |
| Akara with the override `{ tab: "Kenect Nashville" }` | that tab, on the year's sheet |
| Akara without the override | version 1, no tab |
| Year on screen not in the setting, no override | version 1 |
| #286-style override `{ sheetId, tab }` | unchanged |
| "A Place for Mom" tab, "A Place For Mom" client | match (case) |
| A client named "Smith & Co", tab "Smith and Co" | match |

## 7. Tests (written before code; made-up ids and names only)
- `ytd-sheet.test.ts`: `ytdSheetForYear` (valid pairs, spaces, a bad year, a bad id, a missing year); `ytdSheetFor`
  accepts `{ tab }` and still rejects a bad `sheetId`; `readYtdTabIndexImpl` (two GETs, hidden tabs left out, A1 per
  tab, quoting, the 100-tab limit, the deadline, no sheet id in errors, and `malformed` for a non-JSON body, missing
  `sheets` or `title`, and a `valueRanges` count that differs); `normalizeName`; `matchYtdTab` for every rule in 4.4
  and the edge cases in 6, including a dashboard-only row sharing the name and the current client replacing a stale
  entry.
- `ytd-review-sheet.test.tsx`: the order in 4.5 (override with and without `sheetId`; auto match; none; ambiguous;
  no setting), each failure row in 5 and its log line, that the tab chosen is the one read, an override refused for
  a tab claiming another client and for a tab missing from the index, a 400 tab read after a match giving version 1,
  and a grid whose A1 differs from the matched CLIENT row giving version 1.
- #286's tests and `lock-key-pin.test.ts` pass unchanged.

## 8. Rollout
1. After #286 merges: bring `dev` into this branch, build test-first, PR into `dev`, Paul's review.
2. With my consent: set `ORGANIC_SOCIAL_YTD_SHEETS` (2026) in Vercel staging and Production and the local copies.
3. Staging, guarded script (dry run first): Akara's override becomes `{ tab: "Kenect Nashville" }`; the other four
   lose their per-client entries, so they match automatically. Check every client's YTD on staging.
4. Production with the next release, the same steps.

## 9. Review round 1 MINOR items, for the plan
Measure on staging that Renaissance's rows pin no `ytd-review` (cite it) or mark it unverified; duplicate years in
the setting (first valid pair wins), `ytdYearsInvalid(raw): boolean`, the setting read per render; `YtdSheetEntry`
gains `sheetId?: string` and the schema comment (`lib/db/schema.ts:144`) follows; `count` for a shared name is the
number of clients sharing it; the batch URL length at 100 tabs (lower the cap or batch, after confirming Google's
limit); a warning when a pinned client's year is missing from the setting (`ytd sheet no year`); tests for override
against auto precedence, the client-list failure log, no tab title in any log, the index `cached()` options; the new
tests stub and restore `ORGANIC_SOCIAL_YTD_SHEETS`, and #286's suite runs with it unset.

## 10. Not in scope
Creating a client row for a new tab (onboarding stays a person's job); fuzzy matching; the held source caption.
