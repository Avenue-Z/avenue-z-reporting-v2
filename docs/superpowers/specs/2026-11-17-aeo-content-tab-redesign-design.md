# AEO Content Impact redesign, and the competitor move to Overview

Status: draft, 2026-11-17. Written against `origin/dev` @ `551e8969`. Source: the "Dashboard Training Updates for Edit
Requests" feedback from the Renaissance training session (quoted where it decides something). No code changes in this doc.
Reviewed 2026-11-17 by an independent reviewer for inconsistencies, unproven assumptions and deviations from the request;
all 21 findings are applied below (R-n tags point at them).
**Stakeholder feedback, 2026-11-19 (Tina Fleming, Danielle Lopez):** every item approved; D-11, D-12, D-14 and the "Last
updated" column changed as a result; D-20/D-21 added after the build's first measurement (F-n tags: see "Feedback round 1" at the end).

## Why

Content Impact (`/…/reports?section=peec-ai&subsection=content-impact`) is hidden in production for Renaissance and has been
open on staging since 2026-09-08 (`fork/chore/hide-ren-content-impact`, 04ee454f) so the team could review it. The training
session produced a list of changes. This design applies the ones that belong to this tab, and moves the competitor section to
the AEO Overview, so the tab can be QA'd on staging and turned back on.

The tab has to answer two questions for the client: *is the content Avenue Z made or optimized earning AI citations and
traffic?* and *where else on the site is AI attention moving?* It also has to give the Avenue Z team one internal tool:
*which prompts is the brand missing or slipping on, so we know what to write next?*

## What exists today (dev @ 551e8969)

`components/report-sections/peec-ai/content-impact.tsx` (~1,500 lines, one RSC, not on the parts registry) renders, in order:

| Block | Source | Note for this redesign |
|---|---|---|
| AI synopsis | `SHOW_AI_NARRATIVE` | flag is `false`; renders nothing. Untouched. |
| §A KPI strip: Citation Share, Prompt Coverage, AI Referral Traffic, Organic Traffic | Peec + GA4 | "pp" deltas; handled by the separate fix (Non-goals) |
| §B Watched Pages (`PlannedContentPerformanceTable`) | content calendar sheet + GA4 + Peec | row filter is `status.trim().toLowerCase() === 'published'` (~1165). **No date rule.** |
| §C Time-to-first cards | one GA4 query, `pagePath × date × sessionSource`, publish date → today | "First Traffic" = any session, so a team check on launch day reads as 0 days. Takes every calendar row with a path and ISO publish date, whatever its status (~633–636). |
| §D Bot vs Human scatter | Peec Agent Analytics (last 30 days) + GA4 | human axis excludes AI-referred sessions (~717) |
| §E Movers slope chart | Peec URL citations + GA4 | GA4 views are owned paths; the Citation Share view ranks every AI-cited URL, any site (~781–803) |
| §F Fullsite Content Performance (`FullsiteContentPerformanceTable`) | Peec URL citations on owned hosts, `citationCount > 0` | |
| §H Competitor Analysis: H1 domain table, H2 brand-absent competitor URLs | Peec domains, URL citations, coverage | H2 is already URL-level and not blog-filtered, but its column is labelled "Article" |

Other facts this design relies on (verified on dev unless marked):

- **Content calendar** (`lib/content-calendar/client.ts`): every tab of the client's sheet is read and parsed by header aliases;
  rows from all tabs are concatenated with no dedupe (~293). `updateDate` comes from a column whose header matches one of
  `update date`, `last updated`, `updated date`, `refresh date`, `date updated`, `updated`, `last refresh`, `refresh`,
  `optimized date`, `date optimized`, and the cell must parse in `parseCalendarDate` (`lib/content-calendar/date.ts`: ISO or
  `M/D[/YY[YY]]` only; "March 3, 2026" becomes null). URLs may be bare paths (`/blog/x`), kept as is by `normalizeUrl`.
  Renaissance's sheet has no action column; New vs Optimized is guessed from Content Type (`parseContentAction`).
