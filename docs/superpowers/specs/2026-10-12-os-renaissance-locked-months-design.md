# Renaissance on locked months (Organic Social only): design

Status: for Paul's review and approval before any code. Two review rounds done; the one round-2 major (how the sidebars
know a client is locked) was decided 2026-10-12 (4.2b). Revised the same day for Paul's review. Written against
`origin/dev` `e39e393b` (tree `5dac44b3`, the tree production runs); every citation re-checked against `origin/dev`
`fd1da06b`, where the two report pages moved (2 lines) and the export route was renamed from `organic-social` to
`[section]` (the citations use the new path). Approved in principle on 2026-10-12: Renaissance may use
locked months like the outline clients. Scope is the **Organic Social section only**.

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
  whole month (`app/dashboard/[clientSlug]/reports/page.tsx:185`; `app/portal/[clientSlug]/reports/page.tsx:222`;
  `reporting-months.ts:196-226`). The team sees the live month and every finished month back to `firstMonth`; a client
  sees finished months that have opened, newest `clientMonths` of them (`reporting-months.ts:168-193`).
- Insights and Recommendations follow the month on screen; a client sees the approved entry of a month once it opens
  (`components/report-sections/commentary/index.tsx:21-23`; `commentary/monthly.tsx`; `lib/commentary/month.ts:10-38`).
  The rule covers every Organic Social box: any key that is `organic-social` or starts `organic-social:`
  (`lib/commentary/month.ts:6`), so Recommendations (`lib/commentary/views.ts:9-11`) and the Influencer tab's one box,
  Insights (`views.ts:26, 111-113`), follow the month too.
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
  periods. No Recommendations entries and no Influencer entries. No chart notes, no hides, one stored designation.
- Six Organic Social tabs: Overview, Instagram, Facebook, X, LinkedIn (no channel allowlist, so the default four,
  `lib/organic-social/metrics.ts:37, 46`) and Influencer (`lib/organic-social/influencer-tab.ts:21-28`).
- 23 saved Top Content windows (months March to September plus three multi-month custom ranges).
- Users: two client users (one client admin, one viewer) and two Avenue Z admin rows.

## 4. The change
### 4.1 Settings (data, Renaissance only)
Add `dash_social_config.reportingMonths = { firstMonth, clientMonths: 1 }` with the defaults for everything else
(opening day 12, Monday after a weekend, compare to previous month, lock day 5), exactly as the outline clients use.
`firstMonth` is decision D1. Swap the YTD pin in `organic-social:platform.extraParts` from `ytd-review@3` to `ytd-review@4`
(4.2). Nothing else in Renaissance's row changes.

### 4.2 Code (1 of 3): `ytd-review@4`
Why: `ytd-review@3` (live clients) renders nothing for a client with `reportingMonths`, by design
(`parts/ytd-review-live.tsx:37-40`); `ytd-review@2` (locked clients) covers only channels with outline Data rows
(`parts/ytd-review-sheet.tsx:27`, `OUTLINE_DATA_ROWS.standard`), so Renaissance's X tab would lose its YTD Review
(it has had one since 2026-10-05).
What `@4` does: the YTD sheet first, Dash for a month the sheet leaves blank, every platform tab including X (`@3`'s
channel rule, `ytd-review-live.tsx:26-29`), months from January through the **month on screen** (`@2`'s rule,
`lib/organic-social/ytd.ts:100-109` `ytdSheetMonths`), never a partial month (below). Every Dash month is a whole month
with no comparison, as `@3` does (`ytd.ts:123`): locking keys on the period end alone (`locking-client.ts:76-77`), and no
comparison saves a prior-lock read per month (`:107-111`). **Dash floor = January of the year on screen** (`@3`'s floor, `ytd-review-live.tsx:42-43, 56`), so every blank
cell Renaissance's graphs fill from Dash today is still filled; blank cells are never turned into gap lines. Overview (no
channel) renders nothing. Requires `reportingMonths` (renders nothing and logs, like `@2`, without it). Notes as `@3`.
Unpublished, pinned per client. Registered in `EXPORT_LAYOUT` as `'ytd-review@4': 'own'`, like `@3`
(`parts/export-layout.ts:18`; `export-layout.test.ts:10-11` requires every registered part). `@1`, `@2`, `@3` unchanged.
Missing or invalid sheet for the year: an empty sheet, so every month from January comes from Dash, X included, notes
kept (`@3`'s `NO_SHEET` path, `ytd-review-live.tsx:18, 45-46`), not `@2`'s version-1 fallback, which blanks X and starts
at `firstMonth`. A sheet read failure shows "Couldn't load this section."; a slow Dash month shows the YTD timeout card.
No partial month, ever: on the team's live month the graph ends at the newest finished month, as `@3` does today. This
keeps the 10/5 stakeholder decision that a partial month made Renaissance's trend look like a drop (`ytd.ts:111-117`;
`docs/superpowers/specs/2026-10-06-os-ren-ytd-finished-months-design.md` section 1). `ytdSheetMonths` marks the live month
`partial` (`ytd.ts:65`); `@4` leaves it off.

