# Locked months: design

Status: design approved in chat 2026-09-21 (Approach 1). This spec is reviewed adversarially
before I read it, then planned, then built test first. Scope doc: `docs/organic-social-snapshots.md`
(PR 253). Branch `feat/os-locked-months`, PR into `organic-social-october`.

No client identifiers in this document. Dash brand ids and client figures never enter this
repository; it is public.

## 1. What this builds

The three new Organic Social clients get a month and year picker instead of rolling date ranges.

- The Organic Social team sees every month from the client's first reporting month onward,
  plus the current month live, and lands on the most recent finished month.
- A client sees only months that have opened to them (the 12th of the following month, or
  the Monday after when the 12th is a weekend) and lands on the newest one.
- Every month compares against the previous calendar month.
- All of this is enforced on the server. The dropdown is a convenience, not the control.
- Renaissance, and every client without the new setting, behaves exactly as today.

What this does NOT do: lock followers, graphs or the Data tiles. Today only Top Content freezes
on a closed month (`lib/organic-social/frozen.ts`). Locking everything is the next build. Until
it lands, a finished month shows frozen Top Content beside live followers, graphs and tiles.
That is acceptable only because no client of these three has a login (the team approves
internally first, Jasmine's Q10).

## 2. Decisions this rests on

| Decision | Source |
|---|---|
| Month and year picker only; no rolling presets, weeks or quarters | Jasmine, DFA Confirm 2 |
| Team sees the current month live, updating daily | Jasmine, DFA Confirm 3 |
| Clients see finished months, from the 12th; a weekend 12th opens the Monday after | Jasmine, DFA Confirm 4 |
| History starts August 2026 | Jasmine, DFA Q2 |
| Month to month is the default comparison for every client | Jasmine, earlier Q&A ("Always default to Month to Month reporting") |
| Renaissance does not change | Jasmine, DFA Confirm 1 |
| Enforced on the server, keyed on the client's own config, not on role alone | Follows from the two rows above (Renaissance has client logins) |
| The team lands on the most recent finished month | Me, 2026-09-21 |
| The live month compares against the same days of the previous month | Me, 2026-09-21 |

## 3. The rules

All dates are calendar dates (`YYYY-MM-DD`). Date arithmetic is done on those strings in UTC,
so no machine timezone and no daylight saving change can move a date.

### 3.1 Opt in

A client is on locked months when `clients.dash_social_config.reportingMonths` is present:

```json
{ "brandId": 0, "channels": ["instagram"], "reportingMonths": { "firstMonth": "2026-08" } }
```

The key being present, with any value including `null`, means opted in. Absent means today's
behaviour, byte for byte. Renaissance has no such key and nothing in this
build writes to its row.

`firstMonth` must match `^\d{4}-(0[1-9]|1[0-2])$`. Anything else (missing, empty, `2026-13`,
a number) is a **malformed config**: the client is still treated as opted in, gets no months at
all (fail closed, section 3.8), and the server logs an error naming the slug.

### 3.2 The clock

`today` is the date in America/New_York at the moment of the request, computed on the server
from an injected `now` (`Intl.DateTimeFormat` with `timeZone: 'America/New_York'`). The browser
clock is never consulted: the picker receives its months as props from the server.

### 3.3 Viewer

- **Team**: session role `INTERNAL_ADMIN` or `INTERNAL_ANALYST` (the same set the dashboard and
  portal layouts use).
- **Client**: any other role, or no role at all. Unknown means client (fail closed).

### 3.4 Months

For month `M` (`YYYY-MM`), `first(M)` is its 1st and `last(M)` its last day.

- **Finished**: `today > last(M)`.
- **Live**: `M` is the current month and `today` is the 2nd or later. Its range is
  `first(M)` to yesterday. On the 1st there is no live month (yesterday belongs to the previous
  month, which is finished).
- **Opens to clients** (`opensOn(M)`): the 12th of the month after `M`; if that is a Saturday,
  the following Monday (14th); if a Sunday, the following Monday (13th). Weekends only; public
  holidays are not considered (Confirm 4 names weekends only).
- **Client visible**: finished and `today >= opensOn(M)`.

The months a viewer may pick, newest first:

- Team: every finished month from `firstMonth`, plus the live month if there is one.
- Client: every client-visible month from `firstMonth`.

A `firstMonth` in the future yields no months until it arrives.

Worked calendar (2026 to 2027): August opened Mon 14 Sep (the 12th was a Saturday). September
opens Mon 12 Oct. October opens Thu 12 Nov. November opens Mon 14 Dec (the 12th is a Saturday).
December opens Tue 12 Jan 2027.

### 3.5 Default month

- Team: the most recent finished month in the list; if there is none (a brand new client), the
  live month.
- Client: the newest client-visible month.

### 3.6 Comparison

The comparison is always derived on the server. Any `compareRange` in the URL is ignored for an
opted-in client, so a tampered comparison can never pull current-month totals into a change
arrow.

- Finished month `M`: the whole previous calendar month, `first(M-1)` to `last(M-1)`.
- Live month, `first(M)` to day `d`: the same days of the previous month, `first(M-1)` to day
  `min(d, days in M-1)` (March 1 to 30 compares with February 1 to 28).

The first reporting month compares with the month before it (August with July). July is a
comparison window only, never a pickable month.

### 3.7 Canonical form and matching a request

A month travels in the existing date-range format, `custom:YYYY-MM-DD,YYYY-MM-DD`: finished
months as `custom:first(M),last(M)`, the live month as `custom:first(M),yesterday`. Every
downstream getter already accepts it, and the Top Content snapshot key (resolved start and end)
is identical to the key already written for August on staging, so those rows are reused.

A requested `dateRange` selects month `M` only when it parses as `custom:S,E` with valid dates,
`S = first(M)`, `M` is in the viewer's list, and either `E = last(M)` (finished) or `M` is the
live month and `first(M) <= E <= last(M)` (a live-month link from an earlier day still means the
live month). Everything else (no param, a rolling preset, junk, a partial or cross-month range,
a month outside the list) resolves to the default month. A request is **overridden** when the
served `dateRange` string differs from the requested one.

The canonical form is a fixed point: resolving a canonical `dateRange` returns the same string
and is not overridden. This is what rules out redirect loops.

### 3.8 No months

When the viewer's list is empty (malformed config, a future `firstMonth`, or a client before
their first month opens), no Organic Social data is fetched. The section shows one line: for a
client, "Your first report opens on <date>" (or "No reports are available yet" when the date
is unknown because the config is malformed); for the team, "No reporting months yet" plus the
reason. The picker is shown disabled with the same text.

