# Locked months: design

Status: APPROVED by me 2026-09-21, after four independent adversarial review rounds and two
decisions of mine (section 13). Next: the implementation plan, reviewed the same way, then built
test first. Scope doc: `docs/organic-social-snapshots.md` (PR 253). Branch
`feat/os-locked-months`, PR into `organic-social-october`.

No client identifiers in this document. Dash brand ids and client figures never enter this
repository; it is public.

## 1. What this builds

Organic Social clients that opt in get a month and year picker instead of rolling date ranges.
Three clients opt in first; the mechanism is config driven and client agnostic, so adding a
client later is a config change, never a code change (11.2).

- The Organic Social team sees every month from the client's first reporting month onward, plus
  the current month live, and lands on the most recent finished month.
- A client sees only months that have opened to them (by default the 12th of the following
  month, or the Monday after when that is a weekend) and lands on the newest one.
- Every month compares with the previous month by default (configurable per client).
- Commentary follows the month on screen, and never shows a client a month that has not opened.
- All of this is enforced on the server. The dropdown is a convenience, not the control.
- Renaissance, and every client without the setting, behaves exactly as today.

What this does NOT do: lock followers, graphs or the Data tiles. Today only Top Content freezes
on a closed month (`lib/organic-social/frozen.ts`). Locking everything is the next build. Until
it lands, a finished month shows frozen Top Content beside live followers, graphs and tiles.
That is acceptable only because none of the opted-in clients has a login (the team approves
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
| Delivery shifts "to the Friday before or the following Monday, per the account's workflow"; the comparison is the previous month "unless the account specifies another comparison" | The team's Reporting Training SOP |
| Renaissance does not change | Jasmine, DFA Confirm 1 |
| Enforced on the server, keyed on the client's own config, not on role alone | Follows from the rows above (Renaissance has client logins) |
| The team lands on the most recent finished month (D22) | Me, 2026-09-21 |
| The live month compares with the same days of the previous month (D23) | Me, 2026-09-21 |
| Commentary follows the month on screen (D24) | Me, 2026-09-21 |
| Every mechanism is config driven and client agnostic; defaults reproduce today | Me, 2026-09-21 (standing rule) |

## 3. The rules

All dates are calendar dates (`YYYY-MM-DD`). Date arithmetic is done on those strings in UTC, so
no machine timezone and no daylight saving change can move a date.

### 3.1 Opt in and config

A client is on locked months when its `dash_social_config` is a plain object that has its own
`reportingMonths` key (`Object.hasOwn`), whatever the value, including `null`. No key, a missing
config, or a config that is not a plain object means today's behaviour, byte for byte.
Renaissance has no such key and nothing in this build writes to its row. The check is
`hasReportingMonths(client)`: synchronous, pure, no I/O.

The value:

| Key | Required | Values | Default |
|---|---|---|---|
| `firstMonth` | yes | `YYYY-MM` (the opted-in clients use `2026-08`, Jasmine's Q2) | none |
| `opensOnDay` | no | integer 4 to 28: the day of the following month a finished month opens to clients | 12 |
| `weekendRule` | no | `next-monday` or `previous-friday`: where an opening day on a weekend moves | `next-monday` |
| `comparison` | no | `previous-month` or `previous-year` | `previous-month` |

The defaults are Jasmine's rules; the knobs are the variations the team's SOP names. The opted-in
clients set only `firstMonth`. Unknown extra keys are ignored. The list is bounded by
`MAX_REPORTING_MONTHS = 36` (the newest 36 months are offered), a size bound with no product
meaning, so no client's history rule is hard-coded in code.

Validation fails closed, and one error is logged (4.2) with the slug and the key at fault only; the
config object is never logged (it holds the brand id):

- `firstMonth` missing or malformed (or the whole value `null`, `{}`, not an object): opted in, no
  months for anyone (3.8).
- An optional knob malformed: the team keeps its months (they do not depend on `opensOnDay` or
  `weekendRule`, and a malformed `comparison` falls back to `previous-month` for the team) and is
  served normally, with `reason: 'malformed-config'` and `malformedKey` set so the section logs it,
  and every month tagged "Hidden from clients: config error"; clients get no months.

### 3.2 The clock

One clock per request, `requestClock()` (wrapped in `React.cache`), read once and passed to every
layer that needs it (the route, the picker, the section, Commentary), so none can disagree at a
boundary:

- `today`: the date in America/New_York, `YYYY-MM-DD`, built with
  `Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit',
  day: '2-digit' }).formatToParts`. It decides which months are finished and which have opened.
- `lastCompleteUtcDay`: yesterday in UTC. It ends the live month (3.4).
- `liveDayInProgress`: `true` when the current UTC hour is before 4 (3.4).

Pure functions take the clock as an argument. The browser clock is never consulted: the picker
receives its months, labels and tags already formatted on the server.

### 3.3 Viewer

- **Team**: session role `INTERNAL_ADMIN` or `INTERNAL_ANALYST` (the set both layouts use).
- **Client**: any other role, no role, or a session read that fails. Unknown means client.

### 3.4 Months

For month `M` (`YYYY-MM`), `first(M)` is its 1st and `last(M)` its last day.

- **Finished**: `today > last(M)`.
- **Live**: `M` is the current month (by `today`) and has at least one complete UTC day, that is
  `lastCompleteUtcDay >= first(M)`. Its range is `first(M)` to `lastCompleteUtcDay`.
  Why: the freeze check (`isPeriodOpen`, `frozen.ts:14-18`) treats a range as open exactly when it
  ends on or after yesterday in UTC, so ending the live month there makes it open by the freeze
  check's own definition. Nothing (Top Content today, PR 252's graphs, the next build) can freeze
  it. Verified by computation every 5 minutes from 2026 to 2028 across every DST change: the live
  range never reads closed and its end never leaves its month. There is no live month from 00:00
  ET on the 1st until 00:00 UTC on the 2nd (20:00 or 19:00 ET on the 1st); the team still has the
  just-finished month.
  What Dash receives: the headline tiles AND the follower and engagement graphs all use the same
  Eastern window (`isoRangeTz` appends a fixed `T04:00:00Z`, `lib/organic-social/base.ts:40-47`;
  `followers.ts:25`, `trends.ts:24`), and Dash counts the end date inclusively. So during the
  first four hours of each UTC day (20:00 to 24:00 EDT, 19:00 to 23:00 EST) the live month's last
  day is still in progress, on the tiles and on the graphs (the Instagram follower graph's extra
  next-day point is in progress for the same hours). The comparison is then full days against full
  days except that one evening day: at most 4 hours in `24 x d`, about -17% on the first evening a
  live month appears and under 2% from the 10th. That is accepted (team only), and the label says
  so exactly: when `liveDayInProgress` (UTC hour before 4), the live label reads "October 2026,
  through Oct 1 (in progress)". Verified: that condition matches the in-progress hours at every
  15-minute sample from 2026 to 2030.
- **Opens to clients** (`opensOn(M)`): day `opensOnDay` of the month after `M`. If that falls on
  a Saturday or Sunday, `next-monday` moves it to the following Monday and `previous-friday` to
  the Friday before. `opensOnDay >= 4` keeps a Friday shift on the 2nd or later, when the freeze
  check already reads the month as closed (with 3, a Sunday 3rd would open on Friday the 1st, before
  the month freezes). Weekends only; public holidays are not considered (Confirm 4 names weekends
  only).
- **Client visible**: finished and `today >= opensOn(M)`.

The months a viewer may pick, newest first:

- Team: the live month when there is one, then every finished month back to `firstMonth`.
- Client: every client-visible month back to `firstMonth`.

A `firstMonth` in the future yields no months until it arrives.

Worked calendar with the defaults (2026 to 2027): August opened Mon 14 Sep (the 12th was a
Saturday). September opens Mon 12 Oct. October opens Thu 12 Nov. November opens Mon 14 Dec (the
12th is a Saturday). December opens Tue 12 Jan 2027. The first Sunday 12th is 12 Sep 2027:
August 2027 opens Mon 13 Sep 2027.

### 3.5 Default month

- Team: the most recent finished month in the list; if there is none (a new client), the live
  month.
- Client: the newest client-visible month.

### 3.6 Comparison

Always derived on the server. Any `compareRange` in the URL is ignored for an opted-in client, so
a tampered comparison can never pull live or unopened totals into a change arrow.

- `previous-month`, finished `M`: `first(M-1)` to `last(M-1)`. Live `M` through day `d`: the same
  days of the previous month, `first(M-1)` to day `min(d, days in M-1)` (March 1 to 30 compares
  with February 1 to 28).
- `previous-year`, finished `M`: the same month a year earlier. Live: the same days a year
  earlier, `min(d, days in that month)` (29 Feb 2028 compares with 1 to 28 Feb 2027).

The first reporting month compares with the window before it (with `previous-month`, August with
July). That window is for comparison only, never a pickable month.

### 3.7 Canonical form and matching a request

A month travels in the existing date-range format, `custom:YYYY-MM-DD,YYYY-MM-DD`: finished months
as `custom:first(M),last(M)`, the live month as `custom:first(M),lastCompleteUtcDay`. Every
downstream getter already accepts it, and the Top Content snapshot key (resolved start and end) is
identical to the key already written for August on staging, so those rows are reused.

The `dateRange` search param is normalised first: a string is used as is; anything else (an array
from a repeated param, or absent) is not a usable string.

A requested `dateRange` selects month `M` only when it is a string that parses as `custom:S,E`
with valid dates, `S = first(M)`, `M` is in the viewer's list, and either `E = last(M)` (finished)
or `M` is the live month and `first(M) <= E <= last(M)` (a live-month link from an earlier day
still means the live month). Everything else resolves to the default month.

Three outcomes, used by the routes and the logging:

- `canonical`: the param is exactly the served month's canonical string.
- `absent`: no `dateRange` param. Serve the default in place; no redirect, no log.
- `replaced`: the param is present and not canonical. SPA routes redirect; deep links serve in
  place. Logged only when it is a `hidden-month` attempt (the param parses as a whole month or
  live-month range that exists but is not in this viewer's list: the live month or an unopened
  month, for a client). Stale presets, junk and arrays are replaced silently.

The canonical form is a fixed point: resolving a canonical string returns `canonical`. This rules
out redirect loops.

### 3.8 No months

When the viewer's list is empty (malformed config, a future `firstMonth`, or a client before their
first month opens), no Organic Social data is fetched. The section shows one line: for a client,
"Your first report opens on <Mon D>" (or "No reports are available yet" when the date is unknown
because the config is malformed); for the team, "No reporting months yet" plus the reason. The
picker is shown disabled with the same text.

