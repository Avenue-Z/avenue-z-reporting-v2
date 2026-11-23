# Organic Social design overhaul: design and decisions

Date: 2026-11-23. Status: design and decisions, for Paul's review before any work starts. The step-by-step plan is written
only after section 8 is settled. No code, no data, no setting changes in this PR. Revised after Paul's review on #484
(2026-11-23).

## 1. Why

The team asked for the rest of Organic Social to get the look the Social Listening tab has.

- **The 11-19 call with Jasmine and Savannah.** On seeing the Social Listening mockup, Jasmine asked "why does this look
  nicer than our organic social performance dashboards?" (06:20), said the boxes and the shading look "really premium"
  (07:29), and asked "that we do the same for performance" (07:46). She also said the analysis boxes
  "throughout would be more helpful than the insights in the top" (19:05), and agreed Organic Social goes first as the
  test case ("guinea pig us first", 21:56).
- **Slack, 2026-11-20, 12:08 PM**, after she reviewed staging: "when are u going to make the performance reports look
  this elevated".

**What "performance reports" means:** the Organic Social performance tabs, the ones she compared the mockup to on the
call (06:20). Today that is Overview, Influencer, Instagram, Facebook, LinkedIn, X, TikTok and AEO Informed Social
(`ORGANIC_SOCIAL_SUBSECTIONS`, `lib/constants.ts:206-228`). Social Listening already has the look. Other departments' reports are out of scope.

## 2. Where the look comes from (verified 2026-11-23)

