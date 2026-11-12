# AEO Informed Social: the tab on the dashboard, with the team's 2026-11-12 feedback

Date: 2026-11-12. Status: spec, before code. Organic Social only. Builds on the adapter in this PR
(`lib/organic-social/aeo-informed/`, guide `ENGINEERS.md`), which is not wired to anything today.

## Sources (every requirement below cites one)

- The outline doc, current version with the team's comments (docx export read 2026-11-12, every paragraph and both
  comments; paragraph numbers P001 to P040 are the order they appear, private copy). It has the same four screenshots
  as the version the mock-up was built from, plus a new "BEFORE THE TABLES" section and a "Feedback" block.
- The team's Slack reply of 2026-11-12 3:46 PM, which repeats the doc's feedback.
- The mock-up the team reviewed (a Claude artifact, not code), which follows the outline.

## Requirement map

| # | Source | Requirement | Section |
|---|---|---|---|
| R1 | P003 | One tab labeled "AEO Informed Social" | 1 |
| R2 | P004 to P008 | Order: Insights, Graphs, Renaissance Only Socials, Competitor Socials, URL Gaps | 3 |
| R3 | P010, P011 | Domain tag Organic Social; URL tag Organic Social only | 4 (no URL carries the tag; the domain classification selects the same rows, `ENGINEERS.md`) |
| R4 | P012 | Indicators stay on default | 4 (nothing to set through the API) |
| R5 | P013 to P016 | Date range flexible: MoM, YTD, All time | 2 |
| R6 | P018 to P021 | The four graphs and their titles | 3 |
| R7 | P023 to P027, comment C0 ("to add data totals similar to OS"), Slack | Before the tables: Total URLs cited, Total # of retrievals, Total # of citations, Average citation rate | 3, 5 |
| R8 | P028, P029 | Renaissance Only Socials, "Filters: your channels only" | 3 |
| R9 | P031, P032 | Competitor Socials, "Filters: competitor channels only and" (cut off) | 3 |
| R10 | P034, P035 | URL Gaps, "Filters: Min 2 competitors" | 3 |
| R11 | P038, P039, comment C1, Slack | Remove "Retrieved", add citation rate; order Retrievals, total citations, citation rate | 5 |
| R12 | P040, C1, Slack | Graphs in different colors | 3 |

## 1. Where it lives, and who gets it

- A new Organic Social tab, id `organic-aeo-informed`, label "AEO Informed Social", `channel: null`, `view: 'aeo-informed'`,
  following the Influencer tab exactly (`lib/constants.ts:200-249`, `lib/organic-social/influencer-tab.ts:21-28`). It is
  the last Organic Social tab. `OrganicView` gains `'aeo-informed'`.
