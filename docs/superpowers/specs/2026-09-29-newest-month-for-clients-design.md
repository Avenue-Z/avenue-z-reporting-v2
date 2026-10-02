# Clients see only the newest month: design

Status: REVIEWED (two fresh-eyed rounds, 2026-09-29; no blocker or major open). Every claim is read on `origin/dev` 8502f40 (2026-09-29).
Plan: `docs/superpowers/plans/2026-09-29-newest-month-for-clients.md` (written first; it is reconciled to this spec
after review, and this spec wins where they differ).

## 1. Why
Jasmine on the call, 2026-09-29, 24:25: "can we remove the August view, like, after September has been added?" I said
yes (24:33). Confirmed on Slack the same day, 5:12 PM, to my question "from Oct 12, clients only see September, and our
team still sees both. Right?": "yes".

So: a client's month picker offers only the newest month it can open. The team keeps every month.

## 2. What happens today
- A client on locked months is one whose `dash_social_config` has its own `reportingMonths` key
  (`hasReportingMonths`, `lib/organic-social/reporting-months.ts:75-79`). The five on staging (read-only check, 2026-09-29; production is unverified until the launch writes, section 7):
  a-place-for-mom, akara-living, joy-of-life, piper-aircraft, pimco, each `{"firstMonth":"2026-08"}`. Renaissance has
  no `reportingMonths` on staging (same check), so `lockedRangeFor` returns null for it before anything below runs
  (`locked-range.ts:10-11`).
- `parseReportingMonths` reads `firstMonth` (required) and three optional knobs, `opensOnDay`, `weekendRule`,
  `comparison`; a malformed knob sets `badKey` and unknown keys are ignored (`reporting-months.ts:104-129`).
- `monthsFor` builds the list newest first (`:155-170`): the team gets the live month when one exists (`:160-162`) and
  every finished month back to `firstMonth`; a client skips every finished month whose opening day has not come
  (`:166`) and gets all the rest back to `firstMonth`. Bounded by `MAX_REPORTING_MONTHS` = 36 (`:6`, `:165`).
- `resolveLockedRange` (`:179-205`) serves the requested month when it is in the list (`:190-192`), else the default
  (for a client, `months[0]`, `:193`); a present request that is not the served month's canonical string is
  `replaced` (`:194`). A `replaced` request for a whole month or the live month that exists but is not in a client's
  list is a `hiddenMonthAttempt` (`:197-199`).
- Every reader takes the list from `lockedRangeFor` (`locked-range.ts:10-14`):
  - The SPA routes redirect a `replaced` request to the served month and log a hidden-month attempt
    (`app/portal/[clientSlug]/reports/page.tsx:220-228`; `app/dashboard/[clientSlug]/reports/page.tsx:215-225`).
  - The section serves the resolved month in place and logs a hidden-month attempt; this is the deep-link path
    (`components/report-sections/organic-social/index.tsx:88-96`; `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx:98,166-167`).
  - The picker shows `locked.months` with each month's tag (`range-control.tsx:14-21`; `month-picker.tsx:37`).
  - Commentary serves the resolved month; a client's entries must end by the newest month in its list
    (`components/report-sections/commentary/monthly.tsx:24-36`).
- Readers that do NOT use the list:
  - Locking: `settledThrough` and `isLateLock` read only `parsed.ok` and the day knobs (`lock-day.ts:31-40`, `:90-95`);
    `lockDay` is its own key (`lock-day.ts:12-17`). The lock sweep requests `/dashboard` URLs, the team's path
    (`lock-sweep.ts:13-25`).
  - YTD: `ytdMonths` builds its months from the served range and `firstMonth`, from January or `firstMonth`, whichever
    is later (`ytd.ts:42-57`), read in `parts/ytd-review.tsx:23-28`.
- Readers of the key's presence or `parsed.ok` only, so unaffected by a shorter list or a new key: the chart-notes
  actions (`app/actions/chart-notes.ts:50,81,101,126`) and panel (`parts/chart-notes.ts:61`), Commentary's routing
  (`components/report-sections/commentary/index.tsx:16`), the locking client, which passes the raw config to `settledThrough`, `parseLockDay` and `isLateLock`
  (`lib/organic-social/base.ts:28-31,51`; those read `parsed.ok`, the day knobs and `lockDay`, never `clientMonths`), the freeze table's lock switch (`lib/organic-social/frozen.ts:41`), and both
  pickers' opt-in checks (`app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx:123`, portal `:166`). The cache
  warmer and the health sweep fetch as an INTERNAL_ADMIN service principal (the role is set at
  `lib/auth/service-cookie.ts:23`; minted at `lib/cache-warm/run.ts:74` and `app/api/health/sweep/route.ts:59`; URLs at
  `app/api/cache-warm/route.ts:60`, `app/api/health/sweep/route.ts:69`), so they get the team's list, even on `/portal` URLs.
