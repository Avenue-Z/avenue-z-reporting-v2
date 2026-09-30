# Clients see only the newest month: design

Status: draft for review (spec step 2 of the regimen). Every claim is read on `origin/dev` 8502f40 (2026-09-29).
Plan: `docs/superpowers/plans/2026-09-29-newest-month-for-clients.md` (written first; it is reconciled to this spec
after review, and this spec wins where they differ).

## 1. Why
Jasmine on the call, 2026-09-29, 24:25: "can we remove the August view, like, after September has been added?" I said
yes (24:33). Confirmed on Slack the same day, 5:12 PM, to my question "from Oct 12, clients only see September, and our
team still sees both. Right?": "yes".

So: a client's month picker offers only the newest month it can open. The team keeps every month.

## 2. What happens today
- A client on locked months is one whose `dash_social_config` has its own `reportingMonths` key
  (`hasReportingMonths`, `lib/organic-social/reporting-months.ts:75-79`). The five on staging (read-only, 2026-09-29):
  a-place-for-mom, akara-living, joy-of-life, piper-aircraft, pimco, each `{"firstMonth":"2026-08"}`. Renaissance has
  no `reportingMonths`, so `lockedRangeFor` returns null for it before anything below runs (`locked-range.ts:10-11`).
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
- Today, from Oct 12, a client sees September and August (`reporting-months.test.ts:87-95` pins this for 20 Oct 2026).

## 3. The change
One new optional knob, `clientMonths`, inside the existing `reportingMonths` object. Per client, opt in; absent means
today's behaviour exactly. No new column, no schema change (the column is typed `unknown`, `lib/db/schema.ts:143`).

### 3.1 Input
| Key | Required | Valid | Absent | Invalid |
|---|---|---|---|---|
| `clientMonths` | no | a JavaScript number that is an integer from 1 to 36 (`MAX_REPORTING_MONTHS`) | every opened month (today) | `badKey = 'clientMonths'`: the same fail-closed rule as the other knobs (below) |

Invalid means any other value: 0, 37, a fraction, a negative, a string such as `"1"`, `null`, a boolean.

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
- A request for a month that dropped off the client's list (a whole month older than the last one listed) is
  `replaced` by the newest month: the SPA routes redirect, the deep link serves it in place, exactly as any other
  replaced request today. It is NOT a hidden-month attempt and is not logged: the client saw that month before.
- A request for the live month or an unopened month is still a hidden-month attempt, logged as today.
- Canonical strings stay fixed points for both viewers (spec 3.7's "no redirect loops" rule).

### 3.5 What does not change
- Locking, the lock sweep and every lock key: they never read the list or the new key (section 2).
- YTD: a client on September still sees August's numbers in the YTD graphs. That is the year-to-date history, not the
  August view Jasmine asked to remove. Stated in the PR.
- Commentary: its client cutoff is `lastOf(locked.months[0].key)` (`monthly.tsx:35`), and the cap always keeps
  `months[0]`, so it is unchanged.
- The team's list, default month and redirects.
- Renaissance and every client without `reportingMonths`: never reach this code (`locked-range.ts:11`).

## 4. Failure handling
- Invalid `clientMonths`: fail closed, like `opensOnDay` today (locked months spec 3.1). The team keeps every month,
  each finished one tagged "Hidden from clients: config error"; clients get no months and see "No reports are available
  yet"; the section logs the slug and the key only, never the config (`index.tsx:89`, `locked-range.ts:26-29`).
  Locking is unaffected (`settledThrough` reads only `parsed.ok`, `lock-day.ts:31-33`).
- `clientMonths` larger than the number of opened months: the client sees every opened month (nothing to drop).
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

## 6. Tests (all in `lib/organic-social/reporting-months.test.ts`, written before the code)
- T1 parse: 1 and 36 accepted into `cfg.clientMonths`; absent leaves no `clientMonths` property on `cfg` (so the
  existing `toEqual` at `reporting-months.test.ts:77` still holds); each invalid value sets `badKey: 'clientMonths'`.
- T2 client on 2026-10-20 and 2026-10-12: `['2026-09']`, served September, reason `ok`.
- T3 client on 2026-10-05: `['2026-08']`.
- T4 team on 2026-10-20: `[Oct live, Sep, Aug]`, tags `['Live, team only', null, 'No longer shown to clients']`, served September.
- T5 team on 2026-10-05: tags `['Live, team only', 'Team only until Oct 12', null]`.
- T6 client on 2026-10-20 requesting `custom:2026-08-01,2026-08-31`: `replaced`, served September, `hiddenMonthAttempt: false`.
- T7 client requesting the live October range: attempt `true`; on 2026-10-05 requesting whole September: attempt `true`,
  served August; requesting September's canonical string on 2026-10-20: `canonical`.
- T8 `clientMonths: 2` on 2026-12-20: `['2026-11', '2026-10']` (November opens Dec 14, since Dec 12 is a Saturday);
  without the key, `['2026-11', '2026-10', '2026-09', '2026-08']`.
- T9 `clientMonths: 0`: client `months: []`, reason `malformed-config`, key `clientMonths`; team tags config error.
- T10 `settledThrough` equal for the config with, without and with an invalid `clientMonths` on 2026-10-04, 10-05, 10-20, 11-05.
- T11 every day from 2026-09-01 to 2027-08-31 at 14:00 UTC: each offered month's `dateRange` resolves `canonical` to
  the same key, both viewers; more than 700 checks.

## 7. Turning it on
After the code is on staging, a guarded staging script sets `clientMonths: 1` on the five clients (plan Task 4):
host guard, dry run first, every row checked before any write, one transaction, the Renaissance row hashed before and
after, run from the main checkout. Production gets the same with the October release, with my written consent.
Nothing visible changes before Oct 12, since August is still the newest opened month.

## 8. Out of scope
- Any change to what the team sees beyond the tag.
- YTD, locking, Commentary, the lock sweep and the routes: no edits.
- A team-facing Commentary note for aged-out months (the tag is the signal; file it if Jasmine asks).