## 4. Units

Each unit has one job and can be tested alone.

### 4.1 `lib/organic-social/reporting-months.ts` (new, pure)

No I/O, no React, no `Date.now()`. Exports:

```ts
export type ReportingMonthsConfig = { firstMonth: string }
export type Viewer = 'team' | 'client'
export type MonthOption = {
  key: string              // '2026-09'
  label: string            // 'September 2026' (live: 'October 2026, to date')
  dateRange: string        // canonical, 'custom:2026-09-01,2026-09-30'
  compareRange: string     // 'custom:2026-08-01,2026-08-31'
  live: boolean
  opensOn: string          // '2026-10-12'
  clientVisible: boolean
}
export type LockedRange = {
  months: MonthOption[]    // newest first, already filtered for the viewer
  month: MonthOption | null // what to serve; null means section 3.8
  overridden: boolean
  reason: 'ok' | 'malformed-config' | 'not-started' | 'not-open-yet'
}

export function viewerForRole(role: string | undefined | null): Viewer
export function easternToday(now: Date): string
export function resolveLockedRange(
  cfg: unknown, viewer: Viewer, today: string, requested: string | undefined,
): LockedRange
```

`cfg` is `unknown` on purpose: the jsonb is untrusted at runtime whatever its TypeScript type
says, so validation lives here.