- Today, from Oct 12, a client sees September and August (`reporting-months.test.ts:87-95` pins this for 20 Oct 2026).

## 3. The change
One new optional knob, `clientMonths`, inside the existing `reportingMonths` object. Per client, opt in; absent means
today's behaviour exactly. No new column, no schema change (the column is typed `unknown`, `lib/db/schema.ts:143`).

### 3.1 Input
| Key | Required | Valid | Absent | Invalid |
|---|---|---|---|---|
| `clientMonths` | no | a JavaScript number that is an integer from 1 to 36 (`MAX_REPORTING_MONTHS`) | every opened month (today) | `badKey = 'clientMonths'`: the same fail-closed rule as the other knobs (below) |

Invalid means any other value: 0, 37, a fraction, a negative, a string such as `"1"`, `null`, a boolean. It is checked after
`comparison`, so with two bad knobs the earlier one is named (`bad()` keeps the first, `reporting-months.ts:109`). When
it is invalid or absent, `cfg` has no `clientMonths` property at all.

### 3.2 Output: the client's list
Newest first, the opened finished months, at most `clientMonths` of them. Because opening days increase month by month
(`opensOn`, `reporting-months.ts:96-102`), every month older than an opened month has opened, so the list is the
newest `clientMonths` opened months, contiguous.

With `clientMonths: 1` (Jasmine's rule), dates from the real calendar (August opens 2026-09-14, September 2026-10-12,
pinned at `reporting-months.test.ts:55-57`):
- 2026-09-29: August (September has not opened).
- 2026-10-05: August.
- 2026-10-12 onwards: September only.

### 3.3 Output: the team's list
Unchanged: the same months as today, in the same order, with the same default month. One tag is added: a finished,
opened month past the client cap reads "No longer shown to clients". Tag precedence stays: live month, then config
error, then "Team only until ...", then the new tag. Tags never reach a client (`option()`, `:144-149`). This tag is
the team's only signal that a month is gone for clients; Commentary's team note covers only months not yet open
(`clientOpensNote`, `lib/commentary/month.ts:22-28`).

