# Social Listening tab: design

Date: 2026-11-19. Status: draft for review. Branch `feat/social-listening`, PR #468.

## 1. Why

The analyst (Savannah) builds A Place For Mom's monthly social listening deck by hand from Talkwalker: screenshots,
numbers typed into slides, month-over-month changes worked out by hand. The team saw a clickable mockup on 2026-11-19
(`docs/social-listening/`) and approved it. This spec turns the mockup into the real tab: she uploads the two Talkwalker
exports, the page fills in, and she adds her analysis and featured posts in the page instead of in slides.

Success: the November report is produced in the app on staging, Savannah confirms the numbers match her exports, and
the client can read the month without a deck.

## 2. Goals, non-goals, anti-goals

Goals
- G1. A per-client, opt-in Social Listening tab under Organic Social, shown only to clients on reporting months.
- G2. Staff upload the brand and the industry Talkwalker dashboard exports for a month. The file is checked before
  anything is stored; a bad file is refused with a plain reason.
- G3. Every chart the export supports fills in from the stored upload (section 6 lists them).
- G4. An optional analysis box in every chart card and every section, using the existing commentary lifecycle (draft,
  approve, history). Clients see approved text only. An empty box is invisible to clients.
- G5. Featured posts per month (social, forum, web): platform, author, link, engagements, sentiment, commentary, up to 4
  screenshots. Clients see approved posts only.
- G6. A keyword appendix per topic, written by the analyst.
- G7. Month-over-month and year-to-date that compare with what the client was shown (decision D5, section 7).

Non-goals (this build)
- Paid sentiment. Phase 2, section 12. It stays in the plan and the tab leaves room for it.
- The donut that also drops Stacker and PR earned coverage. No export sheet has it (mock README, open decision 3).
- Reading Talkwalker directly. No agent or script runs inside Talkwalker (social-listening repo `CLAUDE.md`, rule 4).
- A redesign of other dashboards (Jasmine asked; Paul: a design pass in Q1 2027).
- Analysis boxes on any other report.

Anti-goals
- A number on the page that disagrees with the uploaded export, or with another number on the same page.
- A client seeing a draft, an unapproved post, a month that is not open to them, or another client's data.
- Any change to what Renaissance or any client without the setting sees.
- Client data in this repo (it is public): fixtures are synthetic; real-file checks run from a private folder.

## 3. Approaches

| | How the export reaches the app | Trade-off | Pick |
|---|---|---|---|
| A | Upload the `.xls` in the tab (server action), parse on the server, store parsed numbers plus the raw file | New parser dependency and tables; matches how Savannah described her month (upload after cleanup) | **Yes** (Thomas, 2026-11-19: "upload the export to the dashboard") |
| B | Savannah drops the file in a Drive folder; the app reads it with the service account | No upload UI, but a second place to manage, Drive write scope, and slower feedback when a file is wrong | No |
| C | Savannah types the numbers into a Google Sheet the app reads (the YTD sheet pattern, `lib/organic-social/ytd-sheet.ts`) | No parser, but brings back hand copying, which this replaces | No |

Analysis boxes: reuse `report_commentary` (one view key per box) instead of a new table. It already has draft and
approve, history, sanitizing and the month rule for locked-months clients (`components/report-sections/commentary/monthly.tsx`).
Keyword appendix: also a commentary box per topic, for the same reasons. First build scope: brand and industry; paid
sentiment second (Thomas, 2026-11-19, option A).

## 4. The setting and the tab

`dash_social_config.socialListening` (typed `unknown` in `DashSocialConfig`, parsed at runtime like
`parseAeoInformedSetting`, `lib/organic-social/aeo-tab/setting.ts:37`):

```
{ enabled: true, brandTopic: "<Talkwalker topic name>", industryTopic?: "<Talkwalker topic name>" }
```

- Absent, or `enabled` not exactly `true`: off, today's behaviour. Any unknown key or a non-string topic: malformed,
  logged once by slug and key (never the value), tab off.
