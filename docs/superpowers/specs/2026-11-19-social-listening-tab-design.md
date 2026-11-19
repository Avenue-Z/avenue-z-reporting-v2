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
  `lib/organic-social/reporting-months.ts:75`), and `hidden_reports` does not hold its id. The portal gets only a
  boolean (`socialListeningTab`), as the AEO tab does (`lib/portal/sidebar-client.ts`).
- Tab: `{ id: 'organic-social-listening', label: 'Social Listening', channel: null, view: 'social-listening' }`, added
  last to `ORGANIC_SOCIAL_SUBSECTIONS` (`lib/constants.ts:203`). `OrganicView` gains `'social-listening'`.
- Without `industryTopic` the Industry pill and every industry section are absent.

## 5. Months

The tab follows the client's reporting months (`lockedRangeFor`, `lib/organic-social/locked-range.ts:10`): the same
month picker, the same served month, the same months a client may open. Social listening adds no month rule of its own.

- A served month with no brand upload: staff see an empty state with the upload control; clients see "This month's
  social listening report isn't ready yet." Industry is independent: with no industry upload its sections show the same
  message to staff and are hidden from clients.
- A month is one calendar month, matched to the export's own date range (V4).

## 6. Upload and the export contract

One upload = one file, one topic (brand or industry), one month. Server action, staff only (section 10), 2 MB limit.
Parsed with SheetJS (`xlsx` 0.20.3 from the SheetJS CDN tarball, pinned; npm's last `xlsx` is 0.18.5, which I believe
carries published advisories: the scratch trial confirms both the advisories and that 0.20.3 reads these files).
Read only; formulas and macros are never evaluated.

**Every rule must pass or nothing is stored.** The refusal names each failed rule in plain words.

| Rule | Check (measured on the Oct and Sep exports, social-listening `docs/findings/2026-11-12-talkwalker-dashboard-export.md`) |
|---|---|
| V1 | The file opens as a workbook, is at most 2 MB, and has at least one sheet |
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

Stored shape (`version: 1`), every field from the export, nothing derived except media totals:
`{ version, topic, month, results, uniqueAuthors?, engagement?, potentialReach?, daily[], dailyBySentiment?[],
sentiment{pos,neu,neg}, sentimentByMedia[{media,pos,neu,neg}], ownedExcluded?{pos,neu,neg}, themes[{theme,share,color}],
influencers[{authorId,name,network,posts,pos,neu,neg,reach,engagement}], overview[{label,who,network,value,unit}] }`.

Logging: an accepted or refused upload logs slug, topic, month, rule ids and byte size. Never values, names, file name
or contents (the AEO rule: a reason names the field, never the value).

## 7. Comparisons and year to date (decision D5)

D5, decided by Thomas 2026-11-12 (social-listening `docs/2026-11-12-build-plan.md`, section 5): **presented numbers are
the record.** Talkwalker revises past months, so a later pull disagrees with what the client was shown.

- **A month's presented values** = its history row if one exists (section 8, backfilled from the reports already
  delivered), else its current upload.
- **Tile and sentiment changes** ("vs Sep report"): this month's upload against the previous month's presented values.
  Tiles show a whole-number percent change (`KpiCard wholeDelta`); sentiment shows the change in points (one decimal).
  Missing previous month: the card's existing greyed "no comparison" placeholder (`KpiCard comparisonExpected`,
  `components/charts/kpi-card.tsx`).
- **Media type and influencer changes**: against the previous month's upload only (history rows don't hold them).
  None, or a media type absent last month: "n/a".
- **Year to date** (brand sentiment, positive + neutral with negative, Reddit sentiment, industry sentiment): January
  to the served month of that year, each month's presented values rounded to whole percents. A month with neither a
  history row nor an upload is a gap, never a zero. Reddit comes from the Reddit row of sentiment by media type.
- The trends lists (emerging, decreasing, new themes) are not in the export: staff type them per month (section 9).

## 8. Storage (new tables, one migration)

- `social_listening_uploads`: id, client_id, month (date, 1st), topic (`brand`|`industry`), data (jsonb, section 6
  shape), raw (bytea, the file as uploaded, never selected by page reads), sha256, byte_size, uploaded_by, uploaded_at.
  Append-only: a re-upload adds a row; the newest row per (client, month, topic) is current. Index (client_id, month, topic).
- `social_listening_history`: client_id, month, topic, results, unique_authors, engagement, potential_reach (nullable
  numerics), pos/neu/neg (whole percents), reddit_pos/neu/neg (nullable), source note. Unique (client_id, month, topic).
  Written only by a guarded script from the team's private history sheet; never by the page.
