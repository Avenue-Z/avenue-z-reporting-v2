# Organic Social: Jasmine's 2026-10-02 walkthrough changes, and Renaissance annotations and YTD: design

Status: REVIEWED (round 1: 7 MAJOR fixed; round 2: 0 MAJOR; round 3, against the call sources at my request: 6 MAJOR, 5 fixed, 1 rebutted with a staging read, plus one open decision in section 8). Minors for the plan are in the review log beside this file. Next: the plan.
Code is cited at `origin/dev` 7243ec7f (the same files as `origin/staging` f495f9a4). Public repo: no brand ids, sheet
ids, client figures or login details here.

## 1. Sources and scorecard
Sources, in order of authority: the 2026-10-02 call with Jasmine, Savannah, Paul and me (timestamps below); Jasmine's Slack
after the call; Paul's Slack after the call; my decisions after the call. Nothing else.

| # | What (source) | Section | Status |
|---|---|---|---|
| S1 | Remove the Facebook footnote "Includes engagement on posts marked Influencer (Dash reports Facebook totals inclusive)." for the outline clients (call 12:24 to 13:46; again for Joy of Life 18:07) | 3 | change |
| S2 | Piper Aircraft: remove the Influencer Posts section on Instagram (call 19:17, said of Piper and PIMCO before either was shown: "If it has influencer posts, I might just have you remove that"; 20:13 "For the Instagram. Yes, the influencer section. That's it.", 20:34) | 4 | change |
| S3 | Akara Living, Kenect Nashville: rename "Influencer Posts" to "Partnership Posts" on Instagram (call 23:13 to 24:23). Akara's only channel is Instagram (staging read 2026-10-02), so this is every tab it has | 4 | change |
| S4 | Default to Jasmine's YTD sheet whenever it differs from Dash (my question at 08:57; Jasmine 09:22: "whatever is on the actual Excel sheet should be what the clients have historically"; 09:50): the Total Followers and Views tiles show the sheet's number for a month the sheet has filled | 5 | change |
| S5 | The dashboard follows Jasmine's later edits to the sheet (my decision) | 5, 6 | change (S4), already true (YTD) |
| S6 | YTD: a month she has not filled yet shows the dashboard's locked number. She fills each month after the 5th from the locked dashboard (Slack: "that was on purpose, I was going to add after the 5th once the data has locked on the dahsboard") | 6 | no change: already the behaviour |
| S7 | YTD: months before an account had data are not listed as gaps (call 10:32; my decision) | 6 | change |
| S8 | Renaissance: annotations exactly like the new organic social clients, automatic callouts and written notes (call 21:31 to 22:08; Paul's Slack: "yes that sounds fine") | 7 | change |
| S9 | Renaissance: YTD Review January through now, sheet first, current month live from Dash (call 21:31; Paul's Slack: "yes that sounds good to me as well") | 8 | change |
| S10 | Renaissance stays live: rolling date picker, never locked; its tiles and footnote are unchanged (my decision; Paul approved only S8 and S9) | 7, 8, 9 | no change |
| S11 | Locked months: once a month locks, Dash's stored answer never changes (call 16:20 to 17:19). The Total Followers and Views tiles and YTD follow the sheet instead whenever it has the month (S4, S5) | 2, 5 | no change to locking: confirmed in code |
| S12 | Release: tell Jasmine (call 25:11) and Maddie (Paul's Slack) before Renaissance reaches production; no demo logins in production (call 08:37); Jasmine copies September from production once it is live | 10 | release step |
| S13 | Already done or no change: PIMCO and Piper use the default (A Place For Mom) outline (19:09); PIMCO needs no change (19:54; its influencer status is in section 4); the sort shows Engagements and Views only (11:56); the follower graph format is accepted (13:55 to 15:21) | n/a | no change |
| S14 | Out of scope: Nick's email request (01:39), RPass setup (05:10), LastPass (05:54) | n/a | none |
| S15 | Facebook Views basis (my question, call 12:36; 10:06): no change. The Views tile reads Dash's paid plus organic views (`lib/organic-social/metrics.ts:123`), and Jasmine's sheet holds the same number (exact matches across several clients and months, private probe 2026-10-01). So a sheet copied from the dashboard keeps one basis | n/a | no change: settled from evidence |

## 2. What happens today (cited)
- **Locked months.** For a client with `reportingMonths`, the Dash client is the locking client (`lib/organic-social/base.ts:51`). From the lock day (New York date; the 5th by default, the Friday before when it is a weekend, `lib/organic-social/lock-day.ts:11-40`) a request whose dates are all settled is answered from `dash_response_locks`. The first such read asks Dash once through an uncached client (`base.ts:34-37`) and stores the answer (`lib/organic-social/locking-client.ts:85-106`); every later read is the stored answer. Reports and content calls are locked (`locking-client.ts:115-121`); `getMedia` is not (`:122-124`) and has no caller. An incomplete answer is not stored (`:100-102`).
- **Renaissance** has no `reportingMonths`, so `lockedRangeFor` returns null (`lib/organic-social/locked-range.ts:10-11`), its date picker is rolling (default `last_30_days`, `app/dashboard/[clientSlug]/reports/page.tsx:171`), and its Dash reads are never locked (`base.ts:51`). Staging read 2026-10-02: Renaissance has no per-client Organic Social part pins; it uses the shared `section_templates` rows (`organic-social:platform` = platform-headlines@1, follower-graph@1, engagement-trend@1, top-content@2).
- **Outline clients** pin their parts per client (staging read 2026-10-02, e.g. A Place For Mom: `versions` top-content 3, follower-graph 2, engagement-trend 2, platform-headlines 2; `extraParts` engagement-breakdown@1, ytd-review@2; `order` starts with ytd-review). Per-client overrides support `versions`, `order`, `hidden`, `extraParts`, `labels`, `thresholds` (`lib/report-sections/types.ts:18-27`).
- **Facebook footnote.** Defined once (`lib/organic-social/metrics.ts:124-125`). Outline tiles copy it (`lib/organic-social/outline-headlines.ts:42`, rendered at `components/report-sections/organic-social/outline-tiles.tsx:30`); Renaissance's tiles copy it on platform tabs only (`lib/organic-social/headline-build.ts:73`, rendered at `platform-headlines.tsx:52`).
- **Influencer section.** Posts split into owned and influencer (`lib/organic-social/outline-top-content.ts:23-33`, called at `parts/top-content-outline.tsx:39`). The section renders when any influencer post exists, with a fixed heading and `aria-label` (`components/report-sections/organic-social/sortable-top-content.tsx:154-158`). No setting hides or renames it (`lib/report-sections/resolve.ts:8-13` carries only order, labels, thresholds).
- **YTD (ytd-review@2).** Months January through the month on screen (`lib/organic-social/ytd.ts:92-101`). Per month and graph: a sheet number wins (`ytd.ts:126`); a blank cell or a missing column from `firstMonth` on uses the Data block's value (`ytd.ts:84-87, 128-132`); N/A, invalid, or a blank before `firstMonth` is a named gap (`ytd.ts:134`, shown at `parts/ytd-review-sheet.tsx:80`). Requires `reportingMonths` (`ytd-review-sheet.tsx:28-32`) and a one-month range starting on the 1st (`ytd.ts:44-49`); no valid sheet for the year draws version 1 (`ytd-review-sheet.tsx:36-40`); a sheet read failure is the block's error card (`:42-48`). The sheet is read at most once per tab an hour (`lib/organic-social/ytd-sheet.ts:122-125`).
- **Annotations.** Automatic callouts and Hide live on follower-graph@2 and engagement-trend@2 (`parts/follower-graph.tsx:56-94`); Hide is not gated on locked months (`parts/annotation-hides.ts`). Written notes are: the graph part skips notes without `reportingMonths` (`parts/chart-notes.ts:59-61`) and every note action refuses (`app/actions/chart-notes.ts:50, 86, 106, 131`); saving also refuses a day before `firstMonth` (`:53-55`). The Day list ends at yesterday in the live month (`parts/chart-notes.ts:92, 101`).

## 3. S1: the Facebook footnote
- `buildOutlineKpis` stops copying the footnote (`outline-headlines.ts:42`): outline tiles show no footnote.
- Renaissance unchanged: `headline-build.ts:73` and `metrics.ts:124-125` stay as they are.
- Edge: Piper's X tab uses the v1 tiles (`parts/outline-data.tsx:43-44`); X has no footnote, so nothing changes there.

## 4. S2 and S3: the Influencer section, per client and per platform
New optional key `dash_social_config.influencerSection`, validated at runtime:
`{ "<CHANNEL>": { "hidden": true } | { "label": "<text>" } }`, keys from the Dash channels (`INSTAGRAM`, `FACEBOOK`, ...).
- Read by `top-content@3` only (`parts/top-content-outline.tsx`, which already reads the client row at `:23`) and passed to
  `SortableTopContent` as two optional props. Renaissance uses top-content@2, so it cannot change.
- `hidden: true`: that platform's influencer row is not rendered, for staff and clients; when no influencer row is left, the
  section and its heading are not rendered. The posts are not moved into the owned top 5 (the split is unchanged).
- `label`: replaces the heading text and the `aria-label` for that platform's row only. The staff-only card toggle
  ("Influencer · change", `designation-toggle.tsx:33`) is unchanged.
- Absent or invalid key: today's behaviour (heading "Influencer Posts"). An invalid key logs once with the slug, never the value.
- Staging data (guarded script, dry run first, my go): Piper `{ "INSTAGRAM": { "hidden": true } }`; Akara
  `{ "INSTAGRAM": { "label": "Partnership Posts" } }`. Other Piper tabs stay as they are (S2 is Instagram only).
- Edge: a staff member can no longer re-mark Piper's hidden Instagram influencer posts from that tab (accepted: Jasmine asked
  for the section to go).
- Unverified until checked with a staff session: which other Piper tabs, and whether PIMCO's only tab (LinkedIn, staging read
  2026-10-02), show an influencer section today. Jasmine's 19:17 condition covers both clients, but she reviewed PIMCO with
  "You won't have to change anything here" (19:54) and named only Instagram for Piper (20:13). If a tab shows the section, it
  comes to me as a decision; acting on it is a data write only (`influencerSection.<CHANNEL>.hidden`), no code.

## 5. S4 and S5: Total Followers and Views tiles follow the sheet
Applies to the outline Data block only (`parts/outline-data.tsx:15-31`, platform-headlines@2 and @3), for a client with a
valid `ytdSheets` entry for the year on screen (`ytdSheetFor`, `ytd-sheet.ts:28-37`). Renaissance's tiles (v1) are never read
from the sheet.
- Only for a whole finished month on screen (`custom:YYYY-MM-01,<last day>`). The live month is never replaced.
- After `getOutlineKpis` returns (the request, its cache and its lock key are unchanged), the tab's sheet is read with the
  existing cached reader and parser. For the month on screen, a sheet number replaces `followers.value` and/or
  `exposure.value` (each separately). TikTok's "Video Views" row reads `exposure` (`outline-layout.ts:65`) and follows.
- Change arrow, sheet against sheet only, never mixed sources: when a tile shows the sheet's number, its arrow is
  `outlineDelta` of that number against the sheet's number for the comparison month. The comparison month is the previous
  month, or the same month a year back for `previous-year`; a comparison month in the prior year reads that year's own entry
  (`ytdSheets["<year-1>"]`). If the comparison month has no sheet number (no entry for that year, a blank, N/A or invalid
  cell, or a read failure), the tile shows no arrow, as it does today when there is no prior (`outline-delta.ts:13`). A tile
  that keeps the dashboard's value keeps today's arrow.
- No data: when Dash's answer for the month is all null (`noData`, `outline-headlines.ts:31`), the Data block stays No data
  (`outline-tiles.tsx:45`) even if the sheet has the month, because the other tiles would read 0.
- Unchanged: Net New Followers, Total Engagements, Engagement Rate, Profile Views, Profile Clicks, Video Views (except TikTok's,
  above) and the engagement breakdown stay Dash. So a tile pair need not reconcile (for example Instagram Engagement Rate is
  Dash's views-based rate, `outline-layout.ts:47`). Accepted.
- A blank, N/A or invalid cell, a missing column, a missing sheet entry for the year, or a sheet read failure: the tile keeps
  the dashboard's value. A read failure logs `ytd sheet read failed (tiles) slug=… status=…` and never blanks the Data block.
- S5: the sheet is re-read at most hourly, so an edit shows within the hour. A month's Followers and Views therefore follow the
  sheet, not the lock, whenever the sheet has that month.

## 6. S6 and S7: YTD Review for the outline clients
- S6: no change. The existing rule (blank from `firstMonth` uses the Data block's locked value, `ytd.ts:128-132`) is exactly
  Jasmine's workflow. The 2027 behaviour stays: no sheet for the year draws version 1, all Dash (`ytd-review-sheet.tsx:36-40`;
  call 09:50).
- S7: per graph and per channel, a leading run of months whose cell is blank or N/A and that produced no point, before the
  first month with a point, is not listed under the graph. A gap after the first point is still named. An invalid (text) cell
  is always named and logged. If no month has a point, the graph shows No data as today.
- The months requested and the values plotted do not change.

## 7. S8: Renaissance annotations
- Graphs: Renaissance's own `report_section_config["organic-social:platform"]` gets `versions` follower-graph 2 and
  engagement-trend 2 (staging, then production with my written consent; guarded script, dry run first). Overview
  (`organic-social`) is not changed. top-content stays @2 and platform-headlines @1.
- Effect: automatic callouts (top 2 follower days, top 3 engagement days) and Hide on every Renaissance platform tab; the
  follower graph plots followers gained per day and is titled "<Platform> Follower Growth Graph" (`parts/follower-graph.tsx:56-81`);
  the graphs use UTC days, while Renaissance's tiles keep the Eastern window (the known 0 to 4 follower difference in
  CLAUDE.md's follow-ups; accepted as for the new clients).
- Written notes without locked months: new optional key `dash_social_config.chartNotes: true`. Notes are on when the client
  has `reportingMonths` (today) OR `chartNotes === true`. Applied at `parts/chart-notes.ts:61` and the four action gates
  (`app/actions/chart-notes.ts:50, 86, 106, 131`). For a client without `reportingMonths`, the first-month floor
  (`:53-55`) does not apply; the future-day refusal stays (`lib/organic-social/chart-notes/validate.ts:46`).
- For Renaissance's clients an approved note shows on any range that includes its day, at once (no client day: Renaissance is
  live). Approvers, Hide, edit, revoke and delete work as for the new clients.
- Staging data: Renaissance `chartNotes: true` (guarded script, my go; production with written consent).

## 8. S9: Renaissance YTD Review (live mode)
New part version `ytd-review@3`, registered with the outline parts (`parts/registry.ts:24-29`), unpublished, pinned per client.
- For live clients only: a client with `reportingMonths` (`hasReportingMonths`, `reporting-months.ts:75-79`) that has @3
  pinned renders nothing and logs once `ytd-review@3 skipped (client has reportingMonths) slug=…`, so it can never create
  new lock rows or requests for an outline client.
- Months, whatever the date picker shows, anchored on the last complete UTC day `D` (`clockFor(...).lastCompleteUtcDay`,
  `reporting-months.ts:87`): January of `D`'s year through `D`'s month. Earlier months are whole months; `D`'s month runs
  `custom:<YYYY-MM>-01,<D>` and is labelled "(live)" unless `D` is that month's last day. So on the 1st the block shows the
  previous month whole, and on January 1 it shows the previous year January to December (its own `ytdSheets` entry).
- Per month and graph: a sheet number wins; a blank or missing column uses live Dash (`getOutlineKpis` with no comparison;
  Renaissance's reads are never locked); N/A or invalid is a gap; S7's leading-run rule applies.
- Open decision (review round 3): Paul approved "sheet first and live Dash for the current month". Below, a blank or missing
  past month also uses live Dash (the outline clients' rule, where a blank uses the dashboard), which goes past his literal
  words. Recommended: keep it, so a month Jasmine has not filled yet is not a gap. The alternative: a blank past month is a gap.
- Sheet: Renaissance's own `ytdSheets["<year>"] = { sheetId, tab }` (the existing shape, `ytd-sheet.ts:28-37`), written by the
  guarded switch-on script that prints the tab's CLIENT row. No sheet for the year: every month from live Dash.
- Channels: only tabs with outline Data rows (`ytd-review-sheet.tsx:24` uses the same check). Renaissance has no channel
  allowlist, so its tabs are the defaults Instagram, Facebook, X, LinkedIn (`lib/organic-social/metrics.ts:37, 45-46`): YTD on
  Instagram, Facebook and LinkedIn; the X tab shows no YTD block.
- Dash requests: at most one per month needing Dash, three at a time (as @2, `ytd-review-sheet.tsx:50`).
- Failure: a sheet read failure is the block's error card, as @2; a Dash failure for a needed month is the block's fallback,
  as @2.
- Placement: Renaissance's `organic-social:platform` override adds `extraParts` ytd-review@3 and an `order` with ytd-review
  first, then platform-headlines, follower-graph, engagement-trend, top-content (the outline clients' order without the parts
  Renaissance does not have). Resolved result on a platform tab: ytd-review@3, platform-headlines@1, follower-graph@2,
  engagement-trend@2, top-content@2.
- The staging write (S8 and S9 together, one guarded script): staging read 2026-10-02 shows Renaissance has an
  `organic-social` override holding only `sharedParts` (Commentary, read at `index.tsx:38`) and no `organic-social:platform`
  key. The script creates only `organic-social:platform` (platform tabs read that key, `index.tsx:61`), refuses if that key
  already exists or carries `frozen` (`resolve.ts:9-11, 44`), leaves `organic-social` and every other key byte for byte,
  validates with `validateSectionOverride` (`lib/report-sections/mutations.ts:90`), adds `chartNotes` and `ytdSheets` to `dash_social_config` without touching
  `brandId`, prints the before and after, and takes a Renaissance fingerprint before and after.

## 9. Unchanged (stated so nothing drifts)
Renaissance's tiles, Facebook footnote, date picker, Top Content (@2, heading "Influencer Posts"), Overview, Commentary and the
absence of locks. The outline clients' requests and lock keys (`lib/organic-social/lock-key-pin.test.ts` must pass unchanged).
PIMCO's setup. The sort buttons. The month rules.

## 10. Release steps (S12)
0. Dates (call 21:40, 25:17, 25:48 to 26:31): the changes are built and sent to Paul for review on 2026-10-02; staging is
   ready for the Whitney review on Tuesday 2026-10-06 (staging, the environment Jasmine approves on); production is ready
   to launch for A Place For Mom on Wednesday 2026-10-07 if Jasmine approves on Tuesday and I give my written go
   (production client rows, `ytdSheets`, no `.test` users, migrations, approvers).
1. Tell Jasmine and Maddie before the Renaissance change reaches production; tell Jasmine when it is live.
1a. Tell Jasmine and Paul (and Kylie through Jasmine) that on the call I said a locked month "will not change" (17:14): Dash's
   stored answer still never changes, but a month's Total Followers and Views tiles and YTD points now follow the sheet, so a
   sheet edit changes what that month shows.
2. No `.test` demo client users in production (the client Team page lists every user of the client).
3. Jasmine copies September from the production dashboard once it is live (production saves its own September on its first
   run after launch, after the 5th).
4. The SOP rewrite records S4 to S7 and the Renaissance behaviour.

## 11. Edge cases
| Case | Expected |
|---|---|
| Outline client, Facebook tab | No footnote |
| Renaissance Facebook tab | Footnote as today |
| Piper Instagram with influencer posts | No influencer row or heading; owned top 5 unchanged |
| Piper Facebook, LinkedIn, X | As today |
| Akara Instagram with influencer posts | Heading and aria-label "Partnership Posts" |
| `influencerSection` invalid | Today's behaviour, one warning with the slug |
| Finished month, sheet has followers and views | Both tiles show the sheet; arrows against the sheet's prior month |
| Finished month, sheet blank (e.g. before she fills it) | Tiles show the locked dashboard value |
| Live month | Tiles show live Dash |
| Sheet unreadable | Tiles show the dashboard value, logged; YTD block error card as today |
| Sheet edited for a past month | Tiles and YTD show the new number within an hour |
| Akara YTD, January to May blank | Not listed as gaps; graph starts at the first point |
| Joy of Life YTD, leading N/A | Not listed; a later N/A is named |
| Renaissance, picker on last 30 days | YTD January through current month (live) |
| Renaissance on the 1st of a month (UTC) | YTD through the previous month, whole |
| Renaissance on January 1 (UTC) | YTD January to December of the previous year |
| Outline client with ytd-review@3 pinned | Renders nothing, one log line; no new Dash requests or locks |
| Finished month from the sheet, comparison month not in the sheet | Sheet value, no arrow |
| January or `previous-year`, prior year's sheet entry present | Arrow against that year's sheet number |
| Dash all null for the month, sheet has the month | Data block shows No data |
| Renaissance X tab | No YTD block |
| Renaissance note approved | Visible to its clients at once on ranges covering the day |
| Renaissance note on a future day | Refused |
| Client without `reportingMonths` and without `chartNotes` | Notes off, as today |

## 12. Tests (written before code; made-up ids and names)
- `outline-headlines`: Facebook outline KPIs carry no footnote; `headline-build` scoped Facebook still does (Renaissance).
- `sortable-top-content`: hidden platform renders no row and no heading when it was the only row; a label replaces the
  heading and aria-label; absent props render today's markup (existing snapshots unchanged).
- `influencerSection` parser: valid, absent, invalid shapes; unknown channel ignored.
- Tiles from the sheet: replaces followers and exposure for a finished month; arrow uses the sheet's comparison month,
  including the prior year's entry for January and `previous-year`; no arrow when the comparison month is not in the sheet;
  Dash all null stays No data; live month untouched; each failure case keeps the dashboard value and logs without the sheet id; TikTok Video Views
  follows Views; the request passed to `getOutlineKpis` is unchanged.
- YTD leading run: blank and N/A leading months unlisted; later gaps named; invalid always named; all-empty is No data.
- Notes gate: on with `reportingMonths`, on with `chartNotes: true`, off otherwise; no first-month floor without
  `reportingMonths`; future day refused.
- `ytd-review@3`: months from January to `D`'s month on any picker range; the 1st shows the previous month whole; January 1
  shows the previous year; sheet wins; blank uses Dash; X renders nothing; sheet failure is the error card; concurrency 3; a
  client with `reportingMonths` renders nothing, logs once and makes no Dash call.
- Placement: `resolveSection` with Renaissance's exact new `organic-social:platform` override returns ytd-review@3,
  platform-headlines@1, follower-graph@2, engagement-trend@2, top-content@2 in that order, and passes
  `validateSectionOverride`; the `organic-social` key (Overview) still resolves as today (beside
  `parts/outline-composition.test.tsx:21-24`).
- Renaissance golden render snapshots and `lock-key-pin.test.ts` pass unchanged before the staging data writes.

## 13. Not in scope
Renaissance's tiles reading the sheet; the Overview tab; validating the YTD tab at runtime (#299, after launch); any change to
how months lock.