- The tab is offered when the setting parses, the client is on reporting months (`hasReportingMonths`,
  `lib/organic-social/reporting-months.ts:75`), and `hidden_reports` does not hold its id. A new pure
  `hasSocialListeningTab(client)` (beside `hasAeoInformedTab`) decides it, and `organicSocialSubsections` gets a
  `s.view === 'social-listening' ? socialListening : ...` branch (`lib/constants.ts:254`). Without that branch every
  `channel: null` entry is offered to every client, Renaissance included, so it is the one gate that matters.
  `OrganicTabsClient` (`lib/constants.ts:227`) and `PortalSidebarClient` (`lib/portal/sidebar-client.ts`) gain
  `socialListeningTab?: boolean`; the portal record carries only that boolean, as the AEO tab does.
- Tab: `{ id: 'organic-social-listening', label: 'Social Listening', channel: null, view: 'social-listening' }`, added
  last to `ORGANIC_SOCIAL_SUBSECTIONS` (`lib/constants.ts:205`). `OrganicView` gains `'social-listening'`.
- `OrganicSocialBody` (`components/report-sections/organic-social/index.tsx`) gets an early branch for the view, like
  the AEO one (`index.tsx:88-103`), including its `NoMonths` path when reporting months are malformed. The top and
  bottom `SharedPartsHeader` boxes are not rendered on this tab: its own analysis boxes replace them, so nothing is read
  from or written to Overview's `organic-social` stream.
- Without `industryTopic` the Industry pill and every industry section are absent. Empty or whitespace topics, and
  `industryTopic` equal to `brandTopic`, are malformed. A malformed setting is logged where the portal record is built
  and where the section renders, as the AEO setting is.