### 3.4 Output: requests
- The newest month's canonical string stays `canonical`.
- A request for a month that dropped off the client's list is `replaced` by the newest month: the SPA routes redirect,
  the deep link serves it in place, exactly as any other replaced request today. It is NOT a hidden-month attempt and is
  not logged. That is any opened month older than the cap: usually one the client saw before the cap reached it, but a
  client capped from its first month never saw them, so for it this is a blind spot in the attempt log (Paul, #291).
  No data leaks either way: the newest month is served.
- The exact rule. `hiddenMonthAttempt` is today's predicate (`reporting-months.ts:197-199`) AND NOT `agedOut`, where
  `agedOut` is true only when all three hold: `cfg.clientMonths` is set (valid), the client's list is non-empty, and
  the requested month key is earlier than the last month in that list (`months[months.length - 1].key`). In every
  other case, including every bad knob (whose client list is empty, `:163`) and every config without `clientMonths`,
  the result is exactly today's.
- So a request for the live month or an unopened month is still an attempt, logged as today; and a client with an
  invalid `clientMonths` asking for an opened whole month is an attempt, as with any bad knob today.
- Canonical strings stay fixed points for both viewers (spec 3.7's "no redirect loops" rule).

### 3.5 What does not change
- Locking, the lock sweep and every lock key: they never read the list or the new key (section 2).
- YTD: a client on September still sees August's numbers in the YTD graphs. That is the year-to-date history, not the
  August view Jasmine asked to remove. Stated in the PR.
- The comparison: September's change arrows still compare with August (`compareRange` `custom:2026-08-01,2026-08-31`,
  label "vs August 2026", `reporting-months.ts:131-136`, pinned at `reporting-months.test.ts:90-93`). That is the
  comparison, not an August view. Stated in the PR with the YTD note.
- Commentary: its client cutoff is `lastOf(locked.months[0].key)` (`monthly.tsx:35`), and the cap always keeps
  `months[0]`, so it is unchanged.
- The team's list, default month and redirects.
- Renaissance and every client without `reportingMonths`: never reach this code (`locked-range.ts:11`).

## 4. Failure handling
- Invalid `clientMonths`: fail closed, like `opensOnDay` today (locked months spec 3.1). The team keeps every month,
  each finished one tagged "Hidden from clients: config error"; clients get no months and see "No reports are available
  yet"; the section logs the slug and the key only, never the config (`index.tsx:89`, `locked-range.ts:26-29`).
  Locking is unaffected (`settledThrough` reads `parsed.ok` and the opening-day knobs, never the list, `badKey` or
  `clientMonths`, `lock-day.ts:31-37`). As with any bad knob, the team's
  Commentary "Clients see this from ..." notes also disappear while it is invalid (`clientOpensNote` returns null on a
  `badKey`, `lib/commentary/month.ts:25`).
  In plain terms: a bad value takes that client's Organic Social report down ("No reports are available yet") until it
  is fixed; it is not a silent fallback. Kept on purpose after Paul's review: his alternative (treat a bad value as 1)
  would need a per-key exception in the client list (`reporting-months.ts:174`), the team tag (`:156`), the no-months
  text (`:225`) and the Commentary note (`commentary/month.ts:25`). Instead the write cannot land a bad value: the
  production SQL in section 7 writes the number 1 and reads every row back.
- `clientMonths` at or above the number of opened months: the client sees every opened month and no team month gets the
  new tag (nothing is dropped). T12.
- No opened month yet: unchanged ("Your first report opens on ...", `noMonthsText`, `:208-213`).

## 5. Edge cases
| # | Case | Expected | Test |
|---|---|---|---|
| 1 | `clientMonths` absent | every opened month, byte for byte today | existing suite unchanged; T8 |
| 2 | `clientMonths: 1`, day after the opening day | newest month only, served by default | T2 |
| 3 | `clientMonths: 1`, before the opening day | the previous opened month (Aug on Oct 5) | T3 |
| 4 | team with `clientMonths: 1` | every month; aged-out month tagged | T4, T5 |
| 5 | client's old link to an aged-out month | replaced by the newest month, not an attempt | T6 |
| 6 | client reaching for the live or an unopened month | still an attempt, logged | T7 |
| 7 | the newest month's own link | canonical, no redirect | T7 |
| 8 | `clientMonths: 2` | the newest two opened months | T8 |
| 9 | invalid value (0, 37, 1.5, -1, "1", null, true) | fail closed as in section 4 | T1, T9 |
| 10 | locking with the key present, absent or invalid | the settled day is identical | T10 |
| 11 | a whole year of days with the key set | every offered month is a fixed point, both viewers | T11 |
| 12 | Renaissance / no `reportingMonths` | never reaches this code | existing `locked-range.test.ts` |
| 13 | deep link to an aged-out month | served the newest month in place, not logged | T6 (same resolver) |
| 14 | Commentary for a client | cutoff unchanged (months[0] kept) | T2 asserts `months[0]` |
| 15 | cap at or above the opened count (2 on Oct 20; 36 with `firstMonth` 0001-01) | every opened month, no new tag | T12 |
| 16 | a bad `opensOnDay` and a request for an opened whole month | an attempt, as today | T13 |
| 17 | invalid `clientMonths` and a request for August on Oct 20 | an attempt, as with any bad knob | T13 |
| 18 | a partial range inside an aged-out month | replaced, newest month, not an attempt | T6 |

## 6. Tests (all in `lib/organic-social/reporting-months.test.ts`, written before the code)
- T1 parse: 1 and 36 accepted into `cfg.clientMonths`; absent leaves no `clientMonths` property on `cfg` (so the
  existing `toEqual` at `reporting-months.test.ts:77` still holds); each invalid value sets `badKey: 'clientMonths'`.
- T2 client on 2026-10-20 and 2026-10-12: `['2026-09']`, served September, reason `ok`.
- T3 client on 2026-10-05: `['2026-08']`.
- T4 team on 2026-10-20: `[Oct live, Sep, Aug]`, tags `['Live, team only', null, 'No longer shown to clients']`, served September.
- T5 team on 2026-10-05: tags `['Live, team only', 'Team only until Oct 12', null]`.
- T6 client on 2026-10-20 requesting `custom:2026-08-01,2026-08-31`: `replaced`, served September, `hiddenMonthAttempt: false`;
  the same for the partial range `custom:2026-08-01,2026-08-15` (that one pins today's behaviour, since a partial range
  is never an attempt, `:197`; the whole-month case is the one that tests the new rule).
- T7 client on 2026-10-20 (last complete UTC day 10-19) requesting `custom:2026-10-01,2026-10-19`: `replaced`, served
  September, attempt `true`; on 2026-10-05 requesting `custom:2026-09-01,2026-09-30`: attempt `true`, served August;
  on 2026-10-20 requesting `custom:2026-09-01,2026-09-30`: `canonical`.
- T8 `clientMonths: 2` on 2026-12-20: `['2026-11', '2026-10']` (November opens Dec 14, since Dec 12 is a Saturday);
  without the key, `['2026-11', '2026-10', '2026-09', '2026-08']`.
- T9 `clientMonths: 0`: client `months: []`, reason `malformed-config`, key `clientMonths`; team tags config error.
- T10 `settledThrough` equal for the config with, without and with an invalid `clientMonths` on 2026-10-04, 10-05, 10-20, 11-05.
- T11 every day from 2026-09-01 to 2027-08-31 at 14:00 UTC, `clientMonths: 1`: each offered month's `dateRange`
  resolves `canonical` to the same key, both viewers; and each opened whole month NOT in the client's list resolves
  `replaced`, served `months[0]`, `hiddenMonthAttempt: false`. The canonical checks are pinned exactly, never adjusted
  to match a run: client checks 352 (one month a day from 2026-09-14, when August opens, through 2027-08-31: 17 + 31 + 30 + 31 + 31 + 28
  + 31 + 30 + 31 + 30 + 31 + 31); team checks 2731 (in a month with D days and k finished months back to August, D x k
  finished checks plus D - 1 live checks, no live month on the 1st at 14:00 UTC: 59, 92, 119, 154, 185, 195, 247, 269,
  309, 329, 371, 402 from September to August). If a run disagrees, find why before changing anything. The replaced
  checks are counted apart and must be at least one a day from 2026-10-12, when September opens and August drops off.
- T12 `clientMonths: 2` on 2026-10-20: client `['2026-09', '2026-08']`, team tags `['Live, team only', null, null]`;
  `clientMonths: 36` with `firstMonth` `0001-01`: client length 36 ending `2023-10`, no team month tagged
  "No longer shown to clients" (the existing cap test, `reporting-months.test.ts:226-233`, with the key set).
- T13 today's attempt rule is kept outside the new case: `{ firstMonth: '2026-08', opensOnDay: 3 }` requesting
  `custom:2026-08-01,2026-08-31` on 2026-10-20 is an attempt (`true`), and so is `{ firstMonth: '2026-08',
  clientMonths: 0 }` with the same request.

## 7. Turning it on
After the code is on staging, a guarded staging script sets `clientMonths: 1` on the five clients (plan Task 4):
host guard, dry run first, every row checked before any write, one transaction, the Renaissance row hashed before and
after, run from the main checkout. Production gets the same with the October release, with my written consent; the production run re-checks that the five
rows have `reportingMonths` and that Renaissance has none before any write, since section 2's facts are from staging.
Nothing visible changes before Oct 12, since August is still the newest opened month.

**Production (after Paul's review).** Run in the Neon SQL editor (CLAUDE.md rule 3), on my written go, after the
launch deploy and before Oct 12. Owner: me. It targets every client opted in to locked months, so it needs no slugs,
and never Renaissance (no `reportingMonths`; excluded by name as well). Checked against staging without writing
(2026-10-01, a read-only transaction): it selects exactly the five outline clients and writes
`{"firstMonth":"2026-08","clientMonths":1}` with `clientMonths` a number, which `parseReportingMonths` accepts
(`reporting-months.ts:132`).

```sql
-- 1. Before: the rows it will touch (expect the five outline clients, never renaissance).
SELECT slug, dash_social_config->'reportingMonths' AS reporting_months
FROM clients WHERE dash_social_config ? 'reportingMonths' ORDER BY slug;

-- 2. The write, one statement, with its own read-back.
UPDATE clients
SET dash_social_config = jsonb_set(dash_social_config, '{reportingMonths,clientMonths}', '1'::jsonb, true),
    updated_at = now()
WHERE dash_social_config ? 'reportingMonths'
  AND jsonb_typeof(dash_social_config->'reportingMonths') = 'object'
  AND slug <> 'renaissance'
RETURNING slug, dash_social_config->'reportingMonths' AS reporting_months;

-- 3. After: every row shows clientMonths 1, as a number.
SELECT slug, dash_social_config->'reportingMonths'->'clientMonths' AS client_months,
       jsonb_typeof(dash_social_config->'reportingMonths'->'clientMonths') AS client_months_type
FROM clients WHERE dash_social_config ? 'reportingMonths' ORDER BY slug;
```

Dated check, by Oct 9 (owner: me): step 3 shows `1` and `number` on every row, and a client login sees only the
newest opened month. Staging gets the same statements first, after merge, with a dry run (step 1) and my go.

## 8. Out of scope
- Any change to what the team sees beyond the tag.
- YTD, locking, Commentary, the lock sweep and the routes: no edits.
- A team-facing Commentary note for aged-out months (the tag is the signal; file it if Jasmine asks).