### 3.9 Commentary follows the month (D24)

For an opted-in client, on Organic Social views only (`organic-social` and
`organic-social:<channel>` view keys), the Commentary on every tab is the Commentary for the
month on screen.

- **Which month an entry belongs to**: the month containing its `periodStart`. An entry written
  for 1 Aug to 5 Sep (a deck-style adjusted window) belongs to August. Commentary already keeps
  one live approved version per period (`lib/commentary/select.ts`), so nothing new is stored.
- **Client viewers**: an entry is eligible only when BOTH it belongs to the served month AND its
  `periodEnd <= last(newest client-visible month)`. Membership alone is not enough: an entry for
  1 Sep to 19 Oct belongs to September but describes the live month, so a client does not get it
  until October opens. On these views a client-role viewer is treated as a non-editor for
  Commentary whatever their email (approved entries only, redacted, no history), so an Avenue Z
  email given a client role sees exactly what a client sees.
- **What the panel receives**: only the eligible entries of the served month (the team: approved
  and drafts of the served month). The panel is given nothing from any other month.
- **Default**: an entry whose period is exactly `first(M)` to `last(M)` is preferred (today's
  ordering, `pickDefaultEntry`, among those); otherwise today's ordering among the month's entries.
  So a whole-month entry wins over an older rolling-window entry that happens to start in the same
  month. The default is picked on the un-redacted eligible entries, then entries are redacted for a
  non-editor, as today (`toClientSafeEntry` blanks `updatedAt`, see the CAUTION in `select.ts`).
- **What the team is told**: an entry the cutoff still withholds from clients carries a team-only
  note, "Clients see this from <Mon D>", the opening date of the month containing its `periodEnd`,
  computed on the server. Example (clock 15 Sep 2026): an approved 1 Aug to 5 Sep entry is
  August's default for the team, but clients see no August Commentary until September opens on
  12 Oct, and the team sees exactly that note instead of discovering it later.