### 4.2b Code (2 of 3): the date range does not follow the user out of a locked Organic Social view
Today section links copy the current `dateRange` in 17 places. Portal sidebar, 11 (it never carries `compareRange`,
`components/layout/portal-sidebar.tsx:31`): the generic section link (`:75`), Inbound Funnel and its tabs (`:114, 134`),
AEO and its tabs (`:162, 196`), Paid Media and its tabs (`:224, 244`), Organic Social and its tabs (`:275, 296`), GA4 and
its tabs (`:324, 359`). Dashboard sidebar, 6 (each with `compareRange`): AEO (`sidebar.tsx:494-495, 531-532`), Paid
Media (`:564-565, 586-587`) and Organic Social (`:618-619, 647-648`); its generic and GA4 links carry none
(`:437-438, 675-676`). Both sidebars know the current section only from `?section` (`portal-sidebar.tsx:29`;
`sidebar.tsx:110`), so on the deep-link route `/reports/organic-social` neither knows it is in Organic Social. A locked
client's Organic Social URL carries the served month once the month picker or the redirect sets it
(`app/dashboard/[clientSlug]/reports/page.tsx:185-189, 222-231`; portal `:222-235`; `month-picker.tsx:20-25`). No locked client has another section today, so this never showed; Renaissance has
Paid Media and AEO (Executive Overview ignores `dateRange`, `[reportSlug]/page.tsx:121-122`). Change: for a client on
locked months, a section link that crosses the Organic Social boundary in either direction omits `dateRange` and
`compareRange`: links out of Organic Social, so the other section opens on its own default; and links into Organic
Social, so the section opens on its default month instead of a range that would be replaced (and, for a month-to-date
range, logged as a hidden-month attempt, `reporting-months.ts:216-221`). This applies at all 17 places, including
Inbound Funnel and GA4, which Renaissance doesn't have, so the rule holds for any locked client. Organic Social's own tab
links keep `dateRange`. In both sidebars, "current section is Organic Social" means `?section=organic-social` on the
reports page, or the path ending `/reports/organic-social` (the deep-link route: dashboard
`app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx:97, 125-126`; portal
`app/portal/[clientSlug]/reports/[reportSlug]/page.tsx:115, 169-170`; the report resolves its own month there). The
dashboard sidebar's `isOnReports` is an exact-path check (`sidebar.tsx:348`), so the deep-link check can't reuse it.
Everything else in the sidebars is unchanged.
How the sidebars know (decided 2026-10-12): the condition is `hasReportingMonths(client)` (pure, client-safe,
`lib/organic-social/reporting-months.ts:75-79`), the page's own predicate (`app/dashboard/[clientSlug]/reports/page.tsx:185`).
The portal sidebar is a client component that receives only `PortalSidebarClient` (`lib/portal/sidebar-client.ts:8-13`),
so `toPortalSidebarClient` gains one boolean, `lockedMonths`, and never the raw setting, keeping what reaches a client's
browser as small as today. The dashboard sidebar derives the same boolean from the row it already holds
(`components/layout/sidebar.tsx:346`).