- **Opt in, per client, default off, nothing client-specific in code.** One setting per client,
  `dash_social_config.aeoInformedSocial = { enabled: true, allTimeFrom: "YYYY-MM-DD", selector?: "<Peec domain
  classification>", fourthGraph?: "<platform>" }` (`selector` defaults to "Organic Social", `fourthGraph` to
  `instagram`, one of the adapter's five platforms), plus the client's own `peec_customer_project_id`
  (`lib/db/schema.ts:219`). Brand names, competitors and colors come from that client's Peec project. A malformed setting
  is no tab and one warning. No client has the setting today, so no client's tabs, pages or behaviour change when this
  ships (read-only check before merge: list every client whose tabs change; expected none).
- **The project id never reaches the browser.** The server computes one boolean, `aeoInformedTab`, from the setting and
  the project id (logging the warning there, never in the pure tab rules) and adds only that boolean to the trimmed
  records the tab rules read: `OrganicTabsClient` (`lib/constants.ts:221-224`), the portal sidebar's
  `PortalSidebarClient` (`lib/portal/sidebar-client.ts:9-17`, whose test pins its fields) and `ExportViewClient`
  (`lib/export/report-view.ts:8`). A test proves the project id is in none of them.
- **Renaissance.** The outline is a Renaissance report, and Renaissance is the only client whose Peec project the adapter
  was proven on (production and staging both carry it). Switching it on writes Renaissance's row and adds a tab to its
  page, which the Renaissance rule forbids without my explicit go, in any environment. So the switch-on is its own
  step: staging first for the team to see, production later, each a guarded one-field write with a rollback, and only on
  my go.
- Insights is the shared commentary header every Organic Social tab uses (`components/report-sections/organic-social/index.tsx:45,50`),
  with its own view key `organic-social:aeo-informed` added to `CommentaryViewKey` (`lib/commentary/views.ts:16-26`) and
  `COMMENTARY_VIEWS` (`:101`), so its Insights are separate from the other tabs'. The outline lists Insights only, so no
  Recommendations key is added for it, as with the Influencer tab (`lib/commentary/views.ts:112-114`).
- **Every place that names a tab learns this view:** the page title rules (`app/dashboard/[clientSlug]/reports/page.tsx:197`,
  `app/portal/[clientSlug]/reports/page.tsx:240`, `lib/export/report-view.ts:36`) and the deep-link routes
  (`app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx:112`, portal `:133`) all show "AEO Informed Social" here;
  bulk export (`lib/export/pages.ts:26`) carries the `aeo` choice. The lock sweep (`lib/organic-social/lock-sweep.ts:19-32`)
  skips this tab: it locks Dash answers, and this tab asks Peec. The health sweep does not probe the tab in this PR
  (follow-up).
- The body renders a dedicated section component for this view (no DB template row, so no write to `section_templates` in
  any environment); the Influencer view's part-registry route is not needed because the tab has one fixed layout.

## 2. Date range

- A three-way control on the tab: **Month** (default), **YTD**, **All time**, held in the URL as `aeo=month|ytd|all`
  (any other value is `month`). The dashboard, portal and export routes pass it through like `subsection`.
- **Month** is the month the page already serves: the locked month for a client on reporting months, otherwise the
  calendar month of the range's last day. Changes compare with the window of the same length just before it, which is
  Peec's own default indicator (the outline: "Indicators should stay on default", P012; the adapter's
  `previousWindow`, `aeo-informed/windows.ts:62-67`, enforced by gate rule `meta.windows`, `gate.ts:144-145`).
- **YTD** runs January 1 to the end of the served month; **All time** runs from the client's `allTimeFrom` (set when the
  tab is switched on: the first day of data in its Peec project, 2026-01-22 for Renaissance, measured 2026-11-09) to the
  end of the served month. Neither shows change columns: their previous windows hold little or no data.
- Every window ends on the served month's end (or the team's in-progress day), so a client never sees data from a month
  that has not opened to them, by the same rule as every other tab.
- **The data's last day** (the adapter's `asOf`) is the earlier of the window's last day and yesterday (UTC), because
  the adapter refuses an as-of that is not before today (`gate.ts:152`) and a window that ends after it
  (`aeo-informed/index.ts:93`). The team's in-progress month therefore runs to yesterday; on its first day there is no
  complete day yet, so staff see "No data for <Month> yet." (clients never see an in-progress month).
- Graphs bucket weekly from the window's start; a bucket running past the data's last day is cut there and marked
  partial (`aeo-informed/graphs.ts:32-37`).
- **Locked months:** this tab's numbers are read from Peec live (cached hourly), not stored when a month locks, so a
  locked month's AEO numbers can move a little after it closes (Peec adds late citations, `ENGINEERS.md`). The tab says
  so in one line under the range control. Locking them like the Dash numbers is a separate decision (open item).

## 3. What the tab shows, top to bottom

1. **Insights** (shared header, section 1).
2. **Graphs**, two across, the outline's titles (P018 to P020 verbatim; the fourth is "Citations on <Platform>" for the
   client's `fourthGraph`, Instagram by default, which is P021's "Instagram, or other relevant social channels"). Each
   graph its own Avenue Z color, with continuity across the dashboard: "Used as a source" in brand green
   (`--color-brand-green`, `app/globals.css:64`, a color no Organic Social line uses); the all-platform citations in white,
   the dashboard's color for totals across channels (`CHART_COLORS.blended`, `lib/constants.ts:24`); a platform graph in
   that platform's line color on the other Organic Social tabs (`CHANNEL_COLOR`,
   `components/report-sections/organic-social/trends.tsx:24-30`: LinkedIn `#9B7BFF`, Instagram brand cyan). Colors are
   read from those constants, never repeated. "Used as a source" is a percent axis; the others count citations. A graph
   with no data shows the outline's "No source data" card. The screenshots' Peec controls (lightning, "...", "Add",
   the "1/4" counter, the bookmark column, "All filters") are Peec UI and not reproduced; the item count is.
