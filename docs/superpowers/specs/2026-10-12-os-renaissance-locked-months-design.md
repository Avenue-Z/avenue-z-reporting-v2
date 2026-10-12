# Renaissance on locked months (Organic Social only): design

Status: draft for review and approval before any code. Written 2026-10-12 against `origin/dev` `e39e393b` (tree
`5dac44b3`, the tree production runs). Approved in principle on 2026-10-12: Renaissance may use locked months like the
outline clients. Scope is the **Organic Social section only**.

## 1. Why
- Renaissance is the only Organic Social client still live. Its finished months keep moving, so Insights written for a
  month go stale while the team is presenting them (10/9 call).
- Its finished-window Top Content is held in the older freeze table, which stores the finished post objects
  (`lib/organic-social/snapshot.ts:8-17`) and never re-reads them (`lib/organic-social/frozen.ts:80-83`). A window saved
  before a code change misses whatever the change reads (on 2026-10-12 September's Influencer Total Views showed "Not
  reported" for this reason and was refreshed by hand). Locked months store Dash's raw answer and normalize it on every
  read (`lib/organic-social/locking-client.ts:85-110`, `lib/organic-social/top-content.ts:173, 198`), so new fields reach
  old months with no refresh.

## 2. How locked months work today (unchanged by this design)
- A client is on locked months when `dash_social_config` has its own `reportingMonths` key
  (`lib/organic-social/reporting-months.ts:75-79`). Settings: `firstMonth` (required), `opensOnDay` (default 12),
  `weekendRule` (default `next-monday`), `comparison` (default `previous-month`), `clientMonths` (optional), `lockDay`
  (default 5) (`reporting-months.ts:104-140`; `lib/organic-social/lock-day.ts:11-18`).
- Every Dash Social read for that client goes through the locking client (`lib/organic-social/base.ts:27-40, 51`). A
  request whose period ends on or before the last locked day is answered from `dash_response_locks`, captured once from
  Dash uncached (`base.ts:35-38`; `lock-day.ts:28-41`). The lock day is the 5th (Friday before a weekend, never after the
  opening day) (`lock-day.ts:19-26`).
- The Organic Social section shows a month picker instead of the date picker, and a requested range is replaced by a
  whole month (`app/dashboard/[clientSlug]/reports/page.tsx:183`; `app/portal/[clientSlug]/reports/page.tsx:220`;
  `reporting-months.ts:196-226`). The team sees the live month and every finished month back to `firstMonth`; a client
  sees finished months that have opened, newest `clientMonths` of them (`reporting-months.ts:168-193`).
- Insights and Recommendations follow the month on screen; a client sees the approved entry of a month once it opens
  (`components/report-sections/commentary/index.tsx:21-23`; `commentary/monthly.tsx`; `lib/commentary/month.ts:10-38`).
- Chart notes: on for any locked client (`lib/organic-social/chart-notes/enabled.ts:6-9`); a note can't be added before
  `firstMonth` (YTD notes: before January of that year) (`app/actions/chart-notes.ts:57-62`).
- Top Content for a locked client skips the freeze table and reads through the lock (`frozen.ts:66-68`).
- The hourly lock sweep renders every Organic Social tab of the two most recently locked months
  (`lib/organic-social/lock-sweep.ts:12-26`; `vercel.json` `/api/lock-sweep` at :00).
- Everything above is keyed to the Organic Social section. Paid Media, AEO and Executive Overview never read
  `reportingMonths`: the `locked` flag is `activeSection === 'organic-social' && hasReportingMonths(client)` (pages cited
  above), and the locking client wraps only the Dash Social reader (`base.ts:51`).

## 3. Renaissance today (production, read only, 2026-10-12)
- `dash_social_config` keys: `brandId`, `chartNotes`, `ownHandles`, `ytdSheets`; no `reportingMonths`.
- Platform tabs: `organic-social:platform` override = YTD Review first (`ytd-review@3`), `platform-headlines@1`,
  `follower-graph@2`, `engagement-trend@2`, `top-content@2`. Overview uses the `organic-social` template row
  (`platform-headlines@1`, `engagement-trend@1`, `top-content@2`) with shared parts Insights and Recommendations.
- Organic Social Insights: Overview July and August, and each platform tab for August, all approved, all whole-month
  periods. No chart notes, no hides, one stored designation.
- 23 saved Top Content windows (months March to September plus three multi-month custom ranges).
- Users: two client users (one client admin, one viewer) and two Avenue Z admin rows.

## 4. The change
### 4.1 Settings (data, Renaissance only)
Add `dash_social_config.reportingMonths = { firstMonth, clientMonths: 1 }` with the defaults for everything else
(opening day 12, Monday after a weekend, compare to previous month, lock day 5), exactly as the outline clients use.
`firstMonth` is decision D1. Swap the YTD pin in `organic-social:platform.extraParts` from `ytd-review@3` to `ytd-review@4`
(4.2). Nothing else in Renaissance's row changes.

### 4.2 Code (1 of 2): `ytd-review@4`
Why: `ytd-review@3` (live clients) renders nothing for a client with `reportingMonths`, by design
(`parts/ytd-review-live.tsx:37-40`); `ytd-review@2` (locked clients) covers only channels with outline Data rows
(`parts/ytd-review-sheet.tsx:27`, `OUTLINE_DATA_ROWS.standard`), so Renaissance's X tab would lose its YTD Review
(it has had one since 2026-10-05).
What `@4` does: the YTD sheet first, Dash for a month the sheet leaves blank, every platform tab including X (`@3`'s
channel rule, `ytd-review-live.tsx:26-29`), months from January through the **month on screen** (`@2`'s rule,
`lib/organic-social/ytd.ts:100-109` `ytdSheetMonths`), Dash months fetched with their comparison so they lock like every
other read. **Dash floor = January of the year on screen** (`@3`'s floor, `ytd-review-live.tsx:42-43, 56`), so every blank
cell Renaissance's graphs fill from Dash today is still filled; blank cells are never turned into gap lines. Overview (no
channel) renders nothing. Requires `reportingMonths` (renders nothing and logs, like `@2`, without it). Notes as `@3`.
Unpublished, pinned per client. `@1`, `@2`, `@3` unchanged.
Missing or invalid sheet for the year: an empty sheet, so every month from January comes from Dash, X included, notes
kept (`@3`'s `NO_SHEET` path, `ytd-review-live.tsx:18, 45-46`), not `@2`'s version-1 fallback, which blanks X and starts
at `firstMonth`. A sheet read failure shows "Couldn't load this section."; a slow Dash month shows the YTD timeout card.
On the team's live month the graph includes the live month as a partial point labelled "(live)" (`ytd.ts:65, 80`): a
deliberate change from `@3` for the team only; clients never see the live month.

### 4.2b Code (2 of 2): the date range does not follow the user out of a locked Organic Social view
Today both sidebars copy the current `dateRange` onto every section link (`components/layout/portal-sidebar.tsx:75`;
`components/layout/sidebar.tsx:564`), and a locked client's Organic Social URL always carries the served month
(`app/dashboard/[clientSlug]/reports/page.tsx:213-223`; `month-picker.tsx:20-25`). No locked client has another section
today, so this never showed; Renaissance has Paid Media, AEO and Executive Overview. Change: when the client is on locked
months and the current section is Organic Social, section links to other sections omit `dateRange` and `compareRange`,
so those sections open on their own default range. Everything else in the sidebars is unchanged.

### 4.3 What Renaissance's users will see change (Organic Social only)
| Before | After |
|---|---|
| Date picker (Last 30 Days, custom ranges, compare options) | Month picker. Team: the live month and every finished month back to `firstMonth`. Clients: the newest opened month only |
| Clients see any range, live | Clients see a month from the 12th (Monday after a weekend) |
| Finished months keep changing | A month's numbers fix on the 5th |
| Insights/Recommendations: newest approved entry | The entry for the month on screen; clients see it once the month opens |
| Approved notes show to clients straight away | Approved notes show to clients in months they can see |
| Top Content of a finished range from the freeze table | Top Content from the lock; new fields (views, authors) reach every locked month |
| YTD Review: January to last finished month | January to the month on screen (team's live month: a partial "(live)" point) |
| Clients see the newest approved Insights entry (August today) | Clients see the entry for the newest opened month only (September): **no Insights box until September's are approved** (rollout step 3) |
| Team can open any range in Organic Social (in use: March, June, March to July, March to August, August to September) | Only whole months from `firstMonth` (D1, D6) |
Paid Media, AEO, Executive Overview: their own pages and numbers do not change; with 4.2b, leaving Organic Social no
longer carries its month to them.

### 4.4 Past months (the late-lock rule)
Months already finished when the settings go in lock on their first read after that (page view or sweep), with Dash's
numbers at that moment, not as of their own lock day (`lock-day.ts:89-96` `isLateLock`; logged `late lock`). September
2026, and any earlier month from `firstMonth`, will therefore show Dash as of the switch date. The sweep captures only the
two newest locked months (`lock-sweep.ts:18-19`); older ones lock when first opened, and each request locks on its own
first read, so one month's parts can be captured on different days (`locking-client.ts:78-105`). Top Content for July to
September stops reading the freeze table and is captured fresh, so post figures and order in months whose Insights are
already written can change once. YTD's Dash months from January lock the same way (late, read back by `@4`), including
months before `firstMonth`, because the locked day ignores `firstMonth` (`lock-day.ts:31-40`; CLAUDE.md follow-up).

## 5. Decisions (for approval)
- **D1 `firstMonth`.** Recommend `2026-07`: the oldest month with approved Organic Social Insights, so the team can
  still open every month that has them (clients see only the newest opened month either way, D2). Cost: July to
  September lock at the switch date's numbers (4.4), and the team loses months before July in Organic Social (saved
  windows show March and June were opened on 2026-10-01). Alternatives: `2026-09` (July and August Insights stay stored
  but can't be opened) or `2026-10` (nothing past locks; clients see "Your first report opens on Nov 12" and no Organic
  Social until then, `reporting-months.ts:225, 231`). **Needs the team's answer before production.**
- **D2 `clientMonths: 1`.** Recommend, same as the outline clients. Renaissance's client users see only the newest
  opened month.
- **D3 Defaults** for opening day, weekend rule, comparison, lock day. Recommend, same as the outline clients.
- **D4 `ytd-review@4`** as in 4.2. Recommend over changing `@3` (keeps live-client behaviour untouched for any future
  live client) or using `@2` (loses X).
- **D5 The freeze table rows** stay in place unused (`frozen.ts:68` skips them). No cleanup in this change.
- **D6 Rolling and multi-month ranges** go away in Renaissance's Organic Social. Saved windows show the team used them
  this month (March to July, March to August on 2026-10-01; LinkedIn August to September on 2026-10-09; Instagram August
  to September on 2026-10-12). **Needs the team's answer before production.**
- **D7 4.2b** (the date range stops at the Organic Social door). Recommend, in the same code PR.

## 6. Edge cases
| Case | Behaviour |
|---|---|
| Old bookmarked Organic Social link with a custom range | Replaced by the right month; a client's request for an unopened month is logged (`reporting-months.ts:220-221`) |
| Lock day on a weekend | Friday before (`lock-day.ts:22-23`) |
| A month's answer missing an account number (followers, net new followers, profile or page views) | Not stored; every view and every hourly sweep re-captures from Dash uncached, so that month never fixes (`locking-client.ts:27, 50-52, 93-103`). The rule was probed only on the outline clients' channels; **unverified for Renaissance's** (rollout step 2a) |
| A month locked with a wrong answer (for example an empty Top Content list) | Stays wrong: an empty list locks (`locking-client.ts:54-56`). The only fix is deleting that client's rows for that period from `dash_response_locks`, **never tried end to end** (CLAUDE.md, locked-months follow-up); proven on staging in step 2c |
| Dash or lock store down | Platform tabs show their error card; Overview drops a channel silently (existing follow-up in CLAUDE.md) |
| Sheet read fails on `@4` | "Couldn't load this section." (4.2) |
| Team edits an approved Insights entry for a past month | New draft; clients keep the approved one (existing) |
| Renaissance's client admin invites a viewer | Unchanged (Team page) |
| The PDF export | Prints the month on screen as a client sees it (existing locked-month rule) |
| Notes before `firstMonth` | Refused with the existing message (`chart-notes.ts:59-61`) |

## 7. Tests (written first, in the plan)
- `ytd-review@4`: months January through the month on screen; X included; sheet value wins; a blank month asks Dash
  with its comparison; renders nothing and logs without `reportingMonths`; failure cards as 4.2; registry exposes 1 to 4
  and `@4` is unpublished.
- Settings proof (a fixture with Renaissance's shape plus `reportingMonths`): the month picker resolves to the expected
  months for team and client; the platform override resolves to `ytd-review@4, platform-headlines@1, follower-graph@2,
  engagement-trend@2, top-content@2` and passes `validateSectionOverride`.
- `ytd-review@4` failure and edge tests: a missing sheet, an invalid sheet entry and a year with no entry, each on X
  (Dash for every month from January, notes kept); a blank cell before `firstMonth` is filled from Dash, never a gap
  line; Overview renders nothing.
- Lock requests: with the floor at January, the expected month requests (and only those) go through the locking client.
- 4.2b: from a locked client's Organic Social, links to other sections carry no `dateRange`/`compareRange`; for a client
  without `reportingMonths`, and from any other section, links are unchanged (both sidebars).
- Existing suites unchanged, including the lock-key pin test and every outline-client test.

## 8. Rollout
1. Code PR (`ytd-review@4`, 4.2b, tests) off `dev`, code review, `dev` -> staging.
2. Staging:
   a. Read-only probe, one request per Renaissance channel and key (Overview and platform), July to September, printing
      only whether each account metric is null. A null one means that month never locks: stop and decide.
   b. Guarded settings write (host guard, dry run, written go). Before and after snapshots of every Organic Social tab
      (tiles, graphs, Top Content, YTD) for July to September, and of Paid Media, AEO and Executive Overview, including
      navigating to them from Organic Social. Lock rows appear for Renaissance after a sweep; no other client's rows change.
   c. Prove the bad-lock way out: delete one month's Renaissance lock rows on staging (dry run, written go) and confirm
      the next render re-captures it.
3. Before production: the team writes and approves September's Organic Social Insights (Overview and every platform
   tab), or explicitly accepts clients seeing no Insights box until they do. The team answers D1 and D6.
4. Production: the same write with written consent, after `main` carries the code. Pre-image saved. Verify as staging.
5. Rollback: remove `reportingMonths` and swap the pin back to `@3`. Lock rows left behind are inert while the setting is
   off (`base.ts:51`); **delete them before ever re-enabling**, or they come back with their old capture date.

## 9. Out of scope
Any change to how locking works (including the empty-answer rule and settledThrough ignoring firstMonth, both existing
follow-ups); other clients; other sections' own behaviour; the freeze table itself; the Overview's v1 parts.