- **Peec fetch caps.** `getUrlCitations` is one `limit: 2000` request (FB-069 left it capped; Renaissance has ~17,081 cited URLs
  in 30 days). `getDomainCoverage` is one `limit: 10000` request dimensioned by `prompt_id × model_id` (`url-citations.ts:641`),
  so for Renaissance it is almost certainly truncated. `fetchAllPages` (`url-citations.ts:199`) exists for paging. **Today's
  per-URL prompt coverage, the Prompt Coverage KPI and H1's coverage column all read the truncated coverage data.**
- **`getUrlCitations(clientSlug)` is called without dates** (`content-impact.tsx:316`), so the current period is a fixed last
  30 days while the prior period follows the picker's compare range (~359).
- **Prompts.** `getPeecOverview` reads `/prompts`, but `TrackedPrompt` (`lib/peec/client.ts:159-177`) keeps no prompt `id`;
  coverage data has only prompt ids. `TrackedPrompt` has `positionByModel` and `priorPositionByModel` (prior = previous period).
- **Overview** renders from the versioned parts registry (`parts/registry.ts`, `template.ts`, `MAINTAINING.md`). It never
  receives `compareRange`; `getPeecOverview` always compares with `previous_period`. `PeecCtx` carries `modelActive` but not the
  `models` list. `resolveSection` (`lib/report-sections/resolve.ts`) applies a client's `extraParts` on top of frozen and
  custom-ordered bases, emitting them after the base ids; ids in the override's `order` are emitted first.
- **Per-client config** lives in `clients.report_section_config`. The key `peec-ai:content-impact` already exists as a viewKey.
  `saveReportSectionConfig` (`app/actions/report-sections.ts:78`) is gated by `canEditDashboard`, which admits
  `INTERNAL_ADMIN`, `INTERNAL_ANALYST` and a `CLIENT_ADMIN` for its own slug; it replaces the section's override with the
  validated one, carrying forward only `sharedParts` (`mergePreservingSharedParts`). `parseOverride`
  (`lib/report-sections/validate.ts`) drops unknown fields.
- **Callers of `ContentImpactReport`:** the dashboard route, the portal route, and the PDF export
  (`components/export/report-element.tsx:42`), which renders with the requester's session.
- **Internal-only precedent:** the `?health=1` panel already renders for internal users only on both routes
  (`dashboard/…/reports/page.tsx:218`, `portal/…/[reportSlug]/page.tsx:142`). R-21.

## Goals

