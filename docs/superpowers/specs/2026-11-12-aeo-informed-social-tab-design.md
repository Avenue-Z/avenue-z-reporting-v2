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
- **Opt in, per client, default off.** The tab exists only when `dash_social_config.aeoInformedSocial === true` and the
  client has `peec_customer_project_id` (`lib/db/schema.ts:219`), and it is not in `hidden_reports`. No client has the
  key today, so no client's tabs, pages or behaviour change when this ships (read-only check before merge: list every
  client whose tabs change; expected none).
- **Renaissance.** The outline is a Renaissance report, and Renaissance is the only client whose Peec project the adapter
  was proven on (production and staging both carry it). Switching it on writes Renaissance's row and adds a tab to its
  page, which the Renaissance rule forbids without my explicit go, in any environment. So the switch-on is its own
  step: staging first for the team to see, production later, each a guarded one-field write with a rollback, and only on
  my go.
- Insights is the shared commentary header every Organic Social tab uses (`components/report-sections/organic-social/index.tsx:45,50`),
  with its own view key `organic-social:aeo-informed` added to `CommentaryViewKey` (`lib/commentary/views.ts:16-26`) and
  `COMMENTARY_VIEWS` (`:101`), so its Insights and Recommendations are separate from the other tabs'.
- The body renders a dedicated section component for this view (no DB template row, so no write to `section_templates` in
  any environment); the Influencer view's part-registry route is not needed because the tab has one fixed layout.

## 2. Date range

- A three-way control on the tab: **Month** (default), **YTD**, **All time**, held in the URL as `aeo=month|ytd|all`
  (any other value is `month`). The dashboard, portal and export routes pass it through like `subsection`.
- **Month** is the month the page already serves: the locked month for a client on reporting months, otherwise the
  calendar month of the range's last day. Tables compare with the previous calendar month (MoM).
- **YTD** runs January 1 to the end of the served month; **All time** runs from the project's first data day to the end
  of the served month. Neither shows change columns: their previous windows hold little or no data (measured: the
  project's data starts 2026-01-22, so YTD's previous window is empty).
- Every window ends on the served month's end (or the team's in-progress day), so a client never sees data from a month
  that has not opened to them, by the same rule as every other tab.
- Graphs bucket weekly from the window's start; the adapter's `asOf` is the window's last day, so a bucket running past
  it is cut there and marked partial (`aeo-informed/graphs.ts:32-37`).

## 3. What the tab shows, top to bottom

1. **Insights** (shared header, section 1).
2. **Graphs**, two across, the outline's four titles verbatim (P018 to P021). Each graph its own color: the two
   all-platform graphs in colors no channel uses (green `CHART_COLORS.googleAds`, yellow `CHART_COLORS.email`,
   `lib/constants.ts:6-30`), LinkedIn in the LinkedIn line color and Instagram in the Instagram line color the other
   Organic Social graphs use (`components/report-sections/organic-social/trends.tsx:19-30`), so a channel keeps its
   color across tabs. Instagram with no data shows the outline's "No source data" card.
3. **Totals**, before the tables (R7): four tiles in the Organic Social KPI tile style: Total URLs cited, Total
   retrievals, Total citations, Average citation rate (definitions in section 5). In Month view each shows its change
   against the previous month like the other tiles; not in YTD or All time.
4. **Renaissance Only Socials**: default "your channels only" (P029), with a switch to all tagged URLs (the outline's
   screenshot shows all of them). The brand name in the title and column comes from the client's own brand in Peec.
5. **Competitor Socials**: tagged channels Peec has registered to a competitor brand. The outline's filter sentence is
   cut off (P032), so this is our reading, written on the page in one line.
6. **URL Gaps**: default min 2 competitors (P035), with the min control (1 to 5).

Tables page 14 rows at a time like the outline's screenshots (71 pages for 987 rows, 32 for 442), with search and the
sort arrows the screenshots show. Mentions shows one colored dot per brand: Peec returns brand colors, not logos.

## 4. Data

- One call per view to `getAeoInformedSocial` (`aeo-informed/index.ts`), gate enforced, with the client's
  `peec_customer_project_id` and the existing `PEEC_AI_CUSTOMER_TOKEN` (`.env.example:48`). No new secret.
- Selector: the "Organic Social" domain classification (R3); indicators untouched (R4).
- Cached per (project, windows) with `cached()` (`lib/cache.ts`), health-critical, so a failure shows in the beacon.
  Finished months are cached 6 hours, the in-progress month 1 hour.
- Speed: a live call took 8 to 10 seconds for a month and 39 to 55 seconds for YTD or All time (2026-11-09 runs). The
  section renders behind its own Suspense with a skeleton, and the hourly cache warmer (`app/api/cache-warm`, 300 second
  ceiling) warms the served month's three views for every opted-in client. Whether a cold YTD render fits the page's
  time limit on Vercel is the open question for the scratch trial.
- A failed pull or a gate error shows the section's error card (the existing `Fallback`) and logs the slug, the view and
  the error name, never the key or the project id.

## 5. Feedback changes to the adapter and the tables

- **Citation rate (R11)**: a row's citations divided by its retrievals, `null` when retrievals are 0 (shown as the table's empty mark). Added
  to `SocialsRow` and `GapRow` with its change in points against the previous window. "Retrieved" is removed from the
  two socials tables. Column order in all three tables ends Retrievals, Total citations, Citation rate; URL Gaps keeps
  its Citation share and Citation position before them. `retrievedPct` stays in the adapter result (nothing on the
  page reads it), so the adapter's contract and gate do not lose a checked field.
- **Totals (R7)**, over the Renaissance Only Socials rows for the window (the client's own channels: "similar to OS",
  C0, means the client's own social performance, which is what the Organic Social tiles show):
  - Total URLs cited: rows with at least one citation.
  - Total retrievals: the sum of retrievals.
  - Total citations: the sum of citations.
  - Average citation rate: total citations divided by total retrievals (a weighted average, so a URL retrieved once
    cannot swing it); the empty mark when total retrievals are 0.
  Computed in the adapter as `totals` (with previous-window values for the Month change), checked by new gate rules
  (each total recounted from the raw rows; the rate equals citations over retrievals), added to `contract.ts`, the
  generated YAML regenerated.

## Edge cases

| Case | Behaviour |
|---|---|
| Client without the key, or without a Peec project | no tab; nothing else changes |
| Key set, project missing | no tab, one warning logged |
| `aeo` missing or unknown | Month |
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
id; export passes `aeo`. Commentary: the new view key is separate.

## Not in this PR

Switching the tab on for any client (section 1). Logos (Peec has none). A definition of Competitor Socials beyond
registered competitor channels.
