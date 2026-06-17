# Official Feedback Log

Source of truth for all feedback on this branch. Every item gets an ID and stays here until `done` or `wontfix`.

**Statuses:** `new` → `triaged` → `needs-clarification` → `in-progress` → `done` / `wontfix`

**Rule:** New issues discovered while fixing another item get their own ID. No silent scope creep.

---

## Active

_(none)_

---

## Closed

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
| **AI synopsis LLM provider** | Vertex AI Gemini (`gemini-2.5-flash-lite`) — same provider already used by `lib/bigquery/gemini.ts` for the Fun Spot conversational summary. | Re-uses existing wiring and project config. No new vendor, no new key. Low latency model, JSON-mode output. |
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