- Optional `industrySample: <1-100>`: when set, the industry tiles and results charts carry "<n>% sample" (Talkwalker
  samples the industry topic; APFM's is 10%, social-listening findings doc, September industry notes).
- Brand and Industry is a URL param `sl=brand|industry` (default brand, anything else is brand), deep-linkable and
  part of the report's Suspense key. It is threaded through the same places `aeo` is on screen: the route URL builders
  and `getReportComponent` in both report pages (`app/dashboard/[clientSlug]/reports/page.tsx`,
  `app/portal/[clientSlug]/reports/page.tsx`). **A PDF of the tab prints brand then industry on one page, whichever
  pill is open** (Thomas, 2026-11-19, review R2-5), like the deck, so single and bulk exports always hold both and `sl`
  is never needed by the export.

## 5. Months

The tab follows the client's reporting months (`lockedRangeFor`, `lib/organic-social/locked-range.ts:10`): the same
month picker, the same served month, the same months a client may open. Social listening adds no month rule of its own.

- A served month with no brand upload: staff see an empty state with the upload control; clients see "This month's
  social listening report isn't ready yet." Industry is independent: with no industry upload its sections show the same
  message to staff and are hidden from clients.
- A month is one calendar month, matched to the export's own date range (V4).
- **The upload's month is never taken from the form.** The action re-resolves the served month on the server
  (`lockedRangeFor` with the request's range) and refuses a month that has not finished (its last day after the last
  complete UTC day) or is before the client's first reporting month. The upload control is shown only on a finished
  served month.
- Comparisons always use the previous calendar month, whatever the client's `comparison` option says
  (`reporting-months.ts:31`).
- Client view per case: no brand upload, the whole tab shows the not-ready text and no Industry pill. Brand uploaded but
  no industry upload, the Industry pill is hidden. Analysis-only sections (Top conversation themes, Key takeaways,
  Keyword appendix) are hidden from clients when no analysis is approved. Staff always see every section, with the
  upload control in place of a missing upload.

## 6. Upload and the export contract

One upload = one file, one topic (brand or industry), one month (section 5). Server action, staff only (section 10),
2 MB limit checked by the action. Next's server-action body limit is set to `3mb` in `next.config.ts`
(`experimental.serverActions.bodySizeLimit`) so a 2 MB file reaches V1 instead of failing in the framework. Measured
sizes: brand 43,520 bytes, industry 18,432 bytes (October). Parser: SheetJS `xlsx` 0.20.3 from the SheetJS CDN
tarball, pinned with its lockfile integrity. Measured in the scratch trial (`docs/findings/2026-11-19-social-listening-xls-parser.md`):
it reads both real exports and every compared value equals the Python parse (16 of 16); npm's last `xlsx` (0.18.5)
carries two HIGH advisories fixed only in CDN releases (0.19.3, 0.20.2); osv-scanner still reports them against 0.20.3
with no fix listed, which the repo's SCA gate reports but never blocks. The Vercel install of a tarball URL is checked in
the plan's first task. Read only; formulas and macros are never evaluated; dates are read as text.

**Every rule must pass or nothing is stored.** The refusal names each failed rule in plain words.

| Rule | Check (measured on the Oct and Sep exports, social-listening `docs/findings/2026-11-12-talkwalker-dashboard-export.md`) |
|---|---|
| V1 | The file starts with the OLE2 signature (legacy `.xls`, as measured), opens as a workbook, is at most 2 MB, and has at least one sheet; anything else is "not a Talkwalker .xls export" |
| V2 | Every sheet: row 1 starts `Title: `, row 2 starts `Filters: ` |
| V3 | The required widgets are present, found by title and header shape, never sheet name (names collide and truncate) |
| V4 | Every filter line ends `MM/DD/YY - MM/DD/YY`, all sheets agree, and the range is the first to last day of the chosen month |
| V5 | The filter line's first item equals the client's topic name for the chosen topic (stops a brand file uploaded as industry) |
| V6 | Counts are whole numbers at or above 0; reach and engagement numbers at or above 0 |
| V7 | Results equals the sum of daily results, the sum of the sentiment split and the sum of sentiment by media type |
| V8 | Daily rows: one per day of the month, in order |
| V9 | Sentiment labels are exactly Positive, Neutral, Negative |

Required widgets. Brand: Results, Unique Authors, Engagement, Potential Reach, Results over time, Share of Sentiment
(split), Share of Sentiment (by media type), Themes (two-word list, decision D4), Top influencers, Overview. Optional,
used when present: Share of Sentiment - Without Brand Owned Channels. Industry: Results, Results over time, Results over
time by sentiment, Share of Sentiment (split), Share of Sentiment (by media type), Themes.

Two widgets are titled Themes on the brand export (25 three-word themes, 120 two-word themes, same header shape). The
cloud uses the two-word list (decision D4): the Themes widget whose theme strings are all two words. Not exactly one such
widget: refused under V3. The industry export has one Themes widget (two-word), used as is.

Stored shape (`version: 1`). Counts are integers; every other number is a JavaScript number as exported. Nothing is
derived at parse time except the media type totals.

```
{ version: 1, topic: 'brand' | 'industry', month: 'YYYY-MM',
  results: int,                          // the Results widget
  uniqueAuthors?: int, engagement?: number, potentialReach?: number,   // brand only
  daily: { day: 'YYYY-MM-DD', results: int }[],          // one per day; dates parsed from MM/DD/YY, the export's own day
  dailyBySentiment?: { day: 'YYYY-MM-DD', pos: int, neu: int, neg: int }[],   // industry only
  sentiment: { pos: int, neu: int, neg: int },           // counts, not percents
  sentimentByMedia: { media: string, pos: int, neu: int, neg: int }[],        // counts
  ownedExcluded?: { pos: int, neu: int, neg: int },      // brand, when the optional widget is present
  themes: { theme: string, share: number, color: string }[],   // share = the export's fraction 0..1
  influencers?: { authorId: string, name: string, network: string, posts: int, pos: int, neu: int, neg: int,
                  reach: number, engagement: number }[],       // brand, up to 5
  overview?: { label: string, who: string, network: string, value: number, unit: string }[]  // brand, 4 cards;
             // the widget stores text in label/value pairs: value parsed as a number, unit is the word after it }
```

"Share of media types" uses the media totals from sentiment by media type (every type the export lists). The separate
Share of Media Types widget is not read; it holds the same counts grouped into named types plus Other.

Logging: an accepted or refused upload logs slug, topic, month, rule ids and byte size. Never values, names, file name
or contents (the AEO rule: a reason names the field, never the value).

## 7. Comparisons and year to date (decision D5)

D5, decided by Thomas 2026-11-12 (social-listening `docs/2026-11-12-build-plan.md`, section 5): **presented numbers are
the record.** Talkwalker revises past months, so a later pull disagrees with what the client was shown.

- **A month's presented upload** = the newest upload for that month and topic made before the month opened to the
  client. Whether an upload was "before open" is worked out once, when it is stored (`opensOn` with the client's
  settings at that moment, `lib/organic-social/reporting-months.ts:96`), and saved on the row as `before_open`
  (boolean), so a later change to `opensOnDay` or `weekendRule` can never change which upload is presented. If no upload
  is `before_open`, the first one. A re-upload after the open date is allowed and becomes what the page shows for that month, but it never
  changes the presented upload; staff see a one-line note that later months still compare with the earlier numbers.
- **A month's presented values** = its history row if one exists (section 8, backfilled from the reports already
  delivered), else its presented upload.