3. **Totals**, before the tables (R7): four tiles built with the Organic Social tiles' `KpiCard`
   (`components/report-sections/organic-social/outline-tiles.tsx:1,18-28`), each with a definition tooltip like theirs:
   Total URLs cited, Total retrievals, Total citations, Average citation rate (definitions in section 5). Labeled
   "Your channels"; they do not follow the table's switch. In Month view each shows its change like the other tiles;
   not in YTD or All time.
4. **Renaissance Only Socials**: default "your channels only" (P029), with a switch to all tagged URLs (the outline's
   screenshot shows all of them). The brand name in the title and column comes from the client's own brand in Peec.
5. **Competitor Socials**: tagged channels Peec has registered to a competitor brand. The outline's filter sentence is
   cut off (P032), so this is our reading, written on the page in one line.
6. **URL Gaps**: default min 2 competitors (P035, the written filter; the screenshot shows its "Min 1" control, so the
   text wins), with a min control 1 to 5. Each min value is its own Peec pull with `gap >= n` (the adapter gains a
   `minCompetitors` input, default 1, replacing the hard-coded 1 at `aeo-informed/index.ts:170`), so citation share stays
   over the table's own rows (`tables.ts:134,146`, gate `url-gaps.share`). Measured 2026-11-11: `gap >= 2` returns
   exactly the rows mentioned by 2 or more brands (225 for September).

Tables page 14 rows at a time like the outline's screenshots (71 pages for 987 rows, 32 for 442), with search and the
sort arrows the screenshots show. Mentions shows one colored dot per brand: Peec returns brand colors, not logos.

## 4. Data

- One call per view to `getAeoInformedSocial` (`aeo-informed/index.ts`), gate enforced, with the client's
  `peec_customer_project_id` and the existing `PEEC_AI_CUSTOMER_TOKEN` (`.env.example:48`). No new secret.
- Selector: the "Organic Social" domain classification (R3); indicators untouched (R4).
- Cached per (project, windows) with `cached()` (`lib/cache.ts`), health-critical, so a failure shows in the beacon.
  Finished months are cached 6 hours, the in-progress month 1 hour.
- Speed: a live call took 8 to 10 seconds for a month and 39 to 55 seconds for YTD or All time (2026-11-09 runs, private
  evidence). The section renders behind its own Suspense with a skeleton and passes the adapter a `deadlineMs` under the
  route's limit (page: 120 seconds, under the 300 second limit report pages run with in production,
  `docs/findings/2026-11-12-aeo-tab-page-time-limit.md`; export: 30 seconds, inside the export's 40 second ready budget,
  `components/export/report-element.tsx:43-44`), so a slow pull ends as the section's error card, never a dead page.
- The hourly cache warmer (`app/api/cache-warm/route.ts`, 300 second ceiling, today warming only `last_30_days` base URLs,
  `:56-68`) gains, for each opted-in client, the three views of the newest month a client viewer is served: at most three
  renders of up to 55 seconds each. So client views and exports normally hit a warm cache.
- The export's stamp shows the window actually rendered (Month, YTD or All time), not only the served month
  (`app/export/[clientSlug]/[section]/page.tsx:52-53,71`).
- A month whose window has no chats is a gate error in the adapter (`view.no-chats`, `gate.ts:79,318`); the section shows
  "No data for this window." for it instead of the error card.
- A failed pull or a gate error shows the section's error card (the existing `Fallback`) and logs the slug, the view and
  the error name, never the key or the project id.

## 5. Feedback changes to the adapter and the tables