### 4.2 `lib/organic-social/locked-range.ts` (new, server glue)

```ts
export function lockedRangeFor(
  client: { slug: string; dashSocialConfig?: { reportingMonths?: unknown } | null } | null,
  role: string | undefined | null,
  requested: string | undefined,
  now?: Date,
): LockedRange | null
```

Returns `null` when the client has no `reportingMonths` key. **`null` is the only thing a
non-opted client ever sees from this build, and every caller treats `null` as "do exactly what
you do today."** When a client viewer's request is overridden, it logs one line:
`[organic-social] reporting month override` with the slug, the served range, and the requested
value cut to 64 characters and JSON-escaped (untrusted input never reaches the log raw).

### 4.3 `components/report-sections/organic-social/month-picker.tsx` (new, client)

Props: `months: MonthOption[]`, `value: string | null` (month key), `emptyText?: string`. A
dropdown, newest first. Each item shows the label; team-only months carry a tag
("Live, team only" or "Team only until Oct 12"); the trigger shows the selected label and
"vs <comparison>". Choosing a month pushes the current URL with `dateRange` set to that month's
canonical range and `compareRange` removed; every other param (section, subsection, and so on)
is kept. No calendar, no presets, no comparison control. Disabled with `emptyText` when
`months` is empty.

### 4.4 `components/report-sections/organic-social/range-control.tsx` (new, server)

```tsx
<OrganicRangeControl client={client} dateRange={rawDateRange} fallback={<ExistingPicker … />} />
```

If `client` has no `reportingMonths`, it returns `fallback` unchanged and does nothing else:
no `auth()` call, no extra work. Otherwise it reads the role (`await auth()`, a failure means
client), calls `lockedRangeFor`, and renders `MonthPicker`. One component serves all four routes.

### 4.5 Route changes

The two SPA routes, `app/portal/[clientSlug]/reports/page.tsx` and
`app/dashboard/[clientSlug]/reports/page.tsx`:

1. When the active section is `organic-social`, call `lockedRangeFor(client, session role,
   dateRangeParam)`. `null` changes nothing.
2. If it returns a month and the request was overridden, `redirect()` to the same path and
   params with `dateRange` set to the canonical range and `compareRange` removed.
3. Pass the served month's `dateRange` and `compareRange` to `OrganicSocialReport` (after the
   redirect they equal the URL's, except that `compareRange` is always the derived one).
4. Replace the Organic Social `<GA4DatePicker … />` with `OrganicRangeControl`, keeping the
   existing element as its `fallback`.

The two deep-link pages, `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx` and
`app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx`: only the picker line changes, to
`OrganicRangeControl` with the existing picker as `fallback`, and only when `reportSlug` is
`organic-social`. They do not redirect: the health sweep and the cache warmer fetch the portal
deep link, and the section below enforces the month in place. No other line in these files
changes (PR 255 edits nearby lines; section 7).

### 4.6 Section change

`components/report-sections/organic-social/index.tsx`, inside `OrganicSocialBody`, after the
role and client config are read: call `lockedRangeFor(config, role, rctx.dateRange)`. `null`
leaves `rctx` untouched. A month replaces `rctx.dateRange` and `rctx.compareRange` with the
served ones. No month renders the section 3.8 message instead of the parts.

This is the second layer. The routes already enforce, but the section is the last point before
Dash is called, so no route (present or future) can serve a hidden month. The client config
comes from the same request-deduplicated `getClientBySlug` the route used, so the two layers
always see the same config. If that lookup fails here, `OrganicSocialBody` already degrades
and logs; the locked check is then skipped because the route, which could not have rendered
without the client, has already enforced it.

### 4.7 Schema type