- **The page shows** the month's current (newest) upload. The served month's own point on every year-to-date chart is
  that same upload, so the donut and its YTD point always agree. History rows and presented uploads supply only the
  earlier months.
- **Tile and sentiment changes** ("vs <previous month> report"): this month's current upload against the previous
  month's presented values. Tiles use `KpiCard wholeDelta`, which shows whole percents from 1% and one decimal under 1%
  (`roundDelta`, `lib/delta-rounding.ts:9`). Sentiment changes are percentage points, which `KpiCard` cannot print (it
  always appends `%`), so a small `PointsDelta` line is added for the industry sentiment tiles and the donut legends; the
  shared `KpiCard` is not changed. Missing previous month: `KpiCard comparisonExpected`'s existing greyed placeholder,
  and "n/a" in legends.
- **Formulas.** pct(k) = 100 × count(k) / results, rounded to one decimal for display. Points change = pct(k) now minus
  the previous month's pct(k) (a history row's whole percent, or the presented upload's one-decimal pct), shown to one
  decimal with its sign. Tile change = 100 × (now / previous − 1), then `roundDelta`; a previous value that is
missing, null or 0 gets the `comparisonExpected` placeholder instead (never Infinity). YTD point = round(pct(k)) for each
  of the three independently, as the deck charts them (they may sum to 99 or 101).
- **Media type and influencer changes**: against the previous month's presented upload only (history rows don't hold
  them); influencers are matched by `authorId`. No upload last month, or a media type or author absent last month:
  "n/a".
- **Year to date** (brand sentiment, positive + neutral with negative, Reddit sentiment, industry sentiment): January
  to the served month of that year; earlier months from presented values, the served month from its current upload, all
  as whole percents. A month with neither a history row nor an upload is a gap, never a zero. Reddit comes from the
  Reddit row of sentiment by media type.
- The trends lists (emerging, decreasing, new themes) are not in the export: staff type them per month (section 8).

## 8. Storage (new tables, one migration)

- `social_listening_uploads`: id, client_id, month (date, 1st), topic (`brand`|`industry`), data (jsonb, section 6
  shape), raw (bytea, the file as uploaded, never selected by page reads), sha256, byte_size, before_open (boolean, set
  once at upload, section 7), uploaded_by, uploaded_at.
  Append-only: a re-upload adds a row; the newest row per (client, month, topic) is current. Index (client_id, month, topic).
- `social_listening_history`: client_id, month, topic, results, unique_authors, engagement, potential_reach (nullable
  numerics, as presented on the tiles), pos/neu/neg (whole percents), reddit_pos/neu/neg (nullable whole percents),
  source (text: `history-sheet` or `delivered-deck`, plus the deck month). Unique (client_id, month, topic). Written
  only by a guarded script from the team's private history sheet and, for October, the delivered October deck; never by
  the page.