- **Nothing for that month**: a client sees no Commentary panel (today's rule when nothing is
  approved); the team sees the panel with "No commentary for <Month YYYY> yet" and Add.
- **Adding**: a new entry is prefilled with the month on screen, `first(M)` to `last(M)` (the
  whole month, also for the live month), and stays editable.
- **Switching months** resets the panel's own selection (the panel is keyed by the month). This
  also discards unsaved editor text when the month changes; accepted.
- **Approver history** (the team's version log) is unchanged for team viewers: it lists every
  period, approvers only, as today. Client-role viewers get none (above).
- **Entries in months outside the list** (for example July, before `firstMonth`) are never the
  served month, so the panel does not show them; approvers still see them in the history log.
- Saving a cross-month period is still allowed (`validateCommentaryInput`, `lib/commentary/
  mutations.ts:5-15`, only checks start before end); the client filter above makes it safe, and
  the prefill steers the team to whole months. Rejecting cross-month periods is not part of this
  build.

Non-opted clients, and every non-Organic Social view that uses Commentary (the six other
`SharedPartsHeader` call sites: Meta ads, LinkedIn ads, paid search, and the three AEO views), run
today's code.

## 4. Units

Each unit has one job and can be tested alone.

### 4.1 `lib/organic-social/reporting-months.ts` (new, pure)

No I/O, no React, no clock. Exports:

```ts
export const MAX_REPORTING_MONTHS = 36
export type Clock = { today: string; lastCompleteUtcDay: string; liveDayInProgress: boolean }
export type Viewer = 'team' | 'client'
export type MonthOption = {
  key: string              // '2026-09'
  label: string            // 'September 2026' (live: 'October 2026, through Oct 19', plus ' (in progress)' when it ends today)
  dateRange: string        // canonical, 'custom:2026-09-01,2026-09-30'
  compareRange: string     // 'custom:2026-08-01,2026-08-31'
  compareLabel: string     // 'vs August 2026' (live: 'vs Sep 1 to Sep 19')
  live: boolean
  opensOn: string          // '2026-10-12'
  tag: string | null       // team only: 'Live, team only' | 'Team only until Oct 12' | 'Hidden from clients: config error' | null
}
export type LockedRange = {
  months: MonthOption[]     // newest first, already filtered for the viewer
  month: MonthOption | null // what to serve; null means 3.8
  outcome: 'canonical' | 'absent' | 'replaced'
  hiddenMonthAttempt: boolean
  reason: 'ok' | 'malformed-config' | 'not-started' | 'not-open-yet'
  malformedKey: string | null
  firstOpensOn: string | null // for the 3.8 client message
}

export function hasReportingMonths(client: unknown): boolean
export function viewerForRole(role: unknown): Viewer
export function clockFor(now: Date): Clock
export function resolveLockedRange(
  cfgValue: unknown, viewer: Viewer, clock: Clock, requested: unknown,
): LockedRange
```

Inputs are `unknown` on purpose: the jsonb and the search params are untrusted at runtime whatever
their TypeScript types say, so validation lives here.

### 4.2 `lib/organic-social/locked-range.ts` (new, server glue)

```ts
export const requestClock: () => Clock // React.cache(() => clockFor(new Date()))
export function lockedRangeFor(
  client: unknown, role: unknown, requested: unknown, clock: Clock,
): LockedRange | null
export function logHiddenMonthAttempt(slug: string, requested: unknown, served: string): void
export function logMalformedConfig(slug: string, key: string | null): void
```

`lockedRangeFor` returns `null` when `hasReportingMonths(client)` is false. **Every caller treats
`null` as "do exactly what you do today."** It takes the clock as an argument (so tests fix it
directly and no hidden clock read hides inside it); callers pass `requestClock()`.

Logging, one layer each, so one request writes at most one line of each kind:

- `logHiddenMonthAttempt` writes `[organic-social] hidden month attempt` with the slug, the served
  range and the requested value normalised to a string, cut to 64 characters, then
  `JSON.stringify`d with U+2028 and U+2029 escaped. Called by the SPA route when it redirects, or
  by the section when it replaces in place (deep links). Never by the picker or Commentary.
- `logMalformedConfig` writes the slug and the key at fault. Called by the section only (every
  Organic Social request reaches it).

### 4.3 `components/report-sections/organic-social/month-picker.tsx` (new, client)

Props (all plain, serialisable data): `months: MonthOption[]`, `value: string | null` (month key),
`emptyText: string | null`. A dropdown, newest first, showing each `label` and `tag`; the trigger
shows the selected `label` and `compareLabel`. Choosing a month pushes the current URL with
`dateRange` set to that month's canonical range and `compareRange` removed; every other param is
kept. No calendar, no presets, no comparison control, no date formatting in the browser. Disabled
with `emptyText` when `months` is empty.

### 4.4 `components/report-sections/organic-social/range-control.tsx` (new, server)

`<OrganicRangeControl client={client} requested={rawParam} role={role} />`. Only ever rendered for
an opted-in client (the routes gate it, 4.5). When `role` is not passed it reads the session
itself (`auth()`, wrapped so a synchronous throw or a rejection both mean client). Calls
`lockedRangeFor(client, role, requested, requestClock())` and renders `MonthPicker`.

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

1. Resolve `lockedRangeFor(client, session role, dateRangeParam, requestClock())` BEFORE the
   health branch.
2. The health branch (dashboard SPA, `?health=1` for an internal role) renders with the served
   month in place and never redirects, so the health sweep keeps finding its beacon.
3. Otherwise, when the outcome is `replaced` and a month exists, log a hidden-month attempt if
   there was one, then `redirect()` to the same path and params with `dateRange` set to the
   canonical range and `compareRange` removed. `redirect()` is never inside a `try`.
4. Pass the served month's `dateRange` and `compareRange` to `OrganicSocialReport` and use the
   served `dateRange` in the Suspense key.
5. Other sections, and every non-opted client, run today's code unchanged.

A bare `/reports` for an opted-in client whose default section is Organic Social makes at most two
hops (the existing missing-section redirect, then the canonical one only if a `dateRange` param
was present and not canonical).

**The two deep-link pages**, `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx` and
`app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx`: only the picker changes, and only when
`reportSlug` is `organic-social` and `hasReportingMonths(client)`; no redirect (the health sweep
and the cache warmer fetch the portal deep link); the section enforces the month in place. The
portal page passes its session role; the dashboard page passes none and the control reads it.
Imports go on their own line directly after the existing `./report-date-range` import. The
`@/lib/constants` import line and `lib/constants.ts` are never edited (section 7).

### 4.6 Section change

`components/report-sections/organic-social/index.tsx`.

`OrganicSocialReport` (outer, synchronous) passes `requestedRange={dateRange}` to
`SharedPartsHeader` (4.7).

`OrganicSocialBody`: the existing template and config `Promise.all` and its `try` stay exactly as
they are (their failure behaviour is Renaissance's too). After it, a separate read for the lock:

```ts
let lockClient: unknown; let lockReadFailed = false
try { lockClient = await getClientBySlug(rctx.clientSlug) } catch { lockReadFailed = true }
```

`getClientBySlug` is request-deduplicated and every route awaits it before rendering the section,
so this returns the route's own result and adds no query. Then:

- `lockReadFailed`: run today's path, for every viewer. It cannot leak: every Dash getter reaches
  Dash only through `dashClientFor` (`lib/organic-social/base.ts:23-30`, which awaits the same
  `getClientBySlug`; Top Content at `top-content.ts:136`), and React 19's `cache` hands back the same
  rejected promise for the rest of the request, so no data can load. Snapshot reads need a client id
  from the same lookup (`frozen.ts:33`). This keeps Renaissance's failure output identical.
- `lockedRangeFor(lockClient, role, rctx.dateRange, requestClock())` is `null`: `rctx` untouched.
- `reason` is `malformed-config`: `logMalformedConfig`; then the 3.8 line only when `month` is
  `null` (the team with a bad optional knob still gets its month, 3.1).
- A month: `rctx.dateRange` and `rctx.compareRange` become the served ones; a `replaced`
  hidden-month attempt is logged (deep links reach this; SPA routes already redirected).
- No month: the 3.8 line and no parts.

A template-lookup failure no longer disables the lock: the lock reads its config on its own.

### 4.7 Commentary

The served month reaches Commentary through the existing shared header, with optional props no
other section passes:

1. `components/report-sections/shared/shared-parts-header.tsx`: optional
   `requestedRange?: string`, copied into the shared context.
2. `components/report-sections/shared/parts/registry.tsx`: `SharedCtx` gains optional
   `requestedRange`; the commentary part forwards it to `CommentarySection` only when defined.
3. `components/report-sections/commentary/index.tsx`, `CommentarySection`: its existing
   `Promise.all([auth(), getClientBySlug(...)])` is untouched (a failing `auth()` still reaches the
   error boundary, as today, for every client). After it, when `hasReportingMonths(client)` and the
   view key is `organic-social` or `organic-social:*`: resolve the served month with
   `lockedRangeFor(client, role, requestedRange, requestClock())` (same inputs and clock as the
   section, so the same month); for a client-role viewer use non-editor capabilities; keep
   `eligibleEntries` (3.9); pick the default with `pickMonthDefault` on the un-redacted entries,
   then redact for a non-editor; history `[]` for a client role; for the team, compute the
   "Clients see this from" notes; key the panel by the month; pass `defaultPeriod`, the notes and
   the empty text. With no served month
   it renders nothing for a client and the empty panel for the team. Otherwise the existing code
   runs unchanged.
4. `lib/commentary/month.ts` (new, pure): `monthOfEntry(entry)`, `eligibleEntries(entries,
   monthKey, clientCutoff | null)`, `pickMonthDefault(entries, monthKey)` and
   `clientOpensNote(entry, config, clock)` (the team note).
5. `components/report-sections/commentary/commentary-panel.tsx`: optional
   `defaultPeriod?: { start: string; end: string }`, `emptyText?: string` and
   `entryNotes?: Record<string, string>` (entry id to team note); absent means today's behaviour.
6. `components/report-sections/commentary/commentary-editor.tsx`: optional
   `defaultPeriod?: { start: string; end: string }`, used only for a new entry; absent means
   today's empty fields.

For Renaissance's Organic Social the header now receives `requestedRange`, which
`CommentarySection` ignores for a client without the key. What reaches the browser
(`CommentaryPanel`'s props) is pinned identical by a pre-change test (section 8). The six other
`SharedPartsHeader` call sites pass nothing new.

### 4.8 Schema type

`lib/db/schema.ts`, `DashSocialConfig`: one optional field, `reportingMonths?: unknown`, with a doc
comment pointing here. Type only: no migration, the column is jsonb.

## 5. Request walkthrough (clock: 20 Oct 2026, 10:00 New York; last complete UTC day 19 Oct)

**A client opens Organic Social** from the portal home (no `dateRange` param): viewer client; list
Sep, Aug; outcome `absent`; September served in place. Headlines ask Dash for Sep 1 to 30 with
context Aug 1 to 31. Top Content serves or freezes the September snapshot. Commentary shows the
approved September entry, or nothing.

**The same client edits the URL to `custom:2026-10-01,2026-10-19`**: October is the live month and
not in a client's list, a `hidden-month` attempt; the SPA route logs and redirects to September.
Via the portal deep link, the section serves September in place and logs.

**A team member, no param**: list Oct ("October 2026, through Oct 19", "Live, team only"), Sep,
Aug; default September. Choosing October serves Oct 1 to 19 against Sep 1 to 19, and Commentary
shows October's drafts or "No commentary for October 2026 yet".

**The health sweep** (internal, `health=1`, `dateRange=last_30_days`) on the dashboard SPA: team
rules, default September, served in place, beacon present, no redirect.

**Renaissance, any URL**: `hasReportingMonths` is false at every call site; routes, pickers,
section and Commentary run the exact code path they run today.

## 6. Impact map

Every changed file, and every caller and branch it reaches.

| File | Change | Reaches | Effect |
|---|---|---|---|
| `lib/organic-social/reporting-months.ts`, `locked-range.ts`, `lib/commentary/month.ts` | new | nothing existing | none |
| `month-picker.tsx`, `range-control.tsx` | new | nothing existing | none |
| `lib/db/schema.ts` | +1 optional field on `DashSocialConfig` | readers: `lib/organic-social/base.ts:26` (`brandId`, `channels`), `lib/constants.ts:203` (`channels`) | none: neither reads the key; no code writes the column |
| Portal and dashboard SPA routes | Organic Social branch, opted-in only | section props, header picker, Suspense key, health branch | non-opted: one synchronous `hasReportingMonths` call returning false, otherwise identical |
| Portal and dashboard deep-link pages | picker, opted-in Organic Social only; one import line | header picker | non-opted and every other slug: identical tree |
| `organic-social/index.tsx` | lock in `OrganicSocialBody`; `requestedRange` to the header | every part through `rctx`; the Commentary header | non-opted: `rctx` untouched; Commentary output pinned identical |
| `shared-parts-header.tsx`, `shared/parts/registry.tsx` | optional `requestedRange` | Commentary for every section that uses it | only Organic Social passes it; other sections identical |
| `commentary/index.tsx`, `commentary-panel.tsx`, `commentary-editor.tsx` | month filter and prefill, opted-in Organic Social views only; optional props | every Commentary panel | non-opted clients and non-Organic Social views: identical |

Parts that receive the served range (all through `rctx`):

- On dev: headlines (`lib/organic-social/headlines.ts:20-39`), followers (`followers.ts:25`), trends
  (`trends.ts:24`), Top Content v1 and v2 (`top-content.ts:142`, `frozen.ts:53`).
- PR 255: `outline-data.tsx` and `engagement-breakdown.tsx` call `getOutlineKpis(ctx.dateRange,
  ctx.compareRange)`; these are the parts the opted-in clients render.
- PR 252: the v2 follower and engagement graphs call `fetchTopContentFrozen` for post marks. The
  live month cannot freeze (3.4), so these are safe as built.

Unchanged by construction, and what does change around it:

- **Dash requests for non-opted clients**: section inputs are pinned (section 8); the getters,
  `lib/date-range.ts`, `lib/ga4/client.ts` and `frozen.ts` are not edited.
- **Windows that reach past now**: finished months end in the past. The live month's tile and
  graph windows can reach up to 4 hours past now in the first four UTC hours of a day (3.4). Dash already
  accepts such windows: the existing `last_N_days` and `this_month` presets
  (`lib/date-range.ts:56-63`, `:76-77`) send them every day.
- **Top Content freezing timing for opted-in clients**: a finished month reads closed from 00:00
  UTC on the 2nd, which is 20:00 ET (EDT) or 19:00 ET (EST) on the 1st. The cache warmer (hourly)
  renders the portal deep link as an internal user, which now serves the team's default (the most
  recent finished month), so a finished month's Top Content freezes automatically on the evening
  of the 1st. That matches Confirm 5 ("numbers lock when a month ends"). When every number locks
  is decided in the next build.
- **Tab links**: both sidebars already carry `dateRange` into the Organic Social tab links
  (`components/layout/portal-sidebar.tsx:272-295`, `components/layout/sidebar.tsx:616-648`); the
  dashboard one also carries `compareRange`, which is ignored (3.6). Neither is edited.
- **Sidebar payloads**: both layouts pass whole client rows to client components (portal
  `getAllClients()`, dashboard `getVisibleClients()`), so the staging config write adds the new key
  to every page's payload, including Renaissance's portal. PR 250 trims the portal sidebar to what
  it needs (`toPortalSidebarClient`). The config write therefore waits for a staging build that
  contains PR 250, with the portal payload checked (section 11). The dashboard sidebar is internal
  only.
- **Cache warmer** (`app/api/cache-warm/route.ts:116-124`, `redirect: 'manual'`, a 3xx counts as
  ok): the portal deep link warms the team's default month; the dashboard SPA URLs carry
  `dateRange=last_30_days`, get redirected, and warm nothing. Before, they warmed a range these
  clients can no longer select.
- **Health sweep** (`app/api/health/sweep/route.ts:63-74`): both probes (portal deep link and
  dashboard SPA, each with `health=1`) render in place with team rules. `HealthProbe` renders the
  section's outer component only. Nothing probes the client view (edge 26).
- **PDF export** prints the page as rendered.
- **Client config cache**: `getClientBySlug` is cached for 5 minutes (`lib/db/queries.ts:32-43`), so
  a config write takes effect within 5 minutes; no cache version bump is needed.
- **Other data paths**: no API route or server action fetches Organic Social data by date. The only
  Organic Social action (`app/actions/organic-social.ts`, the designation toggle) takes none.

## 7. Zero conflicts with the open PRs

| Open PR | Shared file | Its lines (dev side) | Mine |
|---|---|---|---|
| 247 | `lib/db/schema.ts` | 135 | a new field after `channels?: string[]` (139); four unchanged lines between |
| 255 | portal deep link | 5, after 50, 90-92, 117, 125, 160 | an import after `./report-date-range` (`:26`) and the picker block `:149-152` |
| 255 | dashboard deep link | 4, 41, 74-76, 98, 118 | an import after `./report-date-range` (`:23`) and the picker block `:107-110` |
| 247, 250, 255 | `lib/constants.ts`, the `@/lib/constants` import lines | | never edited |
| 250 | portal sidebar and layout | | not touched |
| 252, 254 | organic-social parts, followers, trends | | not touched |
| none | SPA routes, `organic-social/index.tsx`, shared header, shared registry, the three commentary files | | no open PR touches them |

Reviewers' trials: `git merge-file` on both deep links with this placement, 0 conflicts in both
orders; `git merge-tree` on all 15 pairs of the six PR branches, 0 conflicts. Proof for this PR, as
for every PR in the set: `git merge-tree --write-tree` on every pair, then all PRs merged together
in two opposite orders with tests, tsc and `check:rsc`.

## 8. Proving nothing else changed

**Pre-change characterisation tests, written first and green against today's code**, kept green
through the build (`lib/organic-social/locked-months-parity.test.tsx` and the files named below):

- For each of the four routes, the WHOLE returned element tree, serialised as a snapshot, for a
  non-opted client. Fixtures: a Renaissance-shaped client whose keys and shapes come from the
  production baseline (`~/.claude/renaissance-baseline`; shape only, no values, nothing
  identifying), and an opted-in-shaped client without the key. URL inputs: none, `last_30_days`,
  `last_month`, a calendar-month `custom:`, a partial `custom:`, junk, a repeated `dateRange`, each
  with and without `compareRange=previous_year`, plus `health=1` for an internal role. Roles:
  INTERNAL_ADMIN and CLIENT_VIEWER. It covers the picker element and props, the section props, the
  Suspense key, and the absence of any new redirect. Captured before the first change; must not
  move.
- `CommentarySection`: for a non-opted client with and without `requestedRange`, for an opted-in
  client on a non-Organic Social view key, and for each of the six other `SharedPartsHeader` view
  keys (`meta-ads`, `linkedin-ads`, `paid-search`, `peec-ai`, `peec-ai:pr-influence`,
  `peec-ai:content-impact`), the props handed to `CommentaryPanel` are identical to today's, and a
  failing `auth()` still throws as today.
- `CommentaryPanel` and `CommentaryEditor` without the new optional props: rendered output identical
  (snapshot before and after).
- `OrganicSocialBody` for a non-opted client: the parts receive the identical ctx, including when
  the template lookup fails, and when BOTH lookups fail (the existing test at `index.test.tsx:35`
  stays green and is extended to assert its output is unchanged, not merely truthy).

**Renaissance drift check** (`~/.claude/renaissance-baseline/check-drift.sh`) before the first change
and after the last, on prod, staging and dev.

**Staging database**: a pre-change snapshot before adding `reportingMonths` to the opted-in clients,
diffed after (only those rows' `dash_social_config` may change).

## 9. Edge cases

Subject: the `dateRange` param (untrusted), the client config jsonb, the session role, the server
clock; down through the routes, the section and Commentary to the Dash getters.

| # | Category | What could break | Where | Disposition |
|---|---|---|---|---|
| 1 | external failure | `auth()` throws synchronously or rejects in the range control or the section | 4.4, 4.6 | fix: both mean client; tests for a throw and a rejection. Commentary keeps today's behaviour (the throw reaches the error boundary), so Renaissance's failure output does not change |
| 2 | external failure | the template lookup fails and takes the client config with it, disabling the lock on deep links | 4.6 | fix: separate lock read; test "template fails, client, deep link, a hidden month never reaches the getters" |
| 3 | external failure | the lock's own config read fails | 4.6 | fix: today's path for every viewer; test that no getter reaches Dash and Renaissance's failure output is unchanged |
| 4 | operator visibility | a client reaching for a hidden month leaves no trace | 4.2 | fix: one log per request, one layer; test |
| 5 | operator visibility | log noise from absent params, stale presets, several layers | 3.7, 4.2 | fix: hidden-month attempts only; malformed config from the section only; tests |
| 6 | operator visibility | malformed config blanks the section silently | 3.1 | fix: error log with slug and key; test |
| 7 | operator visibility | the health sweep marks the dashboard SPA down after a redirect | 4.5 | fix: resolve before the health branch, never redirect with `health=1`; test |
| 8 | bounds | the month list size, incl. an absurd `firstMonth` like `0001-01` | 3.1 | fix: `MAX_REPORTING_MONTHS = 36`, computed newest first and stopping at the cap |
| 9 | bounds | redirect loop | 3.7 | fix: canonical is a fixed point; test sweeps every day from 2026-08-01 to 2027-12-31 at several hours, team and client |
| 10 | input boundary | junk, partial, reversed, cross-month or impossible `custom:` dates | 3.7 | fix: resolve to default; tests per shape |
| 11 | input boundary | a repeated `dateRange` arrives as an array | 3.7 | fix: normalised; test |
| 12 | input boundary | `compareRange` tampering exposes live or unopened totals | 3.6 | fix: always derived; test |
| 13 | input boundary | config `null`, `{}`, string, number, out-of-range knobs, future `firstMonth` | 3.1 | fix: fail closed for clients (team keeps its months on a bad optional knob) or no months yet; tests per knob |
| 14 | input boundary | existing: `resolveDateRange` throws a TypeError on `custom:` with no comma (`lib/date-range.ts:47-50`) | shared resolver | decline for this build: opted-in clients never pass it through (10); it is Renaissance's code path; file |
| 15 | state | weekend opening days (Saturday, Sunday, both weekend rules), the 1st, month lengths, leap years, DST days | 3.4 to 3.6 | fix: table tests incl. 12 Sep 2026 and 12 Dec 2026 (Saturdays), 12 Sep 2027 (Sunday), 29 Feb 2028, 8 Mar and 1 Nov 2026, `previous-friday` with `opensOnDay` 4 on a Sunday 4th (opens Friday the 2nd, after the freeze), `opensOnDay` 3 rejected, 28 accepted |
| 16 | state | layers read the clock at different moments | 3.2 | fix: `requestClock()` once per request, passed down; `lockedRangeFor` takes the clock; tests pass a fixed clock (a `React.cache` outside a request does not memoise, so "once" is enforced by passing, not by the cache) |
| 17 | state | the live month is frozen (New York and UTC disagree) | 3.4 | fix: the live month ends on the last complete UTC day; test "isPeriodOpen is true for the live range", sampled across a year incl. both DST changes |
| 18 | state | a request that straddles 00:00 UTC computes the live range a moment before the freeze check reads its own clock | 3.4 | accept: at most one Top Content snapshot for that day's window key, identical to live at that moment; the next request uses the new key; stale live links redirect to the current one |
| 19 | state | a finished month freezes on the evening of the 1st, triggered by the cache warmer | 6 | accept: matches Confirm 5; timing for every number decided in the next build |
| 20 | state | stale client config for up to 5 minutes after a write | 6 | accept: bounded by the TTL; in rollout |
| 21 | state | the panel keeps a manual pick across months | 3.9 | fix: panel keyed by the month; test |
| 22 | security | a client role reaches the live or an unopened month by URL, on any route family, with or without `health=1` | 4.5, 4.6 | fix: routes plus section; outer test runs the real routes as CLIENT_VIEWER |
| 23 | security | Commentary shows a client a month that has not opened, incl. a cross-month or rolling-window entry, the history log, or an Avenue Z email with a client role | 3.9, 4.7 | fix: served month membership AND `periodEnd` cutoff; non-editor capabilities and no history for client roles; tests per case |
| 24 | security | untrusted `dateRange` in logs; config (with brand id) in logs | 4.2 | fix: normalised, cut, JSON-escaped incl. U+2028/9; config never logged; tests |
| 25 | security | the staging write widens a payload that already sends whole client rows to every portal page | 6 | accept with order: write only on a staging build containing PR 250, payload checked |
| 26 | security | nothing monitors what a client actually sees; the team cannot preview it | 6 | file: an internal-only client preview is a separate change |
| 27 | existing | Dash windows use a fixed `T04:00:00Z` offset all year (`lib/organic-social/base.ts:41-52`), so November to March windows start an hour early, at 11 PM New York the evening before (corrected 2026-09-22; this row said "late") | shared with Renaissance | file: fixing it changes Renaissance's requests |
| 28 | state | the live month's last day (tiles and graphs) is in progress for four hours each evening | 3.4 | accept: bias at most 4 hours in `24 x d`; labelled "(in progress)" exactly when the UTC hour is before 4; test for the label |
| 29 | operator visibility | an eligible-for-the-team entry is silently withheld from clients by the cutoff | 3.9 | fix: team-only "Clients see this from <date>" note; tests in `month.test.ts` and the commentary index test |
| 30 | state | a non-editor's default picked after redaction mis-orders same-start entries | 3.9, 4.7 | fix: pick before redacting, as today; test |

The outer acceptance test (`lib/organic-social/locked-months-routes.test.tsx`) runs the four real
route modules for an opted-in client with a fixed clock (20 Oct 2026), as CLIENT_VIEWER and as
INTERNAL_ADMIN, over the section 8 inputs plus `health=1`, other sections for the same client, and a
bare `/reports`: it asserts the redirect target or its absence, the served month handed to the
section, and the picker props. The async range control, the section and Commentary are rendered
directly in their own tests, because a returned-tree walk does not render async children. Written
first and watched fail. Mocks note: `OrganicSocialBody` now awaits `getClientBySlug` twice (the
existing read and the lock read), so tests use `mockResolvedValue`, not `mockResolvedValueOnce`.

## 10. Testing (test first)

- `lib/organic-social/reporting-months.test.ts`: every rule in section 3 as table tests with a fixed
  clock; the worked calendar in 3.4; every knob; the fixed-point sweep (edge 9); edge 17.
- `lib/organic-social/locked-range.test.ts`: `null` for no key; logging (edges 4, 5, 6, 24).
- `lib/commentary/month.test.ts`: `monthOfEntry`, `eligibleEntries` (cross-month and rolling-window
  entries, the client cutoff), `pickMonthDefault` (whole-month entry preferred, picked before
  redaction) and `clientOpensNote` (the 15 Sep 2026 example in 3.9).
- `components/report-sections/organic-social/month-picker.test.tsx`: order, labels, tags, the URL it
  pushes (keeps other params, drops `compareRange`), the disabled empty state.
- `components/report-sections/organic-social/range-control.test.tsx`: edge 1.
- `components/report-sections/organic-social/index.test.tsx` (extend): the lock, edges 2 and 3, the
  no-months line, non-opted ctx untouched, the existing test at `:35` tightened.
- `components/report-sections/commentary/index.test.tsx` (extend): D24 behaviour, edges 21 and 23,
  and the section 8 parity.
- `components/report-sections/shared/shared-parts-header.test.tsx` (extend): `requestedRange`
  reaches Commentary only when passed.
- The two route test files in sections 8 and 9.

Every test is watched failing before its code exists. Verification quotes each test's own result
line. The acceptance test is re-run on the merged October set (with PRs 252 and 255) during the
zero-conflict proof.

## 11. Rollout

### 11.1 Steps

1. Code through the October branch, then dev and staging, with the rest of the set.
2. On a staging build that contains PR 250, with the portal payload checked, and on my go, on
   staging only: pre-change snapshot, dry run, then add `reportingMonths: {"firstMonth": "2026-08"}`
   to the opted-in clients (11.2), snapshot diff, drift check. Effective within 5 minutes.
3. Production later, with the rest of the October work, on my express written consent.

### 11.2 Adding a client

1. Add `reportingMonths` to the client's `dash_social_config` with its `firstMonth` and any SOP
   variation (3.1), using a generic host-guarded script that takes the slug and the values as
   arguments: staging first, pre-change snapshot, dry run, then my go; production on my express
   consent.
2. Nothing else. The picker, the gate, the comparison and Commentary follow from the config.

## 12. Out of scope

Locking followers, graphs and tiles (next build); the year to date graphs; annotations; any change
to Renaissance; the filed items (edges 14, 26, 27).

## 13. Review record

Four independent review rounds, each by reviewers with no shared context. I checked every finding
against the code before accepting it.

**Round 1** (two reviewers on `8fdb273`: security and correctness; codebase fit and blast radius).
All findings were real. Merged and deduplicated:

| # | Sev | Finding | Disposition |
|---|---|---|---|
| R1 | BLOCKER | A template-lookup failure also discarded the client config, disabling the lock exactly where deep links rely on it (`index.tsx:57-70`) | Fixed: separate lock read (4.6, edges 2, 3) |
| R2 | BLOCKER | The health sweep also probes the dashboard SPA with `health=1` and `redirect: 'manual'`; a redirect there raises false DOWN alerts | Fixed: resolve before the health branch, never redirect in health mode (4.5, edge 7) |
| R3 | MAJOR | The live month (ending yesterday, New York) reads closed to the UTC freeze check from 20:00 ET and would be frozen nightly | Fixed (see V1): ends on the last complete UTC day (3.4, edge 17) |
| R4 | MAJOR | Commentary sent every approved entry to a client, so a month's Commentary showed before the month opened | Fixed: only the served month's entries (3.9, 4.7, edge 23) |
| R5 | MAJOR | `null` as the value could fail open; the type excluded `null` | Fixed: `Object.hasOwn`, type `unknown` (3.1, 4.8) |
| R6 | MAJOR | The planned parity test walked props and could not see the async control; wrapping every client's picker changed the tree | Fixed: synchronous gate, whole-tree snapshots, control tested directly (4.5, 8) |
| R7 | MAJOR | Sidebars send whole client rows to the browser, so the config write reaches every page's payload | Fixed: write only on a staging build with PR 250, payload checked (6, 11, edge 25) |
| R8 | MAJOR | The impact map missed PR 255's outline parts and PR 252's graph callers | Fixed (6) |
| R9 | MAJOR | "Only the picker line changes" was wrong; the import position decides a conflict with PR 255 | Fixed: placement rule, exact lines (4.5, 7) |
| R10 | MAJOR | Test gaps: `health=1`, CLIENT_VIEWER, Suspense key, other sections, bare `/reports`, template failure; hand-made Renaissance fixture | Fixed (8, 9) |
| R11 | MINOR | Log noise, array params, U+2028/9, config in logs | Fixed (3.7, 4.2) |
| R12 | MINOR | No floor on `firstMonth` | Fixed: `2026-08` (3.1) |
| R13 | MINOR | Clock read up to three times per request | Fixed: `requestClock()` passed down (3.2, edge 16) |
| R14 | MINOR | Sunday 12th untested; date format unspecified; browser-side date formatting | Fixed (3.2, 3.4, 4.1, 4.3) |
| R15 | MINOR | Nothing probes the client view; the team cannot preview it | Filed (edge 26) |
| R16 | MINOR | Imprecise claims (line numbers, Commentary via `rctx`, "no new call", sync-throwing `auth()` stub) | Fixed throughout |

**Round 2** (one reviewer on `2af2847`, verification). R1 to R16 verified closed; freeze behaviour
checked every 5 minutes from 2026 to 2028; `git merge-tree` on all 15 PR pairs, 0 conflicts; no path
found for a client to reach a hidden month. New findings, all real:

| # | Sev | Finding | Disposition |
|---|---|---|---|
| V1 | MAJOR | Ending the live month on today (the R3 fix) compared a partial day with a full one: about -58% on the 1st at 10:00 from elapsed time alone | Fixed: the live month ends on the last complete UTC day, open by the freeze check's own definition and full days against full days; verified by computation (3.4) |
| V2 | MAJOR | Failing closed when the lock read fails changed Renaissance's failure output and was unreachable in production | Fixed: today's path for every viewer; safe because every getter uses the same failed lookup (4.6, edge 3) |
| V3 | MINOR | The Commentary filter was gated on the client, not the view, and lacked the clock | Fixed: Organic Social view keys only; shared clock (3.9, 4.7) |
| V4 | MINOR | `React.cache` does not memoise outside a request; `lockedRangeFor` hid its clock | Fixed: the clock is an argument (4.2, edge 16) |
| V5 | MINOR | Malformed config logged by up to four layers | Fixed: the section only (4.2) |
| V6 | MINOR | Dash accepting a window that ends in the future was unproven | Moot: no opted-in range ends in the future (6) |
| V7 | MINOR | The rollout gate should name a staging build with PR 250 and a payload check | Fixed (11) |
| V8 | PROCESS | D1 had to be decided before planning | Decided: D24 (3.9) |

**Decisions after round 2** (mine, 2026-09-21): Commentary follows the month (D24); every mechanism is
config driven and client agnostic (the `reportingMonths` knobs in 3.1, 11.2).

**Round 3** (one reviewer on `bfc6e2c`, the additions). V2 verified (React 19 `cache` returns the same
rejected promise for the rest of the request; every Dash getter on this branch and on PRs 252, 254
and 255 goes through `dashClientFor`). `previous-year` across leap years, the live-link matching rule,
server action return values and the RSC safety of the new props all checked. New findings, all real:

| # | Sev | Finding | Disposition |
|---|---|---|---|
| X1 | BLOCKER | The rewrite to "belongs to the month of `periodStart`" dropped round 1's `periodEnd` cutoff: an approved 1 Sep to 19 Oct entry would reach a client under September; an older rolling-window entry could become a month's default | Fixed: membership AND cutoff; whole-month entry preferred (3.9, 4.7, edge 23) |
| X2 | MAJOR | "Full days against full days" and "no range ends in the future" were false for the headline tiles, which use Eastern windows | Fixed: stated exactly, bias bounded, "(in progress)" label (3.4, 6, edge 28) |
| X3 | MAJOR | A client-role account with an approver email would get every month's Commentary history | Fixed: client roles get non-editor capabilities and no history on these views (3.9, 4.7) |
| X4 | MINOR | `previous-friday` with `opensOnDay` 3 could open a month before it freezes | Fixed: range 4 to 28 (3.1, 3.4, edge 15) |
| X5 | MINOR | A bad optional knob blanked the team; the `2026-08` floor hard-coded one client rule into code | Fixed: team keeps its months; a 36-month list cap replaces the floor (3.1, edges 8, 13) |
| X6 | MINOR | Catching `auth()` in Commentary would change Renaissance's failure output | Fixed: Commentary keeps today's behaviour (4.7, edge 1) |
| X7 | MINOR | Leftovers: round count, "five other sections" (six call sites), the July example, a line citation, `defaultPeriod`'s type, unsaved text on month switch, section numbering | Fixed throughout |

**Round 4** (one reviewer on `712d01c`, narrow verification of X1 to X7). X1, X3, X4, X6, X7 verified:
dated Commentary examples at 20 Oct 2026 show no leak; `opensOnDay` 4 to 28 with both weekend rules
never opens a month before it freezes, swept every 5 minutes from 2026 to 2030. Findings, all text
level and all real:

| # | Sev | Finding | Disposition |
|---|---|---|---|
| Y1 | MINOR | X2 not closed: graphs also use the Eastern window; the hours differ in EST; the label condition over-labelled one EST hour | Fixed: stated for tiles and graphs, EDT and EST hours, label on UTC hour before 4, verified at every 15 minutes 2026 to 2030 (3.2, 3.4, edge 28) |
| Y2 | MINOR | X5 not closed: the team's bad-knob result would either blank the team or never be logged | Fixed: team served with the reason and key set, logged, tagged (3.1, 4.1, 4.6) |
| Y3 | MAJOR | The cutoff silently withholds an entry the team sees as the month's default (the 1 Aug to 5 Sep example), with no client preview | Fixed: team-only "Clients see this from <date>" note (3.9, 4.7, edge 29) |
| Y4 | MINOR | The spec did not say the default is picked before redaction | Fixed (3.9, 4.7, edge 30) |