- `social_listening_posts`: id, client_id, month, group (`social`|`forum`|`web`), platform, author, url (https only,
  nullable), engagements (int, nullable), sentiment, note (plain text, at most 1,000 characters), position, status
  (`commentary_status` enum: draft or approved), created/updated/approved by and at, deleted_at, deleted_by. Same
  lifecycle as `chart_notes` (`lib/db/schema.ts:422`): approve before a client sees it, only drafts are soft deleted.
- `social_listening_post_images`: id, post_id, mime (jpeg, png or webp, checked by magic bytes), bytes (bytea, at most
  300 KB after the browser shrinks it to 1,200 px), width, height, created_at. At most 4 per post.
- `social_listening_trends`: client_id, month, emerging, decreasing, new (jsonb lists of `{theme, change?}`),
  updated_by, updated_at. Unique (client_id, month).

Screenshots are served by `/api/social-listening/image/[id]` after the same client-access check as the report, with
`Cache-Control: private, max-age=31536000, immutable` (an image never changes; an edit adds a new id), so each viewer
fetches each image once. Neon's transfer limit was hit once before (CLAUDE.md, #407); this keeps image reads small.

## 9. The page

Brand and Industry pills under the header (Industry only with `industryTopic`). Each section below is a chart card with
its analysis box inside it, in this order (the mockup's layout, approved 2026-11-19):

Brand: Data tiles (results, unique authors, engagement, potential reach) / Results over time / Share of sentiment /
Without APFM's own channels (only when the optional sheet is present) / Sentiment by media type / Year to date:
sentiment, positive + neutral with negative, Reddit / Share of media types / Keyword themes (cloud) / Trends in keyword
themes (only when staff entered them) / Top conversation themes (analysis only) / Top authors: overview cards and table /
Most relevant posts / Key takeaways (analysis only) / Keyword appendix.

Industry: Data tiles (results, positive, neutral, negative) / Results over time / Share of sentiment / Sentiment, year to
date / Sentiment over time (daily, by sentiment) / Sentiment by media type / Keyword themes / Top conversation themes /
Key takeaways / Keyword appendix.

Charts reuse `components/charts/` (`KpiCard`, `ChartCard`, `DonutChart`, Recharts). The cloud and the stacked
horizontal bars are new small components. Colors: positive, neutral, negative use one constant added next to
`CHART_COLORS`. Staff-only controls (upload, trends editor, add post) never render for a client role.

Analysis boxes: view keys `organic-social:social-listening:<box>` registered in `COMMENTARY_VIEWS`
(`lib/commentary/views.ts`) with one label each; rendered by `monthlyCommentary` so they follow the served month. Box ids
(fixed list): brand `b-kpis b-daily b-sent b-owned b-cross b-ytd b-posneu b-reddit b-media b-themes b-trends b-conv
b-authors b-posts b-takeaways b-keywords`, industry `i-kpis i-daily i-sent i-ytd i-sentday i-cross i-themes i-conv
i-takeaways i-keywords`. One commentary query per tab load, not one per box.

## 10. Who can do what

Uses the existing rules (`lib/commentary/permissions.ts`): any @avenuez.com staff member may upload, edit trends, write
analysis and add or edit posts; only `COMMENTARY_APPROVERS` may approve or revoke analysis and posts. Clients read only.
Every server action re-checks the session, the client and the setting; the client is never taken from the form alone.

## 11. Failure handling and edge cases

| Case | Behaviour |
|---|---|
| File fails a rule | Nothing stored; message lists the failed rules; log line with rule ids |
| Brand file uploaded as industry (or another topic) | Refused by V5 |
| Wrong month | Refused by V4, message names the month in the file |
| Re-upload for the same month and topic | New current row; the page shows it; earlier rows kept for audit |
| A month has both a history row and an upload | The page shows the upload; later months compare with the history row (D5). Staff see a one-line note saying so |
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
   October from the delivered October deck, through a guarded script with a dry run and a rollback.
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
- Page: renders every section from a stored upload; client role never sees staff controls, drafts or empty boxes; a
  month with no upload shows the right empty text per role; Renaissance and a client without the setting render
  exactly as before (existing snapshot tests unchanged).
- Private check, not in the repo: the real October exports parse and every displayed number equals the export
  (the Python numbers in the private mock folder), run from `~/code/apfm-social-listening-mock`.
