# Official Feedback Log

Source of truth for all feedback on this branch. Every item gets an ID and stays here until `done` or `wontfix`.

**Statuses:** `new` → `triaged` → `needs-clarification` → `in-progress` → `done` / `wontfix`

**Rule:** New issues discovered while fixing another item get their own ID. No silent scope creep.

---

## Active

_(none)_

---

## Closed

### FB-006 — Biggest Winners / Biggest Losers cards on the AEO Overview tab

- **Status:** done
- **Source:** Google doc — Tina's annotated screenshot and pasted copy/data spec
- **Author:** Tina
- **Type:** new feature (data + UI)
- **Scope:** `lib/peec/client.ts`, `lib/profound/client.ts`, `components/report-sections/peec-ai/winners-losers-cards.tsx` (new), `components/report-sections/peec-ai/index.tsx`, `lib/demo-data/peec.ts`, `lib/demo-data/profound.ts`. Universal across every current and future AEO client.

#### Verbatim ask

Tina annotated the Overview Model Breakdown screenshot with **two side-by-side ADD blocks**:
> ADD: Winning Prompts
> ADD: Losing Prompts

And provided the spec / sample data showing:

> **The Biggest Winners**
> Prompts where we **gained** rank to our competitors
> Columns: Prompt | Rank | Delta
> [17 sample rows, deltas integer positive]

> **The Biggest Losers**
> Prompts where we **lost** rank to our competitors
> Columns: Prompt | Rank | Delta
> [20 sample rows, deltas integer negative]

#### What was unambiguous

1. Two new cards, side by side, on the AEO Overview tab.
2. Placement is below the Model Breakdown table and above the Leaderboard (per the annotated screenshot).
3. Titles and subtitle copy are exactly as Tina wrote them, with the words `gained` and `lost` bolded inline.
4. Three columns per card: `Prompt`, `Rank`, `Delta`.
5. Rank is rendered with the `#` prefix (e.g. `#20`).
6. Delta is an integer with a sign; positive deltas are green and negative deltas are red.
7. Winners are sorted descending by delta; losers ascending (most negative first).
8. The sample data Tina provided matches her screenshot 1:1 (verbatim 1:1 verification done at request time before any code).

#### What was inferred (explicit interpretation choices)