### 4.2c Code (3 of 3): months before `firstMonth` are never locked
Today the locking client locks any request whose period ends on or before the last locked day
(`lib/organic-social/locking-client.ts:77`). It has no lower bound, and `settledThrough` ignores `firstMonth`
(`lock-day.ts:31-40`; CLAUDE.md locked-months follow-up). `@4` asks Dash for sheet-blank months from January, so without a
bound Renaissance's January to June would lock late, and any of them with a null account metric would be re-read from
Dash uncached (`base.ts:37`) on every view and every sweep (`locking-client.ts:95, 100-103`), where `@3` reads them through
the cached client today (`base.ts:51`). Change: a request whose period ends before the first day of `firstMonth` reads
live through the cached client and is never stored. Clamping `settledThrough` alone would not do this: Renaissance's last
locked day is later than every month from January to June. The comparison baseline of a `firstMonth` request is
unchanged (it reads the store directly, `locking-client.ts:107-111`). For the five locked clients: the parts that build
months already stop at `firstMonth` (`ytd.ts:59, 65, 97-99, 129-130`; `lock-sweep.ts:19`; `reporting-months.ts:177`), so
the only effect is to stop the stray rows the CLAUDE.md follow-up describes; the lock-key pin is unchanged. The same
PR also does the entry's other ask: `settledThrough`'s final `return lastOf(key)` (`lock-day.ts:39`) becomes `null`,
with a test. It is unreachable: a lock day is day 4 to 28 of the next month, moved only earlier (`lock-day.ts:20-26`),
so the month before last has always locked within last month and the loop returns by its second pass. That CLAUDE.md
entry is then closed in the same PR.

### 4.3 What Renaissance's users will see change (Organic Social only)
| Before | After |
|---|---|
| Date picker (Last 30 Days, custom ranges, compare options) | Month picker. Team: the live month and every finished month back to `firstMonth`. Clients: the newest opened month only |
| Clients see any range, live | Clients see a month from the 12th (Monday after a weekend) |
| Finished months keep changing | A month's numbers fix on the 5th |
| Insights/Recommendations: newest approved entry | The entry for the month on screen; clients see it once the month opens |
| Approved notes show to clients straight away | Approved notes show to clients in months they can see |
| Top Content of a finished range from the freeze table | Top Content from the lock; new fields (views, authors) reach every locked month |
| YTD Review: January to last finished month | January to the month on screen; on the team's live month, January to the newest finished month (never a partial month) |
| Clients see the newest approved Insights entry (August today); no Recommendations or Influencer entries exist | Clients see the entries for the newest opened month only (September), in every box: Insights and Recommendations on Overview and each platform tab, and the Influencer tab's Insights. **No box until September's are approved** (rollout step 3) |
| Team can open any range in Organic Social (in use: March, June, March to July, March to August, August to September) | Only whole months from `firstMonth` (D1, D6) |
Paid Media, AEO, Executive Overview: their own pages and numbers do not change; with 4.2b, the Organic Social month no
longer follows the user to Paid Media or AEO (Executive Overview never read it).