`lib/db/schema.ts`, `DashSocialConfig`: one optional field,
`reportingMonths?: { firstMonth: string }`, with a doc comment pointing here. Type only: no
migration, the column is jsonb.

## 5. Request walkthrough

**A client opens Organic Social on 20 Oct 2026** (firstMonth 2026-08), with a stale bookmark
`?section=organic-social&dateRange=last_30_days`:
the portal SPA route resolves viewer client; the list is Sep, Aug (Oct is live and team only;
nothing later is finished); the default is September; the request is overridden, so it logs and
redirects to `dateRange=custom:2026-09-01,2026-09-30`. The second request matches September,
is not overridden, and renders. The section re-checks and agrees. Headlines ask Dash for Sep 1
to 30 with context Aug 1 to 31. Top Content serves the frozen September snapshot or freezes it.

**The same client edits the URL to `custom:2026-10-01,2026-10-19`**: October is not in a
client's list, so it resolves to September and redirects. Via the deep link, the page renders
September in place.

**A team member on 20 Oct**, no dateRange: list Oct (live), Sep, Aug; default September
(most recent finished); the picker shows October tagged "Live, team only". Choosing October
serves Oct 1 to 19 against Sep 1 to 19.

**Renaissance, any URL**: `lockedRangeFor` returns `null` at every call site; the routes, the
picker and the section run the exact code path they run today.

## 6. Impact map

Every changed file, and every caller and branch it reaches.

| File | Change | Reaches | Effect |
|---|---|---|---|
| `lib/organic-social/reporting-months.ts` | new | nothing existing | none |
| `lib/organic-social/locked-range.ts` | new | nothing existing | none |
| `month-picker.tsx`, `range-control.tsx` | new | nothing existing | none |
| `lib/db/schema.ts` | +1 optional field on `DashSocialConfig` | Readers of `dashSocialConfig`: `lib/organic-social/base.ts:26` (`dashClientFor`, uses `brandId`, `channels`) and `lib/constants.ts:203` (`resolveOrganicSubsection`, uses `channels`) | none: neither reads the new key. No writer of the column exists in code (rows are written in Neon) |
| Portal and dashboard SPA routes | Organic Social branch only | the section switch, the header picker, the Suspense key | Non-opted clients: no new call, no redirect, same props, same picker element. Other sections: untouched lines |
| Portal and dashboard deep-link pages | picker line only | the header picker | Non-opted clients and every other report slug: `fallback` is the existing element, unchanged |
| `organic-social/index.tsx` | `OrganicSocialBody` ctx | every part: headlines, followers, trends, top content (v1 and v2), commentary header | Non-opted: `rctx` untouched. Opted in: parts receive a normal `custom:` range and a `custom:` comparison, which every getter already handles (`lib/organic-social/base.ts:35-53`, `headlines.ts:20-39`, `followers.ts:25`, `trends.ts:24`, `top-content.ts:142`, `frozen.ts:53`) |

Unchanged by construction, and why:

- **Dash requests** for non-opted clients: the section inputs are pinned (section 8), and the
  getters are not edited.
- **Top Content freezing**: `isPeriodOpen` and the snapshot key are not edited; a finished month
  closes and freezes from the 2nd (UTC), as today.
- **Tab links**: both sidebars already carry `dateRange` into the Organic Social tab links
  (`components/layout/portal-sidebar.tsx:272-295`, `components/layout/sidebar.tsx:616-648`), so a
  canonical month survives a tab switch. The dashboard sidebar also carries `compareRange`, which
  an opted-in client ignores (3.6). Neither sidebar is edited (PR 250 edits the portal one).
- **Cache warmer** (`app/api/cache-warm/route.ts:116-124`, `redirect: 'manual'`, a 3xx counts as
  ok): for the three opted-in clients, the portal deep-link URL renders and warms the default
  month; the dashboard SPA URLs return a redirect and warm nothing. Before this change they warmed
  `last_30_days`, a range these clients can no longer see, so nothing useful is lost. Every other
  client is unchanged.
