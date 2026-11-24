# AEO Overview v2: five clear sections, configurable KPIs, sortable deltas

Status: draft, 2026-11-24. Requested by Tina Fleming (VP, AI Strategy). Builders: Paul Ramirez, Thomas Chang.
Source of the requirements: Tina's Glean chat "Reporting overview iteration brief" (2026-11-23). It holds her feedback list,
the "Overview Page V2 Build Brief" Glean drafted from it, and an interactive mockup (`overview_page_v2_mockup.html`).
Tina's own caveat applies to the mockup: use it for **what each visualization shows**, not for its visual design.
The AMU "Weekly Executive Overview" mockup is the layout reference for "clearly separate sections".
The mockup and the AMU reference live in Glean (they can't be exported as text):
mockup <https://app.glean.com/library/528dc58cb5be4c9282e3e51d0d6a5b12>, AMU
<https://app.glean.com/library/0db9b5f8488d454e9baee9ed66453b6e>, chat
<https://app.glean.com/chat/54a0f86165c84ae48a002bb3d4e534d5>. Each slice's implementation plan attaches screenshots of
the mockup section it builds, so a builder without Glean access has the visual reference.
Reference client: Renaissance (Peec). Applies to every client on the AEO section (`peec-ai`), Peec and Profound.

## 1. Why

The AEO Overview reads as one endless scroll of charts. Tina wants:

- clearly separated, numbered sections (the AMU pattern), so a client can find things and the page tells a story;
- more actionable tables: full prompt text, URLs instead of domains, and every delta sortable;
- strategists able to choose which headline KPIs a client sees, without a deploy.

Success: Tina QAs the full v2 page for Renaissance on staging, signs it off, and every AEO client moves to it with one
config change. No client sees a half-redesigned page along the way.

## 2. Goals, non-goals, anti-goals

**Goals**

1. Five numbered sections with an eyebrow (`01 · SNAPSHOT KPIS`), a question headline, a one-line description, and a
   section nav (sticky on desktop).
2. A configurable KPI strip: up to 5 tiles, chosen per client by Avenue Z staff from a catalog of 9 KPIs.
3. A visibility trend chart with per-competitor on/off toggles (Profound's "Visibility Score" chart pattern).
4. A brand table directly under the trend chart, with Position replaced by **Used as a source %**.
5. One speedometer per AI model, replacing the model table.
6. A visibility-by-topic matrix with a **Competitors / Platforms** toggle, directly above a new full-width
   **Prompt Performance** table that replaces Biggest Winners / Biggest Losers.
7. A cited-sources table at **URL** level instead of domain level.
8. Page-wide: a **Compare to** control, a **Show deltas** switch, and every delta in its own sortable column.
9. Removed: "What kinds of sources do AI models cite?", "What do these domain types mean?", "Competitor visibility",
   and "Where competitors are cited and you aren't".
10. Peec and Profound clients both get every section (Paul's decision, 2026-11-24).

**Non-goals**

- The other AEO tabs (Content Impact, PR Influence, Sentiment, Technical Audit) do not change.
- The mockup's visual styling is not a spec; the page keeps the Avenue Z dark brand system.
- Drag-to-reorder KPIs (brief marks it nice-to-have). v1 orders tiles by catalog order.
- A custom comparison range. v1 offers Previous period, Same period last year, No comparison.

**Anti-goals** (a failure even if it technically works)

- A client sees a mix of old and new sections in production.
- A KPI or delta whose meaning is unclear (for example "↓ 4.9%" when it means points). Units must be explicit.
- A number on the new page that silently disagrees with the same number elsewhere on the page (brand table vs KPI tile vs
  gauge) because they were computed on different prompt sets or windows.
- A client admin being able to change which KPIs their own report shows (staff-only control).

## 3. Approaches considered

| | Approach | Trade-off | Verdict |
|---|---|---|---|
| A | **Build v2 parts next to the current ones**; pin Renaissance to a v2 layout on staging only; flip everyone with one template promote at sign-off; then delete the v1 parts | Old and new parts coexist for a while, plus one cleanup PR at the end | **Picked** (Paul, 2026-11-24) |
| B | Edit today's parts in place, slice by slice | Less code, no cleanup; but each slice changes the live page for every client as it reaches `main`, so clients see a half-old, half-new page for weeks | Rejected: works against the "clear sections" goal |
| C | One big feature branch, ship all at once | Breaks one-review-PR-per-feature; very large review | Rejected |

## 4. Rollout mechanism (approach A, in this repo's terms)

The section renders from the part registry (`components/report-sections/peec-ai/parts/registry.ts`) resolved against the
`section_templates` row for `peec-ai` plus the client's `clients.report_section_config['peec-ai']`
(`lib/report-sections/resolve.ts`). The override already supports `versions`, `hidden`, `extraParts` and `order`, which is
everything a "v2 layout" needs:

- New parts (ids that don't exist today, e.g. `prompt-performance`) are added to the registry and reach a client through
  `extraParts`. Changed parts (e.g. `kpi-cards`) get a new version file `parts/<id>.v2.tsx` and are pinned through `versions`.
  Removed parts are listed in `hidden`. v1 files are not touched (`MAINTAINING.md`, "Making a new version").
- Each slice's PR adds its parts to the registry only. It changes no template and no client config.
- **Staging:** after a slice reaches staging, the Renaissance row in the **staging** Neon branch gets its override updated
  (hidden + extraParts + versions + order) so Tina sees v2 grow. Production config is not touched until sign-off.
- **Flip (decided, Claude's call):** `promoteToTemplate` can't do it. `computePromotion`
  (`lib/report-sections/mutations.ts:138`) only moves the version of a part already in the template: it can't add new ids,
  drop hidden ones or reorder, and it copies from a client's production config. So the flip is a reviewed one-off script
  (`scripts/flip-aeo-overview-v2.ts`, shipped in its own PR before sign-off) that:
  1. writes the v2 order to the production `section_templates` row for `peec-ai`;
  2. lists every production client's `report_section_config['peec-ai']` and clears the `versions`, `order`, `hidden` and
     `extraParts` entries that name v1 or v2 Overview parts (bespoke parts and unrelated keys stay);
  3. stops on any client with a `frozen` snapshot and prints it, so Paul decides per client (a frozen client would
     otherwise stay on v1).
  It runs read-only first (prints the diff), then with `--apply`. The template row is insert-if-absent, so editing
  `template.ts` alone changes nothing in production (memory: report-part rollout gotchas). Update `template.ts` too so
  fresh environments match.
- **Cleanup PR:** delete v1 parts no template or config references (`guard.test.ts` lists what is still referenced).

**Section grouping.** Parts render as a flat list today. v2 needs numbered sections and a nav. Builder's call, with this
recommendation: a static map from part id to section (`01 kpis`, `02 visibility`, `03 models`, `04 topics`, `05 sources`)
plus each section's eyebrow, headline and description; `ProviderSection` wraps consecutive parts of the same section in a
section shell and builds the nav from the sections present. Parts not in the map (the synopsis, the footer, bespoke parts)
render outside any numbered section. This keeps per-client `hidden`/`order` working, and a section whose parts are all hidden
disappears along with its nav entry.

**v1 stays exactly as it is until the flip (decided, Claude's call).** Slice 1 touches shared code (`ProviderSection`,
the overview fetchers), so it must not change what a v1 client sees. A client is **on v2** when its resolved part list
contains at least one part listed in the v2 section map. Only then does `ProviderSection` render the section shell, the
nav and the Show deltas switch, and only v2 parts read the selected comparison range. v1 parts keep their hardcoded
previous-period behavior, even though the shared date picker (already rendered on this page,
`app/dashboard/[clientSlug]/reports/page.tsx:276`) offers compare options. The v1 goldens must stay byte-identical
through slices 1–6.

**Removals** are `hidden` entries in the v2 layout, no code. Note `domains-row` today renders three things (the domain
table and both domain-type cards); v2 replaces it entirely with the new URL table part.

## 5. Page-wide behaviors

### 5.1 Compare to

- A **Compare to** control next to the date range: Previous period (default), Same period last year, No comparison.
  Reuse the GA4 section's control and its `compareRange` URL param (`components/report-sections/ga4/date-picker.tsx`
  `COMPARE_PRESETS`, `lib/ga4/client.ts` `deriveCompareRange`). The reports page already parses `compareRange`
  (`app/dashboard/[clientSlug]/reports/page.tsx`); thread it into `PeecAIReport` there, in the portal page, and in
  `components/export/report-element.tsx` so the PDF matches.
- **URL contract (decided, Claude's call).** `compareRange` stays one shared, page-level param, as on every other
  section. Today the picker deletes the param for "No Comparison" (`components/report-sections/ga4/date-picker.tsx`
  `handleApply`), and sections disagree on what missing means: GA4 and Content Impact read it as none, while Paid Search,
  Meta, LinkedIn and Organic Social read it as `previous_period` (`compareRange ?? 'previous_period'`). The v2 Overview
  needs missing = Previous period *and* a way to say none. So `GA4DatePicker` gets an opt-in prop (e.g.
  `explicitNone`) that writes `compareRange=none` for No Comparison; only the AEO page passes it, so no other section's
  URLs change. `deriveCompareRange('none')` already returns null (it falls through to `return null`), so no change is
  needed there. The v2 Overview reads missing as `previous_period`. Same period last year maps to the existing
  `previous_year`. Picking a range on the Overview carries to the other AEO tabs as it does today; that's existing
  behavior, not new scope.
- `getPeecOverview` and `getProfoundOverview` take the comparison range instead of hardcoding `'previous_period'`. They are
  cached on their arguments, so the range must be part of the key. With No comparison, skip the prior-period fetches.
- The GA4 AI sessions query uses the same comparison range.
- Every prior-period figure on the page (KPI deltas, Δ columns, gauge change text, matrix hover deltas, the trend chart's
  previous-period line) uses the one selected comparison range. No part may compute its own window.

### 5.2 Show deltas

- A **Show deltas** switch, on by default, persisted in the URL (e.g. `deltas=off`) so shared links and PDFs keep it.
- Disabled (and deltas hidden) when Compare to is No comparison.
- Off hides every delta on the page: KPI delta lines, Δ columns, gauge change text, matrix hover deltas, the previous-period line.

### 5.3 Delta columns and units

- Every delta sits in its own column, headed **Δ**, directly right of its metric. Never inline next to the value.
- Every column, Δ columns included, is click-to-sort with a visible sort arrow. Reuse/extend
  `components/report-sections/peec-ai/sortable-table.tsx`. Sorting by a Δ column and then hiding deltas falls back to the
  table's default sort.
- Units: rates (visibility, share of voice, used as a source %, share of traffic, CVR) change in **pts**; counts (sessions,
  leads) in **%**; rank in **places**. Every delta shows its unit.
- Color by the metric's direction: green better, red worse. For rank, a lower number is better.
- No prior value: show `–`, never `0`, with a "No comparison data" tooltip. A prompt or URL new this period shows **New**.

### 5.4 Staff-only controls

The KPI editor shows only to Avenue Z staff on the internal dashboard route. Clients, including CLIENT_ADMIN, never see it,
and the server action that saves it must reject non-staff. Note the existing `saveReportSectionConfig` is gated by
`canEditDashboard`, which also admits CLIENT_ADMIN for their own client, so the KPI save needs its own staff check
(the `isInternalStaff(role)` pattern in `components/report-sections/organic-social/parts/kpi-check-in.tsx`).

## 6. Sections

Each section below lists what it shows and where each number comes from, for Peec and for Profound. "Derivable" means the
overview already fetches the rows and the code currently discards the detail; "new call" means a new vendor request.

### 01 · Snapshot KPIs

- Up to 5 tiles across on desktop; fewer than 5 stretch to fill the row; narrow screens wrap.
- Each tile: label, source badge (Peec / Profound / GA4), value, delta line with unit (hidden when deltas are off), and a
  one-line context footer (e.g. competitor average).
- **Edit KPIs** (staff only) opens an inline panel: one toggle per catalog KPI grouped by source, an "N of 5 selected"
  counter, the remaining toggles disabled at 5, Save / Cancel. KPIs whose source isn't connected for the client show
  disabled with "Source not connected".
- Stored **per client** (not per user). Storage needs a new field: `SectionOverride` has no free-form settings today and
  `validate.ts` drops unknown keys. Builder's call on shape; recommendation: a typed `kpis?: KpiId[]` on the `peec-ai`
  override, validated against the catalog, max 5. Whatever the shape, `saveReportSectionConfig` (which a CLIENT_ADMIN
  can call for their own client) must neither accept nor wipe it, the same way it already protects `clientVisible`.
- Zero selected: staff see an empty state prompting a pick; clients don't see the section.
- Default for a client with nothing saved: AI visibility, AI share of voice, Used as a source %, AI search sessions,
  AI search leads (brief's suggestion). Skip any whose source isn't connected.

KPI catalog:

| KPI | Definition | Peec | Profound | Δ unit |
|---|---|---|---|---|
| AI visibility | Share of tracked AI answers that mention the brand | `brandRankings` (exists) | visibility report (exists) | pts |
| AI share of voice | Brand mentions ÷ all tracked brand mentions | `brandRankings` (exists) | exists | pts |
| AI visibility rank | Rank among tracked brands by visibility (open question Q2) | current exists; prior derivable | derivable from per-brand rows | places |
| Used as a source % | Share of answers that retrieved an owned domain (Peec "retrieved") | own-domain row of `topDomains` (derivable) | citation report; note Profound's `retrieved` field is actually citation share — confirm metric | pts |
| Sentiment | Perception score | `brandRankings` (exists) | `lib/profound/sentiment.ts` (overview currently hardcodes 0) | points |
| AI search sessions | GA4 sessions from AI referrers | exists (`isAiSource`) | same | % |
| Share of traffic from AI | AI sessions ÷ all sessions | **new GA4 query** for total sessions (today's query is `sessionSource` with limit 150, so it can't be summed reliably) | same | pts |
| AI search leads | Lead key events from AI sessions (open question Q4) | **new GA4 query** (keyEvents by sessionSource) | same | % |
| AI search CVR | AI leads ÷ AI sessions | from the two above | same | pts |

Open question Q1 (Tina): today's strip has **Citation Share**, which isn't in the 9. Drop it or add it as a 10th.

### 02 · Visibility vs Competitors

**Trend chart, "How has AI visibility grown this year?"**

- Multi-line chart, one line per brand. Below it a checkbox legend (one per tracked brand, color-matched) and a
  **Show competitors** switch.
- Competitors on: the client's line (heavier, can't be unchecked) plus checked competitors. Default: client plus the top 4
  competitors by visibility. Cap around 8 visible lines with a warning.
- Competitors off: the client's current line vs a previous line (gray), hidden when deltas are off / no comparison.
  The chart is always year-to-date (`lib/peec/client.ts:405-412`) while the comparison range follows the date picker, so
  what "previous" means here is **open question Q6**. This is the one place exempt from "every prior figure uses the
  selected comparison range" until Q6 is answered.
- Keep the Daily / Weekly / Monthly / Quarterly control and the year-to-date window.
- Data: per-brand lines are derivable. Peec trend rows carry `brand` (today filtered to the client and pooled competitors,
  `lib/peec/client.ts`); Profound's YTD visibility report already uses dimensions `date × asset_name`.
- Each brand gets one fixed color, reused in the brand table dot and the matrix.

**Brand table, "Which brands appear most often in AI answers?"** (moves directly under the chart)

- Columns: #, Brand, Visibility, Δ, Share of voice, Δ, Used as a source %, Δ. Position removed. Client row highlighted.
  "See all N rows" stays.
- Used as a source % per brand: **new call** for Peec (`GET /brands` returns each brand's `domains`; join to the domain
  report's `retrieved`), as already done in `lib/aeo-outbound/pull.ts`. Profound: no brand→domain mapping in code today;
  needs a mapping (Profound asset domains, or per-client config). Builder confirms with a live call.

### 03 · Performance by AI Model

- One speedometer per AI model the client tracks (grid wraps). Scale 0–100% (open question Q3 for share of voice).
  A tick marks the competitor average on that model.
- Under each gauge: the value, a change line ("↓ 3.1 pts vs previous period", hidden when deltas are off), and
  "Competitor avg 46.2%".
- A metric switcher: Visibility / Share of voice / Used as a source. No Position.
- Data, Peec: client per-model visibility, SoV, retrieved exist (current period). Competitor per-model visibility exists
  (`brandVisibilityByModel`); competitor SoV per model is fetched but discarded (derivable). Prior per model: derivable
  from the prior prompt × model rows already fetched.
- Data, Profound: client per model exists (current only, `ownDomainRetrieved` is 0); competitor per model and prior per
  model need **new calls** (visibility report by `model × asset_name`, and the same for the prior range).

### 04 · Topics & Prompts

**Visibility-by-topic matrix** (new; modeled on AMU's "Visibility by program topic")

- Heatmap, darker = higher visibility. Rows: the client's topics, sorted by client visibility high → low.
- **Competitors / Platforms** toggle. Competitors: client + tracked competitors as columns, client column outlined.
  Platforms: the client's visibility on each tracked model.
- Competitor columns (decided, Claude's call): the client plus the top 7 competitors by visibility for the period, the
  same ranking the trend chart's defaults use, independent of the chart's checkboxes (so the matrix needs no extra URL
  state for the PDF). A "Show all brands" toggle expands to every tracked brand with horizontal scroll.
- Cell hover shows the cell's Δ when deltas are on.
- Data, Peec: topic per prompt exists (`TrackedPrompt.group`, from the first non-facet tag); the raw prompt × model rows
  include every brand but are filtered to the client today, so both matrices are derivable.
- Data, Profound: topic per prompt exists (`prompt × topic`); topic × brand and topic × model need **new calls**.

**Prompt Performance** (replaces Biggest Winners / Biggest Losers)

- One full-width table. Columns: Prompt (full text, wrapped, never truncated), Topic, Rank, Rank Δ, Visibility, Δ.
- Rank Δ = prior rank − current rank (+ means moved up). Default sort Rank Δ descending; deltas off → Rank ascending.
- Filter chips: All / Gained / Lost / No change. Paginate or "See all".
- Data, Peec: rank and prior rank exist (`positionByModel`, `priorPositionByModel`); prior **visibility** per prompt is
  derivable from the prior prompt rows already fetched. Model filter applies as today.
- Data, Profound: no prior data today; **new call** (prompt report for the prior range).

### 05 · Cited Sources

**"Which URLs do AI engines cite most?"** (was "Which domains…")

- Full width. Columns: #, Page (title + full URL, wrapped), Source type (Own / Competitor / third-party classification),
  Page type (Peec URL classification), Used as a source %, Δ, Citation rate, Δ. "Retrieved" is renamed
  "Used as a source %" everywhere on the page.
- Filter chips: All / Your URLs / Competitor URLs / Third-party. Owned URLs highlighted. Total citations in the header.
- Data, Peec: `lib/peec/url-citations.ts` has url, title, classification, citation count and rate; the API row's
  `retrievals` / `retrieval_count` are dropped today (derivable for Used as a source %). Prior values need a second call
  for the prior window (as `competitor-gaps` does).
- Data, Profound: nothing URL-level in code. **Needs a live call first** to confirm the citations report accepts a URL
  dimension. If it doesn't, Profound clients show this section at domain level and the gap is reported to Tina.

## 7. Prompt scope (open question Q5)

The brief proposes visibility, SoV, rank, used as a source %, the matrix and prompt performance on **non-branded prompts
only**, and sentiment on **branded only** (as agreed for AMU). Nothing filters on branded/non-branded today. For Peec it is
feasible (each prompt's tags are fetched); Profound has no equivalent in code. Turning it on changes Renaissance's headline
numbers from what the client has seen. **Tina decides** whether v2 adopts it. If yes, it applies to every metric on the page
at once (anti-goal: mixed prompt sets).

## 8. Slices (one feature PR + one review-record PR each, in this order)

| # | Slice | Depends on |
|---|---|---|
| 1 | Foundation: Compare to + Show deltas + `compareRange` through both providers and GA4; shared Δ-column sortable table and delta formatting (units, `–`, New); section shell + nav map; v2 layout recipe documented for staging | — |
| 2 | 02 Visibility vs Competitors: per-brand trend chart; brand table v2 (+ Peec `/brands` join; Profound mapping) | 1 |
| 3 | 04 Topics & Prompts: topic matrix; Prompt Performance (Peec derivations; Profound new calls) | 1 |
| 4 | 05 Cited Sources: URL table (Peec; Profound after the live check) | 1 |
| 5 | 03 Performance by AI Model: gauges (needs Q3) | 1 |
| 6 | 01 Snapshot KPIs: catalog, tiles, staff-only editor + storage, new GA4 queries (needs Q1, Q2, Q4) | 1 |
| 7 | Flip script (`scripts/flip-aeo-overview-v2.ts`, section 4) in its own PR; run read-only, then `--apply` after Tina's sign-off | 2–6 |
| 8 | Cleanup: delete unreferenced v1 parts and their goldens | 7 |

Slices 2–6 are independent once slice 1 lands. KPIs and gauges are last because they wait on Tina's answers.

## 9. Open questions for Tina

- **Q1.** Citation Share: drop it, or add it as a 10th KPI?
- **Q2.** AI visibility rank: rank among tracked brands ("#9 of 29") or the AMU style ("#1 in 13 of 41 topics")?
- **Q3.** Share-of-voice gauge: true 0–100% scale (small values look nearly empty) or a lower fixed max?
- **Q4.** AI search leads: GA4 key events, or the CRM when a client has one connected?
- **Q5.** Non-branded-only prompt scope (section 7): adopt it in v2?
- **Q6.** Trend chart with competitors off: the chart covers the year to date, but the comparison follows the date
  picker. What should the gray "previous" line be?
  (a) the same Jan 1–today span last year: the natural reading of "grown this year", but most clients have no tracking
  from last year, so the line would be missing or partial (on staging, Renaissance's YTD chart starts Jan 19, 2026);
  (b) keep one YTD line and shade the selected period and its comparison period on it;
  (c) make the chart follow the date picker instead of YTD, and draw the comparison window as the gray line (the title
  would change). Claude's recommendation: (b), which works for every client and matches "current vs previous period".

## 10. Edge cases

- Fewer than 5 KPIs: tiles stretch. A saved GA4 KPI on a client without GA4: staff see "Source not connected", clients don't see the tile.
- No comparison data (new client, prompts added mid-period): `–` in Δ cells; New in Rank Δ, sorted last.
- Many competitors: chart capped around 8 lines; the brand table still lists all.
- Long prompts and URLs wrap; never truncate.
- PDF export respects the current toggles (compare range, deltas, selected competitors, matrix mode). Toggle state that
  lives only client-side (checkboxes) must be in the URL or it won't reach the export render.
- A client with both Peec and Profound keeps the provider tabs; each tab renders the v2 page from its own provider.
- A model filter (`models`) still applies wherever it does today; parts that can't honor it say so, as `kpi-cards` does now.

## 11. Acceptance (whole feature, checked on staging for Renaissance and for one Profound client)

- Five numbered sections with eyebrow, headline, description and a section nav.
- KPI strip: up to 5 tiles; editor visible to staff only; 9-KPI catalog; max 5 enforced; saved per client.
- Trend chart: per-brand lines with checkboxes and Show competitors; competitors off shows current vs previous.
- Brand table directly under the chart; Position removed; Used as a source % added.
- One gauge per tracked model with change text and competitor average.
- Topic matrix with Competitors / Platforms directly above Prompt Performance.
- Prompt Performance: full prompt text; sortable by Rank Δ and Visibility Δ.
- URL-level cited sources with Used as a source % and Citation rate, each with its own Δ.
- Every delta in its own sortable column, with its unit; No comparison or Show deltas off hides all deltas page-wide.
- The four sections listed in goal 9 are gone. Brand colors match across chart, table and matrix.
- Production clients see the old page until the flip.

## 12. Left to the builder

- Exact component structure, chart library choice within the existing stack (Recharts via Tremor/shadcn), and the
  speedometer implementation.
- The exact shape of the KPI storage field and its validation.
- Where the brand-color assignment lives (it must be deterministic per client so colors don't shuffle between renders).
- Whether each slice extends `PeecCtx` or adds per-part data shapes, so long as Peec and Profound map to the same shapes.