1. One content table with a scope switch, replacing §B and §F (feedback: *"Merge the planned-content and all-site
   cited-content tables into one view with a scope toggle or filter."*).
2. Visible URL/slug links and an Avenue Z indicator (New / Optimized) on rows from the content calendar.
3. Time-to-first metrics that the team's own visits can't trigger, with names that say they measure human visits.
4. Clear labels on the Movers chart and the bot-vs-human chart.
5. An internal prompt-gap diagnostic on Content Impact (prompts that *"lack brand citations or are trending down"*),
   internal-only by default, switchable per client without a deploy.
6. The competitor section moves to the AEO Overview: domain-level visibility kept, gap analysis URL-level and not blog-only.
7. Answers to the two "verify" asks: how the published filter works, and why Last Updated is blank.

## Non-goals

- **"pp" labels and the model list.** Both apply to every AEO tab; they ship as a separate small fix (agreed 2026-11-17).
  This redesign keeps today's delta rendering and inherits whatever that fix decides.
- **Splitting bots into search/retrieval vs training, and folder-level insights.** Waiting on Peec crawl insights (Tina with
  Maddie and Kirk). Later phase, below.
- **Converting Content Impact to the parts registry** (see Approaches).
- **Turning Content Impact back on in production.** That is a separate decision after staging QA.
- **Making URL citations follow the date picker** (D-10, follow-up).
- The AI synopsis (flag off).

## Anti-goals

- A client sees the prompt-gap list, or prompt text from it, while its switch is Off: in the portal, on Overview, or in a PDF.
- A client admin can open an internal block for themselves.
- The team's own launch-day visits make a page look fast.
- The merged table silently drops Avenue Z content because it has no AI citations yet.
- A truncated vendor fetch makes a prompt look "Not cited" or a page look uncited.
- Moving the competitor tables changes their formulas. (When a delta is *shown* changes on Overview, D-8; the math doesn't.)

## Approaches

1. **Rework Content Impact in place; competitors join Overview as new versioned parts.** *(Chosen.)* The merged table, prompt
   gaps and time-to-first cards each become their own file, so the monolith shrinks as it's touched. Smallest path; follows the
   repo's "edit in place" rule (`MAINTAINING.md`). Changes apply to every client whose Content Impact tab is visible.
2. **Convert Content Impact to versioned parts first, then redesign.** Gives per-client composition and versioning; roughly
   double the work for a capability nobody has asked for on this tab.
3. **Build a separate v2 tab beside the old one.** Only pays off if some client must keep the old tab; nothing says so, and it
   means two 1,000+ line implementations.

## Decisions made during design

Decisions without a tag were made by Paul. *(design call)* = the author's call, open to correction.

| # | Decision | Why | Rejected |
|---|---|---|---|
| D-1 | Replace "Days to First Traffic" with **"Days to first search visit"**: the first GA4 session with `sessionDefaultChannelGroup = 'Organic Search'` on or after the publish date (same grouping the KPI strip and table use, R-15). | Any-visit timing is triggered by the team checking a new page. A search click is very unlikely to be the team (not provable from data). Pairs with the AI card. | First-30-day sessions (team visits after day 1 still count; young pages not comparable). GA4 internal-traffic filter (not confirmed for Renaissance; not portable). |
| D-2 | The whole competitor section (H1 and H2) moves to Overview as one "Competitors" block; Content Impact keeps none of it. | Feedback: *"place the competitor section on the Overview page"*; one place for the competitor story. | Keeping the gap table on Content because it drives content work. |
| D-3 | The gap table stays URL-level and is relabelled "Page", with a page-type column and how many tracked prompts cite each URL. | Feedback: *"article/URL-specific … should not be limited to blog posts."* The data already is; the label made it read as blog-only. | |
| D-4 | The prompt-gap list is internal-only by default, with a per-client **"Visible to client"** switch only an `INTERNAL_ADMIN` can flip, on `/dashboard`. | Feedback calls it *"an internal diagnostic"*; Paul wants to switch it per client easily, starting internal. | Global flag; DB-only edits. |
| D-5 | The merged table's "All" scope = owned pages AI-cited this period, plus the Avenue Z rows. | Feedback says *"all-site cited-content"*. | Also including uncited pages with traffic. |
| D-6 | The Movers chart keeps its scope and gains labels saying what each view covers. | Feedback: *"Label the Movers chart scope: It includes all site pages, not only content worked on by Avenue Z."* | Restricting it to Avenue Z pages. |
| D-7 | Competitor parts render on the Peec provider only; under Profound they render nothing. | Their data (URL citations, coverage) is Peec-only. | |
| D-8 *(design call)* | On Overview the competitor deltas follow Overview's rule: always against the previous period, formulas unchanged, with two exceptions kept from today: every Δ is hidden while a model filter is active (FB-063), and H2's citation-share Δ is shown only when the picker is "last 30 days" (its current period is fixed at 30 days, D-10). R-5. | Overview never receives `compareRange`. Two parts obeying a toggle the rest of the page ignores would confuse more than it helps. | Threading `compareRange` through both routes, export, `PeecAIReport` and `PeecCtx` for two parts. |
| D-9 *(design call)* | Time-to-first cards count **New** published Avenue Z pages only (not Optimized). R-3. | An optimized page already has search and AI traffic, so it reads as ~0 days and drags the medians down, the distortion D-1 removes. The feedback is about *"a newly published page"*. Also aligns cards with the table's published rule (today §C ignores status). | Every published row; today's status-blind set. |
| D-10 *(design call)* | URL citations stay on today's fixed last-30-days current window in this build; fixing it is a follow-up. | Fixing it changes client numbers and cache entries; one change at a time. Its visible effects are contained by D-8's last-30 gate and stated in the Known issues. | Passing the picker range now. |
| D-11 | The Competitors block is part of the default Overview template, placed just above `footer`. F-1. | Tina, 2026-11-19: *"Make this the default for the template, and right now there shouldn't be any other clients that have access to this anyway besides Renaissance."* (Superseded: per-client opt-in.) | Per-client opt-in through `extraParts` (the original D-11). |
| D-12 | *Superseded by D-11 (F-1).* Because the block is in the template, every Peec client whose Overview isn't frozen gets it. Before release, list every production client with Peec configured; any client besides Renaissance is flagged to Tina before merge (her "only Renaissance" statement is not verifiable from the dev database). | Keeps the exposure check the original D-12 provided. | |
| D-13 | Movers: label only, no data change. The AI-referral and organic views get the "All site pages" label and explanation. The Citation Share view is labelled for what it is. Whether that view should show only the client's own pages goes to Tina (Q-1). | The feedback asked for a label, not a data change; its "all site pages" description holds for the two GA4 views but not for Citation Share. | Restricting Citation Share to owned hosts now. Labelling all three views "All site pages" (false for Citation Share). |
| D-14 | Renaissance gets the Competitors block at release (now through the template, D-11; its `peec-ai` override must not be frozen, checked before release). Its clients see the brand-absent competitor page list from day one. R-8. | They asked for the section on Overview, and their Overview isn't hidden. | Leaving Renaissance off with no owner or trigger. |
| D-15 | In the Overview gap table, clients see only the **count** of prompts citing each page; the prompt text shows only to internal users. R-12. | Prompt text there would hand clients much of what the internal prompt-gap list hides by default. | Showing prompt text to clients. |
| D-16 *(design call)* | Prompt gaps add a **Declining** state, and all its comparisons (Lost, Declining) are against the previous period whatever the compare toggle says. R-4. | The feedback asks for prompts that *"lack brand citations or are trending down"*; "Lost" alone misses prompts still cited but slipping. Peec's prior positions are always previous-period, so one comparison basis keeps Lost and Declining consistent. | Lost only; following the compare toggle (mixes bases). |
| D-17 *(design call)* | Merged-table cells are null ("--") when their source is missing or failed (§B's rule, not §F's 0%). Engagement rate is session-weighted across a path's trailing-slash variants (§B takes the first variant, §F the last; neither is right). Pages whose engagement rate moves because of this are listed in the PR. R-9. | §B and §F compute some columns differently today, so "lifted unchanged" can't hold for both. Null is honest; 0% reads as "no coverage". | Keeping both rules per scope. |
| D-18 *(design call)* | Calendar rows: a bare path (`/blog/x`) is resolved against the client's primary owned domain before linking. Rows are de-duplicated on `urlJoinKey` into one page with a badge of **New**, **Optimized**, or **New · Optimized** when the calendar lists both; its dates follow D-19. Time-to-first uses the New row's publish date. R-13. | Bare paths would link into the reporting app; duplicates would double-count in medians and table. | Linking raw values; no dedupe. |
| D-20 | Complete prompt coverage is cached as a ~0.86 MB **projection** (`getCoverageProjection`), not the full 5.75 MB aggregate; `getDomainCoverage` is untouched. F-7. | The full aggregate exceeds Next's 2 MB data-cache limit, which would silently disable caching (FB-069). PR Influence needs coverage for arbitrary domains, so the shared fetcher can't be projected. | Caching the full aggregate; storing it outside Next's cache (new storage); projecting `getDomainCoverage` (breaks PR Influence). |
| D-21 | A coverage walk with duplicate rows is retried once; persistent duplicates are accepted and logged, not treated as incomplete. Only a walk that exhausts `maxPages` or fails is incomplete. F-7. | Every measured run had 2–3 duplicates out of ~48k rows, so "any duplicate = incomplete" would show prompt gaps' error card every time. A shifted row only matters if it was a prompt's sole owned citation. | Treating any duplicate as incomplete (block always errors). |
| D-19 | The table's "Last updated" column becomes **"Last optimized"**: the latest Publish Date among the page's **Optimized** calendar rows. **"Published"** is the earliest Publish Date among its other rows (New or unclassified). Either is "--" when the page has no such row. No new sheet column. F-2. | Danielle, 2026-11-19: the calendar has no last-updated column; Publish Date (column F) *"is typically the last date that we updated or pushed anything live for that page or article."* So an Optimized row's Publish Date is its optimization date. | Dropping the column (loses "when did we last touch this page"); asking the content team for a new column. |

## Design

### Content Impact, new order

```
How is content performing across AI and human channels?        (header, unchanged)
 1. KPI strip                                                    (unchanged)
 2. Content performance            [ Avenue Z content | All cited pages ]       ← replaces §B + §F
 3. How quickly does new content get found?                       (time-to-first, D-1, D-9)
 4. Which pages are gaining or losing momentum?  · scope chip per view (Movers, D-13)
 5. AI crawler visits vs. human visits, by page                   (bot chart, relabelled)
 6. Prompt gaps  · Internal  [Visible to client: Off]             ← new; internal by default
```

### Data fixes this build depends on (R-1, R-6)

These land first; the blocks below are wrong without them.

- **Complete coverage, cached as a projection (D-20, D-21).** Measured 2026-11-20 (Task 1, Renaissance, 30 days): the
  complete prompt × model walk is 48,478 rows over 5 pages (~13 s), and the full aggregate is **5.75 MB**, almost three times
  Next's 2 MB cache limit. So a new `getCoverageProjection` walks every page and caches only what this build reads (~0.86 MB
  measured): owned prompt ids (overall and per engine), per-URL prompt ids for owned pages and for the gap table's pages,
  per-domain prompt ids for owned and Competitor-classified domains, the top 3 other sites per prompt, and the tag maps as
  today. Content Impact and the Overview competitor parts read the projection. `getDomainCoverage` is left unchanged because
  PR Influence reads it for arbitrary domains (Known issues). Every run shows 2–3 duplicate rows (Peec reorders mid-walk):
  the walk is retried once and, if duplicates persist, accepted and logged (D-21). Only a walk that runs out of pages, or
  fails, renders prompt gaps' error card.
  **This changes client numbers:** the Prompt Coverage KPI, per-URL prompt coverage and H1's coverage were computed on
  truncated data and will rise (97 of 100 tracked prompts cite Renaissance's own site in the complete data). The PR lists
  before/after for Renaissance; no client note needed (F-4).
- **Owned cited pages without the 2,000 cap.** The merged table's "All cited pages" set and the Avenue Z rows' citation share
  come from a paged fetch filtered to owned hosts (FB-050 subdomain rule) *before* caching, so the cache holds only owned rows
  (FB-069's payload concern is about the unfiltered result). The global citation-share denominator (all cited URLs) needs the
  total citation count, not every row; the builder confirms Peec returns a total, else documents what the denominator is.
- **Prompt ids.** `TrackedPrompt` gains `id`, and the `getPeecOverview` cache version is bumped (R-10).

### 2. Content performance (merged table)

One `SortableTable` with a two-option switch above it. Default **Avenue Z content**.

| Column | Source | Notes |
|---|---|---|
| Page | calendar topic, else Peec title, else path | Title on one line, the **slug as a visible link** under it, opening the live URL in a new tab (bare paths resolved, D-18). |
| Avenue Z | calendar | Badge **New**, **Optimized** or **New · Optimized** (D-18); blank when the page isn't in the calendar; `other` shows **Avenue Z**. |
| Published | calendar Publish Date of the New (or unclassified) row | D-19; "--" for a page only ever optimized (it went live before the calendar) |
| Last optimized | latest calendar Publish Date of an Optimized row | D-19; "--" when never optimized |
| Prompt coverage, Δ | Peec coverage (complete, above) | |
| Citation share, Δ | Peec URL citations (owned, uncapped, above) | current window fixed at last 30 days (D-10) |
| AI-referred sessions, Δ | GA4 | renamed from "AI Referral Traffic" |
| Organic sessions, Δ | GA4 | |
| Engagement rate, Δ | GA4 | D-17 |

Row universe:

- **Avenue Z content:** de-duplicated calendar rows that pass the published rule (V1), whether or not AI cites them yet.
- **All cited pages:** the union of the Avenue Z rows and every owned-host URL with `citationCount > 0`, joined on
  `urlJoinKey`. A page in both appears once, with its badge.

One row builder (e.g. `lib/peec/content-performance-rows.ts`) computes every column for both scopes, using D-17's rules.

The switch is client-side state (no refetch). Persisting the choice in `localStorage` per client slug is the builder's call.

Empty states: calendar not connected; GA4 not connected; and, replacing today's "populates once status flips to
live/published/complete" (which contradicts V1, R-17), *"No published content yet. A calendar row appears here once its Status
is set to Published."*

### 3. Time-to-first cards

Universe: de-duplicated Avenue Z rows that are published, **New** (D-9), and have a URL and an ISO publish date. Same single
GA4 query, with `sessionDefaultChannelGroup` added as a dimension.

| Card | Definition |
|---|---|
| Median days to first search visit | D-1 |
| Median days to first AI-referred visit | first session whose `sessionSource` is an AI assistant (`isAiSource`), unchanged math |
| Fastest to first AI-referred visit | min of the above, with its URL |
| Slowest to first AI-referred visit | max, with its URL |

Description line: *"For new content: days from publish date to the first visit by a person arriving from search, and from an
AI answer (ChatGPT, Perplexity, Gemini…). Crawler visits don't count. Measured from publish date to today, whatever range is
selected."*

Known limitation (R-15), noted in the PR, not on the page: a team member testing a prompt in ChatGPT and clicking through
would count as an AI-referred visit.

### 4. Movers (slope chart)

No data change (D-13). The scope chip and description follow the selected view:

| View | Chip | Description |
|---|---|---|
| AI referral, Organic | **All site pages** | *"Every page on the site, not only content Avenue Z created or optimized. Use it to spot pages worth revisiting and untouched pages that are picking up momentum."* |
| Citation Share | **All cited pages across the web** | *"Every page AI engines cite for your tracked prompts, including other sites. Use it to see which pages, yours or others', are gaining or losing AI citations."* |

### 5. Bot vs human chart

No data change now. Title **"AI crawler visits vs. human visits, by page"**. Axis titles: "AI crawler visits (last 30 days)"
and **"Human sessions (GA4, excluding AI-referred)"** (R-16: the human axis skips `isAiSource` rows). A one-line reading guide
naming the quadrants (e.g. crawled a lot but few people arrive = AI is reading it but not sending traffic). Keep the 30-day
note. Exact quadrant wording is the builder's, checked with Tina.

### 6. Prompt gaps (internal by default)

**What it lists:** each tracked prompt, within the selected models, in one of three states. All comparisons are against the
previous period (D-16).

- **Not cited:** no owned page (FB-050 subdomain rule, R-11) is cited for the prompt this period.
- **Lost:** an owned page was cited for the prompt in the previous period and isn't now.
- **Declining:** still cited, but the brand's average position for the prompt (selected models) worsened versus the previous
  period by at least a threshold. Default threshold is the builder's to propose and Tina's to confirm; stored in the section's
  `thresholds` so it is tunable per client.

Columns: prompt text, topic/tag, status, and **"Other sites cited"** for that prompt (non-owned pages from the coverage data's
per-URL prompt ids, inverted; pages that name a competitor brand are marked; top 3 with "+n"). R-11: these are all non-owned
sites (Reddit, media, competitors), so the column isn't called "competitor pages".

**Data:** complete coverage (above) for current and previous period; prompt text and positions from `TrackedPrompt` joined on
the new `id`.

**Visibility switch (D-4, R-2, R-14):**

- Stored per client as `report_section_config['peec-ai:content-impact'].clientVisible: string[]`, a new optional field on
  `SectionOverride` listing internal-by-default block ids opened to the client. Absent or missing `'prompt-gaps'` = internal
  only. No migration (JSON column).
- Only one writer: a new action `setClientVisible(slug, viewKey, blockId, visible)` in `app/actions/report-sections.ts` that
  requires `session.user.role === 'INTERNAL_ADMIN'` and updates only that field.
- `saveReportSectionConfig` **rejects** a body containing `clientVisible`, and **carries the stored `clientVisible` forward**
  the way `mergePreservingSharedParts` carries `sharedParts`, so no other save (commentary opt-in, etc.) can open or wipe it.
  Tests for both.
- `ContentImpactReport` takes a **required** prop `audience: 'internal' | 'client'` (required so a new caller can't forget it).
  Dashboard route → `'internal'`; portal route → `'client'`; PDF export (`components/export/report-element.tsx`) →
  `'client'` whoever exports. With `'client'` the block renders only when `'prompt-gaps'` is in `clientVisible`.
- On `/dashboard` the block's header shows an **"Internal"** chip while hidden from clients, and, for `INTERNAL_ADMIN` only,
  the **"Visible to client"** switch. Analysts see the chip, not the switch.

### Overview: Competitors block

Two new Peec parts, in the **default template** (D-11, F-1): appended to `PEEC_TEMPLATE.order` immediately before
`{ id: 'footer', version: 1 }`, and to the `peec-ai` `section_templates` row by hand at rollout (the row is
insert-if-absent, so code alone doesn't change it). Template order places them; no per-client mechanism is needed.

- A client whose `peec-ai` override is `frozen` keeps its snapshot and does **not** get the parts; that is the existing
  freeze behaviour. Rollout checks that Renaissance isn't frozen.
- A client can still hide them through the existing `hidden` override.
- *Removed with F-1:* the `extraParts` `before` anchor (R-19), the opt-in script, and the `CLIENT_ADMIN` competitor-pin guard
  (R-2's opt-in parts). R-2's `clientVisible` guards are unchanged.

**Parts:**

- **`competitor-visibility@1`**: H1 moved (Source Visibility, Citation Share, Prompt Coverage, deltas; FB-051/FB-058 math
  unchanged; deltas per D-8). Title "Competitor visibility".
- **`competitor-gaps@1`**: H2 moved and changed per D-3: Page (title + linked slug), Page type (Peec URL `classification`,
  humanised), Domain, Citation share and Δ (D-8), **Prompts citing it** (count for clients; for internal users the count
  expands to the prompt text, D-15), Competitors mentioned. Row rule unchanged: cited URLs that don't mention the brand and do
  mention a competitor. Title "Where competitors are cited and you aren't".

**Plumbing (R-5):** `PeecCtx` gains `models: AEOModel[] | null` (H1 needs `filterDomainRowsByModel`) and `audience` (D-15), so
`PeecAIReport` takes the same required `audience` prop from the dashboard route, portal route and PDF export. Each part's
`render` returns a `<Suspense>` around an async child that fetches what it needs, through functions extracted from today's §H
code so the math is shared, not copied. Under Profound both parts return `null` (D-7). Golden tests per `MAINTAINING.md`.

Content Impact loses §H. Its `synopsisContext` still references competitor fields; keep computing them from the extracted
functions so the (disabled) synopsis doesn't break.

## Verifications (do first, report back to Tina)

- **V1, published rule.** Confirmed from code: a calendar row shows when its Status cell is exactly "Published"
  (case-insensitive, trimmed). There is no date rule; items "stop at today" only because future items aren't marked Published
  yet. Confirm on staging with Renaissance's sheet; write the rule into the table's tooltip and the empty state.
- **V2, dates and the badge.** Read-only, service account, every tab of Renaissance's sheet. Danielle confirmed (F-2, F-3)
  there is no last-updated column (D-19 replaces it) and that Content Type in column C is correct.
  1. Publish Date cell formats (column F, R-7): if any are formats `parseCalendarDate` can't read, extend the parser, with
     tests. Report how many Avenue Z pages end up with a Published date and a Last optimized date.
  2. Content Type values (R-20): list each distinct Content Type with the badge `parseContentAction` gives it. Expected: a
     refresh is "Existing Blog Optimization", which already maps to Optimized (`includes('optim')`/`includes('existing')`).
     Any value that maps to `other` or to the wrong badge is fixed in `parseContentAction`, not in the sheet.

## Questions (resolved 2026-11-19)

- **Q-1, Movers Citation Share.** Tina confirmed D-13 as written: label only, no data change.
- **Q-2, Declining threshold.** Danielle: an average drop of **one position** or more. Default `1`, tunable per client.
- **Q-3, New / Optimized labels.** Danielle: Content Types in column C are correct; refreshes are "Existing Blog
  Optimization". Nothing for the content team to change (V2 still verifies the mapping).

## Known issues carried forward (follow-ups)

- **PR Influence still reads truncated coverage.** `getDomainCoverage` keeps its single 10,000-row prompt × model request
  (D-20), so PR Influence's prompt coverage for placement domains is computed on part of the data for large accounts.
  File as its own issue: it needs its own projection or a narrower fetch.

- **URL citations ignore the date picker** for the current period (D-10). Until fixed: the merged table's citation-share
  column and the "All cited pages" set reflect the last 30 days while coverage and GA4 follow the picker; H2's rows are the
  last 30 days while its prompt counts follow the picker; H2's Δ is hidden off "last 30 days" (D-8); and the Movers Citation
  Share view compares a fixed last-30 current period against the picker's compare period (R-5). File as its own issue.

## Later phase (not in this build)

When Peec crawl insights are live for Renaissance: split the bot chart into search/retrieval vs training bots, make
page-level patterns easier to read, and assess whether folder-level views earn a place. Needs its own short design. Starting
points (R-18): `agentData.byPath[k].byType` already splits training vs indexing (`lib/peec/agent-analytics.ts:85-96`), and
`bucketBotType` currently sends `'retrieval'` to `'other'`, which a retrieval split must fix.

## Rollout

Branch off `dev`, feature PR, review record per CLAUDE.md, then dev → staging. On staging: append the two parts to the
staging `peec-ai` `section_templates` row, check Renaissance's Content Impact and Overview, then Tina and Danielle QA. Give
them first: the before/after numbers (Prompt Coverage moves with the coverage fix; no client note needed, F-4), and the count
of "--" cells per merged-table column for Renaissance, so Danielle can decide whether any mostly-blank column should go (F-5).

Production (D-11, D-12, D-14): before the release, list read-only every production client with Peec configured and
`peec-ai` enabled, and which of them have a frozen `peec-ai` override. Put the list in the PR. Any client besides
Renaissance goes to Tina before merge. Then append the two parts to the production `section_templates` row with the
release. Content Impact stays hidden in production for Renaissance until someone decides to unhide it.

## Left to the builder

File layout of the extracted blocks; the switch's exact look; humanised page-type labels; how prompt text expands for
internal users; localStorage for the scope switch; quadrant wording on the bot chart (with Tina).

## Feedback round 1 (2026-11-19)

Source: Tina Fleming's inline (TF) notes and Danielle Lopez's comments on the decisions-for-approval doc
(`docs/official-feedback/aeo-content-impact-decisions-for-approval.md`). Items 1, 2 and 4–10 approved as written.

| # | Feedback | Effect |
|---|---|---|
| F-1 | Tina, item 3: competitors should be the template default; no other client has access besides Renaissance. | D-11 rewritten; D-12 superseded; opt-in machinery removed. Her client claim is checked before release. |
| F-2 | Danielle: no last-updated column; Publish Date is the last push date. | D-19: "Last optimized" from Optimized rows' Publish Date. V2 rewritten. |
| F-3 | Danielle: Content Types in column C are correct; refreshes are "Existing Blog Optimization". | Q-3 closed; V2 still verifies the mapping. |
| F-4 | Tina, item 1: corrected numbers confirmed, no client comms needed. | Rollout note. |
| F-5 | Danielle, item 9: agrees with "--", but if the table is still mostly blank, a column may be dropped; wants to see it in practice. | Blank counts per column delivered before staging QA; the decision is hers at QA. |
| F-6 | Danielle: one-position Declining threshold is fine. | Q-2 closed. |
| F-7 | Paul, 2026-11-20, after Task 1's measurement: cache only the needed pieces; accept the rare shifted row. | D-20, D-21. Plan Task 2 rewritten. |