| Decision | What I chose | Why |
|---|---|---|
| **Source of the data** | Computed from real Peec data, not hardcoded. Each prompt's current-period average rank position vs the prior period of equal length. | Truth-grounded rule. Tina's sample rows are a style guide, not literal content. Hardcoding her examples would ship wrong data for every client. |
| **`delta` formula** | `delta = Math.round(priorPosition) - Math.round(currentPosition)`. Positive = rank improved (you climbed). | Matches the screenshot semantics: row 1 of her winners ("Which agencies specialize in AI-powered SEO?" rank `#20` delta `37`) implies prior rank `#57` → current `#20`. Lower position = better rank in Peec's data model. |
| **Rounding to integers** | Both rank and delta are rendered as integers. Internal calculation rounds the position from each period independently THEN subtracts — not subtracting raw averages and rounding the result — so the displayed delta always equals exactly `priorRank - currentRank` from the user's perspective. | Tina's screenshot shows integer ranks and integer deltas only. No decimals. |
| **Eligibility filter** | A prompt qualifies only when (a) your brand had a recorded position in BOTH periods (`position_count > 0` on both Peec rows, i.e. raw `position > 0`) AND (b) the integer delta is non-zero. | If your brand didn't appear at all in one period, there's no rank to compare. If delta is zero, the prompt didn't move and doesn't belong in either list. |
| **Sort order** | Winners desc by delta, losers asc by delta. No secondary sort (Peec returns prompts in a stable order). | Matches Tina's screenshots: biggest jumps and biggest drops at the top of their respective cards. |
| **Row cap** | No artificial cap. Cards scroll vertically. | Tina's screenshots show ~17-20 rows each; she didn't specify a cap. Real clients may have more or fewer. Scroll handles variable lengths without imposing a magic number. |
| **Symmetry + scroll** | `grid lg:grid-cols-2 gap-5 items-stretch`, each card capped at `max-h-[400px]` on the inner scrollable list. | User's literal ask. The `items-stretch` forces equal height regardless of row count; the inner `max-h` keeps the page footprint bounded; the outer grid equals their widths. |
| **Card shell + header styling** | `rounded-lg border border-white/[0.06] bg-bg-surface p-5` — identical to the LLMBreakdownTable directly above. Title is `text-lg font-bold text-white`; subtitle is `text-sm text-text-muted` with the emphasized word inline-bolded white. | Page-wide visual consistency. No italics on the subtitle even though Tina's mockup has them — italics are not used anywhere on the current dark-themed AEO page, so introducing them here would read as foreign. The bolded inline word delivers the emphasis Tina intended. |
| **Column header treatment** | Small uppercase `text-text-muted` headers separated from rows by a thin divider, with an `InfoTooltip` on the `Delta` column. | Matches the existing Model Breakdown table column treatment so the two stack visually. |
| **Tooltip copy on Delta header** | "Change in your brand's average rank position for each prompt over the selected date range vs. the previous period of equal length. Positive means you moved up." | Disambiguates direction (positive = good) so a viewer doesn't have to infer it from color. Truth-grounded against the actual computation. No em-dashes. |
| **Color palette** | Positive delta `#60FF80` (the page-wide brand green already used in `SectionHeader`). Negative delta `#FF6B6B` (close to Tina's red, harmonizes with the dark surface). | Reuse the existing brand green so winners feel like "on-brand good." Red is matched to Tina's mockup tone without being so saturated it screams against the dark UI. |
| **Hide when empty** | When BOTH winners and losers arrays are empty, the entire two-card grid renders nothing. | Avoids two empty cards eating page real estate for clients without a comparable prior period (brand-new Peec projects; every Profound client today). Matches the existing pattern at `index.tsx:310` for the LLM table. |
| **Empty state per card** | If only one side has rows (e.g. only winners, no losers), the other card still renders with `Not enough data for this period yet.` and stays symmetrical with the populated card. | Honest, non-misleading, preserves layout symmetry. |
| **Profound: no per-prompt rank delta today** | Both `biggestWinners` and `biggestLosers` are empty arrays on Profound. The cards just don't render for the two Profound clients. | Profound's API surface doesn't expose per-prompt rank with a prior-period equivalent the way Peec does. Adding it for Profound would be a separate investigation. Type contract is identical so a future enabling change is a data-layer-only edit. |
| **Refresh icon in Tina's mockup** | Skipped. | Tina's Winners screenshot shows a circular refresh icon top-right of the card; the Losers screenshot doesn't. Looks like an Apple Numbers / Google Sheets refresh artifact rather than a UX directive. The page already revalidates server-side via the `cached()` wrapper. A non-functional client-side icon would mislead. Trivial add later if she actually wants it wired. |

#### Files touched

| File | Change |
|---|---|
| `lib/peec/client.ts` | Added `PromptDelta` type. Added `biggestWinners` and `biggestLosers` to `PeecOverview`. Added a parallel `/reports/brands?dimensions=['prompt_id']` fetch for the prior period to the existing Promise.all. Built `priorPromptMetricsById` map. Added a single loop iterating `promptsRes.data` that joins current + prior per-prompt position, filters, computes delta, and sorts into winners/losers. |
| `lib/profound/client.ts` | Added matching `biggestWinners` / `biggestLosers` fields to `ProfoundOverview`. Returns empty arrays from both `emptyOverview()` and `getProfoundOverviewImpl`. Documented as a known no-op for Profound until their API exposes equivalent data. |
| `components/report-sections/peec-ai/winners-losers-cards.tsx` | **New.** `WinnersLosersCards` renders two `PromptDeltaCard` instances inside a `grid lg:grid-cols-2 gap-5 items-stretch` wrapper. Each card has a sticky-ish header with the title + subtitle + column row, then a `max-h-[400px] overflow-y-auto` body. Returns `null` when both arrays are empty. |
| `components/report-sections/peec-ai/index.tsx` | Imported `WinnersLosersCards`. Rendered it between the existing `<LLM>` table render and the existing Leaderboard grid. |
| `lib/demo-data/peec.ts` | Added the verbatim 17 winners and 20 losers from Tina's spec so demo mode shows what she designed for. |
| `lib/demo-data/profound.ts` | Added empty arrays (consistent with the live API behavior on Profound). |

#### Scope of impact

- Every current Peec client with at least one prompt that has rank in both periods sees these two cards on the Overview tab. No DB change, no per-client config, no backfill.
- Every future Peec client gets it for free.
- Cards never render on Profound (yet), so the two Profound clients see no visual change.
- Cards never render on a brand-new Peec project with no prior baseline.
- Renders in both the internal dashboard and the client portal — both paths use the same `PeecAIReport`.

#### Verification

- TypeScript compilation: clean (`npx tsc --noEmit` zero errors).
- 1:1 verbatim check between Tina's screenshot images and her pasted copy text: titles, subtitles, columns, all 17 winners and all 20 losers including rank/delta values. Match confirmed before any code.
- Demo data carries Tina's exact 37 sample rows so a screenshot of demo mode mirrors her spec pixel-for-pixel.
- Layout: outer `lg:grid-cols-2 gap-5 items-stretch` enforces equal widths and equal heights on desktop; inner `max-h-[400px] overflow-y-auto` enforces bounded page footprint regardless of list length.

#### Open risks (in order of likelihood)

1. **A client with very few prompts may show only one of the two cards populated.** The empty-state copy ("Not enough data for this period yet.") handles this honestly and the cards still render symmetrically. Not a bug, but worth flagging if Tina sees an asymmetric mockup early on.
2. **Profound clients show nothing here.** Two clients only. If Tina expects parity, the fix is a Profound data-layer addition; surface contract is already in place.
3. **A truly brand-new Peec project (no prior period overlapping the date range) shows nothing.** Correct behavior, but could read as "broken" to an unfamiliar viewer. The hide-when-empty branch is deliberate per Tina's broader "don't fake data" stance.
4. **Tina's italic subtitle in the mockup** was deliberately not reproduced (no italics elsewhere on the page). If she pushes back, one-class change (`italic`) on the subtitle `<p>`.

---

### FB-005 — Disambiguate "Google" in the AEO Model Breakdown (and fix the underlying bucketing bug)

- **Status:** done
- **Source:** Google doc — Tina's annotated screenshot of the AEO Overview Model Breakdown table
- **Author:** Tina
- **Type:** data correctness + label clarity
- **Scope:** `lib/peec/client.ts`, `lib/peec/models.ts`, `components/report-sections/peec-ai/llm-breakdown-table.tsx`, `components/report-sections/profound-ai/llm-breakdown-table.tsx`, `components/report-sections/peec-ai/model-filter.tsx`. Universal across every current and future AEO client.

#### Verbatim ask

> "Google" is not a model, so we need some clarification on whether this is Google AI Overviews, Gemini, etc.

#### What was unambiguous

1. The "Google" row in the Overview Model Breakdown table is ambiguous and needs to be replaced with a specific label.
2. Tina is asking us to disambiguate between Google AI Overviews and Gemini (and other possible Google products).

#### What I discovered by querying Peec directly

Confirmed against the live Peec API (`/reports/brands` with `dimensions: ['model_channel_id', 'model_id']` and `/models`):

| `model_channel.id` returned in brands report | `model.id` (friendly scraper id) | Peec's friendly name |
|---|---|---|
| `openai-0` | `chatgpt-scraper` | ChatGPT |
| `perplexity-0` | `perplexity-scraper` | Perplexity |
| `google-0` | `google-ai-overview-scraper` | AI Overview |
| **`google-2`** | **`gemini-scraper`** | **Gemini** ← critical |

The existing `normalizeSource()` in `lib/peec/client.ts` was reading `model_channel.id` first and only falling back to `model.id` if missing. For the Gemini row, `model_channel.id = 'google-2'` does NOT contain "gemini" but DOES contain "google", so the substring check incorrectly bucketed it into `Google`. **Gemini's data has been silently merged into the `Google` row for as long as both have been active on a project.**

End-to-end verification against the iPullRank project (last 30 days):
- BEFORE fix: ChatGPT (33), `Google` (66 — actually 33 AI Overview + 33 Gemini mixed), Perplexity (33)
- AFTER fix: ChatGPT (33), Gemini (33), `Google AI Overview` (33), Perplexity (33)

#### What was inferred (explicit interpretation choices)

| Decision | What I chose | Why |
|---|---|---|
| **Treat this as a bucketing bug, not a label rename** | Fixed both: read `model.id` first AND rename the display label. | A label change alone would have made the bug worse: it would have labeled mixed AI Overview + Gemini data as "Google AI Overview", which is more wrong than "Google". Truth before polish. |
| **Add `model_id` to the dimensions** of `/reports/brands` and `/reports/domains` (lines 385-386 of client.ts) | Peec returns `model.id` (e.g. `gemini-scraper`) when `model_id` is in dimensions. Adding it alongside `model_channel_id` keeps both fields available with no loss of information. | Single-line dimension change. Cheapest possible path to truth-grounded bucketing. |
| **Invert read priority everywhere** | `row.model?.id ?? row.model_channel?.id` instead of the reverse, at all five call sites (`client.ts` lines 515, 563, 583, 608, 625). | `model.id` is the friendly scraper identifier (gemini-scraper, google-ai-overview-scraper) and routes correctly through the existing `normalizeSource` substring checks. Falling back to `model_channel.id` preserves resilience if Peec ever stops returning `model_id`. |
| **Keep `AEO_MODELS` canonical ids unchanged** | The canonical `'Google'` id stays. Display label only changes via new `MODEL_DISPLAY_LABELS` map. | Renaming the canonical id would force URL param changes (`?models=Google` → `?models=GoogleAIOverview`), color map key changes, filter logic changes, and DB migration of any `peecYourBrand`-style configs that reference it. Display-layer indirection is the surgical fix. |
| **Display label: `Google AI Overview`** | Matches Peec's own friendly name from their `/models` endpoint (`google-ai-overview-scraper` → "AI Overview"). | Sourced directly from Peec's API, not invented. Truth-grounded. |
| **Wire the display label through all visible model-name render sites** in the AEO section | Peec breakdown table + Profound breakdown table + shared Model Filter dropdown. | Tina's feedback is on the Overview tab, but the Model Filter is shared across all 4 AEO tabs. Inconsistency between filter and table would be the next thing she flags. One map, three call sites, full consistency. |

#### Files touched

| File | Change |
|---|---|
| `lib/peec/client.ts` | Added `model?: { id: string }` to `ApiDomainRow`. Added `model_id` to dimensions on the two model-grouped brand/domain queries. Inverted read priority at all five `normalizeSource` call sites to prefer `model.id` over `model_channel.id`. |
| `lib/peec/models.ts` | Added `MODEL_DISPLAY_LABELS: Record<AEOModel, string>` map. Identity strings for ChatGPT/Perplexity/Gemini/Claude/Copilot. `Google: 'Google AI Overview'`. |
| `components/report-sections/peec-ai/llm-breakdown-table.tsx` | Imported the display map; renders `MODEL_DISPLAY_LABELS[b.model] ?? b.model`. |
| `components/report-sections/profound-ai/llm-breakdown-table.tsx` | Same one-line swap. Profound's model labels go through the same map for consistency. |
| `components/report-sections/peec-ai/model-filter.tsx` | Imported the display map; renders `MODEL_DISPLAY_LABELS[m]` in the dropdown. Filter is shared across all 4 AEO tabs. |

#### What did NOT change

- `AEO_MODELS` array — canonical ids untouched (`'Google'` stays as the internal id)
- `MODEL_COLORS` map — color still bound to canonical id
- URL params — `?models=Google` still works
- `normalizeSource()` substring-check logic — unchanged; we just feed it better input
- Type signatures — `AEOModel` union unchanged
- Filter state behavior — checkbox toggles still track canonical id
- `lib/profound/client.ts` data layer — Profound is a separate API with its own normalization
- All other AEO report sections (PR Influence per-tab tables, Content Impact) — their per-row labels render via different paths; the shared Model Filter covers them by side effect

#### Scope of impact

- Every current AEO client on Peec sees correct, disambiguated buckets automatically. No DB change, no per-client config, no backfill.
- Every future AEO client gets it for free.
- The fix is at the data layer, so it propagates to:
  - LLM Breakdown table (visible)
  - Model Filter dropdown labels (visible across all 4 AEO tabs)
  - Per-model citation counts on PR Influence (downstream of the same bucketing logic)
  - Domain breakdown by model
- Renders in both the internal dashboard and the client portal.

#### Verification

- TypeScript compilation: clean (`npx tsc --noEmit` zero errors).
- End-to-end against live Peec API for the iPullRank project (last 30 days): old buckets → 3 rows with merged Google; new buckets → 4 rows with separate `Google AI Overview` and `Gemini`. Row counts and the model_channel → model id mapping captured in this log above.
- Peec's `/models` endpoint independently confirms the friendly names used in the display map: `chatgpt-scraper → ChatGPT`, `perplexity-scraper → Perplexity`, `gemini-scraper → Gemini`, `google-ai-overview-scraper → AI Overview`, `google-ai-mode-scraper → AI Mode`.

#### Open risks (in order of likelihood)

1. **Google AI Mode is not yet handled.** Peec also offers `google-ai-mode-scraper`. If a client enables it, those rows contain "google" (no "gemini") and would currently fall into the `Google` bucket alongside AI Overview. Label `Google AI Overview` would then be inaccurate for that client. Fix when needed is a one-line addition to `normalizeSource`: `if (s.includes('ai-mode')) return 'GoogleAIMode'` before the `google` catch-all, plus a new `AEOModel` entry. Out of scope for FB-005, flagged as future work. No current client has AI Mode enabled.
2. **Peec changes their `model.id` naming convention.** Today: `<vendor>-scraper`. If Peec renames (e.g. drops the `-scraper` suffix), the substring matches still hold because `normalizeSource` checks for vendor substrings (`gemini`, `google`, etc.). Low risk.
3. **Surprise from suddenly seeing Gemini appear.** Internal users may be confused that "Gemini" appears as a new row after this ships. That is the correct behavior; Gemini was always there, just mislabeled. Worth a heads-up note in the deploy commit / PR description.

---

### FB-004 — Add a vertical axis to the AEO Overview visibility trend chart

- **Status:** done
- **Source:** Google doc — Tina's annotated screenshot of the "How has AI visibility grown this year?" chart on the AEO Overview tab
- **Author:** Tina
- **Type:** design (visual)
- **Scope:** `components/report-sections/peec-ai/visibility-chart.tsx`. One file. Universal across every current and future AEO client.

#### Verbatim ask

> This chart needs a vertical axis

#### What was unambiguous

1. The chart in the screenshot is the visibility trend chart on the AEO Overview tab (title verbatim matches `VisibilityChart`).
2. It has no Y-axis today. Five horizontal gridlines exist but have no numeric labels.
3. A vertical axis with numeric scale labels needs to be added.

#### What was inferred (explicit interpretation choices)

| Decision | What I chose | Why |
|---|---|---|
| **Number of ticks** | 5 ticks, top to bottom: `CHART_MAX`, `0.75 × CHART_MAX`, `0.5 × CHART_MAX`, `0.25 × CHART_MAX`, `0` | The chart already has 5 evenly spaced horizontal gridlines. 5 ticks aligned to those lines is the natural pairing. Less = under-labeled; more = crowded. |
| **Scale source** | Reused the existing `CHART_MAX` constant. Kept it dynamic (data-driven), not rounded to a "nice" number like the next multiple of 10. | The bar heights are computed against `CHART_MAX`. If the axis is rounded but the bars are not, the bars no longer touch the top tick label and the chart silently misrepresents itself. Truth-grounded: the axis shows the exact scale the bars use. |
| **Number format** | Integer with `%` suffix (e.g. `26%`, `20%`, `13%`, `7%`, `0%`) via `Math.round()` | Convention for chart axes is rounded values. Decimal precision is still available via the hover tooltip (already shows `.toFixed(1)` per bar). One-character change to `.toFixed(1)` if Tina prefers decimals. |
| **Vertical alignment** | Mirrored the gridline pattern exactly: `flex h-40 flex-col justify-between` for the label column, same container height as the gridline column. Both use `justify-between`, so the top label sits at the top edge and the bottom label at the bottom edge, with even spacing between. | Same flex pattern keeps top + bottom labels aligned to the top + bottom gridlines without absolute positioning gymnastics. Slight visual offset between mid-line label centers and mid-gridline positions is on the order of 4-5px; reads naturally as "label sits next to line." |
| **Layout slot** | Added the axis column as the first child of the existing `<div className="flex gap-2">` wrapper. Width: `w-9` (36px), right-aligned text. | That wrapper already had `gap-2` and a `flex-1` chart pane next to it. Layout slot was effectively pre-reserved. No structural rework needed. |
| **X-axis label alignment** | Wrapped the existing date-label row in a matching `flex gap-2` with a `w-9 shrink-0` spacer on the left, so the date labels stay aligned with the bars after the Y-axis pushed the chart column to the right. | Otherwise the date labels would visually drift left of their bars. Spacer width must match the Y-axis column width exactly. |
| **Text styling** | `text-[10px] leading-none tabular-nums text-text-muted` | Matches the existing X-axis label aesthetic (`text-[9px] tabular-nums text-text-muted`) with one-step-larger size for legibility against the gridlines. `tabular-nums` so percent values column-align cleanly. `leading-none` so the labels sit tightly at their flex positions. |

#### What was explicitly out of scope

- No change to `CHART_MAX` computation, bar colors, granularity toggle, hover tooltip, gridlines, competitor polyline, X-axis date labels, or any data layer.
- No "nice rounding" of axis maxima (e.g. snap CHART_MAX to next multiple of 5/10). Would desync axis from actual bar tops. Truth over polish.
- No axis title (no "Visibility %" label). Tina did not ask for one and the chart's eyebrow already says "How has AI visibility grown this year?" The `%` suffix on each tick makes the unit obvious.

#### Files touched

| File | Change |
|---|---|
| `components/report-sections/peec-ai/visibility-chart.tsx` | Added a `w-9` Y-axis label column as the first child of the chart's flex wrapper. 5 tick labels computed from `CHART_MAX`, integer-rounded with `%` suffix. Wrapped the X-axis date label row in a matching flex layout with a `w-9` spacer so date labels stay aligned to the bars. |

#### Scope of impact

- Every current AEO client (Peec or Profound) sees the new axis automatically. `VisibilityChart` has exactly one render site at `components/report-sections/peec-ai/index.tsx:303`; both providers go through that block.
- Every future AEO client gets it for free. No DB change, no per-client config, no backfill.
- Renders in both the internal dashboard and the client portal — both routes go through the same `PeecAIReport` component.

#### Verification

- TypeScript compilation: clean (`npx tsc --noEmit` zero errors).
- Math: 5 ticks compute `Math.round(CHART_MAX × {1, 0.75, 0.5, 0.25, 0})`. When `CHART_MAX = 26.1` (matches Tina's KPI screenshot), ticks render as `26%`, `20%`, `13%`, `7%`, `0%`.
- Layout: Y-axis column and date-label spacer are both `w-9 shrink-0` — bars stay aligned to their date labels. Existing gridlines and competitor polyline live inside the same `flex-1` chart column, so they re-flow to the right by the same `w-9 + gap-2` and remain consistent with each other.
- Demo mode: unaffected. Demo fixtures already drive `CHART_MAX` through the same code path.

#### Open risks (in order of likelihood)

1. **Tick rounding rounds to 0% when CHART_MAX is very small.** If a client's all-time max visibility is < 1%, the second-to-bottom tick (`0.25 × 0.5 = 0.125`) rounds to `0%` and you'd see `1%, 1%, 1%, 0%, 0%` or similar. Edge case. If it happens we switch to `.toFixed(1)`.
2. **Slight vertical offset between mid-label centers and mid-gridline positions** (~4-5px). Caused by `flex justify-between` mechanics with non-zero-height label spans. Looks natural in practice. If Tina says "labels should center on the lines," switch to absolute-positioned labels with `top: X%` and `translate-y(-50%)`.
3. **Y-axis column width.** `w-9` (36px) fits values up to 4 chars (`100%`, `75%`, etc.). If a client somehow reports >999% visibility the column would clip — not a real scenario.

---

### FB-003 — Migrate AEO Overview synopsis from Vertex Gemini to Glean Chat API

- **Status:** done
- **Source:** Thomas (project-wide architectural rule, not Tina-facing)
- **Type:** refactor / standards compliance
- **Scope:** `lib/peec/synopsis.ts`, `lib/glean.ts`. Surgical follow-up to FB-002c.

#### Verbatim ask

> For future reference only use glean chat api for any llm usage. […] clean this up and make sure it doesnt break anything changing from vertex gemini llm to glean. be surgical and make damn sire!

#### What was unambiguous

1. All LLM inference at Avenue Z must use Glean Chat API. No Vertex/Gemini, OpenAI, Anthropic direct, etc.
2. The synopsis shipped in FB-002c uses Vertex Gemini and must be migrated.
3. No regressions to the synopsis card behavior (same prose + recommended-actions output, same caching, same graceful fallback).
4. Glean server URL: `https://avenuez-be.glean.com` (instance = `avenuez`).

#### What was inferred (explicit interpretation choices)

| Decision | What I chose | Why |
|---|---|---|
| **Where to put the Glean chat helper** | Added `gleanChat()` to the existing `lib/glean.ts` rather than creating a new file or extending lib/glean/ into a folder. | The codebase already has `lib/glean.ts` with helpers and constants. The chat pattern already exists inline at `app/api/glean/meeting-brief/route.ts`. Putting the helper next to its peers minimizes new surface area and matches the existing module layout. |
| **Mirror the meeting-brief pattern exactly** | Same payload (`{ messages: [{ author: 'USER', fragments: [{ text }] }], saveChat: false }`), same `X-Scio-Actas` header from `getGleanHeaders()`, same "longest GLEAN_AI message" extraction. | One canonical Glean pattern in the codebase, proven working in the meeting-brief route. No bespoke variations. |
| **Default ActAs email** | `process.env.GLEAN_ACT_AS` if set, else `thomas.chang@avenuez.com` (matches the avenuez-agents/pr-newsjacking default). | Reproducible across environments. Per-caller override available via the `options.actAs` param if needed. |
| **JSON extraction robustness** | Three-tier extractor: direct `JSON.parse` → markdown-fence strip → widest `{...}` substring. Validates shape (`synopsis: string`, `actions: array`) on every attempt. | Glean does not have a `responseMimeType: 'application/json'` flag the way Gemini does. The model usually obeys the "strict JSON" prompt instruction, but can occasionally wrap output in markdown fences or add a sentence. The extractor handles all observed shapes without re-prompting. |
| **Cache version bump** | `version: 'v1'` → `version: 'v2-glean'` in the `cached()` wrapper. | Forces a fresh fetch on first load after deploy. Any cached Vertex Gemini responses from FB-002c are invalidated and will be re-generated by Glean. Avoids stale-content surprises. |
| **Public function signature** | `getOverviewSynopsis(clientSlug, dateRange, provider, data, aiSessions)` — unchanged. | The component (`overview-synopsis.tsx`) does not change. Zero touch on the render layer. |
| **Graceful fallback on Glean failure** | Kept the existing try/catch in the RSC. Now also triggers if `GLEAN_API_TOKEN` or `GLEAN_INSTANCE` are unset (gleanChat throws on init). UI says "Synopsis is temporarily unavailable. Other metrics on this page are unaffected." | Honest, non-blocking. Matches the rest-of-the-page resilience pattern from CLAUDE.md. |
| **Did NOT touch `lib/bigquery/gemini.ts`** | Left in place. | Out of scope. That file powers the Fun Spot conversational summary (different feature, different report area). It should also migrate to Glean per the project-wide rule, but that's a separate item, not part of FB-003. Flagged as a follow-up in the changelog. |
| **Did NOT touch `app/api/glean/meeting-brief/route.ts`** | Left in place. | Working endpoint not in the AEO area. Could be refactored to use the new `gleanChat()` helper for code cleanliness, but the existing inline fetch is functionally correct. Out of scope for FB-003 to avoid risking that endpoint. |

#### Required environment variables

For the synopsis to actually call Glean in deployment:
- `GLEAN_API_TOKEN` — rotate the token that was previously shared in chat; assume the original is compromised
- `GLEAN_INSTANCE=avenuez`
- `GLEAN_ACT_AS=thomas.chang@avenuez.com` (optional; defaults to that)

If any are missing, the synopsis card falls back to the temporarily-unavailable message and the rest of the Overview tab renders unaffected.

#### Files touched

| File | Change |
|---|---|
| `lib/glean.ts` | Added `gleanChat(prompt, options?)` helper. Mirrors `app/api/glean/meeting-brief/route.ts` payload + response parsing. |
| `lib/peec/synopsis.ts` | Removed `GoogleGenAI` import, `getClient()`, and the Gemini `generateContent` call. Now uses `gleanChat()`. Added `extractJsonObject()` for robust JSON parsing. Cache version bumped to `v2-glean` (vendor label `glean`). |

#### What did NOT change

- `components/report-sections/peec-ai/overview-synopsis.tsx` — zero edits. Same RSC, same render path, same fallback UI.
- `components/report-sections/peec-ai/index.tsx` — zero edits. Still calls `<OverviewSynopsis />` with the same props.
- `lib/peec/client.ts`, `lib/profound/client.ts` — zero edits. The data layer is provider-agnostic.
- Cache wrapper API (`cached()`) — unchanged.
- KPI cards, Snapshot KPIs label, trend chart order — all FB-002 work intact.

#### Verification

- TypeScript compilation: clean.
- Lint on touched files: zero errors, zero new warnings.
- Component layer untouched, so no risk of render regression from this commit.
- Cache key changes via `version: 'v2-glean'` so the first request after deploy is a guaranteed miss against Glean (not a stale Gemini hit).

#### Open risks

1. **Glean JSON adherence.** The Glean chat model usually obeys "strict JSON" instructions but the response is not constrained at the API level the way Gemini's `responseMimeType` was. The three-tier `extractJsonObject` mitigates this. If a parse failure still occurs the graceful fallback fires.
2. **Latency.** Glean's chat endpoint can include a tool/search loop. The synopsis is cached 1h so this only affects the first request per (client, range, provider). If P95 becomes a problem, the prompt can be tightened to discourage tool use.
3. **`lib/bigquery/gemini.ts` is still on Vertex Gemini.** Out of scope here. Should be migrated in a follow-up (Fun Spot conversational summary), but that is a different feature and a different code path; not FB-003.

---

### FB-002 — AEO Overview tab redesign (sub-items a, b, c, d, e)

- **Status:** done
- **Source:** Google doc — Tina's "AEO Overview Tab" recommended layout screenshot + KPI replacement text
- **Author:** Tina
- **Type:** design + data + copy
- **Scope:** Answer Engine Optimization → Overview sub-tab only. Universal across every current and future client.

#### Verbatim ask

> Screenshot annotations:
> **ADD:** AI-generated synopsis of overall performance & recommended actions during the period, executive overview style.
> **REMOVE:** The pills for "what changed" — I think this was a misinterpretation of previous feedback.
>
> Text:
> Change these 3 KPIs to:
> - Visibility
> - Citation Share
> - AI Referral Traffic

#### Group mapping (every visible Tina element → a change)

| Tina element | Sub-item | Change |
|---|---|---|
| ADD: AI synopsis | FB-002c | New `OverviewSynopsis` RSC, calls Vertex Gemini, cached 1h per (client, dateRange, provider) |
| REMOVE: "What changed" pills | FB-002a | Deleted `<PeriodRibbon />` render + import |
| Snapshot KPIs label | FB-002d | Added `Snapshot KPIs` eyebrow above the KPI grid |
| 3 KPI cards swap | FB-002b | Visibility (kept), Citation Share (new), AI Referral Traffic (new) |
| Trend Line Chart placement | FB-002e | Moved `<VisibilityChart />` to render after the KPI grid (matched Tina's mockup order) |

#### What was unambiguous

1. Remove the period-ribbon pills entirely.
2. Replace the existing 3 KPI cards (Visibility, Share of Voice, Position) with the 3 Tina specified (Visibility, Citation Share, AI Referral Traffic).
3. Add an LLM-generated executive synopsis at the top of the page.

#### What was inferred (explicit interpretation choices)

| Decision | What I chose | Why |
|---|---|---|
| **Citation Share definition (truth-grounded for both providers)** | Citation Share % = (citations attributed to the client's own domain / total tracked-domain citations) × 100. Same math for Peec and Profound. | Peec exposes per-domain `citation_count`; Profound exposes per-hostname `count`. Both can be summed for the client's own domain and divided by the total. This is identical to Profound's published `citation_share` metric, just computed from raw counts so it works for Peec too (majority of our clients). No invention, no proxy. Rejected the "show — for Peec" path because most clients are on Peec and that would have shipped a broken KPI. |
| **Client's "own domain" identification** | Uses `clients.domain` column from the DB. Normalized via existing `urlJoinKey()` helper (strips protocol, www, trailing slashes). Match is exact normalized-host equality. | Already-existing helper. Handles `avenuez.com`, `www.avenuez.com`, `https://avenuez.com` as the same key. Single column, single source of truth. |
| **Null client.domain or 0 totalCitations** | Shows `--` for the value (no fake number). Number-of-citations subtitle still renders truthfully (`0 of 0` or `0 of N`). | Operational concern: if a client's `clients.domain` is null in the DB, the KPI cannot be computed. The card shows `--` rather than 0% which would imply a measured zero. Fix is a one-row DB update to set `clients.domain`. |
| **AI Referral Traffic source** | GA4 sessions where `sessionSource` matches the AI source list (`isAiSource`), summed across the date range. Same query PR Influence uses. | Single source of truth, already proven on PR Influence page. Tina said "AI Referral Traffic" — I treated this as the traffic volume (sessions), not e.g. % of all sessions. |
| **AI Referral Traffic delta** | Computed against the previous period of equal length. Hidden (no `↑/↓`) when the prior period was zero (no meaningful baseline). | Standard pattern in the rest of the codebase. Zero-baseline % deltas would render `Infinity` or misleading numbers. |
| **AI Referral Traffic when GA4 is not configured** | Card shows `--` with subtitle `GA4 not configured`. | Honest representation. No fake value, no card-shape divergence. |
| **AI synopsis LLM provider** | Vertex AI Gemini (`gemini-2.5-flash-lite`) at the time of FB-002 ship. **Superseded by FB-003** — migrated to Glean Chat API per the project-wide Glean-only rule established right after FB-002 shipped. | Original choice re-used existing Vertex wiring; FB-003 corrected this to comply with the Avenue Z standard. See FB-003 for the migration. |
| **AI synopsis caching** | Wrapped with `cached()` (`lib/cache.ts`) at 1-hour TTL, keyed on (clientSlug, dateRange, provider). | Same pattern as `getPeecOverview` and `getProfoundOverview`. Prevents re-invocation on every page render. Date range changes invalidate naturally. |
| **AI synopsis failure mode** | Try/catch in the RSC. On failure, renders "Synopsis is temporarily unavailable. Other metrics on this page are unaffected." Rest of the page renders normally. | Per CLAUDE.md rule that a failed Supermetrics query must never crash the report. Same principle here. |
| **AI synopsis prompt** | Two to three executive paragraphs + 2-4 recommended actions. Strict instruction: no fabrication, no em-dashes, no hype, real numbers only. | Tina said "executive overview style" + "recommended actions." Drafted to match that tone. Easy to iterate on the prompt later without code changes elsewhere. |
| **Snapshot KPIs label** | Added `Snapshot KPIs` as an eyebrow heading above the KPI grid, styled to match existing section eyebrows. | Tina's mockup shows this label. Lifting the label verbatim from her mockup. |
| **Trend Line Chart order** | Moved `<VisibilityChart />` from above the KPI grid to below it, matching the vertical order in Tina's mockup. | Strict layout match to Tina's "recommended layout" mockup. |

#### What was explicitly out of scope

- `<PeriodRibbon />` component file kept in the codebase (unused) for trivial revert if needed. Only the render + import in `index.tsx` were removed.
- No changes to the dual-provider (Peec vs Profound) branching logic. Synopsis works on whichever provider is active in the tab.
- Model filter behavior on the new KPI cards: Citation Share and AI Referral Traffic do not respond to the per-model filter (no per-model breakdown exists in the data layer). Visibility card still does. This is consistent with the other AEO pages.
- Em-dash scrub across the rest of the codebase: only touched lines were scrubbed. Pre-existing em-dashes in tooltips, comments, and other strings were not modified to keep this commit scoped to FB-002.

#### Files touched

| File | Change |
|---|---|
| `lib/peec/client.ts` | Pulls `clients.domain` from DB, computes `yourBrandCitations` (current + prior) and `totalCitationsPrior` from raw domain rows. Adds these to `PeecOverview` type. Imports `urlJoinKey`. |
| `lib/profound/client.ts` | Same: pulls `clients.domain`, computes `yourBrandCitations` (current + prior) and `totalCitationsPrior` from hostname rows. Adds fields to `ProfoundOverview` type and `emptyOverview()`. Imports `urlJoinKey`. |
| `lib/peec/synopsis.ts` | **New.** Builds an executive-context prompt from the Overview data, calls Vertex Gemini, returns `{ synopsis, actions }`. Wrapped with `cached()` (1h TTL, keyed per client + range + provider). |
| `components/report-sections/peec-ai/overview-synopsis.tsx` | **New.** RSC that renders the synopsis card; try/catch graceful fallback if the LLM fails. |
| `components/report-sections/peec-ai/index.tsx` | Adds GA4 AI referral fetch (current + prior) in `PeecAIReport`. Passes `aiTraffic`, `clientSlug`, `dateRange` to `ProviderSection`. Removes `<PeriodRibbon />` import + render. Reorders so the visibility chart renders after the KPI grid. Adds `Snapshot KPIs` eyebrow. Swaps the KPI cards to Visibility / Citation Share / AI Referral Traffic. |
| `lib/demo-data/peec.ts` | Adds `yourBrandCitations`, `yourBrandCitationsPrior`, `totalCitationsPrior` fixture values so demo mode still typechecks and renders sensible numbers. |
| `lib/demo-data/profound.ts` | Same. |

#### Scope of impact

- Every current AEO client (Peec or Profound) sees the new Overview layout automatically.
- Every future AEO client gets it for free. **One operational requirement:** new clients must have `clients.domain` populated in the DB for Citation Share to show a value (otherwise card renders `--`).
- AI Referral Traffic requires `clients.ga4_property_id` to be set (already true for current clients per existing GA4 wiring).
- Renders in both the internal dashboard and the client portal — both routes go through the same `PeecAIReport` component.

#### Verification

- TypeScript compilation: clean (`tsc --noEmit` zero errors).
- Lint: zero new errors, one pre-existing unused-var warning unchanged.
- Data layer: Citation Share math reviewed against the raw API row shapes (Peec `ApiDomainRow.citation_count`, Profound `metrics[1] = count`). Numbers reflect actual citations, not estimates.
- Demo mode: demo fixtures updated so the Overview tab renders with synthetic-but-plausible Citation Share values for demos.

#### Open risks (in order of likelihood)

1. **AI synopsis prompt tone.** Tina said "executive style" and "recommended actions." Drafted to match. Most likely place she pushes back is the tone or specificity of the recommendations. Fix is a single-file prompt edit in `lib/peec/synopsis.ts` — no component changes needed.
2. **Client.domain set for all clients.** If a client doesn't have `clients.domain` populated, Citation Share shows `--`. Operational, not structural. One-row DB update per client.
3. **AI Referral Traffic for clients without GA4.** Shows `--` with `GA4 not configured` subtitle. Same operational pattern.
4. **Trend chart reorder.** If anyone preferred the old order (chart above KPIs), it is a one-line JSX swap.

---

### FB-001 — Consistent header treatment across all 4 AEO tabs

- **Status:** done
- **Source:** Google doc feedback from Tina (relayed by Thomas), with screenshot of the Content Impact header
- **Author:** Tina
- **Type:** design + copy
- **Scope:** Answer Engine Optimization section only (4 tabs: Overview, PR Influence, Content Impact, Technical Performance). Universal across every current and future client.

#### Verbatim ask

> I would like to have a consistent header across all the tabs and I REALLY like the style of the Content one. Can we basically copy/paste this across each of the 4 tabs and then just change out the icon / copy to be tailored to the purpose of each tab?

#### What was unambiguous

1. Use the Content Impact header as the reference visual treatment (green rounded-square icon container + bold question h2 + smaller gray subtitle).
2. Apply this same treatment to all 4 AEO tabs.
3. Each tab gets its own icon and its own copy "tailored to the purpose" of that tab.
4. Content Impact itself is the reference and stays as-is.

#### What was inferred (explicit interpretation choices)

| Decision | What I chose | Why |
|---|---|---|
| **Architecture: one shared component vs four copy-pasted blocks** | One shared component `section-header.tsx` | Tina said "consistent." A shared component enforces consistency mechanically and makes future header tweaks a one-file edit. The alternative (literal copy-paste into four files) would invite drift the moment anyone edits one. |
| **Color across all four tabs** | Green `#60FF80` everywhere | Tina said "consistent" + "style of the Content one" (which is green), and only called out icon and copy as the things that change per tab. She did not call out color. Strict literal read: same color. |
| **Technical Performance color flip** | Yellow `#FFFC60` → green `#60FF80` | Direct consequence of the universal-green decision above. Pre-existing yellow was overridden to match Tina's consistency directive. |
| **Overview icon** | `Sparkles` (lucide) | Tina did not specify. Sparkles is the AI/answer-engine themed icon in the lucide set; matches the page's role as the top-level AEO visibility view. |
| **Overview question copy** | "How visible is the brand across AI answer engines?" | Tina did not provide copy. Drafted to mirror Content Impact's voice (short question form). Reflects what the Overview page actually shows: visibility, share of voice, sentiment, competitor comparison. |
| **Overview subtitle copy** | "Visibility, share of voice, and sentiment across tracked LLMs, with side-by-side comparison to competitors." | Tina did not provide copy. Drafted by listing the actual metrics rendered on the page. |
| **PR Influence icon** | `Megaphone` (lucide) | Tina did not specify. Megaphone is the canonical PR icon in the lucide set. |
| **PR Influence question copy** | "How is AI-driven PR coverage performing?" | Lifted verbatim from a smaller `h3` already in the file (above the KPI section). Promoted to the header h2 to reuse existing approved language and minimize copy-interpretation risk. |
| **PR Influence subtitle copy** | "Where earned media earns LLM citations, which publications carry the most AI authority, and the opportunities to grow share of voice." | Tina did not provide copy. Drafted to mirror Content Impact's voice. |
| **Overview's existing "ANSWER ENGINE OPTIMIZATION" eyebrow + big "Overview" h2** | Removed entirely | None of the other three tabs has this eyebrow + big title pattern. Keeping it would make Overview inconsistent with Tina's "consistent across all tabs" ask. The top dark band of the page (`StickyReportHeader`) already shows "ANSWER ENGINE OPTIMIZATION" as the page title for the Overview subsection, so removing this block does not lose context. |
| **Technical Performance subtitle em-dash** | Replaced em-dash with a period | The user specified "no AI-looking punctuation like em-dashes" as a working rule going forward. Since the subtitle was being edited anyway (via the header swap), the em-dash was scrubbed at the same time. Content preserved otherwise. |

#### What was explicitly out of scope

- The top dark band (Avenue Z logo + page title + date/model filters) was already shared across all 4 tabs via `StickyReportHeader`. Not touched.
- Em-dashes elsewhere in the AEO codebase (tooltips, comments, table headers, the PR Influence demo-mode badge note string, etc.) were left untouched. Scrubbing them all would be a separate cleanup item.
- No per-client conditional logic was added. The change is structural and universal by construction.
- No changes to the Profound vs Peec provider branching logic in `index.tsx`. The header sits above that branch.

#### Files touched

| File | Change |
|---|---|
| `components/report-sections/peec-ai/section-header.tsx` | **New**. Shared component. Props: `icon`, `title`, `subtitle`, optional `badge`. Color hard-coded green. |
| `components/report-sections/peec-ai/content-impact.tsx` | Replaced the inline header markup with `<SectionHeader />`. Visual output unchanged. |
| `components/report-sections/peec-ai/technical-audit.tsx` | Replaced inline header with `<SectionHeader />`. Icon color shifted yellow to green. Subtitle em-dash replaced with period. |
| `components/report-sections/peec-ai/pr-influence.tsx` | Added `<SectionHeader />` at top of return. Imported `Megaphone` from lucide. |
| `components/report-sections/peec-ai/index.tsx` (Overview) | Removed the eyebrow + h2 block. Replaced with `<SectionHeader />`. Imported `Sparkles` from lucide. |

#### Scope of impact

- Every current AEO client (Avenue Z, Shopify, etc.) sees the new headers automatically. No DB change, no per-client config, no backfill.
- Every future AEO client added to the system gets the new headers automatically. No onboarding step.
- Renders in both the internal dashboard (`/dashboard/[clientSlug]/reports?section=peec-ai...`) and the client portal (`/portal/[clientSlug]/reports/peec-ai...`).

#### Verification

- TypeScript compilation: clean.
- Visual: Content Impact header is byte-identical to before (markup extracted into component, no style changes). Technical Performance, PR Influence, Overview now show the same green icon + question + subtitle treatment.
- Demo-mode badges preserved per tab: Tech and Overview use the inline-with-h2 slot; Content and PR Influence use their pre-existing separate-row signaling unchanged.

#### Open risks (where Tina is most likely to push back, in order)

1. **The Overview question/subtitle copy is my draft, not Tina's words.** If she has specific copy in mind, this is the highest-probability edit.
2. **The Sparkles icon for Overview** was my pick. If Tina prefers a different icon (e.g., Eye, BarChart3, Compass), trivial to swap one prop.
3. **The yellow-to-green color flip on Technical Performance** is the one place existing code was overwritten. If the yellow was a deliberate design decision, swap back by editing one constant in `section-header.tsx` (or pass color as a prop).
4. **The Megaphone icon for PR Influence** was my pick. Trivial swap if Tina wants Newspaper, Radio, or something else.