- `social_listening_posts`: id, client_id, month, group (`social`|`forum`|`web`), platform, author, url (https only,
  nullable), engagements (int, nullable), sentiment, note (plain text, at most 1,000 characters), position, status
  (`commentary_status` enum: draft or approved), replaces_id (nullable, the approved post a draft edits), replaced_at,
  created/updated/approved by and at, deleted_at, deleted_by. Approve before a client sees it; only drafts are soft
  deleted. **Editing an approved post forks a draft** (`replaces_id` = the approved post, its image rows copied); the
  approved post stays what clients see until the draft is approved, which sets the old row's `replaced_at` and hides it.
  At most one open draft per approved post (partial unique index on `replaces_id`). At most 12 posts per month.
- `social_listening_post_images`: id, post_id, bytes (bytea, JPEG only: the browser converts and shrinks to 1,200 px,
  at most 300 KB, checked by size and the JPEG magic bytes), print_bytes (JPEG at 600 px, at most 60 KB, made by the
  browser in the same step), width, height, created_at. At most 4 per post. One image per server action call.
- `social_listening_trends`: client_id, month, emerging, decreasing, new (jsonb lists of `{theme, change?}`), status
  (draft or approved, the same approvers), updated_by, updated_at, approved_by, approved_at. Unique (client_id, month).
  Clients see a month's trends only once approved; saving after approval sets it back to draft.