- **Health sweep** (`app/api/health/sweep/route.ts:63-69`, portal deep link with `health=1`, as
  the internal service principal): renders the default month in place for the three clients;
  unchanged for everyone else.
- **Commentary** has its own period (`report_commentary.period_*`), independent of the picker.
- **PDF export** prints the page as rendered.
- **Client config cache**: `getClientBySlug` is cached for 5 minutes (`lib/db/queries.ts:32-43`),
  so a staging config write takes effect within 5 minutes. The cache version does not need a bump:
  the jsonb is read whole and an old entry without the key simply means "not opted in yet".
- **Other data paths**: no API route or server action fetches Organic Social data by date. The
  only Organic Social action (`app/actions/organic-social.ts`, the designation toggle) takes no
  date.

## 7. Zero conflicts with the open PRs

Every PR in the October set must merge with every other, in any order, with no conflicts.

| Open PR | Shared file | Its lines | Mine |
|---|---|---|---|
| 247 | `lib/db/schema.ts` | the `channels` doc comment (135-136) | a new field after `channels?: string[]` (139), three unchanged lines between |
| 255 | both deep-link pages | imports, `getReportSection` signature and organic case, the `reportName` block | the picker line only (portal ~151, dashboard ~109) |
| 250 | `portal-sidebar.tsx`, portal layout | | not touched |
| 252, 254 | organic-social parts, followers, trends | | not touched |

Proof, as for every PR in the set: `git merge-tree --write-tree` on every pair, then all PRs
merged together in two opposite orders with tests, tsc and `check:rsc`.

## 8. Proving nothing else changed

**Pre-change characterisation tests, written first and green against today's code**, then kept
green through the build (`lib/organic-social/locked-months-parity.test.tsx`):

For a client WITHOUT `reportingMonths` (a Renaissance-shaped fixture and one of the new clients'
shapes without the key), across URL inputs {none, `last_30_days`, `last_month`, a calendar-month
`custom:`, a partial `custom:`, junk, each with and without `compareRange=previous_year`}, on all
four routes, running the real route modules with the section stubbed (the pattern PR 255's
parity test uses):

- the `dateRange` and `compareRange` the route hands `OrganicSocialReport`;
- the picker element and its exact props;
- that no redirect happens beyond the existing missing-`section` one;
- that `auth()` is called no more times than today.

And for `OrganicSocialBody`: a no-config client's parts receive the identical ctx.

**Renaissance drift check** (`~/.claude/renaissance-baseline/check-drift.sh`) before the first
change and after the last, on prod, staging and dev.

