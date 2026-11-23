# Organic Social design overhaul: plan for review

Date: 2026-11-23. Status: plan only, for Paul's review and approval before any work starts. No code, no data, no
setting changes in this PR.

## 1. Why

The team asked for the rest of Organic Social to get the look the Social Listening tab has.

- **The 11-19 call with Jasmine and Savannah.** On seeing the Social Listening mockup, Jasmine asked "why does this look
  nicer than our organic social performance dashboards?" (06:20), said the boxes and the shading look "really premium" (07:29),
  and asked "that we do the same for performance" (07:46). She also said the analysis boxes
  "throughout would be more helpful than the insights in the top" (19:05), and agreed Organic Social goes first as the
  test case ("guinea pig us first", 21:56).
- **Slack, 2026-11-20, 12:08 PM**, after she reviewed staging: "when are u going to make the performance reports look
  this elevated".

**What "performance reports" means:** the Organic Social performance tabs, the ones she compared the mockup to on the
call (06:20). Today that is Overview, Influencer, Instagram, Facebook, LinkedIn, X, TikTok and AEO Informed Social
(`lib/constants.ts:192-227`). Social Listening already has the look. Other departments' reports are out of scope.

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
   a decision of its own (section 7).

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
| Insights and Recommendations (top of each tab) | `CommentarySection` via the shared parts registry, then `CommentaryPanel` | `renderComm`, the analysis box (`SlAnalysis`) |
| Data tiles (`outline-tiles.tsx`, `platform-headlines.tsx`, `parts/outline-data.tsx`, `parts/engagement-breakdown.tsx`) | `components/charts/kpi-card` | `kpi` and `change` |
| Followers and engagement graphs (`parts/follower-graph.tsx`, `parts/engagement-trend.tsx`, `trends.tsx`) | `ChannelTrendChart` in `trends.tsx`, on `components/charts/line-chart` (Recharts) | `lineChart`. **No artifact equivalent** for the annotations, chart notes and channel toggles these graphs carry |
| YTD Review (`parts/ytd-review*.tsx`) | `components/charts/bar-chart`, `line-chart`, `chart-card` | `ytdColumns` and `pointLines` (shape only: the artifact's are sentiment shares, these are counts) |
| Top Content (`parts/top-content*.tsx`, `sortable-top-content.tsx`, `post-card.tsx`, `top-content.tsx`) | Post cards; `components/charts/data-table` on the table view | The artifact's post card (`postCard`) and table styles for the frame. **No artifact equivalent** for the sort toolbar, the owned and influencer designation, or post metrics |
| Influencer tab (`parts/influencer-posts.tsx`, `influencer-grid.tsx`, `influencer-card.tsx`) | `kpi-card`, influencer cards built on `post-card.tsx` | `kpi` for the tiles, post card frame for the cards. Same gaps as Top Content |
| KPI Check-In (`parts/kpi-check-in.tsx`) | `components/charts/progress-ring` | **No artifact equivalent** (the artifact has no rings). Card frame only |
| AEO Informed Social (`aeo-informed/*.tsx`) | `kpi-card`, `line-chart` via `trends.tsx`, its own table | `kpi`, `lineChart`, the artifact's table styles |
| Month picker, range control, sort toolbar | Their own buttons and selects | The artifact's pill and button styles (`.pill`, `.btn`) |

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

So restyling those shared files would change GA4, Paid Media, Executive Overview and the rest without anyone asking.
The plan keeps every change inside Organic Social, the same way Social Listening did.

## 5. Proposed approach

**One Organic Social design kit, built from what Social Listening already proved.**

1. **Phase 0, extract (no visual change).** Move the Social Listening frames, charts and stylesheet into a shared
   Organic Social kit (for example `components/report-sections/organic-social/design/`). Social Listening switches to the
   kit and must render exactly as today: its existing tests and snapshots are the proof.
2. **Phase 1, the look, tab by tab (numbers unchanged).** Swap each Organic Social tab's frames, tiles and charts to the
   kit: Overview, Influencer, Instagram, Facebook, LinkedIn, X, TikTok, AEO Informed Social. Only how a number is drawn
   changes, never which number: same getters, same requests, same locked months. One PR per tab (or per shared part, such
   as the YTD graphs), each standing alone.
3. **Phase 2, the analysis box look.** Give the existing Insights and Recommendations boxes on these tabs the `SlAnalysis`
   look. They reach `monthlyCommentary` through the shared parts registry
   (`components/report-sections/shared/parts/registry.tsx:19-35`) and `CommentarySection`
   (`components/report-sections/commentary/index.tsx:15-22`), which other reports share, so the new look is passed for
   Organic Social views only and every other report keeps `CommentaryPanel`. Same rows, same approvals, same history; only
   the box looks different.
4. **Phase 3, analysis inside each chart (a decision, not assumed).** Jasmine wants analysis next to each chart instead
   of one panel at the top (19:05). That adds new boxes per chart, which changes how the team writes up a month, and per
   the call it needs Matty and Nick told first (20:30). Proposed for Organic Social only, as the test case she agreed to.

**Rollout, per client.** A setting per client (for example `dashSocialConfig.design: "v2"`), off by default, so today's
look stays until a client is switched on. Order: APFM on staging, Jasmine's review, then the other Organic Social
clients, Renaissance last.

**Renaissance.** In scope, as asked, but last, and only with a proof that every number and every request is unchanged
(the existing Renaissance fingerprint and golden tests), plus my explicit go. Nothing ships to production without
Jasmine's approval on staging.

**How it ships.** One deliverable branch off `dev` for the overhaul, each phase and tab a standalone PR into it, Paul
reviewing each one. The deliverable branch then walks `dev`, `staging` (Jasmine's QA) and `main` as usual.

## 6. Checks every PR must pass

- No file under `components/charts/` or outside Organic Social changes (except the glow, if approved separately).
- Numbers unchanged: same values on screen and in the PDF, proven by the existing golden and snapshot tests plus a
  before and after read of each tab on staging.
- The PDF export still prints every card as one block (`data-export-block`), and the client view and "Preview as client"
  still hide every staff-only control.
- A tab not switched on renders byte for byte as today.

## 7. Decisions for Paul and me before any work starts

1. **Timing versus the design team.** On the call Paul said the dashboards get design passes from Serge and the design
   team when they become a Q1 focus (06:58). Do we roll the Social Listening look out now, or wait for that pass?
2. **Chart engine.** Port the Social Listening SVG charts to the other tabs, or keep Recharts and restyle it inside the
   Organic Social kit (shaded fill, no inner frame)? SVG matches the artifact exactly. Recharts keeps the existing
   tooltips, annotations and chart notes with less change.
3. **Phase 3.** Per-chart analysis boxes now, or after the look ships?
4. **The glow.** Fix `.bg-glow` app-wide (every report changes), keep it Organic Social only, or leave it?
5. **Per-client setting.** Agree the gate and the client order above.

## 8. Not in scope

Any other department's report, any number or data source, the PDF layout beyond keeping it working, light mode (the
light palette exists in `app/globals.css` but nothing renders the theme toggle, `components/theme-toggle.tsx`, so the
app is dark only).