Screenshots are served by `/api/social-listening/image/[id]`. `/api` is outside the proxy's matcher (`proxy.ts`), so
the route does every check itself: a session; staff (`isStaff`, `lib/auth/route-access.ts:8`) or a client whose slug
owns the post (`canOpenPortal`, `route-access.ts:15`); and for a client role, the post must be approved, not replaced
and not deleted. Otherwise 404. Response `Cache-Control: private, max-age=31536000, immutable` (an image never changes;
an edit adds a new id), so each viewer fetches each image once. `?print=1` serves `print_bytes`; the PDF export uses it
and prints only each post's first image, so a month's posts add at most 12 × 60 KB to a PDF (Chromium embeds images
as stored, and a large Overview PDF once passed Vercel's 4.5 MB response limit, `lib/export/print-image.ts:1-5`).

Page reads (the month's uploads, the previous month, up to 12 YTD months, history, posts, trends, commentary) go through
`cached()` under the `db` tag, and every write calls `updateTag('db')`, as commentary does (`app/actions/commentary.ts`).
Neon's transfer limit was hit once before (#407), and the lock sweep renders every Organic Social tab in its window.

## 9. The page

Brand and Industry pills under the header (Industry only with `industryTopic`). Each section below is a chart card with
its analysis box inside it, in this order (the mockup's layout, approved 2026-11-19):

Brand: Data tiles (results, unique authors, engagement, potential reach) / Results over time / Share of sentiment /
Without brand-owned channels (only when the optional sheet is present) / Sentiment by media type / Year to date:
sentiment, positive + neutral with negative, Reddit / Share of media types / Keyword themes (cloud) / Trends in keyword
themes (only when staff entered them) / Top conversation themes (analysis only) / Top authors: overview cards and table /
Most relevant posts / Key takeaways (analysis only) / Keyword appendix.

Industry: Data tiles (results, positive, neutral, negative) / Results over time / Share of sentiment / Sentiment, year to
date / Sentiment over time (daily, by sentiment) / Sentiment by media type / Keyword themes / Top conversation themes /
Key takeaways / Keyword appendix.

Charts reuse `components/charts/` (`KpiCard`, `ChartCard`, `DonutChart`, Recharts). The cloud, the stacked horizontal
bars and `PointsDelta` are new small components. Colors: a new `SENTIMENT_COLORS` constant beside `CHART_COLORS`
(`CHART_COLORS.positive/neutral/negative` are the delta colours and stay as they are). Staff-only controls (upload,
trends editor, add post) never render for a client role.

**PDF export prints the client's view, whoever exports.** `useExportMode()` is a client-side context
(`components/export/export-mode.tsx:14`) and the export page resolves with the exporter's role
(`app/export/[clientSlug]/[section]/page.tsx:58`), so hiding controls in the browser is not enough. The export passes an
explicit server-side flag from `exportReportElement` into the section, and every section 5 case is driven by one value,
`clientView = role is a client OR exporting`. Under it the tab renders no controls, no drafts, no staff notes, no empty
or analysis-only section without approved text, approved posts with their first image at print size, approved trends,
and each analysis box's client entry (as commentary prints, `commentary-panel.tsx:73-75`). A staff member's export can
never put a draft or an empty staff-only card in front of a client.

Analysis boxes: view keys `organic-social:social-listening:${SocialListeningBoxId}` added to the `CommentaryViewKey`
union (`lib/commentary/views.ts:16`) and to `COMMENTARY_VIEWS` with `{ label, owner: 'Savannah / Jasmine' }`, label
"Social Listening, <section>". Rendered by `monthlyCommentary` with one shared `ANALYSIS_LABELS` (title "Analysis",
noun "analysis", no outline); the two keyword boxes use title "Keywords in this topic". Box ids (fixed list): brand
`b-kpis b-daily b-sent b-owned b-cross b-ytd b-posneu b-reddit b-media b-themes b-trends b-conv b-authors b-posts
b-takeaways b-keywords`, industry `i-kpis i-daily i-sent i-ytd i-sentday i-cross i-themes i-conv i-takeaways i-keywords`.
Reads: a new `getCommentaryForViewPrefix(clientId, 'organic-social:social-listening:')` (one query, cached like
`getCommentaryForView`, `lib/db/queries.ts:288`), and `monthlyCommentary` gains an optional pre-fetched `entries` prop so
the boxes do not query one by one. The commentary write path (`app/actions/commentary.ts:55`) is reused as is: it checks
staff and a known view key but not the client's setting, which is accepted (a stray analysis row on a client without the
tab is never rendered).

## 10. Who can do what

Uses the existing rules (`lib/commentary/permissions.ts`): any @avenuez.com staff member may upload, edit trends, write
analysis and add or edit posts; only `COMMENTARY_APPROVERS` may approve or revoke analysis and posts. Clients read only.
Every new server action (upload, posts, images, trends) re-checks the session, the client and the setting; the client is
never taken from the form alone. Analysis boxes use the existing commentary actions (section 9).

## 11. Failure handling and edge cases

| Case | Behaviour |
|---|---|
| File fails a rule | Nothing stored; message lists the failed rules; log line with rule ids |
| Brand file uploaded as industry (or another topic) | Refused by V5 |
| Wrong month | Refused by V4, message names the month in the file |
| Re-upload for the same month and topic | New current row; the page shows it; earlier rows kept for audit |
| A month has both a history row and an upload | The page (and its own YTD point) shows the upload; later months compare with the history row (D5). Staff see a one-line note saying so |
| Re-upload after the month opened to the client | Allowed; the page shows it; later months keep comparing with the presented upload; staff see a note |
| Upload attempted for an unfinished month | Refused: "October isn't over yet" (the month named) |
| Previous month missing | Changes show the "no comparison" placeholder or "n/a"; YTD shows a gap |
| Optional owned-channels sheet missing | That card is absent; no error |
| Database read fails | The tab shows the standard error card (`ReportErrorBoundary`); other tabs unaffected |
| Image over 300 KB or not an image | Refused before storing; message says why |
| Post URL not https | Refused |
| Setting malformed | Tab off, one warning line naming the key |
| Client without reporting months | Tab not offered |
| Two staff upload at once | Both rows stored; the newer is current; no lock needed (append-only) |
| Export from a future Talkwalker layout (a widget renamed) | V3 refuses and names the missing widget |

## 12. Phase 2: paid sentiment (accounted for, not built here)

The deck's Paid Ads section (slides 29 to 32 of the October deck: purpose, sentiment overview of ad comments, comment
examples by sentiment, takeaways) comes from the team's paid ad comment sheets, today pulled into Glean (Savannah,
2026-11-19 call). Plan: a third pill, "Paid", reading the comment sheet through the service account (the
`lib/organic-social/ytd-sheet.ts` pattern), with its own analysis boxes. **Blocked on**: a sample comment sheet from
Savannah, its column layout, and who shares it with the service account. Its own spec addendum when unblocked. The
setting reserves the key `paidSheet` for it; this build rejects it as unknown so it cannot be set early by mistake.