**Staging database**: a pre-change snapshot before adding `reportingMonths` to the three clients,
diffed after (only those three rows' `dash_social_config` may change).

## 9. Edge cases

Subject: the date-range string from the URL (untrusted), the client config jsonb, the session
role, the server clock; down through the routes and the section to the Dash getters.

| # | Category | What could break | Where | Disposition |
|---|---|---|---|---|
| 1 | external failure | `auth()` throws in the range control | 4.4 | fix: treat as client (fail closed); test `range control: auth failure means client rules` |
| 2 | external failure | client lookup fails in the section | 4.6 | decline: existing degrade and log; the route already enforced with the same deduped lookup |
| 3 | operator visibility | a client hitting a hidden month leaves no trace | 4.2 | fix: one log line per client override; test `logs a client override with slug and served range` |
| 4 | operator visibility | malformed config blanks the section silently | 3.1 | fix: error log naming the slug; test `malformed config logs and fails closed` |
| 5 | bounds | month list grows forever | 3.4 | decline: about 12 a year from August 2026; revisit if it passes 36 |
| 6 | bounds | redirect loop | 3.7 | fix: canonical is a fixed point; test sweeps every day from 2026-08-01 to 2027-12-31, team and client |
| 7 | input boundary | junk, partial, reversed, cross-month or impossible `custom:` dates | 3.7 | fix: resolve to default; tests per shape |
| 8 | input boundary | `compareRange` tampering exposes current-month totals | 3.6 | fix: always derived, URL ignored; test |
| 9 | input boundary | config `firstMonth` malformed or future | 3.1, 3.4 | fix: fail closed, and no months until it arrives; tests |
| 10 | input boundary | existing: `resolveDateRange` accepts junk `custom:` and yields invalid dates (`lib/date-range.ts:45-48`) | shared resolver | decline for this build: opted-in clients never pass junk through (7); Renaissance keeps today's behaviour; file as a follow-up |
| 11 | state | the 12th on a weekend; the 1st and 2nd; month lengths; leap years; DST days | 3.4 to 3.6 | fix: table tests incl. 12 Sep 2026 and 12 Dec 2026 (Saturdays), 29 Feb 2028, 8 Mar and 1 Nov 2026 |
| 12 | state | server and browser clocks disagree | 3.2 | fix: months computed on the server only |
| 13 | state | ET month boundary vs `isPeriodOpen` (UTC) | 6 | decline: a finished month may show live Top Content for the first hours of the 2nd (UTC); it freezes on the next view; no client sees it before the 12th |
| 14 | state | stale client config for up to 5 minutes after a write | 6 | decline: bounded by the TTL, documented in rollout |
| 15 | security | a client role reaches the live or an unopened month by URL, via either route family | 4.5, 4.6 | fix: both layers; outer test runs the real routes as a client |
| 16 | security | a missing or unknown role gets team rules | 3.3 | fix: unknown means client; test |
| 17 | security | untrusted `dateRange` written to logs raw | 4.2 | fix: cut to 64 characters and JSON-escaped; test |
| 18 | existing | Dash windows use a fixed `T04:00:00Z` (EDT) offset all year (`lib/organic-social/base.ts:40-47`), so November to March windows start an hour late | shared with Renaissance | file: fixing it changes Renaissance's requests |

The outer acceptance test (`lib/organic-social/locked-months-routes.test.tsx`) runs the four real
route modules for an opted-in client, as a client and as the team, over the inputs in section 8
and a fixed clock of 20 Oct 2026: it asserts the redirect target (SPA), the served month handed
to the section, and the picker props. It is written first and watched fail.

## 10. Testing (test first)

- `lib/organic-social/reporting-months.test.ts`: every rule in section 3 as table tests with a
  fixed `today`; the worked calendar in 3.4; the fixed-point sweep (edge 6).
- `lib/organic-social/locked-range.test.ts`: `null` for no key; logging (edges 3, 4, 17).
- `components/report-sections/organic-social/month-picker.test.tsx`: order, labels, tags, the
  URL it pushes (keeps other params, drops `compareRange`), the disabled empty state.
- `components/report-sections/organic-social/range-control.test.tsx`: returns `fallback`
  untouched with no `auth()` call for a no-config client; edge 1.
- `components/report-sections/organic-social/index.test.tsx` (extend): opted-in ctx replacement,
  the no-months message, no-config ctx untouched.
- The two route test files in sections 8 and 9.

Every test is watched failing before its code exists. Verification quotes each test's own
result line.

## 11. Rollout

1. Code through the October branch, then dev and staging, with the rest of the set.
2. On my go, on staging only: pre-change snapshot, dry run, then add
   `reportingMonths: {"firstMonth": "2026-08"}` to the three clients' `dash_social_config`
   (host-guarded script, `jsonb_set`, those three slugs only), snapshot diff, drift check.
   Effective within 5 minutes.
3. Production later, with the rest of the October work, on my express written consent.

## 12. Out of scope

Locking followers, graphs and tiles (next build); the year to date graphs; annotations; any
change to Renaissance; the two existing shared-resolver issues (edges 10 and 18), which are filed.

## 13. Review record

Filled in after the adversarial review of this spec.