- **Citation rate (R11)**: a row's citations divided by its retrievals, `null` when retrievals are 0 (shown as the table's empty mark). It can
  exceed 100% (a source can be cited more than once per retrieval: the outline's URL Gaps screenshot has 220 citations on
  145 retrievals, 152%), so its contract field has a minimum of 0 and no maximum, unlike the adapter's 0 to 1 percentages
  (`gate.ts:74,289`), and it displays as a whole percent above 100. Added
  to `SocialsRow` and `GapRow` with its change in points against the previous window. "Retrieved" is removed from the
  two socials tables. Column order in all three tables ends Retrievals, Total citations, Citation rate; URL Gaps keeps
  its Citation share and Citation position before them (URL Gaps never had "Retrieved"; adding the rate there is our
  reading of "New order: Retrievals, total citations, citation rate", so all three tables end the same way). `retrievedPct` stays in the adapter result (nothing on the
  page reads it), so the adapter's contract and gate do not lose a checked field.
- **Totals (R7)**, over the Renaissance Only Socials rows for the window (the client's own channels: "similar to OS",
  C0, means the client's own social performance, which is what the Organic Social tiles show):
  - Total URLs cited: rows with at least one citation.
  - Total retrievals: the sum of retrievals.
  - Total citations: the sum of citations.
  - Average citation rate: total citations divided by total retrievals (a weighted average, so a URL retrieved once
    cannot swing it; our reading of "average", stated in the tile's tooltip); the empty mark when total retrievals are 0.
- The feedback names the screenshots' cut-off "Total" column as total citations, so `pdf_columns_cropped` leaves
  `meta.unverified` and the column map marks it exact.
  Computed in the adapter as `totals` (with previous-window values for the Month change), checked by new gate rules
  (each total recounted from the raw rows; the rate equals citations over retrievals), added to `contract.ts`, the
  generated YAML regenerated.

## Edge cases

| Case | Behaviour |
|---|---|
| Client without the key, or without a Peec project | no tab; nothing else changes |
| Key set, project missing | no tab, one warning logged |
| `aeo` missing or unknown | Month |
| First day of the team's in-progress month | "No data for <Month> yet." for staff |
| A window with no chats | "No data for this window." |
| Citation rate above 100% | shown as is, e.g. 152% |
| Min competitors changed | a fresh (cached) pull with `gap >= n` |
| Uncached YTD in a PDF export | the 30 second deadline ends as the error card; the warmer normally prevents it |
| Malformed `aeoInformedSocial` setting | no tab, one warning |
| Month with no own-channel rows | tiles show 0 and the empty mark; tables show their empty state |
| A row with 0 retrievals | citation rate shows the empty mark, no change shown |
| YTD or All time | no change columns, no tile changes |
| Peec 401, 429 after retries, timeout, gate error | section error card, logged; the rest of the page renders |
| Instagram has no data | the "No source data" card |
| Client viewer on a month not yet open | the page serves their newest open month, as every tab does |
| PDF export | same content; the export route passes `aeo` |
| Tab hidden in `hidden_reports` | no tab |

## Tests (written first)

Adapter: citation rate and its change (0 retrievals, new URL, normal); totals and their previous values; gate rules for
both, each proven to fire; contract and YAML drift. Tabs: the tab appears only with the key and a project, last in the
list, hidden by `hidden_reports`; no current client's tab list changes. Section: order of blocks; graph titles and four
distinct colors; tiles and their Month-only changes; column order of each table; defaults (your channels, min 2); the
`aeo` param (three values, unknown, missing); error card on a failed pull with a log line that holds no key or project
id; export passes `aeo`. Commentary: the new view key is separate. Also: the as-of clamp and day 1 of a month; a
rate over 100%; `minCompetitors` sends `gap >= n` and share adds to 100%; the page title on every route and the export;
the trimmed portal and export records hold the boolean and never the project id; the lock sweep skips the tab; the
warmer adds three views per opted-in client; "No source data"; paging at 14 rows, search, sort; Mentions dots; the
export stamp; the fourth graph follows `fourthGraph`.

## Not in this PR

Switching the tab on for any client (section 1). Logos (Peec has none). A definition of Competitor Socials beyond
registered competitor channels.