## 13. Rollout

1. Dev database: run the migration, then switch the setting on for APFM with a guarded one-key script (needs Thomas's
   go; dev and staging writes need written consent, memory `staging-only-client-onboarding`).
2. Backfill history rows for January to October (brand) and May to October (industry) from the private history sheet,
   October from the delivered October deck, through a guarded script with a dry run and a rollback. **October is not
   uploaded** (Thomas, 2026-11-19, review R2-3): October stays the delivered deck, the tab starts with November, and
   November's tile and sentiment changes compare with October's history row. Accepted consequence: November's media
   type and author changes show "n/a" for that first month only.
3. Staging: same steps after Paul's review and the dev to staging promotion, each with Thomas's go. Savannah uploads
   November's exports there and checks the page against her files.
4. Production only after Savannah and Jasmine approve on staging and Thomas says go.

## 14. Tests (each output has one, written first)

- Setting parse: off, ok, malformed per key; tab offered only with reporting months; hidden_reports hides it; the portal
  record carries only the boolean.
- Export contract: one passing synthetic workbook per topic (built in the test with SheetJS, made-up numbers), and one
  failing workbook per rule V1 to V9 with the expected message.
- Parse output: every field of the stored shape from the synthetic workbook.
- Comparisons: presented value picks history over upload; tile change, sentiment points, n/a cases; media and influencer
  changes by authorId; YTD gaps never zero; whole-percent rounding matches the deck's method.
- Upload action: refuses non-staff, wrong client, missing setting; stores raw, sha256 and size; appends on re-upload.
- Posts: create, edit, approve, revoke, soft delete a draft only; client sees approved only; https rule; image limits
  and magic-byte check; image route refuses another client's image.
- Page: renders every section from a stored upload; client role never sees staff controls, drafts or empty boxes; each
  section 5 case per role (no brand upload, brand without industry, no industry topic, analysis-only sections with
  nothing approved); the staff note on a month with a history row and on a re-upload after the open date; the industry
  sample label.
- Tab list: `organicSocialSubsections` offers the tab only with the setting and reporting months; Renaissance's tab list
  and every client without the setting are unchanged (an explicit Renaissance assertion). Two existing tests change on
  purpose and say so: `lib/organic-social/aeo-tab/tab-list.test.ts:16` (AEO no longer last) and
  `lib/organic-social/subsections.test.ts:9` (the full id list).
- Export: a staff export of the tab prints no controls, drafts or staff notes, approved posts' first print images only,
  and brand then industry from either pill, in single and bulk exports.
- Image route: 404 for no session, another client, a client viewing a draft, replaced or deleted post's image;
  `Cache-Control` header; `?print=1` serves the print bytes.
- Trends action: staff only, client and setting re-checked, saving after approval returns it to draft, clients see
  approved only.
- Upload month: refused for an unfinished month and a month before the first reporting month; the month never comes from
  the form. Size: a 2 MB plus 1 byte file is refused with the V1 message.
- Logging: accepted and refused uploads log slug, topic, month, rule ids and size only (a test asserts no value, name or
  file name appears).
- Presented upload: the newest before the open date wins; a later re-upload changes the page but not the next month's
  comparison.
- History backfill script: refuses a host other than the one it names, dry run writes nothing, rollback restores.
- Private check, not in the repo: the real October exports parse and every displayed number equals the export
  (the Python numbers in the private mock folder), run from `~/code/apfm-social-listening-mock`.