### 4.4 Past months (the late-lock rule)
Months already finished when the settings go in lock on their first read after that (page view or sweep), with Dash's
numbers at that moment, not as of their own lock day (`lock-day.ts:89-96` `isLateLock`; logged `late lock`). September
2026, and any earlier month from `firstMonth`, will therefore show Dash as of the switch date. The sweep renders every tab
of the two newest locked months (`lock-sweep.ts:16-23`); other months' tiles, graphs and Top Content lock when first
opened, and each request locks on its own first read, so one month's parts can be captured on different days
(`locking-client.ts:78-105`). Top Content for July to
September stops reading the freeze table and is captured fresh, so post figures and order in months whose Insights are
already written can change once. YTD's Dash months are different: the first sweep after the switch renders the two newest
locked months' platform tabs (August and September for a switch before November 5), and `@4` there asks Dash for every sheet-blank month from January (`ytd.ts:100-109,
129-130`), so every such month from `firstMonth` on late-locks in that first sweep, not when it is first opened. Months
before `firstMonth` read live and are never stored (4.2c).

## 5. Decisions (for approval)
- **D1 `firstMonth`.** Recommend `2026-07`: the oldest month with approved Organic Social Insights, so the team can
  still open every month that has them (clients see only the newest opened month either way, D2). Cost: July to
  September lock at the switch date's numbers (4.4), and the team loses months before July in Organic Social (saved
  windows show March and June were opened on 2026-10-01). Alternatives: `2026-09` (July and August Insights stay stored
  but can't be opened) or `2026-10` (nothing past locks; clients see "Your first report opens on Nov 12" and no Organic
  Social until then, `reporting-months.ts:225, 231`). Paul agreed `2026-07` (review, 2026-10-12).
- **D2 `clientMonths: 1`.** Recommend, same as the outline clients. Renaissance's client users see only the newest
  opened month.
- **D3 Defaults** for opening day, weekend rule, comparison, lock day. Recommend, same as the outline clients.
- **D4 `ytd-review@4`** as in 4.2. Recommend over changing `@3` (keeps live-client behaviour untouched for any future
  live client) or using `@2` (loses X).
- **D5 The freeze table rows** stay in place unused (`frozen.ts:68` skips them). No cleanup in this change.
- **D6 Rolling and multi-month ranges** go away in Renaissance's Organic Social. Saved windows show the team used them
  this month (March to July, March to August on 2026-10-01; LinkedIn August to September on 2026-10-09; Instagram August
  to September on 2026-10-12). This follows from the 2026-10-12 approval to lock Renaissance like the outline clients,
  which only serve whole months.
- **D7 4.2b** (the date range stops at the Organic Social door). Recommend, in the same code PR.

## 6. Edge cases
| Case | Behaviour |
|---|---|
| Old bookmarked Organic Social link with a custom range | Replaced by the right month; a client's request for an unopened month is logged (`reporting-months.ts:220-221`) |
| Lock day on a weekend | Friday before (`lock-day.ts:22-23`) |
| A month's answer missing an account number (followers, net new followers, profile or page views) | Not stored; every view and every hourly sweep re-captures from Dash uncached, so that month never locks; its numbers stay live (`locking-client.ts:27, 50-52, 93-103`). The rule was probed only on the outline clients' channels; **unverified for Renaissance's** (rollout step 2a). Months before `firstMonth` never reach this rule (4.2c). From `firstMonth` on it is the five locked clients' existing behaviour, kept as is: step 2a records which channel and month, and it is reported before production |
| A month locked with a wrong answer (for example an empty Top Content list) | Stays wrong: an empty list locks (`locking-client.ts:54-56`). The only fix is deleting that client's rows for that period from `dash_response_locks`, **never tried end to end** (CLAUDE.md, locked-months follow-up); proven on staging in step 2c |
| Dash or lock store down | Platform tabs show their error card; Overview drops a channel silently (existing follow-up in CLAUDE.md) |
| Sheet read fails on `@4` | "Couldn't load this section." (4.2) |
| Team edits an approved Insights entry for a past month | New draft; clients keep the approved one (existing) |
| Renaissance's client admin invites a viewer | Unchanged (Team page) |
| The PDF export | Resolves the month with the exporter's own role (`app/export/[clientSlug]/[section]/page.tsx:52`), so a team export of the live month prints live numbers; Insights and Recommendations print the client's entry (`commentary/monthly.tsx:41-44`); the YTD block never has a partial month (4.2) |
| Settings just switched (or rolled back) | The client row is cached for 300 seconds in two separate entries, `getClientBySlug` (the page) and `getAllClients` (the dashboard sidebar and both sweeps) (`lib/db/queries.ts:32-35, 97-98, 127-129`); a raw SQL UPDATE does not expire their `db` tag, which only the app's own saves do (`updateTag('db')`, e.g. `app/actions/commentary.ts:111`). Each entry is served from cache until it has been read once after its 300 seconds: `unstable_cache` serves the expired entry and refreshes it in the background (`lib/cache.ts:127-131`; the same behaviour `locking-client.ts:13-16` describes for Dash). Until then the page and the sidebar or sweep can disagree. Rollout steps 2b, 4 and 5 reload until both show the new state |
| The fixed 04:00 UTC window offset is fixed later (CLAUDE.md follow-up) | Not built. Any request-shape change already fails `lock-key-pin.test.ts`, and CLAUDE.md says to map old keys forward first. This change lands first; when the offset fix is built, it maps keys for every locked client, Renaissance included |
| Notes before `firstMonth` | Refused with the existing message (`chart-notes.ts:59-61`) |

## 7. Tests (written first, in the plan)
- `ytd-review@4`: months January through the month on screen; X included; sheet value wins; a blank month asks Dash
  as a whole month with no comparison; renders nothing and logs without `reportingMonths`; failure cards as 4.2;
  registry exposes 1 to 4 and `@4` is unpublished; `EXPORT_LAYOUT` has `'ytd-review@4': 'own'`.
- Settings proof, built from the verbatim production pre-image of Renaissance's `organic-social:platform` override (it
  holds no secrets) plus `reportingMonths`, with the brand id and sheet ids in `dash_social_config` replaced by
  placeholders: the month picker resolves to the expected months for team and client; the platform override resolves to
  `ytd-review@4, platform-headlines@1, follower-graph@2, engagement-trend@2, top-content@2` and passes
  `validateSectionOverride`. It fails if the override's `versions` pins `ytd-review` (`resolve.ts:43-45`).
- `ytd-review@4` failure and edge tests: a missing sheet, an invalid sheet entry and a year with no entry, each on X
  (Dash for every month from January, notes kept); a blank cell before `firstMonth` is filled from Dash, never a gap
  line; Overview renders nothing.
- `ytd-review@4` on the team's live month: the last point is the newest finished month; no "(live)" label and no
  request for the live month.
- Lock requests: with the floor at January and `firstMonth` `2026-07`, January to June requests read live and write
  nothing; requests from July lock.
- 4.2c, locking client: a request ending the day before `firstMonth` reads live and writes nothing; one ending in
  `firstMonth` locks as today, and its comparison baseline is read as today; `lock-key-pin.test.ts` unchanged.
- `settledThrough`: for every `lockDay` 4 to 28, both weekend rules and every day of a year, it returns last month's or
  the month before last's final day, never anything older; the final `return` is `null`; existing cases unchanged.
- 4.2b, both sidebars: for a locked client, links out of and into Organic Social carry no `dateRange`/`compareRange`, at
  every one of the 17 places (each portal branch: generic, Inbound Funnel and its tabs, AEO and its tabs, Paid Media and
  its tabs, Organic Social and its tabs, GA4 and its tabs; the dashboard's AEO, Paid Media and Organic Social links and
  tabs); Organic Social's own tab links keep it; the deep-link route counts as Organic Social in both sidebars; for a
  client without `reportingMonths` every link is unchanged (the portal golden snapshot is unchanged for those clients).
- The portal sidebar mapper exposes exactly one new field, `lockedMonths: boolean` (true only when
  `hasReportingMonths(client)`), and never the `reportingMonths` setting (`lib/portal/sidebar-client.test.ts` pins the
  new shape).
- Existing suites unchanged, including the lock-key pin test and every outline-client test.

## 8. Rollout
1. Code PR (`ytd-review@4`, 4.2b, 4.2c, tests) branched from current `dev`, code review, `dev` -> staging.
2. Staging (`firstMonth` `2026-07`):
   a. Read-only probe of every request shape locking will hold, per channel, July to September: Overview headlines,
      `platform-headlines@1`, the outline-KPI shape `@4` uses (no comparison), Overview's graph shapes
      (`engagement-trend@1`; an `ALL_CHANNELS` that is `{}` counts as complete, `locking-client.ts:38-41`), and Overview's
      and the Influencer tab's `getContent` (an empty list counts as complete, `:54-56`). Renaissance is the first locked
      client that renders Overview's v1 parts. Print only whether each account metric is null, whether a graph's
      `ALL_CHANNELS` is empty, and whether a content list is empty. A null account metric is kept as the existing
      behaviour (section 6) and recorded; an empty graph or content answer would lock: stop and report before b.
   b. Guarded settings write (host guard, dry run, written go), one UPDATE setting `reportingMonths` and the YTD pin
      together (two writes would blank the YTD block in between: `@3` renders nothing with `reportingMonths`, `@4`
      nothing without). After the UPDATE, wait 300 seconds, then reload until both the page (month picker) and the
      dashboard sidebar (link shape) show the new state (section 6: one load after the wait usually still shows the old
      one); only then take any after snapshot. Before
      and after snapshots of every Organic Social tab
      (tiles, graphs, Top Content, YTD) for July to September, and of Paid Media, AEO and Executive Overview, including
      navigating to them from Organic Social. Lock rows appear for Renaissance after the sweep, triggered on staging by a bounded GET of `/api/lock-sweep` with
      the cron bearer (staging may have no cron), or by page renders; no other client's rows change; no Renaissance
      lock row ends before July. Record the sweep's URL count, duration and failures for the first run after the switch
      and for a warm run: Renaissance adds 6 tabs x 2 months = 12 renders, at concurrency 8 (`lib/cache-warm/run.ts:28`)
      within `maxDuration` 300 (`app/api/lock-sweep/route.ts:26`), and `warmOne` has no per-URL timeout (`run.ts:30-41`).
   c. Prove the bad-lock way out: delete one month's Renaissance lock rows on staging (host guard, dry run, written go) and confirm
      the next render re-captures it.
3. Before production: September's entries are written and approved by the team (already on the go-live checklist):
   Insights on Overview, each platform tab and the Influencer tab, and Recommendations on Overview and each platform tab.
   Production waits until a read-only probe shows them approved. Give the Organic Social team a heads-up that
   Renaissance's Organic Social becomes whole months from `firstMonth` on, with no custom or multi-month ranges (they
   used an August to September range on 2026-10-12).
4. Production: the same single-UPDATE write with written consent, after `main` carries the code. Pre-image saved. The
   same cache wait as 2b (wait, then reload until the page and the dashboard sidebar both show it), then verify as
   staging.
5. Rollback: one UPDATE removing `reportingMonths` and swapping the pin back to `@3`, then the same cache wait. Lock rows
   left behind are inert while the setting is off (`base.ts:51`); **delete them before ever re-enabling**, or they come
   back with their old capture date. Delete them only after a lock sweep has run on the rolled-back row: until each cache
   entry refreshes, a sweep can still read the old row (`app/api/lock-sweep/route.ts:32`, `lock-sweep.ts:13`) and a
   render can still lock (`base.ts:51`). With 4.2c there are none before July to clean up.

## 9. Out of scope
Any change to how locking works other than 4.2c (including the empty-answer rule, an existing follow-up); other clients;
other sections' own behaviour; the freeze table itself; the Overview's v1 parts; the 04:00 UTC offset fix (section 6).