1. **The mockup.** `docs/social-listening/mock.template.html`, filled by `docs/social-listening/build.py` and published
   as the private artifact the team reviewed: claude.ai/artifact/Wa1yh2FgKLLjabYVXRRuw1. The live version was published
   2026-11-19 at 10:52 and is byte for byte the local build of that minute (checked 2026-11-23). It is the only version
   the artifact serves. An earlier local build (10:46) exists in my private folder; which of the two was on screen during
   the 11-19 call is not recorded, so the 10:52 version is the reference here. Its colours, font and card sizes were copied
   from the app itself (`app/globals.css`, `components/charts/kpi-card.tsx`, `components/charts/chart-card.tsx`, per
   `docs/social-listening/README.md` and the artifact's own comments), so it is the app's palette, treated differently.
2. **The port into the app (PR #468), scoped to the Social Listening tab only.** All under
   `components/report-sections/organic-social/social-listening/`:
   - `sl.module.css`: the mockup's page rules as a CSS module, so nothing can reach another page.
   - `artifact-charts.tsx`: the mockup's chart functions as server components.
   - `cards.tsx`: the section, card and staff-note frames. A card's analysis box sits inside the card, under its chart.
   - `analysis.tsx` (`SlAnalysis`): the analysis box, a drop-in for `CommentaryPanel` (same props, same commentary
     actions), passed through the `Panel` prop of `monthlyCommentary` (`components/report-sections/commentary/monthly.tsx:21-26`).
   - `posts.tsx`, `pills.tsx`, `trends.tsx`, `upload.tsx`: the posts, topic pills and preview toggle, theme trends and
     upload slot.
3. **Staging matches the artifact, element by element (checked 2026-11-23).**

   **Styles.** The artifact's stylesheet against `sl.module.css`, rule by rule: 105 rules identical. 12 differ in small,
   deliberate ways: real buttons get a pointer cursor, two rules leave their top spacing to the page, the word cloud uses
   the mockup's wide variant, form fonts inherit the same font instead of naming it, the analysis button uses `!important`
   to beat the shared button style, wide tables get a thin scrollbar, post notes keep their line breaks and post links
   are underlined. The artifact's other rules draw its stand-in sidebar, header and month picker (the app draws its own),
   or were renamed for the module (`.chip.Positive` is `.chipPositive`, `.tbtn.primary` is `.primary`, the preview rules
   under `body.preview` are the client view's `.commClient`).

   **Charts.** Every chart function in the artifact has a counterpart in `artifact-charts.tsx`, and every number in each
   one (sizes, padding, opacities, the gradient stops) is the same. The only difference is the year, written as "2026" in
   the mockup and taken from the data on staging.

   | Artifact function | Staging | What it draws |
   |---|---|---|
   | `kpi`, `change` | `Kpi`, `Change` | Data tile with its change line |
   | `lineChart` | `LineChart` | Line with the shaded fill (gradient 0.35 to 0), dashed grid, peak label |
   | `donut`, `legend` | `Donut`, `Legend` | Sentiment donut and its legend |
   | `hbars` (with its colour key) | `HBars`, `Key` | Horizontal stacked bars (sentiment by media type) and the colour key also used under the year-to-date and daily charts |
   | `ytdColumns` | `YtdColumns` | Year-to-date stacked columns |
   | `pointLines` | `PointLines` | Year-to-date lines with points |
   | `dailyStack` | `DailyStack` | Sentiment over time, stacked by day |
   | `cloud` | `Cloud` | Keyword cloud |
   | `renderComm`, `openEditor` | `SlAnalysis` (`analysis.tsx`) | Analysis box: tinted card, small label, dashed "+ Add analysis", plain text editor |
   | `postCard`, `postForm`, `renderGroup` | `posts.tsx` | Post cards with screenshots, the add-post form, grouped scrolling rows |
   | preview toggle (`body.preview`) | `PreviewToggle` (`pills.tsx`) | "Preview as client" |

   **Sections and cards.** All 31 headings in the artifact (brand and industry) are on staging in the same order. Three
   differences, all deliberate: "Without APFM's own channels" is "Without brand-owned channels" (no client name in code);
   two titles are built from the data ("Sentiment, January to October" from the year-to-date span, "Top 5 authors" from the
   number of authors); and staging adds the Keyword appendix section Jasmine asked for on the call (08:22).

   **On screen.** Clicked through the APFM Social Listening tab on staging: the cards, the shaded line chart and
   "+ Add analysis" inside each card, as in the artifact.
4. **One gap, and it is app-wide.** The artifact has a soft teal and purple glow behind the page. The app means to have
   the same glow (`.bg-glow`, `app/globals.css:234-240`, on `<body>` in `app/layout.tsx:31`), but that rule is invalid
   CSS (no commas between the layers, and the colour is listed first instead of last), so browsers drop it. On staging
   the body's computed `background-image` is `none` on every page. Fixing it changes every page of every report, so it is
   a decision of its own (section 8).

## 3. What the other Organic Social tabs draw today, and the artifact element each would take

Seen on staging (APFM Instagram, 2026-11-23) and read from the code. The right-hand column is a proposal: the artifact
element closest to each part. Where the artifact has nothing like the part, it says so; those need a design decision, not
a guess.

**The two differences you can see at a glance:**

- **Analysis.** Social Listening: a small, softly tinted box inside each chart card, dashed "+ Add analysis" when empty,
  small buttons. Other tabs: one large Insights panel at the top of the tab with solid cyan Edit, Approve and Delete
  buttons.
- **Line charts.** Social Listening: shaded fill under the line, dashed grid, peak labelled, no inner frame. Other tabs:
  Recharts `Line` with no fill (`components/charts/line-chart.tsx:404`), drawn inside its own bordered box (`:440`,
  `:482`), so inside a chart card it is a box within a box (`components/charts/chart-card.tsx:19`).

**Every part, under `components/report-sections/organic-social/`:**

| Part | Draws through today | Closest artifact element |
|---|---|---|
| Insights (top of each tab) and Recommendations (bottom, `SHARED_PART_PLACEMENT`, `components/report-sections/shared/parts/registry.tsx:45-48`) | `CommentarySection` via the shared parts registry, then `monthlyCommentary`, which draws `CommentaryPanel` | The look of `renderComm` (`SlAnalysis`), but not its editor: see section 5 and decision (a) |
| Data tiles (`outline-tiles.tsx`, `platform-headlines.tsx`, `parts/platform-headlines.tsx`, `parts/outline-data.tsx`, `parts/engagement-breakdown.tsx`) | `components/charts/kpi-card` | `kpi` and `change`, with two visible differences: the shared tile has a hover tooltip (`components/charts/kpi-card.tsx:49`) and shows a greyed dash and "vs prior period" when there is no prior value (`:73`); the Social Listening `Change` has no tooltip and shows "n/a" (`social-listening/artifact-charts.tsx:35`) |
| Followers and engagement graphs (`parts/follower-graph.tsx`, `parts/engagement-trend.tsx`, `trends.tsx`) | `ChannelTrendChart` in `trends.tsx`, on `components/charts/line-chart` (Recharts) | `lineChart`. **No artifact equivalent** for the annotations, chart notes and channel toggles these graphs carry |
| YTD Review (`parts/ytd-review*.tsx`) | `components/charts/bar-chart`, `line-chart`, `chart-card` | `ytdColumns` and `pointLines` (shape only: the artifact's are sentiment shares, these are counts) |
| Top Content (`parts/top-content*.tsx`, `sortable-top-content.tsx`, `post-card.tsx`, `top-content.tsx`) | Post cards; `components/charts/data-table` on the table view | The artifact's post card (`postCard`) and table styles for the frame. **No artifact equivalent** for the sort toolbar, the owned and influencer designation, or post metrics |
| Influencer tab (`parts/influencer-posts.tsx`, `influencer-grid.tsx`, `influencer-card.tsx`) | `kpi-card`, influencer cards built on `post-card.tsx` | `kpi` for the tiles, post card frame for the cards. Same gaps as Top Content |
| KPI Check-In (`parts/kpi-check-in.tsx`) | `components/charts/progress-ring` | **No artifact equivalent** (the artifact has no rings). Card frame only |
| AEO Informed Social (`aeo-informed/*.tsx`) | `kpi-card`; its graphs use Recharts directly (`aeo-informed/graphs.tsx:8`), borrowing only `formatMonthDay` and the channel colours (`:14-15`); its own table | `kpi`, `lineChart`, the artifact's table styles. Not on the parts system (`organic-social/index.tsx:107`) |
| Month picker, range control, sort toolbar | Their own buttons and selects | The artifact's pill and button styles (`.pill`, `.btn`) |

**The Social Listening charts are sentiment-specific.** `LineChart` takes one series of daily results (`SlDay[]`,
`social-listening/artifact-charts.tsx:64`) with no tooltip. `Donut`, `HBars`, `YtdColumns` and `DailyStack` are typed for
positive, neutral and negative (`:96`, `:130`, `:171`, `:234`). So extracting them gives a sentiment kit; drawing
follower, view or engagement data in that style is new code this work owns, not a move.

## 4. The constraint that shapes the plan

The Organic Social tabs draw through the shared chart kit in `components/charts/`, which other departments' reports use
too (measured 2026-11-23, files importing each, tests excluded):

| Component | Organic Social files | Files elsewhere |
|---|---|---|
| `kpi-card` | 4 | 21 |
| `data-table` | 1 | 12 |
| `bar-chart` | 2 | 7 |
| `chart-card` | 2 | 3 |
| `line-chart` | 4 | 1 |
| `progress-ring`, `hover-hint` | 1, 2 | 0 |

Outside Organic Social, `kpi-card` is used in 21 files across 20 report sections (GA4, Executive Summary, Paid Search,
Meta, LinkedIn, Shopify and others), `data-table` by 10 sections and the configurable dashboard, `bar-chart` by 7 paid and email
sections, `chart-card` only by the configurable dashboard's blocks (`components/dashboard/blocks/`), and `line-chart`
by Paid Media. So restyling those files in place would change other departments' reports without anyone asking.
`progress-ring` and `hover-hint` have no users outside Organic Social, so they can be edited in place. Everything else
stays inside Organic Social, the same way Social Listening did, or uses an additive, default-off prop (section 7).

## 5. How the analysis boxes save today, and what per-chart boxes would change

Read from the code and a read-only count of production (2026-11-23). No change is made here.

**One table for every box.** `report_commentary` (`lib/db/schema.ts:351-379`): one row per entry, with the client, the
box (`view_key`), the text, its own reporting period (`period_start`, `period_end`, separate from the page's date
picker), `draft` or `approved`, and who wrote and approved it. Editing an approved entry adds a new draft row and the
client keeps the approved one until the new one is approved. Nothing is ever deleted (drafts are soft deleted), so every
version stays in the approver history. The Insights box and the Recommendations box are the same thing under two keys
(for example `organic-social:instagram` and `organic-social:instagram:recommendations`, `lib/commentary/views.ts`).
Insights renders at the top of a tab and Recommendations at the bottom (`SHARED_PART_PLACEMENT`,
`components/report-sections/shared/parts/registry.tsx:45-48`).

**Two ways a box picks its text:**

| | Free range | Month mode |
|---|---|---|
| Used by | Every box outside Organic Social (Renaissance's AEO, PR Influence, Paid Search, Meta, LinkedIn), and any Organic Social box for a client without locked months (none in production) | Every Organic Social box for a client on locked months (`components/report-sections/commentary/index.tsx:21-23`), which is all six Organic Social clients in production |
| Drawn by | `CommentaryPanel` (`index.tsx:25-62`) | `monthlyCommentary` (`components/report-sections/commentary/monthly.tsx`), which renders `CommentaryPanel` by default |
| The period | Staff type any start and end date (`commentary-editor.tsx:106-111`) | The editor starts on the month on screen (`lib/commentary/initial-period.ts`); the dates can still be changed |
| The entry dropdown | Every period ever written; "latest" is the newest period (`pickDefaultEntry`, `lib/commentary/select.ts:75`) | Only entries whose period starts in the month on screen (`lib/commentary/month.ts:12-14`); a whole-month entry wins (`:17-20`) |
| What a client sees | The newest approved entry | The approved entry for the month on screen, and nothing past the newest month open to them (`monthly.tsx:44`, `month.ts:25-29`) |

**Production today:** 82 entries, 6 clients, 17 boxes. Every Organic Social entry covers exactly one whole calendar
month. Only two entries in the whole table cover anything else, and both are Renaissance boxes outside Organic Social
(Paid Search and AEO PR Influence). So the custom date range is used, rarely, on the other service lines, and never on
Organic Social.

**Does analysis carry over month to month?** It stays with its month: saved for good, shown whenever that month is
picked, with its full history. It does not copy into the next month. A new month's box starts empty, because the text is
about that month. If the team wants last month's text offered as a starting draft, that is a new behaviour and a
decision (section 8).

**The Social Listening box is a plain-text editor, so it cannot simply replace today's.** It converts text to HTML
and back, keeping only `h3`, `p` and `li` (`lib/organic-social/social-listening/analysis-text.ts:25`) and stripping
every tag inside them (`:28`). Today's Tiptap editor saves `strong`, `em`, `ul`, `ol` and `a`
(`lib/commentary/sanitize.ts:7`). A read-only count of production (2026-11-23): all 69 live Organic Social entries
use formatting the plain-text box would drop on edit (65 lists, 25 italic, 18 links, 14 bold). It also lacks the
Insights outline starter (`INSIGHTS_OUTLINE`, `lib/commentary/labels.ts:12-22`), the entry dropdown and the full
"Last updated by / Approved by" line (`components/report-sections/commentary/commentary-panel.tsx:115-155`). Decision (a).

**What per-chart boxes would change (Phase 3):**

- **New box names, same table, no migration.** `view_key` is plain text, so the table needs no change. Each key must be
  added to the `CommentaryViewKey` type (`lib/commentary/views.ts:21-33`) and registered in `COMMENTARY_VIEWS`, because
  the save action refuses an unknown key (`isCommentaryViewKey`, `:135`). The scheme needs care: Overview's key is the
  bare `organic-social`, so `organic-social:<chart>` would collide with the tab keys, and a prefix read of
  `organic-social:` would pull every box, Social Listening's 26 included; a tab prefix such as `organic-social:instagram:`
  also matches `organic-social:instagram:recommendations`. Decision (c).
- **Same rules as today.** Drafts, approval, history, the client cutoff and the PDF all come from the same code, as they
  already do on Social Listening.
- **One read per tab.** Social Listening reads all its boxes in one query (`getCommentaryForViewPrefix`,
  `lib/db/queries.ts:306-316`) instead of one per box. That query returns every month for the prefix, so it grows with
  boxes times months times versions per client. Small today (82 rows in the whole table). Limiting it to the months on
  screen would cut the approver history, which `monthlyCommentary` builds from every month (`monthly.tsx:54`).
- **The existing Insights and Recommendations stay readable.** August to October analysis lives under the current keys.
  If those boxes are removed, that text disappears from the page (it is still in the table). So they must keep showing
  any month that has text; whether they stay for new months too is a decision (section 8).
- **No custom dates on the new boxes.** The Social Listening box has no date fields and always saves the whole month on
  screen (`components/report-sections/organic-social/social-listening/analysis.tsx:73`). For Organic Social that matches
  every entry in production.
- **Other service lines do not change.** Renaissance's AEO and paid boxes keep the free-range panel. The change sits
  behind the Organic Social and locked-months check (`index.tsx:21`), as month mode already does.
- **More to write each month.** Today a tab has two boxes a month; with per-chart boxes it has one more for every chart.
  That changes the team's routine, which is why the call said Matty and Nick hear about it first (20:30).

## 6. Proposed approach

**One Organic Social design kit, built from what Social Listening already proved.**

1. **Phase 0, extract (no visual change).** First add render snapshots of the Social Listening brand view, industry view
   and export from fixtures on `dev`: today there are none (no `__snapshots__` under `social-listening/`;
   `artifact-charts.tsx` and `cards.tsx` have no tests; `section.test.tsx` mocks `monthlyCommentary` and checks
   structure only). Then move the frames, charts and stylesheet into a shared Organic Social kit (for example
   `components/report-sections/organic-social/design/`) and switch Social Listening to it; those new snapshots must not
   change. The kit is sentiment-specific (section 3); generalising it for follower, view and engagement data is new code.
2. **Phase 1, the look, one part version at a time (numbers unchanged).** The parts render on more than one tab:
   every platform tab shares the `organic-social:platform` template, and Overview uses the same parts
   (`organic-social/index.tsx:143`). So the unit is a **new version of a part** (for example `top-content@4`), registered
   beside the old ones in `components/report-sections/organic-social/parts/registry.ts` with the old version's file left
   untouched (`components/report-sections/peec-ai/MAINTAINING.md`), plus one change for AEO Informed Social, which is not
   on the parts system (`organic-social/index.tsx:107`). Only how a number is drawn changes, never which number: same
   getters, same requests, same locked months.
3. **Phase 2, the analysis box look. Not look-only: it depends on decision (a).** The Social Listening box is plain
   text and would drop the formatting every existing Organic Social entry uses (section 5). Paul's suggestion: keep the
   Tiptap `CommentaryEditor`, the outline starter, the entry dropdown and the attribution line, inside a panel styled
   like Social Listening. The boxes reach `monthlyCommentary` through the shared parts registry
   (`components/report-sections/shared/parts/registry.tsx:19-35`) and `CommentarySection`
   (`components/report-sections/commentary/index.tsx:15-22`), which other reports share. The cleanest route Paul names is
   a `commentary@2` shared part, pinned per client through `sharedParts`, so every other report keeps `CommentaryPanel`.
4. **Phase 3, analysis inside each chart (a decision, not assumed; storage in section 5).** Jasmine wants analysis
   next to each chart instead of one panel at the top (19:05). That adds new boxes per chart, which changes how the team
   writes up a month: per the call Matty and Nick hear about it first (20:30), and Kyleah signs off (decision 3).
   Proposed for Organic Social only, as the test case she agreed to.

**Rollout, per client: part versions, not a new flag.** A client gets the new look by pinning the new part versions in
its `report_section_config[<key>].versions` (`lib/report-sections/resolve.ts:44`), the mechanism Organic Social already
uses. A separate `design` flag would add branches inside existing versions and break "a client not pinned to a new
version renders byte for byte as today" (section 7). A setting is needed only for AEO Informed Social, which is not on the parts system. A frozen
snapshot ignores `versions` (`resolve.ts:9-11`, `:44`); read-only check of production (2026-11-23): no client's Organic
Social config is frozen. Order: APFM on staging, Jasmine's review, then the other Organic Social clients, Renaissance
last.

**Renaissance.** In scope, as asked, but last, and only with a proof that every number and every request is unchanged
(a read-only before and after capture of Renaissance's numbers on each tab, plus the value tests in section 7), plus
my explicit go. Nothing ships to production without Jasmine's approval on staging.

**How it ships.** Each part version, and the AEO Informed Social change, is its own feature branch off `dev` with its own
PR and its own review record (`docs/qa/<feature>-code-review.md`, CLAUDE.md Stage 1), standing alone and mergeable in
any order. No stacking: when one piece needs another, it waits until that one has merged to `dev`, then branches from
the updated `dev`. A deliverable branch is not an option today: the shared base-branch guard (`checks / checks`, the
template's `check-base-branch.sh` at `v1`) lets a `feat/`, `fix/` or `docs/` branch target only `dev` and fails any other
branch name. It reached this repo on 2026-09-28 (`5cec064c`), after the September `organic-social-october` branch.
From `dev`, the work walks `staging` (Jasmine's QA) and `main` as usual.

## 7. Checks every PR must pass

- **Files.** Changes stay under `components/report-sections/organic-social/`, except these, each named in its PR:
  `components/charts/progress-ring.tsx` and `hover-hint.tsx` (no users outside Organic Social);
  `components/charts/line-chart.tsx` only if decision (b) picks an additive prop, which must be default-off and leave
  every other user's tests and goldens unchanged; `components/report-sections/commentary/index.tsx` or
  `components/report-sections/shared/parts/registry.tsx` for Phase 2; `lib/commentary/views.ts` for Phase 3;
  `app/dashboard/[clientSlug]/reports/page.tsx` and `app/portal/[clientSlug]/reports/page.tsx` only if decision (e)
  extends "Preview as client" (`slPreview`, `slview=client`, `:145` and `:180`).
- **Standard gates.** `npx tsc --noEmit`, `npm test`, `npm run lint` and `npm run check:rsc` (it scans test files too).
- **Numbers unchanged, proven by values, not markup.** The Organic Social goldens are markup snapshots, which change by
  design with the look (and `top-content.golden` captures only the loading skeleton). So old versions' goldens stay
  untouched, and each new part version gets a test that renders the old and new versions on the same fixture and
  asserts the same values and labels.
- **Empty and error states kept.** Each part keeps `NoData`, `ytd-failure` and its `Suspense`/`safe()` wrapper. The
  Social Listening `LineChart` returns nothing on empty data (`social-listening/artifact-charts.tsx:67`), a blank card,
  so any reuse adds an empty state.
- **Templates.** No `section_templates` change unless a new part id is added; if one is, append the row by hand and
  never run `scripts/seed.ts`.
- The PDF export still prints every card as one block (`data-export-block`), and the client view and "Preview as client"
  still hide every staff-only control.
- A client not pinned to a new version renders byte for byte as today.

## 8. Decisions before any work starts

Each decision lists Paul's recommendation from his #484 review. Decisions 1, 3, 6 and 7 are product calls: they are
settled from what Jasmine has already said where she has said it (the 11-19 call, cited in section 1), not by sending
her new questions, and Kyleah is brought in before Phase 3 because the Organic Social boxes list "Jasmine / Kyleah" as
owners (`lib/commentary/views.ts:94-126`).

1. **Timing versus the design team.** Paul said on the call the dashboards get design passes from Serge and the design
   team when they become a Q1 focus (06:58). *Paul's recommendation:* go now on Phases 0 to 2; the look reuses our own
   tokens, and an extracted kit gives the design team one place to change later. Product call.
2. **Chart engine.** *Paul's recommendation:* hybrid. Restyle Recharts for the interactive trend graphs (the channel
   toggles, callouts, notes and tooltips live there); use the SVG style for the static year-to-date columns and the tiles.
   Depends on (b).
3. **Phase 3, analysis inside each chart.** *Paul's recommendation:* later. It needs (a), (c) and Kyleah's sign-off first,
   and it reverses the original scope of one commentary stream per view ("one overall summary per service view is enough
   for the first version", `docs/superpowers/specs/2026-07-06-report-commentary-design.md:59-61`). Product call.
4. **The glow.** *Paul's recommendation:* leave it and file an issue; an app-wide fix changes every department and
   possibly the PDF.
5. **The gate.** *Paul's recommendation:* keep the client order, gate on part versions (section 6), and use a setting
   only for the views not on the parts system.
6. **The top boxes.** *Paul's recommendation:* treat them separately. Insights shows past months only, once per-chart
   boxes ship for that client. Recommendations stays: it is forward-looking and already renders at the bottom. Product
   call.
7. **Carry-over.** *Paul's recommendation:* stay empty. The text is about its month, and carried-over text risks being
   approved unchanged. Product call.
8. **The read.** *Paul's recommendation:* keep one query per tab, with a per-tab prefix, not `organic-social:`. Limiting it
   to the months on screen would cut the approver history (section 5).

**Decisions the first draft assumed but did not list (Paul):**

- **(a) The editor for the restyled boxes.** Keep the Tiptap `CommentaryEditor` inside a panel styled like Social
  Listening, or accept the plain-text box and the formatting loss on edit (section 5: all 69 live entries affected).
- **(b) The shared line chart.** Fork `components/charts/line-chart.tsx` (496 lines) into Organic Social, or add an
  additive, default-off prop to the shared file. Its frame is hard-coded (`:440`, `:482`) and it draws only `<Line>`
  (`:402`); a shaded fill needs `<Area>`. `trends.tsx:4`, `parts/ytd-review.tsx:9` and `parts/ytd-review-sheet.tsx:10`
  all render it.
- **(c) The per-chart key scheme and owner labels.** Paul suggests `organic-social:<tab>:chart:<id>`, with an explicit
  `overview` segment and `recommendations` reserved (section 5).
- **(d) Controls with no artifact equivalent.** The KPI Check-In rings, the graph annotations and chart notes, the
  channel toggles, the Top Content sort toolbar and the owned or influencer designation (section 3).
- **(e) "Preview as client" beyond Social Listening.** If yes, both report pages change (section 7).
- **(f) Which part versions get restyled.** Only those pinned in production (read-only, 2026-11-23). Client overrides:
  `top-content@3`, `follower-graph@2`, `engagement-trend@2`, `platform-headlines@2` and `@3`,
  `engagement-breakdown@1`, `ytd-review@2` and `@4`, and `kpi-check-in@1` on APFM's Overview. Template defaults that
  clients without an override get: Overview `platform-headlines@1`, `engagement-trend@1`, `top-content@2`; platform tabs
  also `follower-graph@1`; Influencer `influencer-posts@1` (`organic-social/template.ts:34`, no production row).

## 9. Not in scope

Any other department's report, any number or data source, the PDF layout beyond keeping it working, light mode (the
light palette exists in `app/globals.css` but nothing renders the theme toggle, `components/theme-toggle.tsx`, so the
app is dark only).
