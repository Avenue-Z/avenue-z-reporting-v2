# Locked months: design

Status: design approved in chat 2026-09-21 (Approach 1). Revised the same day after two
independent adversarial reviews (section 13). Then planned, then built test first. Scope doc:
`docs/organic-social-snapshots.md` (PR 253). Branch `feat/os-locked-months`, PR into
`organic-social-october`.

No client identifiers in this document. Dash brand ids and client figures never enter this
repository; it is public.

## 1. What this builds

The three new Organic Social clients get a month and year picker instead of rolling date ranges.

- The Organic Social team sees every month from the client's first reporting month onward,
  plus the current month live, and lands on the most recent finished month.
- A client sees only months that have opened to them (the 12th of the following month, or
  the Monday after when the 12th is a weekend) and lands on the newest one.
- Every month compares against the previous calendar month.
- Commentary never shows a client a month that has not opened to them.
- All of this is enforced on the server. The dropdown is a convenience, not the control.
- Renaissance, and every client without the new setting, behaves exactly as today.

What this does NOT do: lock followers, graphs or the Data tiles. Today only Top Content freezes
on a closed month (`lib/organic-social/frozen.ts`). Locking everything is the next build. Until
it lands, a finished month shows frozen Top Content beside live followers, graphs and tiles.
That is acceptable only because none of the three clients has a login (the team approves
internally first, Jasmine's Q10).

## 2. Decisions this rests on

| Decision | Source |
|---|---|
| Month and year picker only; no rolling presets, weeks or quarters | Jasmine, DFA Confirm 2 |
| Team sees the current month live, updating daily | Jasmine, DFA Confirm 3 |
| Clients see finished months, from the 12th; a weekend 12th opens the Monday after | Jasmine, DFA Confirm 4 |
| Numbers lock when a month ends | Jasmine, DFA Confirm 5 |
| History starts August 2026 | Jasmine, DFA Q2 |
| Month to month is the default comparison for every client | Jasmine, earlier Q&A ("Always default to Month to Month reporting") |
| Renaissance does not change | Jasmine, DFA Confirm 1 |
| Enforced on the server, keyed on the client's own config, not on role alone | Follows from the rows above (Renaissance has client logins) |
| The team lands on the most recent finished month | Me, 2026-09-21 |
| The live month compares against the same days of the previous month | Me, 2026-09-21 |

## 3. The rules

All dates are calendar dates (`YYYY-MM-DD`). Date arithmetic is done on those strings in UTC,
so no machine timezone and no daylight saving change can move a date.

### 3.1 Opt in

A client is on locked months when its `dash_social_config` is a plain object that has its own
`reportingMonths` key (`Object.hasOwn`), whatever the value, including `null`:

```json
{ "brandId": 0, "channels": ["instagram"], "reportingMonths": { "firstMonth": "2026-08" } }
```

No key, a missing config, or a config that is not a plain object means today's behaviour, byte
for byte. Renaissance has no such key and nothing in this build writes to its row. The check is
`hasReportingMonths(client)`: synchronous, pure, no I/O.

`firstMonth` must match `^\d{4}-(0[1-9]|1[0-2])$` and be no earlier than
`EARLIEST_REPORTING_MONTH = '2026-08'` (Jasmine's Q2; it also bounds the list). Anything else
(`null`, `{}`, a string, a number, `2026-13`, `2026-01`, `0001-01`) is a **malformed config**:
the client is still opted in, gets no months (fail closed, 3.8), and the server logs an error
with the slug and the reason only. The config object is never logged (it holds the brand id).

### 3.2 The clock

`today` is the date in America/New_York, as `YYYY-MM-DD` built from
`Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year, month, day }).formatToParts`.
It is computed ONCE per request (`requestToday()`, wrapped in `React.cache`) and shared by the
route, the picker and the section, so the three can never disagree at midnight or on the 12th.
Pure functions take `today` as an argument. The browser clock is never consulted: the picker
receives its months, labels and tags as props already formatted on the server.

### 3.3 Viewer

- **Team**: session role `INTERNAL_ADMIN` or `INTERNAL_ANALYST` (the set both layouts use).
- **Client**: any other role, no role, or a session read that fails. Unknown means client.

### 3.4 Months

For month `M` (`YYYY-MM`), `first(M)` is its 1st and `last(M)` its last day.

- **Finished**: `today > last(M)`.
- **Live**: `M` is the current month. Its range is `first(M)` to `today`, so it exists every
  day, including the 1st. The range ends on today, not yesterday, on purpose: the freeze check
  (`isPeriodOpen`, `frozen.ts:14`) uses the UTC date, and a live range ending yesterday in New
  York reads as closed from 20:00 ET every evening and would be frozen. A range ending today in
  New York is open under every UTC date that can occur at that moment, so no caller, present or
  future, can freeze the live month. The cost is that the live month includes today's partial
  day; it is team-only.
- **Opens to clients** (`opensOn(M)`): the 12th of the month after `M`; if that is a Saturday,
  the following Monday (14th); if a Sunday, the following Monday (13th). Weekends only; public
  holidays are not considered (Confirm 4 names weekends only).
- **Client visible**: finished and `today >= opensOn(M)`.

The months a viewer may pick, newest first:

- Team: the live month, then every finished month back to `firstMonth`.
- Client: every client-visible month back to `firstMonth`.

A `firstMonth` in the future yields no months until it arrives.

Worked calendar (2026 to 2027): August opened Mon 14 Sep (the 12th was a Saturday). September
opens Mon 12 Oct. October opens Thu 12 Nov. November opens Mon 14 Dec (the 12th is a Saturday).
December opens Tue 12 Jan 2027. The first Sunday 12th is 12 Sep 2027: August 2027 opens Mon
13 Sep 2027.

### 3.5 Default month

- Team: the most recent finished month in the list; if there is none (a brand new client), the
  live month.
- Client: the newest client-visible month.

### 3.6 Comparison

The comparison is always derived on the server. Any `compareRange` in the URL is ignored for an
opted-in client, so a tampered comparison can never pull live or unopened totals into a change
arrow.

- Finished month `M`: the whole previous calendar month, `first(M-1)` to `last(M-1)`.
- Live month, `first(M)` to day `d` (today): the same days of the previous month, `first(M-1)`
  to day `min(d, days in M-1)` (March 1 to 30 compares with February 1 to 28).

The first reporting month compares with the month before it (August with July). July is a
comparison window only, never a pickable month.

### 3.7 Canonical form and matching a request

A month travels in the existing date-range format, `custom:YYYY-MM-DD,YYYY-MM-DD`: finished
months as `custom:first(M),last(M)`, the live month as `custom:first(M),today`. Every downstream
getter already accepts it, and the Top Content snapshot key (resolved start and end) is identical
to the key already written for August on staging, so those rows are reused.

The `dateRange` search param is normalised first: a string is used as is; anything else (an
array from a repeated param, or absent) counts as not a usable string.

A requested `dateRange` selects month `M` only when it is a string that parses as `custom:S,E`
with valid dates, `S = first(M)`, `M` is in the viewer's list, and either `E = last(M)`
(finished) or `M` is the live month and `first(M) <= E <= last(M)` (a live-month link from an
earlier day still means the live month). Everything else resolves to the default month.

Three outcomes, used by the routes and the logging:

- `canonical`: the param is exactly the served month's canonical string.
- `absent`: no `dateRange` param. Serve the default in place; no redirect, no log.
- `replaced`: the param is present and not canonical. The SPA routes redirect; the deep links
  serve in place. It is logged only when it is a `hidden-month` attempt (the param parses as a
  whole month or live-month range that exists but is not in this viewer's list: the live month
  or an unopened month for a client). Stale presets, junk and arrays are replaced silently.

The canonical form is a fixed point: resolving a canonical string returns `canonical`. This is
what rules out redirect loops.

### 3.8 No months

When the viewer's list is empty (malformed config, a future `firstMonth`, or a client before
their first month opens), no Organic Social data is fetched. The section shows one line: for a
client, "Your first report opens on <Mon D>" (or "No reports are available yet" when the date is
unknown because the config is malformed); for the team, "No reporting months yet" plus the
reason. The picker is shown disabled with the same text.

### 3.9 Commentary

For an opted-in client and a client viewer, Commentary shows only approved entries whose period
ends on or before `last(newest client-visible month)`, and none when there is no visible month.
The filter runs on the server before entries become props, the same boundary the existing
attribution and history rules use. Team viewers and every non-opted client are unchanged.

Open for my decision (section 13, item D1): whether Commentary also follows the selected month
(defaults to the entry for the month on screen) for opted-in clients.

## 4. Units

Each unit has one job and can be tested alone.

### 4.1 `lib/organic-social/reporting-months.ts` (new, pure)

No I/O, no React, no clock. Exports:

```ts
export const EARLIEST_REPORTING_MONTH = '2026-08'
export type Viewer = 'team' | 'client'
export type MonthOption = {
  key: string              // '2026-09'
  label: string            // 'September 2026' (live: 'October 2026, to date')
  dateRange: string        // canonical, 'custom:2026-09-01,2026-09-30'
  compareRange: string     // 'custom:2026-08-01,2026-08-31'
  compareLabel: string     // 'vs August 2026' (live: 'vs Sep 1 to Sep 20')
  live: boolean
  opensOn: string          // '2026-10-12'
  tag: string | null       // team only: 'Live, team only' | 'Team only until Oct 12' | null
}
export type LockedRange = {
  months: MonthOption[]    // newest first, already filtered for the viewer
  month: MonthOption | null // what to serve; null means 3.8
  outcome: 'canonical' | 'absent' | 'replaced'
  hiddenMonthAttempt: boolean
  reason: 'ok' | 'malformed-config' | 'not-started' | 'not-open-yet'
  firstOpensOn: string | null // for the 3.8 client message
}

export function hasReportingMonths(client: unknown): boolean
export function viewerForRole(role: unknown): Viewer
export function easternDate(now: Date): string
export function resolveLockedRange(
  cfgValue: unknown, viewer: Viewer, today: string, requested: unknown,
): LockedRange
```

Inputs are `unknown` on purpose: the jsonb and the search params are untrusted at runtime
whatever their TypeScript types say, so validation lives here.

### 4.2 `lib/organic-social/locked-range.ts` (new, server glue)

```ts
export const requestToday: () => string          // React.cache(() => easternDate(new Date()))
export function lockedRangeFor(
  client: unknown, role: unknown, requested: unknown,
): LockedRange | null
export function logHiddenMonthAttempt(slug: string, requested: unknown, served: string): void
```

`lockedRangeFor` returns `null` when `hasReportingMonths(client)` is false. **Every caller treats
`null` as "do exactly what you do today."** It logs the malformed-config error (slug and reason
only). `logHiddenMonthAttempt` writes `[organic-social] hidden month attempt` with the slug, the
served range and the requested value normalised to a string, cut to 64 characters, then
`JSON.stringify`d with U+2028 and U+2029 escaped. It is called by exactly one layer per request:
the SPA route when it redirects, or the section when it replaces in place (a deep link). The
picker never logs.

### 4.3 `components/report-sections/organic-social/month-picker.tsx` (new, client)

Props (all plain, serialisable data): `months: MonthOption[]`, `value: string | null` (month
key), `emptyText: string | null`. A dropdown, newest first, showing each `label` and `tag`; the
trigger shows the selected `label` and `compareLabel`. Choosing a month pushes the current URL
with `dateRange` set to that month's canonical range and `compareRange` removed; every other
param is kept. No calendar, no presets, no comparison control, no date formatting in the
browser. Disabled with `emptyText` when `months` is empty.

### 4.4 `components/report-sections/organic-social/range-control.tsx` (new, server)

`<OrganicRangeControl client={client} requested={rawParam} role={role} />`. Only ever rendered
for an opted-in client (the routes gate it, 4.5). When `role` is not passed it reads the session
itself (`auth()`, wrapped so a synchronous throw or a rejection both mean client). Calls
`lockedRangeFor` with `requestToday()` and renders `MonthPicker`.

### 4.5 Route changes

Every route gates synchronously, so a non-opted client's returned tree contains exactly today's
picker element and no new wrapper:

```tsx
{hasReportingMonths(client)
  ? <OrganicRangeControl client={client} requested={dateRangeParam} role={role} />
  : <ExistingPicker … />}
```

**The two SPA routes**, `app/portal/[clientSlug]/reports/page.tsx` and
`app/dashboard/[clientSlug]/reports/page.tsx`, when the active section is `organic-social` and
`hasReportingMonths(client)`:

1. Resolve `lockedRangeFor(client, session role, dateRangeParam)` BEFORE the health branch.
2. The health branch (dashboard SPA, `?health=1` for an internal role) renders the section with
   the served month in place and never redirects, so the health sweep keeps finding its beacon.
3. Otherwise, when the outcome is `replaced` and a month exists, log a hidden-month attempt if
   there was one, then `redirect()` to the same path and params with `dateRange` set to the
   canonical range and `compareRange` removed. `redirect()` is never inside a `try`.
4. Pass the served month's `dateRange` and `compareRange` to `OrganicSocialReport` and use the
   served `dateRange` in the Suspense key.
5. Other sections, and every non-opted client, run today's code unchanged.

A bare `/reports` for an opted-in client whose default section is Organic Social makes at most
two hops (the existing missing-section redirect, then the canonical one only if a `dateRange`
param was present and not canonical).

**The two deep-link pages**, `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx` and
`app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx`: only the picker changes, and only
when `reportSlug` is `organic-social` and `hasReportingMonths(client)`; no redirect (the health
sweep and the cache warmer fetch the portal deep link); the section enforces the month in place.
The portal page passes its session role; the dashboard page passes none and the control reads
it. Imports go on their own line directly after the existing `./report-date-range` import. The
`@/lib/constants` import line and `lib/constants.ts` are never edited (section 7).

### 4.6 Section change

`components/report-sections/organic-social/index.tsx`, `OrganicSocialBody`. The existing
template and config `Promise.all` and its `try` stay exactly as they are (their failure
behaviour is Renaissance's too). After it, a separate read for the lock:

```ts
let lockClient: unknown; let lockReadFailed = false
try { lockClient = await getClientBySlug(rctx.clientSlug) } catch { lockReadFailed = true }
```

`getClientBySlug` is request-deduplicated, and every route awaits it before rendering the
section, so this read returns the route's own result and adds no query. Then:

- `lockReadFailed` and a client viewer: render the "temporarily unavailable" line and no parts
  (fail closed). Team viewer: continue as today.
- `lockedRangeFor(lockClient, role, rctx.dateRange)` is `null`: `rctx` untouched.
- A month: `rctx.dateRange` and `rctx.compareRange` become the served ones; if the outcome is a
  `replaced` hidden-month attempt, log it (deep links reach this; SPA routes already redirected,
  so their section sees `canonical`).
- No month: render the 3.8 line and no parts.

A template-lookup failure therefore no longer disables the lock: the lock reads its config on
its own.

### 4.7 Commentary change

`components/report-sections/commentary/index.tsx`, `CommentarySection`, which already holds the
session and the client: when `hasReportingMonths(client)` and the viewer is a client, filter the
approved entries (3.9) before `pickDefaultEntry` and before anything becomes props. Otherwise
the existing code runs unchanged.

### 4.8 Schema type

`lib/db/schema.ts`, `DashSocialConfig`: one optional field, `reportingMonths?: unknown`, with a
doc comment pointing here. Type only: no migration, the column is jsonb.

## 5. Request walkthrough (fixed clock: 20 Oct 2026, New York)

**A client opens Organic Social** from the portal home (no `dateRange` param): viewer client;
list Sep, Aug; outcome `absent`; the route serves September in place. Headlines ask Dash for
Sep 1 to 30 with context Aug 1 to 31. Top Content serves or freezes the September snapshot.
Commentary shows entries ending by Sep 30.

**The same client edits the URL to `custom:2026-10-01,2026-10-19`**: October is the live month
and not in a client's list, so a `hidden-month` attempt; the SPA route logs and redirects to
September. Via the portal deep link, the section serves September in place and logs.

**A team member, no param**: list Oct (live, "Live, team only"), Sep, Aug; default September.
Choosing October serves Oct 1 to 20 against Sep 1 to 20.

**The health sweep** (internal, `health=1`, `dateRange=last_30_days`) on the dashboard SPA: team
rules, default September, served in place, beacon present, no redirect.

**Renaissance, any URL**: `hasReportingMonths` is false at every call site; routes, pickers,
section and Commentary run the exact code path they run today.

## 6. Impact map

Every changed file, and every caller and branch it reaches.

| File | Change | Reaches | Effect |
|---|---|---|---|
| `lib/organic-social/reporting-months.ts`, `locked-range.ts` | new | nothing existing | none |
| `month-picker.tsx`, `range-control.tsx` | new | nothing existing | none |
| `lib/db/schema.ts` | +1 optional field on `DashSocialConfig` | readers: `lib/organic-social/base.ts:26` (`brandId`, `channels`), `lib/constants.ts:203` (`channels`) | none: neither reads the key; no code writes the column |
| Portal and dashboard SPA routes | Organic Social branch, opted-in clients only | section props, header picker, Suspense key, health branch | non-opted: one synchronous `hasReportingMonths` call returning false, otherwise identical |
| Portal and dashboard deep-link pages | picker, opted-in Organic Social only; one import line | header picker | non-opted and every other slug: identical tree |
| `organic-social/index.tsx` | `OrganicSocialBody` lock | every part through `rctx` | non-opted: `rctx` untouched. Opted in: parts get a normal `custom:` range and comparison |
| `commentary/index.tsx` | client-viewer filter, opted-in only | the Commentary panel props | non-opted and team: identical |

Parts that receive the served range (all through `rctx`):

- On dev: headlines (`lib/organic-social/headlines.ts:20-39`), followers (`followers.ts:25`),
  trends (`trends.ts:24`), Top Content v1 and v2 (`top-content.ts:142`, `frozen.ts:53`).
- PR 255: `outline-data.tsx` and `engagement-breakdown.tsx` call `getOutlineKpis(ctx.dateRange,
  ctx.compareRange)`; these are the parts the three clients render.
- PR 252: the v2 follower and engagement graphs call `fetchTopContentFrozen` for post marks. The
  live month cannot freeze (3.4), so these are safe as built.

Unchanged by construction, and what does change around it:

- **Dash requests for non-opted clients**: section inputs are pinned (section 8); the getters,
  `lib/date-range.ts`, `lib/ga4/client.ts` and `frozen.ts` are not edited.
- **Top Content freezing timing for the three clients**: a finished month reads closed from
  00:00 UTC on the 2nd, which is 20:00 ET (EDT) or 19:00 ET (EST) on the 1st. The cache warmer
  (hourly) renders the portal deep link as an internal user, which now serves the team's default
  (the most recent finished month), so a finished month's Top Content freezes automatically on the
  evening of the 1st. That matches Confirm 5 ("numbers lock when a month ends"). When every number
  locks is decided in the next build.
- **Tab links**: both sidebars already carry `dateRange` into the Organic Social tab links
  (`components/layout/portal-sidebar.tsx:272-295`, `components/layout/sidebar.tsx:616-648`); the
  dashboard one also carries `compareRange`, which is ignored (3.6). Neither is edited.
- **Sidebar payloads**: both layouts pass whole client rows to client components (portal
  `getAllClients()`, dashboard `getVisibleClients()`), so the staging config write adds the new
  key to every page's payload, including Renaissance's portal. PR 250 trims the portal sidebar to
  what it needs. The config write therefore happens only after PR 250 is merged (section 11). The
  dashboard sidebar is internal only.
- **Cache warmer** (`app/api/cache-warm/route.ts:116-124`, `redirect: 'manual'`, a 3xx counts as
  ok): the portal deep link warms the team's default month; the dashboard SPA URLs carry
  `dateRange=last_30_days`, get redirected, and warm nothing. Before, they warmed a range these
  clients can no longer select.
- **Health sweep** (`app/api/health/sweep/route.ts:63-74`): both probes (portal deep link and
  dashboard SPA, each with `health=1`) render in place with team rules. Nothing probes the client
  view; that is accepted (edge 23).
- **Commentary** is reached only through 4.7; `SharedPartsHeader` renders outside
  `OrganicSocialBody` and never sees `rctx`.
- **PDF export** prints the page as rendered.
- **Client config cache**: `getClientBySlug` is cached for 5 minutes (`lib/db/queries.ts:32-43`),
  so a staging config write takes effect within 5 minutes; no cache version bump is needed.
- **Other data paths**: no API route or server action fetches Organic Social data by date. The
  only Organic Social action (`app/actions/organic-social.ts`, the designation toggle) takes none.

## 7. Zero conflicts with the open PRs

| Open PR | Shared file | Its lines | Mine |
|---|---|---|---|
| 247 | `lib/db/schema.ts` | the `channels` doc comment, line 135 | a new field after `channels?: string[]` (139); four unchanged lines between |
| 255 | portal deep link | dev lines 5, after 50, 90-92, 117, 125, 160 | an import after `./report-date-range` (`:26`) and the picker block `:149-152` |
| 255 | dashboard deep link | dev lines 4, 41, 74-76, 98, 118 | an import after `./report-date-range` (`:23`) and the picker block `:107-110` |
| 247, 250, 255 | `lib/constants.ts` and the `@/lib/constants` import lines | | never edited |
| 250 | portal sidebar and layout | | not touched |
| 252, 254 | organic-social parts, followers, trends | | not touched |

The reviewer's `git merge-file` trial against PR 255 found 0 conflicts with this placement and a
conflict if the import moves next to line 4. Proof, as for every PR in the set: `git merge-tree
--write-tree` on every pair, then all PRs merged together in two opposite orders with tests, tsc
and `check:rsc`.

## 8. Proving nothing else changed

**Pre-change characterisation tests, written first and green against today's code**, kept green
through the build (`lib/organic-social/locked-months-parity.test.tsx`):

- For each of the four routes, the WHOLE returned element tree, serialised as a snapshot, for a
  non-opted client. Fixtures: a Renaissance-shaped client whose keys and shapes come from the
  production baseline (`~/.claude/renaissance-baseline`; shape only, no values, nothing
  identifying), and a new-client shape without the key. URL inputs: none, `last_30_days`,
  `last_month`, a calendar-month `custom:`, a partial `custom:`, junk, a repeated `dateRange`,
  each with and without `compareRange=previous_year`, plus `health=1` for an internal role.
  Roles: INTERNAL_ADMIN and CLIENT_VIEWER. The snapshot covers the picker element and props, the
  section props, the Suspense key and the absence of any new redirect. It is captured before the
  first change and must not move.
- `CommentarySection` for a non-opted client and for a team viewer of an opted-in client: the
  props handed to `CommentaryPanel` are identical.
- `OrganicSocialBody` for a non-opted client: the parts receive the identical ctx, including when
  the template lookup fails.

**Renaissance drift check** (`~/.claude/renaissance-baseline/check-drift.sh`) before the first
change and after the last, on prod, staging and dev.

**Staging database**: a pre-change snapshot before adding `reportingMonths` to the three clients,
diffed after (only those three rows' `dash_social_config` may change).

## 9. Edge cases

Subject: the `dateRange` param (untrusted), the client config jsonb, the session role, the
server clock; down through the routes, the section and Commentary to the Dash getters.

| # | Category | What could break | Where | Disposition |
|---|---|---|---|---|
| 1 | external failure | `auth()` throws synchronously or rejects in the range control or section | 4.4, 4.6 | fix: both mean client; tests for a throw and a rejection |
| 2 | external failure | the template lookup fails and takes the client config with it, disabling the lock on deep links | 4.6 | fix: separate lock read; test "template fails, client, deep link, requested live month never reaches the getters" |
| 3 | external failure | the lock's own config read fails | 4.6 | fix: client viewer fails closed; team continues as today |
| 4 | operator visibility | a client reaching for a hidden month leaves no trace | 4.2 | fix: one log per request, one layer; test |
| 5 | operator visibility | log noise from absent params, stale presets, and two layers | 3.7, 4.2 | fix: log hidden-month attempts only; test |
| 6 | operator visibility | malformed config blanks the section silently | 3.1 | fix: error log with slug and reason; test |
| 7 | operator visibility | the health sweep marks the dashboard SPA down after a redirect | 4.5 | fix: resolve before the health branch, never redirect with `health=1`; test |
| 8 | bounds | the month list size | 3.1 | fix: floor at `2026-08`; about 12 months a year after that |
| 9 | bounds | redirect loop | 3.7 | fix: canonical is a fixed point; test sweeps every day from 2026-08-01 to 2027-12-31, team and client |
| 10 | input boundary | junk, partial, reversed, cross-month or impossible `custom:` dates | 3.7 | fix: resolve to default; tests per shape |
| 11 | input boundary | a repeated `dateRange` arrives as an array | 3.7 | fix: normalised; test |
| 12 | input boundary | `compareRange` tampering exposes live or unopened totals | 3.6 | fix: always derived; test |
| 13 | input boundary | config `null`, `{}`, string, number, out of range, before the floor, future | 3.1 | fix: fail closed or no months yet; tests |
| 14 | input boundary | existing: `resolveDateRange` throws a TypeError on `custom:` with no comma (`lib/date-range.ts:47-50`) | shared resolver | decline for this build: opted-in clients never pass it through (10); it is Renaissance's code path; file |
| 15 | state | weekend 12ths (Saturday and Sunday), the 1st, month lengths, leap years, DST days | 3.4 to 3.6 | fix: table tests incl. 12 Sep 2026 and 12 Dec 2026 (Saturdays), 12 Sep 2027 (Sunday), 29 Feb 2028, 8 Mar and 1 Nov 2026 |
| 16 | state | route, picker and section read the clock at different moments | 3.2 | fix: `requestToday()` once per request; test |
| 17 | state | the live month is frozen every evening (ET and UTC disagree) | 3.4 | fix: live range ends today; test "isPeriodOpen is true for the live range at every hour of the day" |
| 18 | state | a finished month freezes on the evening of the 1st, triggered by the cache warmer | 6 | accept: matches Confirm 5; timing for every number decided in the next build |
| 19 | state | stale client config for up to 5 minutes after a write | 6 | accept: bounded by the TTL; in rollout |
| 20 | security | a client role reaches the live or an unopened month by URL, on any route family, with or without `health=1` | 4.5, 4.6 | fix: routes plus section; outer test runs the real routes as CLIENT_VIEWER |
| 21 | security | Commentary shows a client a month that has not opened | 3.9, 4.7 | fix: server-side filter before props; test |
| 22 | security | untrusted `dateRange` in logs; config (with brand id) in logs | 4.2 | fix: normalised, cut, JSON-escaped incl. U+2028/9; config never logged; tests |
| 23 | security | nothing monitors what a client actually sees; the team cannot preview it | 6 | file: an internal-only client preview is a separate change |
| 24 | security | the staging write widens a payload that already sends whole client rows to every portal page | 6 | accept with order: write only after PR 250 merges |
| 25 | existing | Dash windows use a fixed `T04:00:00Z` offset all year (`lib/organic-social/base.ts:41-52`), so November to March windows start an hour late | shared with Renaissance | file: fixing it changes Renaissance's requests |

The outer acceptance test (`lib/organic-social/locked-months-routes.test.tsx`) runs the four real
route modules for an opted-in client with `requestToday` fixed at 2026-10-20, as CLIENT_VIEWER and
as INTERNAL_ADMIN, over the section 8 inputs plus `health=1`, other sections for the same client,
and a bare `/reports`: it asserts the redirect target or its absence, the served month handed to
the section, and the picker props. The async range control and the section are rendered directly
in their own tests, because a returned-tree walk does not render async children. Written first
and watched fail.

## 10. Testing (test first)

- `lib/organic-social/reporting-months.test.ts`: every rule in section 3 as table tests with a
  fixed `today`; the worked calendar in 3.4; the fixed-point sweep (edge 9); edge 17.
- `lib/organic-social/locked-range.test.ts`: `null` for no key; logging (edges 4, 5, 6, 22);
  `requestToday` (edge 16).
- `components/report-sections/organic-social/month-picker.test.tsx`: order, labels, tags, the URL
  it pushes (keeps other params, drops `compareRange`), the disabled empty state.
- `components/report-sections/organic-social/range-control.test.tsx`: edge 1.
- `components/report-sections/organic-social/index.test.tsx` (extend): the lock, edges 2 and 3,
  the no-months line, the non-opted ctx untouched, and the existing test at `:35` still green.
- `components/report-sections/commentary/index.test.tsx` (extend or new): edge 21 and the
  non-opted and team parity in section 8.
- The two route test files in sections 8 and 9.

Every test is watched failing before its code exists. Verification quotes each test's own result
line. The acceptance test is re-run on the merged October set (with PRs 252 and 255) during the
zero-conflict proof.

## 11. Rollout

1. Code through the October branch, then dev and staging, with the rest of the set.
2. After PR 250 is merged, and on my go, on staging only: pre-change snapshot, dry run, then add
   `reportingMonths: {"firstMonth": "2026-08"}` to the three clients' `dash_social_config`
   (host-guarded script, `jsonb_set`, those three slugs only), snapshot diff, drift check.
   Effective within 5 minutes.
3. Production later, with the rest of the October work, on my express written consent.

## 12. Out of scope

Locking followers, graphs and tiles (next build); the year to date graphs; annotations; any
change to Renaissance; the filed items (edges 14, 23, 25).

## 13. Review record

Two independent reviewers with no shared context reviewed the first draft (`8fdb273`) on
2026-09-21: one for security and correctness, one for codebase fit and blast radius. I checked
every finding against the code before accepting it. All were real. Merged and deduplicated:

| # | Sev | Finding | Disposition |
|---|---|---|---|
| R1 | BLOCKER | A template-lookup failure also discarded the client config, disabling the lock exactly where deep links rely on it (`index.tsx:57-70`) | Fixed: separate lock read (4.6, edges 2 and 3) |
| R2 | BLOCKER | The health sweep also probes the dashboard SPA with `health=1` and `redirect: 'manual'`; a redirect there raises false DOWN alerts (`sweep/route.ts:71-74`, `sweep-probe.ts:78`, `derive.ts:28`) | Fixed: resolve before the health branch, never redirect in health mode (4.5, edge 7) |
| R3 | MAJOR | The live month (ending yesterday, New York) reads closed to the UTC freeze check from 20:00 ET and would be frozen nightly; PR 252 adds two more callers | Fixed by construction: the live month ends today (3.4, edge 17) |
| R4 | MAJOR | Commentary sends every approved entry to a client, so a month's Commentary shows before the month opens | Fixed: server-side filter (3.9, 4.7, edge 21). Following the selected month is D1 below |
| R5 | MAJOR | `null` as the value could fail open with an obvious truthiness check; the type excluded `null` | Fixed: `Object.hasOwn`, type `unknown` (3.1, 4.8) |
| R6 | MAJOR | The planned parity test walked props and could not see the async control; wrapping every client's picker changed the tree | Fixed: synchronous gate in routes, whole-tree snapshots, control tested directly (4.5, 8) |
| R7 | MAJOR | Sidebars send whole client rows to the browser, so the config write reaches every page's payload | Fixed: write only after PR 250 merges (6, 11, edge 24) |
| R8 | MAJOR | The impact map missed PR 255's outline parts and PR 252's graph callers | Fixed (6) |
| R9 | MAJOR | "Only the picker line changes" was wrong: an import is needed, and its position decides a conflict with PR 255 | Fixed: import placement rule, corrected line references (4.5, 7) |
| R10 | MAJOR | Test gaps: `health=1`, CLIENT_VIEWER, Suspense key, other sections, bare `/reports`, template failure; Renaissance fixture hand-made | Fixed (8, 9) |
| R11 | MINOR | Log noise (absent param, two layers), array params, U+2028/9, config in logs | Fixed (3.7, 4.2, edges 5, 11, 22) |
| R12 | MINOR | No floor on `firstMonth` | Fixed: `2026-08` (3.1, edge 8) |
| R13 | MINOR | Clock read up to three times per request | Fixed: `requestToday()` (3.2, edge 16) |
| R14 | MINOR | Sunday 12th untested; `easternDate` format unspecified; browser-side date formatting | Fixed (3.2, 3.4, 4.1, 4.3) |
| R15 | MINOR | Nothing probes the client view; the team cannot preview it | Filed (edge 23) |
| R16 | MINOR | Imprecise claims: date-range lines, "commentary header" via `rctx`, "no new call", sync-throwing `auth()` stub | Fixed throughout |

Decision needed from me before planning:

- **D1.** Should Commentary follow the selected month for opted-in clients (default to the entry
  for the month on screen, so presenting August shows August's Commentary)? The security filter
  above stands either way.
