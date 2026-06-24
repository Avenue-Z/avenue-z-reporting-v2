# Official Feedback Log

Source of truth for all feedback on this branch. Every item gets an ID and stays here until `done` or `wontfix`.

**Statuses:** `new` → `triaged` → `needs-clarification` → `in-progress` → `done` / `wontfix`

**Rule:** New issues discovered while fixing another item get their own ID. No silent scope creep.

---

## Active

_(none)_

---

## Closed

### FB-035 — Watched Pages table overhaul (Tina, 2026-06-24)
- **Ask:** Replace 16-column Planned Content Performance table with 9-column shape: Content Piece (topic + URL hyperlinked), Content Type, Publish Date, Last Updated, Prompt Coverage (+ delta), Citation Share (+ delta), AI Referral Traffic (+ delta), Organic Sessions (+ delta), Engagement Rate (+ delta). Only completed work (strict literal: status === "published" case-insensitive). Paginate at 10 with expand. Default sort Citation Share desc. New title and subtitle. Comparison-period deltas across all 5 metrics.
- **Bug discovered en route:** compareRange was not wired to ContentImpactReport at app/dashboard/[clientSlug]/reports/page.tsx:71, silently killing FB-034 §A delta wiring. Fixed in Task 3.
- **Files touched:**
  - lib/peec/url-citations.ts: added promptIdsByUrlKey field + urlPromptIds helper + dateRange opt on getDomainCoverage; cache versions v3 to v4 (coverage) and v2 to v3 (citations).
  - lib/peec/url-citations.test.ts: appended assertions locking promptIdsByUrlKey aggregation.
  - components/report-sections/peec-ai/sortable-table.tsx: added defaultSortKey + defaultSortDir props.
  - app/dashboard/[clientSlug]/reports/page.tsx:71: wired compareRange prop.
  - components/report-sections/peec-ai/content-impact.tsx: 6 new fetches (4 GA4 + 2 Peec prior-period), per-row metric x period derivation, strict literal status filter.
  - components/report-sections/peec-ai/content-impact-tables.tsx: PlannedContentRow redefined, columns rebuilt, new title and subtitle, pagination at 10, default sort Citation Share desc, inline delta renderer.
- **Sheet row:** Content Impact | Watched Pages: 9-col overhaul + strict status==='published' filter + paginate at 10 + default sort by Citation Share + comparison-period deltas on all 5 metrics + new title/subtitle | Done
- **Hotfix #1 (0485065):** Preview at 46cd794 surfaced every delta reading exactly 0.0% across §A KPIs AND Watched Pages rows. Root cause: content-impact.tsx:221 called parseDateRange(compareRange) directly, which does not understand the magic strings 'previous_period' / 'previous_year' that the date picker emits. The fallthrough returned the SAME window as the main range, so prior fetches received identical data to current fetches and every delta computed to 0. Bug originated in FB-034 Task 2 (10b88dc) and was amplified by FB-035 across 5 per-row deltas. Fix: import deriveCompareRange from lib/ga4/client and call deriveCompareRange(mainRangeStr, compareRange). This is the same helper every other report already uses (ga4, inbound-funnel, pr-influence, demand-overview, peec-ai overview). New regression test lib/ga4/client.test.ts pins (a) parseDateRange does NOT understand 'previous_period' / 'previous_year' (the canary), (b) deriveCompareRange shifts the window correctly for previous_period and previous_year, (c) custom: passthrough works, (d) unknown compare modes return null. Process lesson: before adding data plumbing to a file, grep sibling components for the same symbol; if the file you are editing handles it differently than its peers, that is a question not a feature.

### FB-034 — Content Impact §A Snapshot KPIs: replace 8 cards with Tina's 4 + fix delta display

- **Status:** done
- **Source:** Tina's screenshot annotation on Content Impact §A (2026-06-24). FEEDBACK: "Change these KPIs to: Citation Share, Prompt Coverage, AI Referral Traffic, Organic Traffic." Plus ISSUE: "Right now, when you have a comparison period turned on, it doesn't display change."
- **Author:** Thomas (called) / Claude (implementation)
- **Type:** UI replacement (8 cards → 4) + bug fix (delta wiring)
- **Scope:** `components/report-sections/peec-ai/content-impact.tsx` (orchestrator + local KpiCard), `lib/peec/content-impact-synopsis.ts` (context schema + buildContext + cache bump), `lib/peec/content-impact-synopsis.test.ts` (fixture update)
- **Branch:** `official-feedback-content-impact-tab-content-v1`
- **Sheet rows:**
  - `Content Impact | Change these KPIs to: Citation Share, Prompt Coverage, AI Referral Traffic, Organic Traffic. | Done. §A Snapshot KPIs strip now shows exactly 4 cards: Citation Share (% of total AI citations captured by owned domains), Prompt Coverage (% of tracked prompts citing any owned domain), AI Referral Traffic (GA4 sessions from AI sources), Organic Traffic (GA4 Organic Search channel sessions). Old 8-card grid removed.`
  - `Content Impact | ISSUE: Right now, when you have a comparison period turned on, it doesn't display change. | Fixed. Root cause: page router was passing compareRange prop to ContentImpactReport but the component was ignoring it. Component now accepts compareRange, derives prior period via deriveCompareRange (defaults to previous_period when no explicit range passed), fetches prior-period GA4 sessions, and renders delta line on each KPI card (arrow + magnitude + "vs previous period"). Prompt Coverage shows no delta in v1 because getDomainCoverage does not accept a dateRange (limitation noted; future FB will add prior-period coverage fetch).`

#### Problem

Tina's screenshot on the Content Impact tab marks §A "Snapshot KPIs" with a swap-out for the 8 existing cards (Planned URLs, Live URLs, Total Sessions, AI Citations, AI-Referred Sessions, Owned URLs with AI Activity, % Null/Unmatched, Owned Domains Cited) plus a yellow-highlighted ISSUE: when a comparison period is selected from the date picker, the KPI cards do not display the change between periods.

Root cause investigation: the page router (`app/portal/[clientSlug]/reports/[reportSlug]/page.tsx`) already passes a `compareRange` prop to `ContentImpactReport`, but the component signature did not accept it. The value was silently dropped. No prior-period data was being fetched, so there were no delta values to render even if the cards supported it (which they did not, the local `KpiCard` had no delta slot).

#### Solution — 5 commits

| Sub-item | Commit | What |
|---|---|---|
| **FB-034 (Task 1)** | `989e5d1` | Extend local `KpiCard` with `delta?: number` + `invertDelta?: boolean` props, rendering arrow `↑` green `#60FF80` (positive when not inverted) or `↓` red `#FF4444`, magnitude with 1 decimal, " vs previous period" copy. Mirrors Overview's KpiCard delta rendering exactly. When `delta` is undefined the line is omitted (no fake zero). |
| **FB-034 (Task 2)** | `10b88dc` | Accept `compareRange?: string` on `ContentImpactReport`. Derive `mainIso` and `compareIso` via `parseDateRange` + `deriveCompareRange` (defaults to `'previous_period'`). Add 2 GA4 queries to the existing `Promise.allSettled`: `sessionSource × sessionDefaultChannelGroup × sessions`, one for main and one for prior. Single query shape feeds AI Referral Traffic and Organic Traffic for both periods (4 KPI values from 2 fetches). No JSX changes in this commit. |
| **FB-034 (Task 3)** | `7845dbf` | Compute 4 new KPI values + deltas. Citation Share = `yourBrandCitations / totalCitations * 100`, prior from `peecData.yourBrandCitationsPrior` + `peecData.totalCitationsPrior`, delta in percentage points. Prompt Coverage = aggregate `(unique-prompt-IDs-across-owned-domains / totalTrackedPrompts) * 100` (no prior in v1). AI Referral Traffic = sum where `isAiSource(sessionSource)` from the new query, prior from prior query, delta = `((cur - prior) / prior) * 100`. Organic Traffic = sum where `sessionDefaultChannelGroup === 'Organic Search'`, same delta math. Truth-grounded: prior unavailable → delta stays null → card omits delta line. |
| **FB-034 (Task 4)** | `16a117b` | Swap §A JSX: 8-card grid replaced by 4-card grid (Citation Share / Prompt Coverage / AI Referral Traffic / Organic Traffic). Section header copy is "Snapshot KPIs", Tina's section label from her v1 recommended-layout doc (previously deferred from FB-032). Demo-mode hardcoded values: 24.5% / 67% / 1,243 / 6,667 with sample deltas +2.3pp / -- / +18.4% / -4.2% so the delta line is visually testable in demo mode. |
| **FB-034 (Task 5)** | `3e9a940` | Refactor `ContentImpactSynopsisContext`: drop 6 orphaned old-KPI fields (`plannedUrlsInScope`, `liveUrls`, `totalSessions`, `aiReferredSessions`, `ownedUrlsWithAiActivity`, `unmatchedPct`), keep `totalAiCitations` + `ownedDomainsCited` (validator Rules 2-3 still reference them), add new KPI fields. Update `buildContext()` Data section to reorganize into "Snapshot KPIs for the period" + "Owned-content AI footprint" + "Competitor and third-party AI footprint" with 3 `(USE THESE EXACT VALUES)` section labels. Cache version `v1-glean-ci → v2-glean-ci-kpi-swap` flushes FB-033's stale cached responses. Validator rules 1-3 unchanged. Test fixture `baseContext()` updated to new shape; all 10 assertions still pass. |

#### Verification

- `npx tsc --noEmit` zero output after every commit.
- `npx tsx lib/peec/content-impact-synopsis.test.ts` both `passed.` lines (regression + 9 validator assertions).
- `grep -nc "<KpiCard" content-impact.tsx` exactly 4.
- `grep -n "v2-glean-ci-kpi-swap" content-impact-synopsis.ts` 2 hits (comment + version line).
- `grep -n "Snapshot KPIs" content-impact.tsx` 1 hit (new §A header).
- Vercel preview to be confirmed: §A renders exactly 4 cards in both demo and live modes; selecting a comparison period from the date picker causes the delta line to appear under Citation Share + AI Referral Traffic + Organic Traffic (Prompt Coverage stays delta-less by design).

#### Known limitations

- **Prompt Coverage delta deferred:** `getDomainCoverage(clientSlug)` in `lib/peec/url-citations.ts:286` does not accept a `dateRange` parameter, so there is no prior-period coverage data to subtract from. Card renders the current value alone with no delta line. Future FB can add prior-period coverage support (would require adding a `dateRange?: string` arg to `getDomainCoverage` + downstream Peec query).
- **Comparison period defaults to "previous_period" when not explicitly selected**, same default Overview uses. If the user does not pick a comparison range from the date picker, the page still computes deltas vs. the immediately-prior matching window.

#### Follow-up commits after preview verification

| Commit | What |
|---|---|
| `e2997d0` (polish) | Scrubbed 2 em-dashes from source-code comments in Task 5 (no-em-dash rule applies to comments too). Functional change: zero. |
| `741dc69` (revert) | Reverted 2 overreaches that exceeded Tina's literal ask: (a) §A header restored from "Snapshot KPIs" back to original "How is content performing at a glance?" (Tina's screenshot showed "Snapshot KPIs" as her own annotation label, not a header change request); (b) removed `deriveCompareRange('previous_period')` fallback so deltas render only when the user explicitly turns on a comparison period via the date picker. |
| `b0c1afd` (hotfix #1) | Removed validator Rule 2 after Vercel logs showed the synopsis empty-state firing consistently with `totalAiCitations mismatch: prose claims "3,196 AI citations" but context.totalAiCitations = 105239`. Glean was correctly writing per-domain prose like "example.com earned 3,196 AI citations", but Rule 2's broad regex wrongly treated it as a total claim. Rules 1 + 3 kept. Cache bumped `v2-glean-ci-kpi-swap → v3-glean-ci-rule2-removed`. Regression test added locking the per-domain false positive. |
| `a4a3d12` (hotfix #2) | Citation Share delta gate fix. Peec returns prior values unconditionally (independent of `compareRange`), so Citation Share's delta was leaking even when comparison period was OFF. Now ALL 3 deltable KPIs gate on `compareIso !== null`. Tina's literal "when you have a comparison period turned on" honored across the board. |

#### Deferred for future FBs

- Tina ADD: Scatter chart "AI Bot Traffic vs. Human Traffic" (next FB in this round).
- Tina ADD: Slope chart "Which pages are gaining momentum and which are losing it?" (next FB in this round).
- Tina section labels for §B (Watched Pages), §C (Speed Stats), §F (Fullsite Content Performance), §H (Competitor Analysis), Thomas to confirm next round whether on-page headers or doc labels.
- Prompt Coverage delta wiring (requires getDomainCoverage refactor to accept dateRange).
- Future-FB option: add a narrower Rule 2 to the validator that requires explicit "total" phrasing, IF a real total-misreporting bug appears.

### FB-033 — Content Impact: AI-generated executive synopsis card at top

- **Status:** done
- **Source:** Tina's Google Doc "Content Impact Tab — Recommended layout" (ADD #1, 2026-06-24): "AI-generated synopsis of overall performance & recommended actions during the period, executive overview style."
- **Author:** Thomas (called) / Claude (implementation)
- **Type:** UI addition (new section at top of Content Impact tab)
- **Scope:** `lib/peec/content-impact-synopsis.ts` (new), `lib/peec/content-impact-synopsis.test.ts` (new), `components/report-sections/peec-ai/content-impact-synopsis.tsx` (new), `components/report-sections/peec-ai/content-impact.tsx` (mount + synopsisContext build)
- **Branch:** `official-feedback-content-impact-tab-content-v1`
- **Sheet row:** `Content Impact | ADD: AI-generated synopsis of overall performance & recommended actions during the period, executive overview style. | Added. Sparkles-iconed Executive Synopsis card at top of the tab between the demo badge and the §A KPI strip. Glean-backed, FB-031 hardened (post-Glean validator with 3 numeric-claim patterns + retry-on-violation), FB-025 decimal cap (1 decimal max in prose). Cached 1h per (client, date range, context).`

#### Problem

Tina's v1 recommended layout has a green ADD block at the top of Content Impact for an AI-generated executive synopsis card mirroring the one PR Influence and Overview already ship. Tina did not write the prose herself, she described the brief: "AI-generated synopsis of overall performance & recommended actions during the period, executive overview style." Glean-backed card that summarizes the §A KPIs + the surviving §B/§C/§F/§H sections in 2 to 3 paragraphs followed by 2 to 4 recommended actions, hardened against every prior synopsis bug.

#### Solution — 5 commits + 1 docs commit, FB-031 four-layer pattern from day one

| Sub-item | Commit | What |
|---|---|---|
| **FB-033 (Task 1)** | `fc66a93` | Scaffold `lib/peec/content-impact-synopsis.ts` with `ContentImpactSynopsis` + `ContentImpactSynopsisContext` types + Rule 1 of the validator (brand-absent URL count). FIRST test assertion reproduces the FB-031 analog: context = 5, prose = "0 URLs where brand was absent", validator flags it. |
| **FB-033 (Task 2)** | `054c718` | Round out validator with Rule 2 (total AI citations, thousands-separator aware) + Rule 3 (owned domains cited rounded-to-zero). Plus happy-path + "no" wording + empty-prose tests so accept-by-default behavior is locked. |
| **FB-033 (Task 3)** | `30570d1` | `buildContext()` data section with `USE THESE EXACT VALUES` labels + Glean prompt (executive tone + 1-decimal rule + no-em-dash rule + data-integrity strict rule) + retry-on-violation loop (max 2 attempts; throws to graceful empty state on second failure) + `cached('glean', 'getContentImpactSynopsis', impl, { version: 'v1-glean-ci', ttlSeconds: 3600, tags by client + dateRange })`. |
| **FB-033 (Task 4)** | `91e27f6` | `ContentImpactSynopsis` RSC mirroring the PR Influence shell exactly: Sparkles icon, "Executive Synopsis" eyebrow, paragraph prose, "Recommended actions" list, empty state on error ("Synopsis is temporarily unavailable. Other metrics on this page are unaffected."). |
| **FB-033 (Task 5)** | `b34b3bd` | Mount in `content-impact.tsx`: build `synopsisContext` from the exact same expressions §A KPI cards use (so synopsis numbers can never disagree with KPI strip) + brand-absent count + top-3 brand-absent items mirror the §H.2 live derivation verbatim (`urlCitations.filter(c => !c.mentionsYourBrand && c.competitorBrandNames.length > 0)`) so the synopsis count cannot disagree with the §H.2 table. Insert `<Suspense fallback={skeleton}><ContentImpactSynopsis .../></Suspense>` between the demo badge and §A label. |

#### Hardening pattern (FB-031 carried forward, all four layers)

1. **Prompt labels** `(USE THESE EXACT VALUES)` on every section in the data block so Glean cannot reinterpret them. 4 section labels in the Data block + 1 explanatory comment.
2. **Post-Glean validator** with 3 regex patterns: brand-absent URL count (FB-031 analog), total AI citations (with thousands separator support), owned domains cited (rounded-to-zero guard). Intentionally narrow.
3. **Retry-on-violation** max 2 attempts. Second-attempt prompt includes the specific violations from attempt 1 with explicit instructions. Second failure throws to graceful empty state.
4. **Cache version** `v1-glean-ci`, first cached version of this helper. Future prompt or schema changes must bump it to flush.

Plus FB-025 numeric formatting carried forward: per-row counts rounded to 1 decimal in `buildContext()` before interpolation; "Number formatting (strict)" rule in the prompt.

#### Field-name correction during implementation

The plan's example for §H.2 brand-absent derivation assumed `urlCitations` rows had `brandCitations`/`competitorCitations` numeric fields. Actual `UrlCitation` type (verified in `lib/peec/url-citations.ts`) uses `mentionsYourBrand: boolean` + `competitorBrandNames: string[]`. Implementer (Task 5) adjusted to mirror §H.2's actual live filter verbatim: `urlCitations.filter(c => !c.mentionsYourBrand && c.competitorBrandNames.length > 0)`. This is the same filter §H.2 uses, so by construction the synopsis count + the §H.2 table cannot diverge. `host` populated from `c.domain` (already lowercased + www-stripped via `hostOf()`).

#### Verification

- `npx tsc --noEmit` — zero output, after every commit.
- `npx tsx lib/peec/content-impact-synopsis.test.ts` — both `passed.` lines (regression assertion + 9 validator tests).
- `grep -c "—" lib/peec/content-impact-synopsis.ts components/report-sections/peec-ai/content-impact-synopsis.tsx lib/peec/content-impact-synopsis.test.ts` — zero literal em-dashes in any new file.
- `grep -n "USE THESE EXACT VALUES" lib/peec/content-impact-synopsis.ts` — 5 hits.
- `grep -n "v1-glean-ci" lib/peec/content-impact-synopsis.ts` — 2 hits (1 in version field, 1 in comment).

#### Deferred for later FBs

- Tina ADD: Scatter chart "AI Bot Traffic vs. Human Traffic" (next FB).
- Tina ADD: Slope chart "Which pages are gaining momentum and which are losing it?" (next FB).
- Tina ADD: Section labels (Snapshot KPIs / Watched Pages / Speed Stats / Fullsite Content Performance / Competitor Analysis), Thomas to confirm whether on-page headers or doc labels.
- Tina ISSUE: Snapshot KPIs don't show change when comparison period is on, KPI delta-wiring bug, separate FB.

### FB-032 — Content Impact (v1) layout: delete 7 sections + dead-code cleanup

- **Status:** done
- **Source:** Tina's Google Doc "Content Impact Tab — Recommended layout" (3 screenshots, 2026-06-24)
- **Author:** Thomas (called) / Claude (implementation)
- **Type:** UI removal (layout-only round; no adds, no renames, no copy edits)
- **Scope:** `components/report-sections/peec-ai/content-impact.tsx`, `components/report-sections/peec-ai/content-impact-tables.tsx`
- **Branch:** `official-feedback-content-impact-tab-format-v1`

#### Problem

Tina's v1 recommended layout for Content Impact marks 6 sections REMOVE (red highlight) plus a footer concatenated provenance string that mirrors the one she removed from PR Influence in FB-030 (cross-tab pre-empt). She also calls out 3 new sections to ADD (synopsis card, scatter chart, slope chart) and 5 section labels she's introducing ("Snapshot KPIs"/"Watched Pages"/"Speed Stats"/"Fullsite Content Performance"/"Competitor Analysis"). The ADDs and labels are explicitly deferred to next round per Thomas — content for the new sections will come then; this round is deletion-only to land the layout reshape first.

#### Solution — 9 commits, surgical, deletion-only

| Sub-item | Commit | What |
|---|---|---|
| **FB-032-a** | `46c00cc` | Delete §D "Which delivers more lift — new content or optimization?" + `newRows`/`optimizedRows` split + `sectionDGroup()` + `groupMedianFirstAi()` + `parseDateRange` import (§D was their only caller) |
| **FB-032-b** | `5ff00a3` | Delete §E "Which content is decaying vs. compounding over time?" + `decayBuckets`/`decayOk` block + `tallyTrajectories` and `Trajectory` imports (kept `median` + `computeUrlTiming` for §C) |
| **FB-032-c** | `923edea` | Delete §G "Where is content disconnected from AI demand?" entire wrapper + all 3 sub-views (G.1 Traffic but No AI Citations, G.2 Citations but Little Human Traffic, G.3 Bot Attention but No Citations/Visits) + `ownedHostSet`/`sessionsByPath`/`citedOwnedByPath`/`topicByPath` compute + `labelFromPath` import + 3 G.* table component imports |
| **FB-032-d** | `d3fef39` | Delete §H.3 "Which competitor pages repeat across our target themes?" (IIFE + leading separator) + `urlTagNames` import + `RepeatedCompetitorPagesTable` import |
| **FB-032-e** | `5644c5d` | Delete §I "Which AI systems are interacting with our content?" + `bots` alias (kept `filteredBots` — §A KPI "Owned URLs with AI Activity" still consumes it) + `AISystemsInteractingTable` import |
| **FB-032-f** | `126dcc8` | Delete §J "What should the content team do next?" + all 5 heuristic row builders + `ContentTeamRecommendationsTable` import |
| **FB-032-g** | `d0f5e32` | Delete bottom concatenated footer (FB-030 cross-tab pre-empt — same pattern Tina removed on PR Influence) + now-fully-dead `totalBotVisits` compute |
| **FB-032-h** | `7e8514a` | Code-quality follow-ups from review. Dead §E prior-period GA4 query removed (`priorRange`/`priorRangeStr`, `ga4PriorResult` slot in `Promise.allSettled`, the prior-period `ga4Query` block, `ga4PriorRows`, rejected-logger) — killed a wasted GA4 round-trip per render. Dropped unused `ContentCalendarData` type import. Dropped dead `action` field from `plannedTiming`/`urlTimings` (§D was the only consumer via `groupMedianFirstAi`). Scrubbed seven orphan comments referencing removed sections. Dropped now-orphan `deriveCompareRange` import. |
| **FB-032 (tables cleanup)** | `7ff0e6b` | Drop 6 dead table component exports + Row types from `content-impact-tables.tsx` (`TrafficNoCitationsTable`, `CitationsLittleTrafficTable`, `BotAttentionNoCitationsTable`, `RepeatedCompetitorPagesTable`, `AISystemsInteractingTable`, `ContentTeamRecommendationsTable`). Drop `PRIORITY_COLORS` constant, `opportunityNote` `TT` key, and the entire `Globe2`/`Sparkles` lucide import line. Surviving exports: `PlannedContentPerformanceTable` (§B), `OwnedContentCitedTable` (§F), `CompetitorDomainsCitedTable` (§H.1), `CompetitorUrlsBrandAbsentTable` (§H.2). Net change: -532 lines, single file. |

#### Surviving page (top → bottom)

1. `SectionHeader` (existing, untouched)
2. **§A** Snapshot KPIs — 8-card grid (untouched)
3. **§B** Watched Pages — Planned Content Performance table (untouched)
4. **§C** Speed Stats — Time-to-First-Traffic/AI-Activity cards (untouched)
5. **§F** Fullsite Content Performance — Owned Content Cited table (untouched)
6. **§H** Competitor Analysis — H.1 Top Competitor Domains + H.2 Brand-Absent Editorial URLs (H.3 stripped, wrapper preserved)

All deletions land in JSX itself, not behind `calendarIsDemo` gates — demo-on and demo-off render identically.

#### Library files INTENTIONALLY untouched

`lib/ga4/content-derive.ts` (kept — `tallyTrajectories` / `Trajectory` / `classifyTrajectory` still consumed by `lib/ga4/content-derive.test.ts`). `lib/peec/url-citations.ts` (kept — `urlTagNames` still consumed by `lib/peec/url-citations.test.ts`). Only the *imports* in `content-impact.tsx` were dropped. No library API change.

#### Files touched

- `components/report-sections/peec-ai/content-impact.tsx` — 7 JSX deletions + supporting compute + import cleanup across 8 commits.
- `components/report-sections/peec-ai/content-impact-tables.tsx` — 6 dead exports + tooltip key + lucide imports dropped in 1 commit.

#### Verification

- `npx tsc --noEmit` — zero output, after every commit.
- `grep -n "Section [A-Z]:" components/report-sections/peec-ai/content-impact.tsx` — only A, B, C, F, H. Zero hits for D, E, G, I, J.
- `grep -nc "export function" components/report-sections/peec-ai/content-impact-tables.tsx` — `4`.
- `grep -n "Content Impact Tracker" components/report-sections/peec-ai/content-impact.tsx` — 1 hit (the file-header doc comment banner at line 34, source-code only; the user-visible footer `<p>` block is gone).
- `grep -n "ga4PriorRows\|priorRange\|tallyTrajectories\|Trajectory\|urlTagNames\|labelFromPath\|parseDateRange\|deriveCompareRange\|sectionDGroup\|groupMedianFirstAi\|decayBuckets\|sessionsByPath\|citedOwnedByPath\|topicByPath\|totalBotVisits\|sectionJRows\|ContentCalendarData" components/report-sections/peec-ai/content-impact.tsx` — zero hits.

#### Deferred (cataloged for next round)

- **Tina ADD: AI-generated synopsis card** at top of page (will apply FB-031 hardening pattern: section labels with `USE THESE EXACT VALUES`, `Data integrity (strict)` prompt rule, post-Glean `validateXxxGrounding` validator, retry-on-violation, cache version bump).
- **Tina ADD: Scatter chart** "AI Bot Traffic vs. Human Traffic" with verbatim title + subtitle, 2x2 quadrants (High Bot/Low Human, High Bot/High Human, Low Bot/Low Human, Low Bot/High Human).
- **Tina ADD: Slope chart** "Which pages are gaining momentum and which are losing it?" with verbatim subtitle and toggle buttons for AI Referral Traffic / Organic Search Traffic / Citation Share.
- **Tina labels** ("Snapshot KPIs"/"Watched Pages"/"Speed Stats"/"Fullsite Content Performance"/"Competitor Analysis") — Thomas to confirm next round whether these become on-page section headers or stay as doc-organization labels.
- **Tina ISSUE on Snapshot KPIs:** "Right now, when you have a comparison period turned on, it doesn't display change." Separate FB next round — KPI delta-wiring bug, not layout.

#### Plain-English summaries for Tina's sheet (column F equivalent)

When Tina sets up the Content Impact tab in her scorecard sheet, these are the column-F-style "what shipped" notes for each REMOVE row:

- §D: Done. Section removed.
- §E: Done. Section removed.
- §G: Done. All three views in this section removed.
- §H.3 (Repeated Competitor Pages): Done. Subsection removed; the broader Competitor Analysis section above it kept.
- §I (AI Systems Interacting): Done. Section removed.
- §J (What should the content team do next?): Done. Section removed.
- Bottom footnote: Done. The footnote is gone.

#### Open risks

- The `SectionHeader` subtitle at the top of the page still ends "...and what the content team should build next" — wording that referenced §J, which is now deleted. Tina did not flag the subtitle copy, so it was intentionally left alone per literal-interpretation policy. If Tina raises it on v1 review, ship a one-line copy edit next round.
- The `// Content Impact Tracker` source-code comment at line 34 of `content-impact.tsx` is preserved (source-code only, not user-visible) — same handling as the matching code comment on PR Influence after FB-030.

### FB-031 — Harden PR Influence synopsis against Glean contradiction

- **Status:** done
- **Source:** Thomas eyeballed the Vercel preview of PR #64 and caught the Executive Synopsis saying *"AI cited 8 editorial domains, and there were 0 editorial domains where the brand was absent during the period."* while the Top Editorial Opportunities table on the same page showed 5 brand-absent editorial URLs. Two surfaces on the same page contradicted each other.
- **Author:** Thomas (caught) / Claude (implementation)
- **Type:** correctness hardening (no UI change)
- **Scope:** `lib/peec/pr-influence-synopsis.ts`, new `lib/peec/pr-influence-synopsis.test.ts`

#### Problem

The PR Influence Executive Synopsis is a Glean Chat response grounded in `synopsisContext`. In the preview, Glean returned prose that flatly contradicted the table directly beneath it. Code-trace confirmed both surfaces source from the same `byHost` map (`synopsisContext.brandAbsentCount = byHost.size`; table = `sortedByHost.slice(0, 50)`), so they cannot differ at render-time. Root cause was either Glean hallucinating around a numeric count or a stale cached response sneaking past the arg-based cache key. Either way, the previous prompt did not have a rule forbidding the model from rounding a positive count to zero, and there was no post-generation check.

#### Solution — four defensive layers

1. **Prompt hardening.** Section labels in the user message marked `USE THESE EXACT VALUES` so Glean cannot mistake them for prose-adjustable inputs. New explicit `Data integrity (strict)` rule: never round a positive count to zero, never say "no" when a count is positive, never state a positive number when a count is zero.
2. **Post-Glean validator** (new exported `validateSynopsisGrounding`). Scans the returned prose for three numeric-claim patterns and verifies each one against `synopsisContext`:
   - brand-absent host count (the exact bug we hit, in both phrasing variants)
   - total editorial domains cited (`N editorial domains`)
   - `N of M placements` AI-citation rate
3. **Retry-on-violation.** If the validator finds a violation, the helper retries once with a stricter prompt that names the specific contradictions. On second failure it throws — the component's existing try/catch (in `pr-influence-synopsis.tsx`) renders the graceful "Synopsis is temporarily unavailable" empty state. We never ship prose that contradicts the page.
4. **Cache version bump.** `v2-glean-pri` → `v3-glean-pri-grounded` so any older cached responses generated under the weaker integrity rule are evicted on deploy.

#### Files touched

- `lib/peec/pr-influence-synopsis.ts` — prompt hardening, new `validateSynopsisGrounding` export, retry-on-violation loop in `getPRInfluenceSynopsis`, cache version bump.
- `lib/peec/pr-influence-synopsis.test.ts` — **new file.** 13 unit assertions locking the validator contract. The first assertion reproduces the production bug verbatim and asserts validation flags it.

#### Verification

- `npx tsx lib/peec/pr-influence-synopsis.test.ts` — all 13 assertions pass.
- `npx tsx lib/peec/sentiment-insights.test.ts` — still green.
- `npx tsx lib/peec/winners-losers.test.ts` — still green.
- `npx tsc --noEmit` — zero output.
- Type signature of `getPRInfluenceSynopsis` unchanged. `pr-influence-synopsis.tsx` requires no edits.

#### Open risks

- The validator regex set is intentionally narrow (three known patterns) to avoid false positives on natural Glean prose. If Glean invents a fourth way to contradict the context, the validator will not catch it. Mitigation: cache bump + stricter prompt should reduce the rate; we extend the regex set if a new pattern surfaces.
- Overview synopsis (`lib/peec/synopsis.ts`) is **not** hardened in this commit. That is a deliberate scope cut — reserved as a follow-up so this fix can ship clean.

### FB-030 — Remove bottom footnote on PR Influence

- **Status:** done
- **Source:** Tina v1 PR Influence CSV row 24 (unmarked REMOVE ask). Verbatim: *"REMOVE: This footnote at the very bottom of report. 'PR Influence on AI Visibility . Peec AI (live) . GA4 AI referral sessions (live) . 3 PR placements (2025-06-06 to 2026-01-27)'"*
- **Author:** Thomas (called) / Claude (implementation)
- **Type:** UI removal
- **Scope:** `components/report-sections/peec-ai/pr-influence.tsx`

#### Problem

A trailing `<p className="text-xs text-text-muted">` block at the bottom of the PR Influence RSC concatenated tab title, data-source disclosure, and PR placement count + date range into a small-print footnote. Tina explicitly asked it gone.

#### Solution

Deleted the `<p>` block entirely. No replacement. The file's top-of-file `// PR Influence on AI Visibility` code comment header is preserved because it is not user-visible.

#### Files touched

- `components/report-sections/peec-ai/pr-influence.tsx` — one `<p>` block deleted.

#### Verification

- `npx tsc --noEmit` zero output.
- Grep confirms the only remaining occurrence of the string "PR Influence on AI Visibility" is in the top-of-file code comment, not in JSX.
- Existing tests still pass.

#### Open risks

None. Pure deletion, no behavior change beyond removing the footnote.

### FB-029 — PR Placement Matchback restored under Exec Summary

- **Status:** done
- **Source:** Tina v1 PR Influence CSV row 23 (R23 REVISION). Verbatim: *"REVISION: We would like to add a chart right beneath the exec summary that is showing this information requested from the PRD. I think the PR placement matchback was the answer to this but somehow got left out of the outline or maybe accidentally was deleted."* PRD quote: *"Did placements achieved by the PR team get cited in AI? The dashboard must compare a maintained list of PR-secured placements against the list of editorial URLs cited in tracked AI answers."*
- **Author:** Thomas (called) / Claude (implementation)
- **Type:** restore + simplify (formerly removed in FB-015 commit `81b2277` per Tina's V1 5-section layout; her V2 REVISION explicitly asks for it back)
- **Scope:** `components/report-sections/peec-ai/pr-influence.tsx`, `components/report-sections/peec-ai/pr-influence-tables.tsx`

#### Problem

The PR Placement Matchback table answered the PRD question "Did placements achieved by the PR team get cited in AI?". FB-015 removed it because Tina's V1 5-section "Recommended layout" omitted it. Tina V2 R23 REVISION explicitly says it was the answer to the PRD ask and should be restored — right beneath the Executive Synopsis.

#### Solution

- New focused `PRPlacementMatchbackTable` in `pr-influence-tables.tsx` with 5 columns: Publication / Article / Publish Date / Cited by AI? / AI Engines. Simpler than the pre-FB-015 13-column version. Mapped to Tina's literal title ("which placements are showing up in AI citations").
- Tina's verbatim title and subtitle wired through the existing `<SectionHeading>` component.
- "N of M placements cited by AI (rate%)" summary line above the table for instant readability.
- Rendered between `<PRInfluenceSynopsis>` and `<SentimentInsights>` in `pr-influence.tsx` — exactly where Tina asked.
- Reuses the still-live `filteredMatchbackRows` (date + model aware) and `placementsCitedByAI` — both kept after FB-015 for the synopsis context. No new fetches, no new data layer.
- Universal across clients. Empty-state copy honest when there are no placements in the selected timeframe.

#### Files touched

- `components/report-sections/peec-ai/pr-influence-tables.tsx` — new `PRPlacementMatchbackTable` component + `PRPlacementMatchbackRow` type appended.
- `components/report-sections/peec-ai/pr-influence.tsx` — import + matchback row list + render between Synopsis and Sentiment.

#### Verification

- `npx tsc --noEmit` zero output.
- Grep confirms Tina's verbatim title and subtitle strings live in the source.
- Existing tests still pass.

#### Open risks

None. Data layer was already in place; this is pure restore + simplified render.

### FB-028 — Top Editorial Opportunities: URL-level brand-absent, Tina R15 5-col shape preserved

- **Status:** done
- **Source:** Tina v1 PR Influence CSV. R15 ✅ (the V1-accepted 5-column shape that must stay): *"Top Editorial Opportunities: 5 columns (Publication / Article / Competitors Mentioned / Citation Share / Delta of Citation Share)"*. R16 ⚠️: *"There should be more than one pitch opportunity here. When I look in Peec and look at URLs and filter to editorial, there are thousands of articles."* R17 ⚠️: *"See issue above, there must be something wrong with one of the filters."*
- **Author:** Thomas (called) / Claude (implementation)
- **Type:** data-layer rewrite + table column shape preserved
- **Scope:** `components/report-sections/peec-ai/pr-influence.tsx`, `components/report-sections/peec-ai/pr-influence-tables.tsx`

#### Problems

Three compounding bugs collapsed the production table to 0-1 rows even when Peec held hundreds of brand-absent editorial URLs:
1. `brandAbsentDomains = editorialDomains.filter(d => !prDomains.has(d.domain.toLowerCase()))` defined "brand absent" as "no PR placement on this domain." Wrong definition. A brand can have no PR placement on a domain yet still be mentioned in editorial articles cited there.
2. `brandAbsentRowsFiltered = brandAbsentDomains.filter((d) => d.retrievedDelta > 0)` required a positive period-over-period delta at the DOMAIN level. R15 ✅'d "Delta of Citation Share" as a COLUMN to DISPLAY, not as a filter to GATE inclusion. Removed.
3. `.slice(0, 20)` capped the collapsed list.

#### Solution

- **Row source:** `urlCitations` (URL-level), date-scoped to the page date range. The pre-existing `getUrlCitations(clientSlug)` call passed no opts, defaulting to internal `last30()` — also fixed.
- **Brand-absent filter:** `c.mentionsYourBrand === false` (R16 literal).
- **Editorial filter:** `c.classification?.toLowerCase() === 'editorial'` (R16's "filter to editorial" Peec UI literal) with a host cross-reference fallback against `editorialDomains` so the table is never silently empty.
- **Honest Citation Share:** `c.citationCount / sumOfAllPeriodCitations * 100`.
- **Honest Delta of Citation Share:** added prior-period `getUrlCitations(clientSlug, { startDate: resolvedCompare.startDate, endDate: resolvedCompare.endDate })` to `Promise.allSettled`. Built `priorShareByUrlKey` map. `delta = currentShare - priorShare`. Reuses the existing `<CitationDelta>` ↑/↓ widget.
- **R15 ✅ 5 columns preserved verbatim**: Publication / Article / Competitors Mentioned / Citation Share / Delta of Citation Share.
- **One row per host:** top brand-absent editorial URL on each host (table reads cleanly when one domain has many brand-absent URLs).
- **Cap raised from 20 to 50.**
- **Synopsis context** (`brandAbsentCount` + `topBrandAbsentDomains`) sources from the same URL-level `byHost` map for table-prose consistency.

#### Files touched

- `components/report-sections/peec-ai/pr-influence-tables.tsx` — `BrandAbsentEditorialDomainRow` shape (replaced `citationCount` + `citationCountDelta` with `citationShare` + `citationShareDelta`), `BrandAbsentEditorialDomainsTable` columns (all 5 columns kept, value formulas updated).
- `components/report-sections/peec-ai/pr-influence.tsx` — `Promise.allSettled` adds `urlCitationsPriorResult`; URL fetches date-scoped to page range; entire brand-absent compute block rewritten; synopsis context sources from `byHost` map.

#### Verification

- `npx tsc --noEmit` zero output.
- `npx tsx lib/peec/sentiment-insights.test.ts` still passes.
- `npx tsx lib/peec/winners-losers.test.ts` still passes.
- Grep confirms the legacy `!prDomains.has` misdefinition and `retrievedDelta > 0` gate no longer appear in `pr-influence.tsx`.
- Grep confirms both R15 column labels live in `pr-influence-tables.tsx`.

#### Open risks

- The primary editorial filter is `classification === 'editorial'`. If Peec exposes a different exact string (e.g. `'Editorial'` capitalized differently, or `'editorial_news'`), the lowercase check still matches `'editorial'` substring. If it doesn't match at all, the host cross-ref fallback kicks in. Worth verifying on the Vercel preview that the table is populated.
- URL-level prior-period data depends on Peec returning per-URL rows for the prior date window. If `resolvedCompare` is null (e.g. very long custom range), prior fetch resolves to `[]` and `priorShareByUrlKey` is empty — all deltas equal currentShare in that case. Honest fallback.

### FB-027 — Dynamic X-axis on Prompt Clusters chart

- **Status:** done
- **Source:** Tina v1 PR Influence CSV row 14 (R14). Verbatim: *"ISSUE: The bars are appearing very small, can we have this chart dynamically adjust to better show the relativity of rows? For example, if the highest value of one of the rows is only 3.1%, the X-axis doesn't need to go all the way up to 100%. Maybe it could be adjusted to the next highest '5' or '10'."*
- **Author:** Thomas (called) / Claude (implementation)
- **Type:** chart axis fix
- **Scope:** `components/report-sections/peec-ai/pr-influence-tables.tsx` — `PromptClusterOpportunityMatrix` only.

#### Problem

`<XAxis domain={[0, 100]}>` was hard-pinned. When a client's top editorial-citation-share value is small (Tina's example: 3.1%), every bar renders as an anemic sliver against the 100% scale.

#### Solution

Compute `maxValue = Math.max(...chartData.map(d => d.value))`. Round it up:
- `maxValue === 0` → fallback to `upper = 5` (axis still renders gridlines).
- `maxValue <= 10` → `upper = Math.ceil(maxValue / 5) * 5` (next multiple of 5).
- `maxValue > 10` → `upper = Math.ceil(maxValue / 10) * 10` (next multiple of 10).

Pass `domain={[0, upper]}` to the X-axis. Everything else unchanged — same chart, same colors, same tooltip, same heights.

#### Files touched

- `components/report-sections/peec-ai/pr-influence-tables.tsx` — `PromptClusterOpportunityMatrix` function body.

#### Verification

- `npx tsc --noEmit` zero output.
- Grep confirms `domain={[0, 100]}` is gone and `domain={[0, upper]}` is present.
- Existing tests (lib/peec/sentiment-insights.test.ts + lib/peec/winners-losers.test.ts) still pass.

#### Open risks

None. Single-block change, pure presentation, no data layer impact.

### FB-026 — Live Glean-backed Sentiment Insights, date + model reactive

- **Status:** done
- **Source:** Tina v1 PR Influence CSV rows R4 + R5 (both same complaint, on the card body and the pill). Verbatim: *"ISSUE: This seems like static copy and should be pulling actual data. It doesn't change when a new date range or model is selected and is an exact copy of the example text I provided."*
- **Author:** Thomas (called) / Claude (implementation)
- **Type:** new feature (live data + Glean classification) + component rewrite
- **Scope:** `lib/peec/sentiment-insights.ts` (NEW), `lib/peec/sentiment-insights.test.ts` (NEW), `components/report-sections/peec-ai/sentiment-insights.tsx` (rewrite), `components/report-sections/peec-ai/pr-influence.tsx` (RSC plumbing)

#### Problem

Pre-FB-026 the Sentiment Insights card was 100% hardcoded Avenue Z sandbox content: `POSITIVE_THEMES` array, `WEAKNESSES` array, `SENTIMENT_PCT = 89.4`, and a `SANDBOX_CLIENT_SLUG === 'avenue-z'` gate that hid it on every other client. It did not react to the page date range or the model filter because there was no data flow.

#### Solution

1. New `lib/peec/sentiment-insights.ts` helper that:
   - Accepts per-URL citation data already filtered to period + model by the caller.
   - Sends the URLs + titles to Glean Chat with a strict-JSON output schema.
   - Returns `{ sentimentPct, positiveThemes[], negativeThemes[], analyzedUrlCount }`.
   - Cached per `(clientSlug, dateRange, modelKey)` for one hour. `modelKey` is a stable sorted-comma-join.
   - Mirrors the canonical `lib/peec/synopsis.ts` pattern (three-tier JSON extractor, gleanChat with saveChat:false, no actAs).
2. New `lib/peec/sentiment-insights.test.ts` with 10 assertions covering `applyEnginesFilter` and `modelKeyOf`.
3. `sentiment-insights.tsx` rewritten as a props-driven `'use client'` component that accepts `data: SentimentInsights | null` and renders accordions over the live themes. The pill tint + label derive from the live `sentimentPct`. Empty state copy is honest when zero AI-cited URLs are available.
4. `pr-influence.tsx` filters URL citations to the active model selection (`applyEnginesFilter`), calls `getSentimentInsights` server-side, and passes the result via props. Wrapped in try/catch so a Glean failure does not crash the page.

The Avenue Z sandbox gate is LIFTED. Every client sees live sentiment.

#### Files touched

- `lib/peec/sentiment-insights.ts` (NEW)
- `lib/peec/sentiment-insights.test.ts` (NEW)
- `components/report-sections/peec-ai/sentiment-insights.tsx` (full rewrite)
- `components/report-sections/peec-ai/pr-influence.tsx` (imports + RSC plumbing + JSX)

#### Verification

- `npx tsc --noEmit` zero output.
- `npx tsx lib/peec/sentiment-insights.test.ts` all 10 assertions pass.
- `npx tsx lib/peec/winners-losers.test.ts` still passes.
- Glean call uses `gleanChat()` with `saveChat: false` and no `actAs` (USER token).

#### Open risks

- Quality of themes depends on Glean's classification accuracy over URL titles. If a period has too few cited URLs (or titles are missing), the empty state path is the honest outcome.
- Cache key is keyed on `modelKey` plus `dateRange` plus `clientSlug`. Different model orderings collapse to the same key via `modelKeyOf` (sorted-join).

### FB-025 — Round synopsis numerics + strict format rule

- **Status:** done
- **Source:** Tina v1 PR Influence CSV row 2 (R2). Verbatim: *"ISSUE: The executive synopsis is returning long decimals that are standing out as unnecessary."* Example she provided: `growthmarketingpro.com at 2.6297537434931484 AI citations`.
- **Author:** Thomas (called) / Claude (implementation)
- **Type:** prompt + format fix
- **Scope:** `lib/peec/pr-influence-synopsis.ts`

#### Problem

`buildContext()` interpolated per-domain citation counts (Peec `retrieved` field, a float percentage) and opportunity scores (derived 0-100) into the Glean prompt as raw numbers. Glean dutifully echoed them into prose verbatim, producing readable-but-ugly long decimals in the Executive Synopsis.

#### Solution

1. `d.citationCount.toFixed(1)` for per-domain interpolations; `Math.round(o.score)` for opportunity scores.
2. New strict 'Number formatting' rule in the prompt: at most 1 decimal in prose, integers stay integers, percentages render as 'N.N%', counts use thousands separators.
3. Bumped cache version `v1-glean-pri` → `v2-glean-pri` so previously-cached responses with raw floats are flushed.

#### Files touched

- `lib/peec/pr-influence-synopsis.ts` — `buildContext()` body, `getPRInfluenceSynopsisImpl()` prompt string, `cached()` version field.

#### Verification

- `npx tsc --noEmit` zero output.
- Existing tests (lib/peec/winners-losers.test.ts) still pass.

#### Open risks

None. Single-file change, no schema or render-layer impact.

### FB-024 — YTD chart pinned to today + drop misleading "Tracking began" line + revert Neon column

- **Status:** done
- **Source:** Thomas after Paul declined the FB-022 Neon migration. Re-read of Tina's literal CSV E7: *"this YTD chart is changing based on the date range selector. Please make static to always show YTD."*
- **Author:** Thomas (called) / Claude (implementation)
- **Type:** data layer fix + cleanup
- **Scope:** `lib/peec/client.ts`, `lib/profound/client.ts`, `components/report-sections/peec-ai/visibility-chart.tsx`, `components/report-sections/peec-ai/index.tsx`, `lib/db/schema.ts`, deleted `drizzle/0010_jittery_nextwave.sql` + `drizzle/meta/0010_snapshot.json` + journal entry.

#### Problems FB-022 left open

1. **YTD window still partially reacted to the picker.** FB-022 computed `ytd = { start: Jan 1 of year(mainDates.endDate), end: mainDates.endDate }`. For relative ranges the picker uses today as endDate, so the chart looked static. But for custom historical ranges (e.g. user picks "Jan 1 to Mar 15"), the chart truncated to that end date. Not literally what Tina asked for.
2. **"Tracking began" line was unsourceable** without the Neon column Paul declined. FB-022 wired it through a new `clients.firstTrackedAt` DB column + Drizzle migration; without the migration the SELECT would fail at runtime.

#### Solution

1. **Pin YTD window to today.** Both clients now compute `ytd = { start: Jan 1 of current year, end: today }`, completely independent of `mainDates.endDate`. Chart is truly static. The picker has zero effect on it.
2. **Drop the "Tracking began" display entirely.** Tina called the displayed value incorrect. With no source of truth (Neon column reverted), the honest answer is to remove the misleading line. The chart's H1 ("How has AI visibility grown this year?") + the page-level YTD selector already communicate the time window.
3. **Revert the Neon work.** Removed `firstTrackedAt` from `lib/db/schema.ts`. Deleted the Drizzle migration SQL + snapshot JSON. Reverted the journal entry. Dropped the `firstTrackedAt` prop from `ProviderSection` + `<VisibilityChart>`.

#### Freshness

Chart refreshes daily without any new wiring. Page load triggers the YTD fetch (subject to the existing 1h `cached()` TTL). Peec's nightly ingest lands new bars by morning; once the cache TTL expires, the fresh data appears.

#### Files touched

- `lib/peec/client.ts` — YTD `end_date` now pinned to today (was `mainDates.endDate`).
- `lib/profound/client.ts` — YTD `end_date` now pinned to today.
- `components/report-sections/peec-ai/visibility-chart.tsx` — dropped `firstTrackedAt?: Date | null` prop, dropped `trackingStart` declaration, dropped the `<p>Tracking began ...</p>` display line. Tooltip retained (it's accurate).
- `components/report-sections/peec-ai/index.tsx` — dropped `firstTrackedAt` from `ProviderSection` prop type + destructure + both invocations.
- `lib/db/schema.ts` — reverted the `firstTrackedAt: timestamp('first_tracked_at', { mode: 'date' })` column add.
- DELETED `drizzle/0010_jittery_nextwave.sql`, DELETED `drizzle/meta/0010_snapshot.json`, reverted `drizzle/meta/_journal.json` entry idx 10.

#### Verification

- `npx tsc --noEmit` zero output.
- `npx tsx lib/peec/winners-losers.test.ts` all 16 assertions pass.
- `grep firstTrackedAt|first_tracked_at` across lib/components/app/drizzle returns zero hits.
- `grep trackingStart|Tracking began` returns zero hits.

#### Open risks

None. Code-only change. No DB touch.

#### Lineage

Supersedes the DB-column portion of FB-022. Keeps FB-022's YTD-fetch and tooltip improvements.

---

### FB-023 — Winners/Losers cards: live, date AND model reactive (CSV E11)

- **Status:** done
- **Source:** Tina's Overview-tab v1 scorecard CSV, cell E11: *"ISSUE: This seems like static copy and should be pulling actual data. It doesn't change when a new date range or model is selected and is an exact copy of the example text I provided."*
- **Author:** Tina (flagged) / Claude (implementation)
- **Type:** data layer + compute + UI rewrite + sandbox lift
- **Scope:** `lib/peec/client.ts`, `lib/profound/client.ts`, NEW `lib/peec/winners-losers.ts`, NEW `lib/peec/winners-losers.test.ts`, `components/report-sections/peec-ai/winners-losers-cards.tsx`, `components/report-sections/peec-ai/index.tsx`.

#### Literal interpretation

Tina named BOTH date range AND model selection. Honored literally: cards react to both. Sandbox gate also lifted; keeping the gate would mean other clients see nothing, contradicting "should be pulling actual data" for any client.

#### Two-part change

1. **Data layer (`lib/peec/client.ts`)**:
   - Updated the existing `promptBrandsRes` fetch to dimension by `['prompt_id', 'model_channel_id', 'model_id']`. Limit bumped 2000 to 5000 to absorb the larger (prompt × model) row count.
   - Added `promptBrandsPriorRes` with the same model-dimensioned shape, bounded to the prior period.
   - Built per-prompt-per-model position maps for both periods, scoped to your brand.
   - Flattened across models for the legacy `promptMetricsById` consumer (downstream code keeps its previous semantics).
   - Extended `TrackedPrompt` type with `positionByModel` + `priorPositionByModel` (`Partial<Record<AEOModel, number>>`).
   - Cache version stays at v8 (FB-022 + FB-023 ship together in this branch); comment updated.

2. **Compute + UI**:
   - New `lib/peec/winners-losers.ts` with TWO pure functions: `applyModelFilter(prompts, models)` collapses per-model maps to flat `{ position, priorPosition }` per prompt, restricted to selected models. `computeWinnersLosers(flat)` splits into winners (delta > 0) and losers (delta < 0), sorts by absolute delta, caps at 20 per side.
   - Unit tests for both (model filter scenarios + averaging + drops + all compute edge cases). Uses `node:assert` and `tsx` to match the project's existing test convention.
   - `winners-losers-cards.tsx` rewritten props-driven. Static const arrays removed. Sandbox gate lifted. Empty state copy mentions both date and model.
   - `peec-ai/index.tsx` `ProviderSection`: chains `applyModelFilter` then `computeWinnersLosers` using the active `models` prop. Profound provider variant runs the same compute but yields empty arrays because Profound's per-model maps are always empty (parity-only mirror).

3. **Profound parity (type-level only)**:
   - `lib/profound/client.ts` `TrackedPrompt` mirrors the new fields with empty maps. Profound's Overview shows the cards in their empty state because Profound's API doesn't yet expose per-prompt-per-model rows. A separate Profound-parity FB can wire actual data when needed.

#### Lineage

Supersedes FB-006 (static Avenue Z arrays + clientSlug-gated render).

#### Scope of impact

Overview tab Winners/Losers cards. Other surfaces that consume `data.trackedPrompts` see two new fields added to the type; they don't reference them so they are unaffected. Flattened `position` / `visibility` / `sov` fields keep their previous semantics. Demo data (`lib/demo-data/peec.ts`, `lib/demo-data/profound.ts`) typed and populated with empty per-model maps so the Overview demo mode still renders.

#### Performance note

One additional `peecPost('/reports/brands')` per Overview page load (the prior-period prompt fetch). Plus larger response on the current-period fetch (rows now per-prompt-per-model). `limit: 5000` should suffice for current clients; verify during smoke and bump if Peec returns truncated pages. Caches per `(clientSlug, dateRange)` for 1 hour.

#### Verification

- `npx tsc --noEmit` — zero output.
- `npx tsx lib/peec/winners-losers.test.ts` — 16 assertions pass.
- Static verification only (tsc + tsx); dev-server smoke deferred until the FB-022 migration is applied so the chart works end-to-end.

#### Open risks

- **`limit: 5000` truncation:** If a client has > 5000 (prompt × model) rows, Peec returns the first page only. Detected during dev smoke by checking response length.
- **Thin-history clients:** Brand-new clients with no comparable prior period or no prompts under selected models get the empty-state message. Literal "actual data or nothing" interpretation.
- **Profound provider variant on Overview:** shows empty cards until Profound parity ships.

---

### FB-022 — Visibility chart truly YTD + show correct "Tracking began" date (CSV E7)

- **Status:** done
- **Source:** Tina's Overview-tab v1 scorecard CSV, cell E7: *"ISSUE: 'Tracking began May 18' – this is incorrect, this workspace has been tracking data since March 28, 2025. I think that this YTD chart is changing based on the date range selector. Please make static to always show YTD."*
- **Author:** Tina (flagged) / Claude (implementation)
- **Type:** data layer + display
- **Scope:** `lib/peec/client.ts`, `lib/profound/client.ts`, `lib/db/schema.ts`, `drizzle/0010_jittery_nextwave.sql` (new migration), `components/report-sections/peec-ai/index.tsx`, `components/report-sections/peec-ai/visibility-chart.tsx`.

#### Two-part issue

1. **Data-layer bug:** `dailyVisibility` was fetched with the date-range-bound `current` body in both clients. The chart's tooltip claimed YTD but the data tracked the picker. Tina caught it.
2. **Display bug:** "Tracking began May 18" was rendered from `bucketDaily(data, 'weekly')[0]?.label`, i.e., the first weekly bucket of whatever data was passed in. When the picker was "Last 30 days" and today was a Tuesday, the first weekly bucket fell on a recent Monday. It was a misleading artifact of the picker-bound fetch, not a workspace inception date.

#### Decision (literal CSV fix)

Tina gave us the correct date (March 28, 2025) and said the displayed date is incorrect. Honored literally by sourcing the date from a new `clients.firstTrackedAt` column populated per-client. The leftmost X-axis bucket label of the now-truly-YTD chart won't reflect Avenue Z's actual inception when it predates the current year. Only the DB-sourced label can.

#### Implementation

- `lib/db/schema.ts`: added `firstTrackedAt: timestamp('first_tracked_at', { mode: 'date' })` to clients table.
- `drizzle/0010_jittery_nextwave.sql`: additive nullable ALTER TABLE migration (auto-generated via drizzle-kit generate).
- `lib/peec/client.ts`: added YTD window compute; parallel `trendRowsYTD` fetch; routed `dailyVisibility`/`competitorDailyVisibility` to YTD; bumped cache version v7 to v8.
- `lib/profound/client.ts`: added YTD window compute; added `weeklyYTDRes` fetch in the Promise.all; routed `dailyVisibility`/`competitorDailyVisibility` to YTD; bumped cache version v4 to v5.
- `components/report-sections/peec-ai/index.tsx`: threaded `firstTrackedAt` from `getClientBySlug` through `ProviderSection` to `<VisibilityChart>`.
- `components/report-sections/peec-ai/visibility-chart.tsx`: replaced `trackingStart` calc with `firstTrackedAt: Date | null` prop. Formats + displays as "Tracking began {full date}" when provided; omits the line when null. Updated header tooltip from "fixed to year-to-date" to "Year-to-date, this chart shows the full year regardless of the page date picker."

#### Scope of impact

Overview tab visibility chart on both Peec + Profound provider variants. `weeklyVisibility` (consumed by `components/report-sections/demand-overview/index.tsx`) is intentionally LEFT as picker-range bound. Different feature, different consumer.

#### Performance note

Two additional API calls per Overview page load (one to Peec, one to Profound for clients with both). YTD ranges are wider than picker ranges, so payload is larger. The `cached()` wrapper caches per `(clientSlug, dateRange)` for 1 hour.

#### Verification

- `npx tsc --noEmit`: zero output.
- `grep trackingStart` shows the new firstTrackedAt-sourced declaration only in visibility-chart.tsx.

#### Open follow-ups (post-commit operational)

- Apply the migration: `npx drizzle-kit migrate` (Thomas to run after review).
- Populate Avenue Z: `UPDATE clients SET first_tracked_at = '2025-03-28T00:00:00Z' WHERE slug = 'avenue-z';` (Thomas to run after migration).
- Non-Avenue-Z clients are left NULL until backfilled. Their chart silently omits the "Tracking began" line. Acceptable for the v2 review (Tina is reviewing Avenue Z).

#### Open risks

None code-side. Operational risks above.

---

### FB-021 — Remove "Which prompts are AI engines answering with our brand?" chart (Rule #11, CSV E12)

- **Status:** done
- **Source:** Tina's Overview-tab v1 scorecard CSV, row 12 (free-standing column-E entry, no original ask in columns A-D): *"REMOVE Chart: 'Which prompts are AI engines answering with our brand?' at the very bottom. This wasn't explicitly stated to remove in the initial doc, but it was not included in the recommended layout."*
- **Author:** Tina (flagged) / Claude (implementation)
- **Type:** layout removal
- **Scope:** `components/report-sections/peec-ai/index.tsx`, `components/report-sections/profound-ai/index.tsx`. Two component files deleted entirely.

#### Decision

Honor Rule #11 ("recommended layout = full spec"): if it's not in Tina's recommended layout, it gets removed. Apply to BOTH the Peec provider variant AND the Profound provider variant of the Overview tab for layout parity. Delete the two component files since no other surface imports them.

#### Implementation

- `peec-ai/index.tsx`: removed the 5-line render block conditional on `data.trackedPrompts.length > 0` (rendered TrackedPromptsChart for Peec, ProfoundTrackedPromptsChart for Profound). Removed both imports.
- `profound-ai/index.tsx`: removed the Tracked prompts render block + comment. Removed the import.
- Deleted `components/report-sections/peec-ai/tracked-prompts-chart.tsx` and `components/report-sections/profound-ai/tracked-prompts-chart.tsx`.

#### Scope of impact

- Universal layout removal. Both Peec and Profound clients lose the chart from the Overview tab.
- `data.trackedPrompts` field on PeecOverview + ProfoundOverview types KEPT — still consumed by PR Influence (synopsis context, opportunity rows), Content Impact (citation density), AI summaries, demand-overview, report-generator, and both synopsis libs.

#### Verification

- `npx tsc --noEmit` — zero output.
- `grep -rn "TrackedPromptsChart\|ProfoundTrackedPromptsChart"` returns zero hits across components/app/lib.
- `grep -rn "trackedPrompts"` (excluding the deleted files) still returns >10 hits — field intact for downstream consumers.

#### Open risks

None. Pure render removal; no data layer changes.

---

### FB-020 — Remove Overview SectionHeader subtitle (CSV E2)

- **Status:** done
- **Source:** Tina's Overview-tab v1 scorecard CSV, cell E2: *"REMOVE: Subtitle 'Visibility, share of voice, and sentiment across tracked LLMs, with side-by-side comparison to competitors.'"*
- **Author:** Tina (flagged) / Claude (implementation)
- **Type:** copy / layout
- **Scope:** `components/report-sections/peec-ai/section-header.tsx`, `components/report-sections/peec-ai/index.tsx`. Overview tab only. Other 3 AEO tabs unchanged.

#### Decision

Drop the `subtitle` prop from the `<SectionHeader>` call on the Overview tab. Make `subtitle` optional in the shared `SectionHeader` component so the other 3 AEO tabs (PR Influence, Content Impact, Technical Performance) keep their own subtitles unchanged.

#### Implementation

- `section-header.tsx`: `subtitle: string` → `subtitle?: string`. The `<p>` render wrapped in `{subtitle && (...)}` so the line is omitted when no subtitle is passed.
- `peec-ai/index.tsx` Overview SectionHeader call: removed the `subtitle="..."` line. Title, icon, badge unchanged.

#### Scope of impact

- Every current client sees the Overview header render without a subtitle. Universal layout change, not sandboxed.
- Other 3 tabs still pass their own subtitle strings (verified via grep):
  - `pr-influence.tsx:501` — `subtitle="Where earned media earns LLM citations..."`
  - `content-impact.tsx:589` — `subtitle="Which content assets earn LLM citations..."`
  - `technical-audit.tsx:388` — `subtitle="AEO technical health. Structured data..."`

#### Verification

- `npx tsc --noEmit` — zero output (clean).
- Visual: Overview header renders green Sparkles + question only (no subtitle line below). Other 3 tabs unchanged.
- Grep confirms each non-Overview SectionHeader call still passes a non-empty subtitle.

#### Open risks

None. Trivial prop drop. Conditional render preserves existing tabs.

---

### FB-019 — Match Prompt Clusters chart height to Top Editorial Domains card (fix dead space + thin bars)

- **Status:** done
- **Source:** Thomas after the merge: "can we match these perfectly so theres no dead space between them and also make the which prompt clusters table look less anemic? ... we shrink the which prompt clusters one to match the which editorial domains table and itll make it look less anemic too."
- **Author:** Thomas (flagged) / Claude (visual polish)
- **Type:** layout polish
- **Scope:** `components/report-sections/peec-ai/pr-influence-tables.tsx` `PromptClusterOpportunityMatrix` only. Lineage: builds on FB-012 (chart creation) + FB-015 (side-by-side layout).

#### Root cause

The side-by-side wrapper at `pr-influence.tsx:525` is `grid lg:grid-cols-2` which defaults to `align-items: stretch` — both cards equalize to the taller card's height. The Prompt Clusters chart was the taller card because its `chartHeight` formula was `Math.max(220, length * 34 + 40)` → for 11 clusters = 414px chart → ~570px card. The Top Editorial Domains card with 5 rows naturally renders ~470px, so it had to stretch ~100px, producing the visible dead space below the table.

Separately, the auto-sized bars at ~38px-per-row category bands looked thin and "anemic" against the wide chart.

#### Fix

Two changes to `PromptClusterOpportunityMatrix`:

1. **Tighten per-row spacing** in `chartHeight`: `Math.max(220, length * 34 + 40)` → `Math.max(200, length * 24 + 36)`. For 11 clusters, chart drops from 414px to 300px (~25% reduction). Card total now lands ~470px — matches the editorial-domains card's natural height, so the grid stretch no longer leaves dead space on either side.
2. **Explicit bar thickness**: added `barSize={14}` to the `<Bar>` element. Previously the bar thickness was auto-derived from band width; with the tighter spacing, auto-bars would have gotten even thinner. The explicit `14px` keeps bars visually prominent regardless of how many clusters there are.
3. **Tighter `barCategoryGap`**: `8` → `4` so the explicit barSize doesn't fight gap whitespace.

#### What was unambiguous

- Cards in `lg:grid-cols-2` stretch to equal height; the taller card sets the floor.
- Shrinking the chart shrinks the right card; the left card collapses to its natural content height.
- `barSize` on `<Bar>` overrides auto-sizing and is the canonical Recharts knob for bar thickness in vertical (= horizontal) layouts.

#### What was inferred

- The exact `chartHeight` formula: I picked `length * 24 + 36` (vs other plausible values) by estimating the Top Editorial Domains card height from screenshot proportions (~470px). If the editorial card is in fact taller or shorter on a given client (different row counts), heights will drift by a few px but the cards still end up close. This is a layout heuristic, not a load-bearing calculation.
- Bar size 14 px: chosen as visually substantial without being chunky. Editorial card bars are 16px tall (`h-4 w-24` div) — keeping the cluster bars in the same visual register.

#### What was explicitly out of scope

- The horizontal scrollbar at the bottom of the Top Editorial Domains card (SortableTable's internal `overflow-x`). Cosmetic, separate concern. Flagged but not fixed here.
- The actual data values driving bar lengths (FB-013's per-cluster calc). The percentages are real; the cosmetic fix doesn't change the math.

#### Files touched

| File | Change |
|---|---|
| `components/report-sections/peec-ai/pr-influence-tables.tsx` | `PromptClusterOpportunityMatrix`: `chartHeight` formula tightened, `barCategoryGap` reduced to 4, `<Bar>` got explicit `barSize={14}`. |

#### Verification

- TypeScript clean.
- Math: 11 clusters × 24 + 36 = 300 px chart; card chrome ~170 px; total ~470 px. Matches editorial card's natural height.

#### Open risks

1. **Clients with very different cluster counts** will shift heights proportionally. With 6 clusters, chart = 180 px floor (still matches the floor). With 20 clusters, chart = 516 px and the editorial card has to stretch instead — but at that point the editorial card likely has more rows too, so heights co-scale.
2. **The Top Editorial Domains card's horizontal scrollbar** still shows when content overflows the half-width card. Untouched here.

---

### FB-018 — "Tap a theme" → "Click a theme" (Tina's literal verb)

- **Status:** done
- **Source:** Thomas final-audit insistence on 1:1. Tina's spec: "When you **click** on a theme, it opens an accordion." Code said "Tap a theme."
- **Author:** Tina (literal text) / Claude (verb correction)
- **Type:** copy correction (one word)
- **Scope:** `components/report-sections/peec-ai/sentiment-insights.tsx`. Two instances (Positive Themes intro + Negative Themes intro). Lineage: correction to FB-010 copy.

#### What changed

`Tap a theme` → `Click a theme` (replace_all, both column-intro paragraphs).

#### Verification

- TypeScript clean.
- Avenue Z sandbox gate unchanged.

---

### FB-017 — Rename Sentiment Insights "Weaknesses" → "Negative Themes"

- **Status:** done
- **Source:** Thomas final audit. Tina's literal spec ("Positive Themes & Negative Themes side-by-side") was flagged by me in the post-FB-015 honest-review note as the one label discrepancy. Thomas confirmed the audit needed to be exact.
- **Author:** Tina (literal text) / Claude (label correction)
- **Type:** label correction
- **Scope:** `components/report-sections/peec-ai/sentiment-insights.tsx`. Lineage: correction to FB-010 label.

#### Why this wasn't done in FB-010

FB-010 used "Weaknesses" because Tina's underlying CONTENT for the right column was framed that way (Unclear Answer Engine Methodology, Unproven Answer Engine Impact — gaps, not negatives per se). Her LAYOUT spec however said "Negative Themes." FB-010 chose the data-side label; this corrects to the layout-side label per Tina's literal text.

#### What changed

- `<h4>Weaknesses</h4>` → `<h4>Negative Themes</h4>`
- "Tap a weakness to see the explanation." → "Tap a theme to see the explanation."
- Comment "// Side-by-side: Positive Themes (left), Weaknesses (right)" → "Negative Themes (right)"

The underlying data array (`WEAKNESSES` const), state (`openWeak`, `toggleWeak`), and behavior are untouched. Only user-visible copy changed.

#### Files touched

| File | Change |
|---|---|
| `components/report-sections/peec-ai/sentiment-insights.tsx` | h4 label + intro paragraph copy + top-of-file comment. No logic / state / data changes. |

#### Verification

- TypeScript compilation: clean.
- Avenue Z sandbox gate unchanged: still `clientSlug !== 'avenue-z' → return null`.

#### Open risks

- None.

---

### FB-016 — Fix unreadable tooltip text on the Prompt Clusters bar chart

- **Status:** done
- **Source:** Thomas screenshot of the Vercel preview after FB-015 deployed: "the percentage is, like, in black, and you can't see it. So we're gonna have to change the color of that."
- **Author:** Thomas (flagged) / Claude (one-line fix)
- **Type:** visual bug fix
- **Scope:** `components/report-sections/peec-ai/pr-influence-tables.tsx` — `<RechartsTooltip>` config on the `PromptClusterOpportunityMatrix` bar chart. Lineage: bug surfaced after FB-012 (chart creation).

#### Root cause

Recharts `<Tooltip>` has THREE separate style props: `contentStyle` (the container), `labelStyle` (the row label, e.g. cluster name), and `itemStyle` (each data row, e.g. "Citation Share : 1.6%"). I had set `color: '#FFFFFF'` on `contentStyle` only. That covers the container's default color but Recharts' `<DefaultTooltipContent>` applies its own internal defaults for the label and item rows, and the item row falls back to a near-black `color: rgb(51, 51, 51)` (Recharts source). On the dark `#272727` tooltip background, that is invisible.

#### Fix

Added `labelStyle={{ color: '#FFFFFF', fontWeight: 600 }}` and `itemStyle={{ color: '#FFFFFF' }}` to the `<RechartsTooltip>` config. Removed the redundant `color: '#FFFFFF'` from `contentStyle` (it was a no-op once Recharts' internal defaults took over). The tooltip now renders cluster name in bold white + metric line in white, against the dark `#272727` background.

#### Files touched

| File | Change |
|---|---|
| `components/report-sections/peec-ai/pr-influence-tables.tsx` | `<RechartsTooltip>` config in `PromptClusterOpportunityMatrix`: added `labelStyle` + `itemStyle`, removed redundant `contentStyle.color`. |

#### Verification

- TypeScript compilation: clean.
- Hovering any bar in the new render shows: cluster name in bold white, "Citation Share : X.X%" in white, against dark tooltip background.

#### Open risks

- None. Single-prop style fix, no behavior change.

---

### FB-015 — Remove PR Placement Matchback to match Tina's 5-section layout

- **Status:** done
- **Source:** Thomas re-validation pass: "structurally please confirm 1:1 with Tina." Tina's recommended-layout mockup has consistently omitted Matchback across FB-011, FB-012, and FB-014 (three separate feedback rounds). Pattern is unambiguous: Matchback is not in her vision for the tab.
- **Author:** Thomas (validation) / Claude (final structural reconciliation)
- **Type:** delete
- **Scope:** `components/report-sections/peec-ai/pr-influence.tsx` + `components/report-sections/peec-ai/pr-influence-tables.tsx`. Universal change. Lineage: closes FB-014 open risk #1 ("Matchback placement").

#### Pattern that drove this

| Feedback round | Tina's mockup of the tab | Matchback present? |
|---|---|---|
| FB-011 | Synopsis → Sentiment → Top Editorial → … | No |
| FB-012 | Synopsis → Sentiment → Top Editorial → Prompt Clusters | No |
| FB-014 | Synopsis → Sentiment → Top Editorial → Prompt Clusters → Top Editorial Opportunities | No |

Three rounds of "didn't mention" is the signal. Combined with Thomas's stated layout order (also 5 sections, no Matchback), the conservative call to keep Matchback in FB-014 was the wrong reading.

#### What changed

- Deleted the `<PRPlacementMatchbackTable>` JSX render in `pr-influence.tsx`.
- Deleted the `matchbackTableRows` builder block + the 4 demo arrays that fed it (`DEMO_PROMPT_CLUSTERS`, `DEMO_AI_ENGINES`, `DEMO_PROMPT_COUNT`, `DEMO_POST_PUBLISH_TREND`).
- Deleted the entire `PRPlacementMatchbackTable` component + `PRPlacementMatchbackRow` interface + `AI_ENGINES_TOOLTIP` + `POST_PUBLISH_TOOLTIP` consts from `pr-influence-tables.tsx`.
- Cleaned imports: `PRPlacementMatchbackTable`, `PRPlacementMatchbackRow`.
- Kept the `buildMatchback()` helper, `matchbackRows`, `filteredMatchbackRows`, and `placementsCitedByAI` computation in `pr-influence.tsx`. Reason: the executive synopsis context still uses `placementsCitedByAI` (X of Y placements cited by AI) and the synopsis is model-filter-agnostic by design.

#### What was unambiguous

1. Tina's recommended-layout screenshots across three feedback rounds consistently show 5 sections under the SectionHeader: Synopsis → Sentiment Insights → Top Editorial Domains → Prompt Clusters → Top Editorial Opportunities.
2. Thomas's stated layout order (chat: "synopsis to sentiment insights to top editorial domains to which prompt clusters offer the biggest PR opportunity to top editorial opportunities") names exactly those 5 sections.
3. Post-FB-014, the code rendered 6 sections (the extra was Matchback between Prompt Clusters and Top Editorial Opportunities).
4. To be structurally 1:1 with Tina's mockup, Matchback must be removed.

#### Files touched

| File | Change |
|---|---|
| `components/report-sections/peec-ai/pr-influence.tsx` | Removed `<PRPlacementMatchbackTable>` JSX, `matchbackTableRows` builder, 4 demo arrays, and `PRPlacementMatchbackTable` + `PRPlacementMatchbackRow` imports. Kept `buildMatchback`, `matchbackRows`, `filteredMatchbackRows`, `placementsCitedByAI` (still feed synopsis context). |
| `components/report-sections/peec-ai/pr-influence-tables.tsx` | Deleted the entire Matchback section: `PRPlacementMatchbackRow` interface, `AI_ENGINES_TOOLTIP` const, `POST_PUBLISH_TOOLTIP` const, `PRPlacementMatchbackTable` component (lines 38–300 in the pre-FB-015 file). |

#### Final state — JSX render order under the SectionHeader

```
1. PRInfluenceSynopsis
2. SentimentInsights
3. <div grid lg:grid-cols-2>
     TopEditorialDomainsTable
     PromptClusterOpportunityMatrix
   </div>
4. BrandAbsentEditorialDomainsTable  (= "Top Editorial Opportunities")
```

That is 4 JSX blocks (the side-by-side counts as one block in the layout, but visually presents 2 cards). Total visible sections on the page: 5, matching Tina's mockup.

#### Scope of impact

- Every AEO client with the PR Influence tab enabled no longer sees the Matchback table.
- Synopsis context numbers (placementsCitedByAI etc.) unaffected — same compute, just not rendered as a table on this tab.
- Per-model filter no longer affects any visible table on the tab in a way that depends on Matchback (Matchback's per-row model engines computation was internal-only post-removal). The synopsis remains model-filter-agnostic by design.
- No DB change, no env change, no API change.
- Diff is the removal of a large dead-render block.

#### Verification

- TypeScript compilation: clean (`npx tsc --noEmit` zero output).
- JSX render order grep produces exactly the 5-section sequence above.
- No dangling references (`PRPlacementMatchback`, `matchbackTableRows`, `NextPitch`, `Sparkles` all return empty from grep across the two files).
- Sandbox gates unchanged: still 2 (FB-006 winners-losers + FB-010 sentiment-insights).

#### Open risks

1. **If Tina actually wanted Matchback kept** (despite three omissions), this is one JSX restore. Component file is now deleted, so restoration is a copy-back from git history. Documented for future restore if needed.
2. **The `buildMatchback` helper still runs on every render** even though nothing visible consumes its full output anymore — only `placementsCitedByAI` (a single number) is used downstream. Could be simplified to a smaller compute. Out of scope here; the function is correct, just over-computes by one ~30-line `.map()`. Future cleanup.

---

### FB-014 — Top Editorial Opportunities (retitled + redesigned Brand-Absent table) + remove Next Pitch Opportunities section

- **Status:** done
- **Source:** Tina (Google doc, Jun 17 batch: 8:42 / 8:59 / 9:04 / 9:12 AM). Thomas confirmed final tab order in chat: "synopsis to sentiment insights to top editorial domains to which prompt clusters offer the biggest PR opportunity to top editorial opportunities."
- **Author:** Tina
- **Type:** redesign + delete
- **Scope:** `components/report-sections/peec-ai/pr-influence-tables.tsx` + `components/report-sections/peec-ai/pr-influence.tsx`. Universal change (no Avenue Z sandbox gate needed).

#### Verbatim ask (Tina)

> Columns Revision:
> - Publication
> - Article (combine article title and hyperlink it with the URL)
> - Competitors Mentioned
> - Citation Share
> - Delta of Citation Share

> Chart Revision:
> - Only show articles where the brand is not mentioned (or if it has no data so we can check manually)
> - Only show articles with a positive delta on citation share
> - Remove the footnote at the bottom of the chart.

> Title Revision
> Old: Which editorial domains cite our competitors but not us?
> New: What are the top pitch opportunities for getting our brand mentioned in AI?

> Subtitle Revision
> Old: High-authority editorial domains that AI tools cite for your tracked prompts, but where your brand has no PR placement. These are the highest-priority pitch targets.
> New: Prompt-level citations on the rise where your brand is not mentioned, revealing outreach opportunities that may require different strategies depending on the type of article being cited.

> REMOVE: Where should we pitch next to close AI visibility gaps?
> REMOVE: How is the opportunity score calculated?

#### What was unambiguous

1. The `BrandAbsentEditorialDomainsTable` ([pr-influence-tables.tsx:402+](../../components/report-sections/peec-ai/pr-influence-tables.tsx)) is the target of the Columns / Chart / Title / Subtitle revisions. Tina's old title text matches that table verbatim.
2. Final column set (in order): Publication, Article (combined title + URL hyperlink), Competitors Mentioned, Citation Share, Delta of Citation Share. Remove: Brand Mentioned, Opportunity Priority, Suggested PR Angle.
3. New title + new subtitle text.
4. Filter row set to (brand-not-mentioned OR no-data) AND positive citation-share delta.
5. Remove the bottom footnote.
6. The "Where should we pitch next to close AI visibility gaps?" REMOVE targets the `NextPitchOpportunitiesTable` section (Section F). That section is deleted entirely from the page.
7. The "How is the opportunity score calculated?" REMOVE was already shipped in FB-012; no further action needed.

#### What was inferred (explicit interpretation choices)

| Decision | What I chose | Why |
|---|---|---|
| **"Combine article title and hyperlink it with the URL"** | Single "Article" cell: render the title as a clickable link to the URL. If only one of (title, URL) exists, render that as text or link. If both are missing, render `--`. Cell is `block max-w-[240px] truncate` to keep long titles in the table width. | Most natural read of "combine" — the article title becomes the link text. Title is the readable surface; URL is the action target. Matches standard UX for article-link cells across the codebase (and across the web). |
| **"brand not mentioned (or if it has no data so we can check manually)"** | Existing `topBrandAbsentUrlByHost` logic at [pr-influence.tsx:339-345](../../components/report-sections/peec-ai/pr-influence.tsx) already filters URLs to `mentionsYourBrand === false`. Rows where no such URL exists keep `articleTitle = null` and `articleUrl = null` so the row renders with `--` in the Article column — visible signal that manual check is needed. No change to that logic. | Already correct. Article fields render gracefully as `--` when topUrl is null. |
| **"Only show articles with a positive delta on citation share"** | Filter applied at the table-row build step: `brandAbsentRowsFiltered = brandAbsentDomains.filter(d => d.retrievedDelta > 0)`. The unfiltered `brandAbsentDomains` is preserved for the synopsis context (`brandAbsentCount`, `topBrandAbsentDomains`). | Tina's filter is for the visible chart, not the executive synopsis. Synopsis stays globally accurate; table shows only rising opportunities. |
| **Source field for "Delta of Citation Share"** | `d.retrievedDelta` (already on the `TopDomain` type, populated from Peec API response). Same field FB-012 renders as the up/down arrow next to Citation Share on the Top Editorial Domains table. | Consistent semantics across the tab — one canonical delta source. Reused `<CitationDelta>` component to match visual treatment exactly. |
| **Existing `Sortable Table` + `SortableColumn` infra** | Reused. Tina did not say "convert to a different visualization"; the word "table" is implicit in "Columns Revision" + "Chart Revision" (she uses "Chart" loosely to mean "this card"). | Lowest-risk read. Matches the visual treatment of the rest of the PR Influence tab. |
| **Where the `NextPitchOpportunitiesTable` component lives** | Deleted entirely from `pr-influence-tables.tsx` (component + `NextPitchOpportunityRow` type). The `nextPitchRows` + `nextPitchEmptyKind` computation in `pr-influence.tsx` deleted too. | Tina removed the section; no other consumer imports these. Per CLAUDE.md "If you are certain that something is unused, you can delete it completely." Cleaner than leaving dead exports. |
| **Removed `isDemo` prop on `BrandAbsentEditorialDomainsTable`** | Dropped from the component signature and the call site. | Used only by the deleted footnote. No other use. |
| **Kept the `PRPlacementMatchbackTable` render** | Stays where it is (between the side-by-side row and Top Editorial Opportunities). | Tina's REMOVE list did NOT include Matchback. Thomas's stated tab order ("synopsis → sentiment → top editorial → prompt clusters → top editorial opportunities") describes the asked-for sections; Matchback isn't named because Tina didn't touch it this batch. Defaulting to keep: do not remove without explicit ask. If Tina or Thomas later say "remove Matchback," it's a single JSX delete. Carried as an open risk below. |
| **Demo-mode rows** | `brandAbsentRowsFiltered` runs the same `retrievedDelta > 0` filter against the demo `samplePeecOverview()` editorial domains. Demo may render fewer rows than before — acceptable per the FB-013 same-pattern decision. | Filter is universal. Don't bypass for demo. If demo rows look thin, extend the demo fixture (out of scope here). |

#### What was explicitly out of scope

- `PRPlacementMatchbackTable` columns / subtitle / order: untouched.
- `TopEditorialDomainsTable`: untouched (FB-012 is the source of truth for that card).
- `PromptClusterOpportunityMatrix`: untouched (FB-012 + FB-013 stand).
- `<PRInfluenceSynopsis>`: untouched. Synopsis context still uses the unfiltered `brandAbsentDomains` count + top 5 domains so executive prose stays globally accurate.
- Per-model filter logic: `filterDomainRowsByModel` still applies to `rawBrandAbsentTableRows` (the model filter overlays cleanly on the new shape since the generic only requires `{ domain, citationCount }`). Behavior unchanged.

#### Files touched

| File | Change |
|---|---|
| `components/report-sections/peec-ai/pr-influence-tables.tsx` | `BrandAbsentEditorialDomainRow`: removed `brandMentioned`, `opportunityPriority`, `suggestedAngle`; added `citationCountDelta`. `BrandAbsentEditorialDomainsTable`: new title + subtitle, 5-column set (Publication, Article-combined, Competitors Mentioned, Citation Share, Delta of Citation Share), removed footnote, dropped `isDemo` prop. Deleted: `NextPitchOpportunitiesTable` component + `NextPitchOpportunityRow` interface + `NEXT_PITCH_TOOLTIP` const. |
| `components/report-sections/peec-ai/pr-influence.tsx` | `rawBrandAbsentTableRows` builder updated: new shape, added `citationCountDelta`, dropped removed fields, filtered to `retrievedDelta > 0` at the build step. Deleted: `nextPitchRows` + `nextPitchEmptyKind` computation block. Deleted: `<NextPitchOpportunitiesTable>` + `<Sparkles>` JSX. Imports cleaned: `Sparkles`, `NextPitchOpportunitiesTable`, `NextPitchOpportunityRow` removed. `<BrandAbsentEditorialDomainsTable>` call site dropped `isDemo` prop. |

#### Scope of impact

- Every AEO client with the PR Influence tab enabled sees: (a) the retitled "Top Editorial Opportunities" card with the new 5-column shape, (b) the rising-delta filter, (c) no Next Pitch section.
- Synopsis context unaffected.
- No data fetch changes, no env changes.
- Diff: -254 / +53 lines net (-201).

#### Verification

- TypeScript compilation: clean (`npx tsc --noEmit` zero output).
- Final tab order: `SectionHeader → PRInfluenceSynopsis → SentimentInsights → [TopEditorialDomainsTable + PromptClusterOpportunityMatrix side-by-side] → PRPlacementMatchbackTable → BrandAbsentEditorialDomainsTable (now "Top Editorial Opportunities") → footer attribution`.
- Sandbox gates unchanged: still 2 (FB-006 winners-losers + FB-010 sentiment-insights).

#### Open risks (in order of likelihood)

1. **Matchback placement.** Thomas's stated tab order names 5 sections (synopsis → sentiment → top editorial → prompt clusters → top editorial opportunities). Matchback is currently the 4.5th — between the side-by-side and Top Editorial Opportunities. If Tina meant for Matchback to also be removed (her layout sketches have consistently omitted it across FB-011, FB-012, and FB-014), this is a single JSX delete. Carrying as the highest-likelihood next-feedback item.
2. **"Article" cell width.** `max-w-[240px] truncate` may clip long titles on narrow viewports. Easy single-class tweak if Tina complains.
3. **Demo rows may render thin.** The new `retrievedDelta > 0` filter applies in demo mode too. If the demo `samplePeecOverview()` fixture has most editorial domains with non-positive deltas, the demo table will look empty. Out of scope to extend the demo fixture here.
4. **Delta-of-citation-share tooltip copy** is my draft ("Period-over-period change in this domain's citation share. (Peec AI source data.)"). Single-line edit if Tina has preferred copy.

---

### FB-013 — Fix per-cluster `editorialCitationDensity` (was a single global value; every bar rendered at 100%)

- **Status:** done
- **Source:** Thomas spotted "i feel like the prompt clusters one is off" after the FB-012 deploy on Avenue Z. Inspection confirmed every bar at 100% — pre-existing data-layer bug surfaced by FB-012's bar chart.
- **Author:** Thomas (flagged) / Claude (rooted + fixed)
- **Type:** data-layer bug fix
- **Scope:** `components/report-sections/peec-ai/pr-influence.tsx` `computeOpportunityRows()` only. Lineage: iteration on [[fb-012]]; predates FB-012 but only became visible when the cluster bar chart replaced the old 7-column table.

#### Verbatim flag (Thomas)

> "is this what it is supposed to look like? i feel like the: Which prompt clusters offer the biggest PR opportunity? is off"

#### Root cause

`computeOpportunityRows()` computed `editorialCitationDensity` once GLOBALLY, then assigned it to every cluster row identically:

```ts
const totalEditorialCitations = editorialDomains.reduce((s, d) => s + d.citationRate, 0)
const avgEditorialCitation = totalEditorialCitations / editorialDomains.length
// ...inside per-cluster .map():
const editorialCitationDensity = Math.min(avgEditorialCitation / 100, 1)  // <- identical across clusters
```

For Avenue Z, `citationRate` values on editorial domains average above 100 (since each is `citation_rate * 100` and several editorial domains have near-saturated coverage on their tag), so `Math.min(.../ 100, 1) = 1` → `* 100 = 100%` for every cluster.

The pre-FB-012 SortableTable masked this because it rendered six other columns (`brandCitationRate`, `competitorPresence`, `opportunityScore`, etc.) that varied per cluster. Tina's screenshot in FB-012 also shows `Editorial Citation Density` at 100.0% for every row — she didn't notice because the Opportunity Score column (72, 70, 69...) provided the visible ranking.

FB-012 removed all six masking columns and left this one as the only metric. The bug went from invisible to dominant: 11 identical 100% bars and no ranking.

#### Fix

Compute `editorialCitationDensity` PER CLUSTER using data already fetched:

- `coverage.tagNameById`: tag id → display name (cluster names)
- `coverage.tagIdsByDomain`: host → tag ids that domain is cited under
- `data.topDomains`: all cited domains with `type` (`Editorial` subset isolatable)
- `topDomain.retrieved`: per-domain citation share %

Per cluster:

```ts
editorialShare(clusterName) =
  sum(retrieved across editorial-typed domains tagged with clusterName)
  / sum(retrieved across ALL domains tagged with clusterName)
  * 100
```

Semantics: "of all citations on prompts in this cluster, what share came from editorial-typed domains?" Real per-cluster value, varies, ranks. Fits Tina's literal ask ("Topic × % citation share from editorial sources") and gives the chart a meaningful sort order.

`computeOpportunityRows()` now takes `topDomains` and `coverage` as additional parameters. Call site updated to pass `data.topDomains ?? []` and `coverage`.

#### What was unambiguous

1. Bars were all 100%. The chart was not ranking anything. That's wrong.

#### What was inferred (explicit interpretation choices)

| Decision | What I chose | Why |
|---|---|---|
| **Semantic of "% citation share from editorial sources" (Tina's words)** | Per-cluster: editorial-typed domains' citation sum / all domains' citation sum on that cluster, expressed as %. | The most defensible read of "% citation share from editorial sources" with the data we actually have. Uses fields already computed and rendered elsewhere on this same page. |
| **Cluster name to tag id resolution** | Reverse the `coverage.tagNameById` map (`tagNameById[id] === name`) to get `tagId(name)`. | `coverage` is the only place we have a tag-id ↔ tag-name (== cluster name) bridge. `trackedPrompts[].group` is the cluster name; `topDomains` are tagged by id. |
| **Unknown cluster fallback** | `editorialShare = 0` if no tag id found by name. | Avoids a NaN propagating into the chart. Defensible default; a cluster with no tag-side match has no citation data to attribute. |
| **`opportunityScore` formula** | Still uses the per-cluster `editorialCitationDensity` (now real) for the 35% weight. Other weights unchanged. | The fix flows through automatically. Score values will shift, but the score is no longer rendered to users anyway (FB-012 removed the column + methodology block); it only feeds Next Pitch priority badges. The bug was contained to this calc; the formula itself was fine. |
| **No new fetch** | Reused existing `coverage` (already fetched on the page) and `data.topDomains` (already in scope). | Zero new network calls. Same caching, same demo-mode fallback. |

#### What was explicitly out of scope

- No change to render code, chart, table, or layout. Same FB-012 chart, real numbers now.
- No change to FB-012's removed columns, removed legend, or removed methodology block. FB-012 stands.
- Per-model filter still does not affect this metric (carries the v1 limitation forward). Recomputing per-model would require fetching per-model tag aggregates; not in scope.
- No update to `OpportunityRow` type — the fields are the same shape, just with non-degenerate values.

#### Files touched

| File | Change |
|---|---|
| `components/report-sections/peec-ai/pr-influence.tsx` | `computeOpportunityRows()` now takes `(trackedPrompts, editorialDomains, topDomains, coverage)`. Adds `tagIdByName` reverse map + `editorialHosts` set + `clusterEditorialShare()` helper. Per-cluster `editorialCitationDensityPct` replaces the global `avgEditorialCitation` calc. Score formula unchanged. Call site at line 362 updated. |

#### Scope of impact

- Every AEO client with the PR Influence tab enabled gets real per-cluster numbers on the FB-012 bar chart.
- `opportunityScore` values will shift downstream — affects only the High/Medium/Low priority badge in `NextPitchOpportunitiesTable`. Tina's seeing real values now; nothing visible breaks.
- No DB change, no env change, no new API call.

#### Verification

- TypeScript compilation: clean (`npx tsc --noEmit` zero output).
- Hand-traced the new calc against Avenue Z's data shape: `tagNameById` + `tagIdsByDomain` are both populated for Avenue Z (Peec coverage fetch returns data), so `clusterEditorialShare()` returns real values. For clusters with no tag-side match (rare), returns 0 — visible as a missing bar, honest signal.
- Demo mode: `coverage` is reset to the empty object literal in demo mode (`pr-influence.tsx:224`). Demo runs through `clusterEditorialShare()` → `tagIdByName.get(name)` returns undefined → 0 for every cluster. Demo bar chart will be empty/0. Acceptable because demo prompts are synthetic anyway; the demo-mode story is the rest of the page, not this calc. If demo bars need real values, swap the demo `coverage` literal for one with sample `tagNameById` + `tagIdsByDomain` content (out of scope here).

#### Open risks (in order of likelihood)

1. **Cluster name strings may not perfectly match tag display names** in some clients' Peec configs. If so, `tagIdByName.get(clusterName)` returns undefined and that cluster's bar shows 0. Fix: case-insensitive match or fuzzy match; or surface the mismatch in a debug log. Punt until we see it.
2. **A cluster with non-zero prompts but zero domains tagged with that cluster's tag** will compute `totalCit = 0` → returns 0. Same defensible default.
3. **Demo mode bars all at 0** until we extend the demo `coverage` fixture (see Verification note above). Acceptable; demo only renders Avenue Z anyway.

---

### FB-012 — Reduce Top Editorial Domains, turn Prompt Cluster Opportunity into a simple bar chart, place them side-by-side

- **Status:** done
- **Source:** Tina (Google doc, 8:42 AM / 8:54 AM / 9:10 AM / 9:12 AM Jun 17). Whitney Hart endorsement "Agreed with reccos here" (11:57 AM Jun 18). Thomas confirmed layout order in chat: "synopsis, sentiment, top editorial domains, and then which prompt clusters."
- **Author:** Tina (+ Whitney endorsement)
- **Type:** reduce + redesign + reorder
- **Scope:** `components/report-sections/peec-ai/pr-influence-tables.tsx` (two components) + `components/report-sections/peec-ai/pr-influence.tsx` (layout). Universal design changes — apply to every client. No data sandbox needed.

#### Verbatim ask (Tina)

**On Top Editorial Domains:**
> - Citation Count -> Citation Share
> - Remove Column: Avg Citation
> - Remove Column: PR
> - Remove legend on bottom left corner
>
> Rephrase subtitle
>
> Old: Each secured PR placement matched against Peec AI citation data. Shows which earned media is being retrieved by AI engines and whether your brand is mentioned.
>
> New: These domains are the most likely to surface as cited sources in AI-generated results, so they should be prioritized on the media target list.

**On "Which prompt clusters offer the biggest PR opportunity?":**
> Chart Revision: Turn this into a simple bar chart with the dimension being "Topic" and the metric being % citation share from editorial sources.

**On layout (both):**
> Maybe this one can go side-by-side with the next/previous chart since we are reducing both of them?

#### What was unambiguous

1. Top Editorial Domains: rename `Citation Count` → `Citation Share`, drop `Avg. Citations` column, drop `PR` column, drop the bottom-left blue/green legend.
2. Top Editorial Domains: replace the subtitle with Tina's "New" text.
3. Prompt Cluster Opportunity: replace the 7-column sortable table with a simple bar chart. Dimension = topic (cluster). Metric = % citation share from editorial sources.
4. Both reduced charts go side-by-side now that they are smaller.
5. Page order per Thomas's confirmed read of Tina's "Recommended layout" screenshot: Synopsis → Sentiment Insights → Top Editorial Domains → Prompt Clusters. Matchback was not on Tina's recommended layout, so it moves below the side-by-side row.

#### What was inferred (explicit interpretation choices)

| Decision | What I chose | Why |
|---|---|---|
| **Subtitle "Old:" text Tina pasted does not match the current Top Editorial Domains subtitle in code** | Treated as a copy-paste error in Tina's note. Replaced the current Top Editorial Domains subtitle with her "New" text. Matchback subtitle untouched. | Tina's "Old" text actually matches the `PRPlacementMatchbackTable` subtitle at [pr-influence-tables.tsx:273](../../components/report-sections/peec-ai/pr-influence-tables.tsx). But her "New" text describes editorial-domain pitch targeting, which fits Top Editorial Domains and does not fit Matchback at all. Thomas's broader feedback "reduce, side-by-side, this card" makes Top Editorial Domains the unambiguous target. Reconciled by intent, not by the mismatched quote. |
| **Green-on-PR styling on Domain text + bar fill** | Removed. Domain always white. Bar always editorial blue `#39A0FF`. | Tina removed the bottom legend that explained the green-vs-blue signal. With the legend gone, an unexplained color signal would confuse the reader. The PR column is also removed, so the green Yes/No signal is being de-emphasized across this card. Removing the inline color cue is the consistent reduction. |
| **`hasPR` field on `TopEditorialDomainRow`** | Kept on the type (still computed by the parent for back-compat with the BrandAbsent table's `hasPR` logic) but no longer rendered. | Easier than rippling type changes through a sibling component. No on-screen impact. |
| **`isDemo` and `prDataAvailable` props on `TopEditorialDomainsTable`** | Removed from the component signature and the call site. | Both props existed only to drive the PR column's "Yes / No / --" tri-state. Column gone, props unused. |
| **Bar chart orientation** | Horizontal bars (label-left, bar-right), sorted descending. | Cluster names can be long ("AI & Automation", "TikTok Shop") and the chart now lives in half-width (side-by-side layout). Horizontal bars read cleanly when narrow; vertical labels would have to angle or truncate. |
| **Bar chart X-axis** | Fixed `0–100%` domain, gridlines off, axis line muted. | Absolute scale across all clients; bar lengths are comparable across page loads and clients. Same principle as the FB-053 visibility-bar fix. |
| **Bar chart color** | Single `#39A0FF` (editorial blue) across all bars. | One metric, one color. The old table used 4 colors because there were 4 different metric bars per row. Now there is one metric — one bar color is correct. |
| **Bar chart subtitle** | "Topics ranked by share of citations earned from editorial sources. Higher share means a stronger candidate for the next PR pitch." | Old subtitle ("Clusters scored by opportunity: editorial citation density, brand absence, competitor presence, and publication tier...") is no longer accurate. The new chart shows ONLY editorial citation share. Drafted to match Tina's voice and stay short. |
| **Page order (Matchback moves below the side-by-side row)** | New order: Synopsis → Sentiment Insights → [Top Editorial + Prompt Clusters side-by-side] → Matchback → Brand-Absent → Next Pitch. | Tina's "Recommended layout" screenshot puts Synopsis, Sentiment, Top Editorial, and Prompt Clusters in that order. Matchback is not on the screenshot, so it sinks below. Thomas explicitly confirmed this read. FB-011's open risk #1 anticipated this exact reorder. |
| **"How is the opportunity score calculated?" 4-weight methodology block** | Removed entirely from the page. | It explained the old `opportunityScore` column (35% editorial + 30% brand absence + 20% competitor + 15% tier). That column is gone from the new bar chart. The score is still *computed* server-side because the Next Pitch table uses it to assign priority badges, but the user no longer sees the number itself. A methodology block explaining an invisible calculation is noise. |
| **Methodology footer line under the chart** (old: "Opportunity Score = 35% ...") | Removed. | Same reason as the block above. |
| **Wrapper grid class** | `grid gap-6 lg:grid-cols-2`. Below `lg` (1024px) the cards stack one above the other, matching every other section's responsive behavior. | Standard Tailwind responsive grid. Matches the side-by-side patterns elsewhere in the codebase. |

#### What was explicitly out of scope

- Matchback table itself (columns, copy, layout): untouched. Only its vertical position changed.
- Brand-Absent Editorial Domains and Next Pitch Opportunities tables: untouched.
- The `opportunityScore` computation in `pr-influence.tsx:computeOpportunityRows` and the `NextPitchOpportunitiesTable` priority logic: untouched. The score is still calculated to drive Next Pitch priority badges.
- Per-model filter behavior on the new bar chart: it reflects all-model aggregated data (same caveat as before — `editorialCitationDensity` is aggregated, not per-model). Carrying the v1 limitation comment forward.
- No data layer changes. The fields needed for the new chart (`editorialCitationDensity`) and the reduced table (`citationCount`, `promptCoverage`) already exist on the row types.
- Em-dash scrub across the rest of the file: only edited lines were scrubbed (none had em-dashes).

#### Files touched

| File | Change |
|---|---|
| `components/report-sections/peec-ai/pr-influence-tables.tsx` | Added Recharts imports. `TopEditorialDomainsTable`: dropped `isDemo`/`prDataAvailable` props, renamed `Citation Count` → `Citation Share`, removed `avgCitations` and `hasPR` columns, removed bottom legend, swapped subtitle, removed green-on-PR styling from Domain text and bar fill. `PromptClusterOpportunityMatrix`: entire `SortableTable` replaced with a Recharts horizontal `BarChart` over `editorialCitationDensity`. New subtitle. Old methodology footer line removed. |
| `components/report-sections/peec-ai/pr-influence.tsx` | Reorganized the JSX flow: Top Editorial + Prompt Clusters now sit in a `grid gap-6 lg:grid-cols-2` wrapper directly under SentimentInsights. Matchback moves below. Removed the "How is the opportunity score calculated?" block at the bottom. Updated the `<TopEditorialDomainsTable>` call site to match the new prop signature (rows only). Removed now-unused `cn` import. |

#### Scope of impact

- Every current and future AEO client with the PR Influence tab enabled sees the reduced layout and the bar chart automatically. No DB change, no per-client config, no backfill.
- No data sandbox needed — these are universal design / layout / UX changes (per the workstream rule "design = universal, hardcoded data = Avenue Z gate"). Nothing in this change introduces hardcoded Avenue Z content.
- Renders identically in the internal dashboard and the client portal.
- The bar chart uses Recharts (already in the codebase). No new dependencies.

#### Verification

- TypeScript compilation: clean (`npx tsc --noEmit` returned zero output).
- Diff stats: -208 / +90 lines net (-118), reflecting the reduction.
- Sandbox gate sanity-check: untouched. The two pre-existing Avenue Z sandbox gates (FB-006 `winners-losers-cards.tsx`, FB-010 `sentiment-insights.tsx`) are unaffected.

#### Open risks (in order of likelihood)

1. **Bar chart subtitle copy is my draft, not Tina's words.** Easy single-line edit if she pushes back.
2. **Bar chart visual density on narrow widths.** Currently uses `chartHeight = Math.max(220, rows.length * 34 + 40)`. With ~11 clusters, height ~414px — still reasonable in half-width. If Tina wants a tighter chart, single tweak to the formula.
3. **Matchback moving below the side-by-side row.** FB-011's open risk #1 predicted this; Tina's recommended-layout screenshot supports it; Thomas confirmed. If Tina actually wants Matchback to stay above, single JSX move.
4. **Methodology block removal.** Tina did not explicitly ask for this. The block only explained the old `opportunityScore` column which is now gone, so it explained nothing the user could see. If Tina wants context restored, paste a short note under the bar chart.
5. **The `Avg. Citations` column was the only place the `citation_avg` metric surfaced to the user.** If anyone was using it operationally, they will need a different surface now. Likely no one was — it had a `text-white/30` muted styling in the prior table.

---

### FB-011 — Sentiment Insights placement correction (iteration on FB-010)

- **Status:** done
- **Source:** Thomas, after eyeballing the FB-010 ship on the Vercel preview. Re-reading Tina's mockup more strictly.
- **Author:** Thomas (interpreting Tina's mockup)
- **Type:** placement correction
- **Scope:** `components/report-sections/peec-ai/pr-influence.tsx` only. One JSX move. Lineage: iteration on [[fb-010]].

#### Verbatim ask

> "Based on this screenshot, it should go... the synopsis, then sentiment insights, and then editorial domains next. Because right now, the order is not that. Right now, it goes synopsis, then the... which PR placements are being cited by AI section, then the sentiment insights. But sentiment insights are supposed to go above."

#### What changed

Moved `<SentimentInsights>` from between Section B (PR Placement Matchback) and Section C (Top Editorial Domains) to between the Executive Synopsis and Section B. New page order:

```
SectionHeader -> Executive Synopsis -> Sentiment Insights -> Matchback -> Top Editorial -> Brand-Absent -> Opportunity Matrix -> Next Pitch -> Methodology
```

#### Why FB-011, not a fix-up of FB-010

Per the project's audit-trail rule (`docs/official-feedback/handoff.md`): iterations on prior FB items get a new ID so the timeline reads linearly. FB-010 shipped with one placement; FB-011 corrects it. Both stay closed in this log.

#### Why FB-010 picked the other placement

FB-010's decision log notes: "Tina's screenshot lists `ADD: Sentiment Insights` immediately above `Top Editorial Domains`. Thomas's instruction was 'look at screenshot for placement' — strict literal read of the screenshot puts Sentiment Insights directly above Top Editorial Domains." That read satisfied the literal "above Top Editorial Domains" but missed Tina's intended overall flow (Synopsis -> Sentiment Insights -> Top Editorial Domains, with Matchback unmentioned because it wasn't on her sketch).

#### Files touched

- `components/report-sections/peec-ai/pr-influence.tsx` — single JSX block moved. Updated the inline comment above the `<SentimentInsights>` render to document the FB-011 placement decision.

#### Verification

- TypeScript compilation: clean.
- The component itself is unchanged — same `clientSlug` prop, same Avenue Z sandbox gate. Only its position in the JSX flow changed.

#### Open risks

1. If Tina wanted Matchback BELOW Top Editorial Domains (per her omission of it from the mockup), this PR Influence reorder doesn't address that. Out of scope for FB-011; flag as future FB-NN if Tina ever raises it.

---

### FB-010 — AEO PR Influence tab: add Sentiment Insights section (Avenue Z sandbox)

- **Status:** done
- **Source:** Tina via Thomas — annotated mockup of PR Influence "Recommended layout" with `ADD: Sentiment Insights` immediately above `Top Editorial Domains`. Plus a detailed static example.
- **Author:** Tina
- **Type:** new UI (static, Avenue Z sandbox)
- **Scope:** new `components/report-sections/peec-ai/sentiment-insights.tsx`, modified `components/report-sections/peec-ai/pr-influence.tsx`. Sandbox-gated to Avenue Z only.

#### Verbatim ask (condensed)

`ADD: Sentiment Insights`. Headline: `Positive 89.4%`. Two weaknesses (titled, each with an explanation paragraph). Eight positive themes ("Sources of Positive Claims") mapping each theme to its citing URLs. Design: sentiment as KPI pill, Positive Themes + Weaknesses side-by-side, click-to-expand accordion. Placement: below Synopsis, above Top Editorial Domains.

#### Key decisions

| Decision | Why |
|---|---|
| Static, hardcoded Avenue Z content (no Glean, no fetch) | Thomas: "avenue z is the guinea pig... let's just make it static for avenue z first and then cross the bridge on the others." Same pattern as FB-006. |
| Sandbox gate: `clientSlug === 'avenue-z'` only | Thomas: "sandbox all this feedback to avenue z... don't want data leaking into other clients." Hardcoded Avenue Z URLs must not render on iPullRank, Shopify, etc. Other clients see nothing in the slot. |
| Placement: between Matchback (Section B) and Top Editorial Domains (Section C) | Thomas: "look at screenshot for placement." Literal read of Tina's screenshot puts the ADD label directly above Top Editorial Domains. |
| Client component (`'use client'`) | Accordion needs `useState`. Two `Set<number>` states (positive + weaknesses) so multiple themes can be open at once. |
| Sentiment as a rounded-full pill with brand-green accent | Tina: "sentiment as a KPI pill." Brand green is the existing positive-signal color. |
| `ChevronRight` rotating to 90deg on expand | Standard accordion affordance. |
| URLs render as `hostname.com · /path`, new tab, brand-green `›` marker | Readable + reuses the synopsis "Recommended actions" visual rhythm. |
| Em-dashes replaced with periods in the weakness explanations Tina provided | Project house rule, same intent. |
| Two columns symmetrical heights, `max-h-[400px] overflow-y-auto` per side | Same containment as FB-006 Winners/Losers; page footprint stays bounded. |

#### Files touched

- `components/report-sections/peec-ai/sentiment-insights.tsx` — **New.** ~210 lines. Two `const` arrays (`POSITIVE_THEMES` × 8, `WEAKNESSES` × 2) carry Tina's verbatim data. `SANDBOX_CLIENT_SLUG = 'avenue-z'` gate at the top.
- `components/report-sections/peec-ai/pr-influence.tsx` — Added import; rendered `<SentimentInsights clientSlug={clientSlug} />` between Section B and Section C.

#### What did NOT change

- Synopsis (FB-009-a), Section B, Section C and below — all untouched.
- No data layer additions, no fetches, no env vars.
- FB-006 sandbox fix lives on its own branch (PR #54), not this one.

#### Scope of impact

- Avenue Z: section renders with Tina's static content.
- Every other client: renders nothing in the slot (page flows directly from Matchback into Top Editorial Domains).
- Both internal dashboard and Avenue Z client portal render paths.

#### Verification

- TypeScript clean (`npx tsc --noEmit`).
- 1:1 verbatim check between Tina's pasted "Sources of Positive Claims" and the inline `POSITIVE_THEMES` array — 8 themes, exact titles, exact URLs in the same order.
- Sandbox slug lives in one constant per component, so flipping to live later is a one-line change.

#### Open risks

1. Sentiment value (89.4%) is frozen — will drift from reality as the underlying citation mix changes. Intentional, flagged for live-derivation follow-up.
2. Only Avenue Z renders this; other clients see nothing here until they're either onboarded as additional sandbox clients or we ship live derivation.
3. Static URLs may rot over time. No mitigation in the static version.
4. Default-collapsed accordion hides content at first paint. Matches Tina's brief; trivial to default the first theme open if she requests it.
5. Empty slot on non-Avenue-Z clients may confuse future devs. The `SANDBOX_CLIENT_SLUG` const + comment explain the rationale at the call site.

---

### FB-009 — AEO PR Influence tab: add Executive Synopsis, remove the top KPI strip

- **Status:** done
- **Source:** Tina via Thomas — annotated mockup of the PR Influence tab "Recommended layout" (the ADD/REMOVE block) plus the live page screenshot showing the duplicate "How is AI-driven PR coverage performing?" heading + 6-up KPI grid below it.
- **Author:** Tina
- **Type:** new UI (synopsis) + removal (KPI strip)
- **Scope:** `components/report-sections/peec-ai/pr-influence.tsx`, new `pr-influence-synopsis.tsx` and `lib/peec/pr-influence-synopsis.ts`. Universal across every current and future AEO client by virtue of living in the shared PR Influence render path. First batch on the `official-feedback-pr-influence-tab` branch.

#### Verbatim ask

> **ADD:** AI-generated synopsis of overall PR influence on AEO & recommended actions during the period, executive overview style.
>
> **REMOVE:** The pills for "How is AI-driven PR coverage performing?"

Group mapping:

| Tina element | Sub-item | Change |
|---|---|---|
| ADD: synopsis | FB-009-a | New `<PRInfluenceSynopsis>` RSC card at the top of the tab, Glean-backed, PR-Influence-specific data inputs, executive prose + 2-4 recommended actions |
| REMOVE: pills | FB-009-b | Deleted the entire Section A KPI Strip block (`<h3>` eyebrow + 6 `<KpiCard>` instances) plus the now-dead intermediate display variables that fed only those cards |

#### What was unambiguous

1. Add an executive-style AI synopsis card to the PR Influence tab, matching the FB-002c/FB-003 Overview synopsis pattern.
2. Remove "the pills" beneath the "How is AI-driven PR coverage performing?" heading.
3. Synopsis content should cover the period's PR-influence story and include recommended actions.

#### What was inferred (explicit interpretation choices)

| Decision | What I chose | Why |
|---|---|---|
| **What "the pills" means on this tab** | The entire Section A KPI Strip — the `<h3>` eyebrow + all 6 `<KpiCard>` instances directly below the FB-001 SectionHeader. | (1) The page already has the SectionHeader at the top with the title "How is AI-driven PR coverage performing?" (added in FB-001). The Section A h3 repeated that exact question. Tina was visually staring at a duplicate question + a strip of card containers below it. (2) "The pills" is plural — the h3 alone is singular; the 6 cards are plural. Her word fits the cards. (3) Her red REMOVE annotation in the mockup brackets the heading + cards as one unit. (4) Replacing a metrics strip with a narrative executive synopsis is consistent with what "executive overview style" implies — the same data, retold as prose with recommendations. |
| **Mirror the FB-002c/FB-003 Overview synopsis shell exactly** | Same card layout, Sparkles icon, "EXECUTIVE SYNOPSIS" eyebrow, prose paragraphs, "Recommended actions" list with brand-green `›` markers, graceful try/catch with the same "Synopsis is temporarily unavailable" fallback copy. | Single canonical pattern across the AEO report. The two synopsis cards (Overview + PR Influence) read as the same component, reinforcing the visual rhythm of the section. |
| **Sparkles icon, not Megaphone** | Kept Sparkles (the same one Overview's synopsis uses). | Sparkles is the universal "AI-generated" semantic. Megaphone is for the PR Influence section header (FB-001) — that already lives at the top of the page. The synopsis is AI-generated, so it should read as an AI artifact, not a PR artifact. |
| **PR-Influence-specific synopsis inputs** | The synopsis context (`PRInfluenceSynopsisContext`) carries: AI Visibility % + delta, Avg AI Position + delta, total AI Citations, total PR placements + AI-cited placement count, AI Referral Sessions + delta, total editorial domains + brand-absent count, top 5 brand-absent editorial domains (with citation counts), top 3 opportunity clusters (with scores). All sourced from the data the page already fetches. | These are the metrics the deleted KPI strip surfaced PLUS the per-section signal (brand-absent domains, opportunity clusters) that gives the synopsis enough to recommend specific moves. No new fetches. No proxies. Same numbers the lower-page tables already show. |
| **Synopsis is model-filter-agnostic** | The synopsis context uses unfiltered all-model data even when a model filter is active. Same behavior as the Overview synopsis. | The synopsis is an executive readout at the top of the page; it summarizes the whole period, not the filter state. The per-section tables below already respond to the filter and surface the model-specific detail. Model-filter-responsive synopses would also defeat the 1h cache by adding `models` to the cache key. |
| **Synopsis is provider-agnostic in this tab** | The cache key is `(clientSlug, dateRange)`, not `(clientSlug, dateRange, provider)`. The PR Influence tab is Peec-only (the file uses `getPeecOverview` directly), so provider is implicit. | Simpler key. If a future Profound PR Influence render path is added, swap to `(clientSlug, dateRange, provider)` like Overview does. Low-cost change. |
| **Glean prompt** | Same shell as the Overview synopsis: executive tone, plain English, no fabrication, no em-dashes, strict JSON output (`{synopsis, actions}`). Body specialized to focus on: placement-to-AI-citation conversion, brand-absent editorial domains, and content / pitching moves to close gaps. | Tina said "executive overview style." Same rails that worked for the Overview synopsis. The PR-Influence-specific focus areas come from her own ADD wording ("PR influence on AEO & recommended actions"). |
| **Glean call shape** | `gleanChat(prompt, { saveChat: false })`. No tools, no search. Single-shot inference over the inline-provided numbers. | Same anti-hallucination guarantee as Overview: Glean has no path to invent numbers because it has no search, and the only numbers it sees are the ones we pass in. |
| **JSON extractor: three-tier (direct, fence-strip, widest-span)** | Identical pattern to Overview synopsis. Throws on shape mismatch so the RSC falls back gracefully. | Proven pattern. Glean usually obeys "no markdown fences" but occasionally wraps; the extractor handles all observed shapes without a re-prompt. |
| **Cache version `v1-glean-pri`** | Distinct from Overview's `v2-glean` so cache buckets don't collide and a future migration to a global token / different impersonation model can bump independently. | Tagging discipline. |
| **Dead variable pruning** | Removed `llmFiltered`, `filteredAiVisibilityPct`, `filteredAvgPosition`, `displayAiVisibility`, `displayAiVisibilityDelta`, `displayAvgPosition`, `displayAvgPositionDelta`, and the model-filtered `totalCitations` block — every one of these fed ONLY the KPI cards. Confirmed via grep that no other render site or computation references them. | Strict-mode TS would otherwise flag them as dead, and leaving dead code is the kind of thing that rots and confuses the next reader. Pruned what was provably unused only. |
| **Kept all data the lower-page tables still need** | `youMetrics`, `editorialDomains`, `placementsCitedByAI`, `filteredMatchbackRows`, `aiSessions`, `aiSessionsDelta`, `matchbackTableRows`, `topEditorialRows`, `brandAbsentTableRows`, `opportunityRows`, `nextPitchRows`, `nextPitchEmptyKind` — all of these are still computed and still flow into Sections B through F. | Strict literal scope: this FB removed Section A only. Sections B-F render identically to before. |
| **No em-dashes in any copy** | The PR Influence synopsis subtitle, the fallback message, the prompt, and the FB-009 commit message all use periods or commas only. | Project house rule. |

#### Files touched

| File | Change |
|---|---|
| `lib/peec/pr-influence-synopsis.ts` | **New.** `getPRInfluenceSynopsis()` cached helper. `buildContext()` formats the numeric snapshot. `extractJsonObject()` is the same three-tier extractor as Overview. Calls `gleanChat(prompt, { saveChat: false })`. 1h TTL, version `v1-glean-pri`. |
| `components/report-sections/peec-ai/pr-influence-synopsis.tsx` | **New.** RSC card mirroring `overview-synopsis.tsx`. Sparkles icon, prose paragraphs, "Recommended actions" list, graceful fallback. |
| `components/report-sections/peec-ai/pr-influence.tsx` | Added imports for `PRInfluenceSynopsis` and `PRInfluenceSynopsisContext`. Removed imports for `KpiCard`, `PEEC`, `GA4`, `sumByModel`. Deleted the dead `llmFiltered`/`filtered*`/`display*`/model-filtered `totalCitations` block (39 lines). Built the synopsis context as the last derivation before the `return`. In the JSX, replaced the entire Section A KPI Strip with a single `<PRInfluenceSynopsis>` render. |

#### What did NOT change

- Sections B (Matchback), C (Top Editorial Domains), D (Brand-Absent Editorial Domains), E (Prompt Cluster Opportunity Matrix), F (Next Pitch Opportunities), and the scoring methodology block — all untouched. Same rows, same filter behavior, same demo-mode behavior.
- The FB-001 `<SectionHeader>` at the top of the page — unchanged.
- The model filter mechanics for the lower-page tables — unchanged.
- The Glean infrastructure (`gleanChat()` in `lib/glean.ts`, the ActAs opt-in fix from `f6b0534`) — inherited from `main` via the rebase, unchanged.
- The `period-ribbon.tsx` component file — never rendered on PR Influence in the first place (only on Overview, where it was removed in FB-002a).

#### Scope of impact

- Every Peec client on the PR Influence tab gets the new top card automatically. No DB change, no per-client config, no backfill.
- Synopsis content varies per client and per period (the prompt sees real client-specific numbers). Two clients viewing the same date range will get two different synopses, both grounded in their own data.
- Renders in both the internal dashboard and the client portal.
- Operationally requires the Glean env vars already configured for FB-002c / FB-003 (`GLEAN_INSTANCE`, `GLEAN_API_TOKEN`). No new env vars.

#### Verification

- TypeScript compilation: clean (`npx tsc --noEmit` zero errors).
- Audit grep: zero remaining `KpiCard`, `displayAiVisibility`, `displayAvgPosition`, `llmFiltered`, `filteredAiVisibilityPct`, `filteredAvgPosition`, or `Section A: KPI Strip` references in `pr-influence.tsx`.
- File line count: 635 (down from 691 pre-change, net -56 after accounting for the added synopsis context block).
- The Glean call path is the same one already proven live on the Overview synopsis after the `f6b0534` ActAs fix — no separate Glean integration risk.

#### Open risks (in order of likelihood)

1. **Synopsis tone / specificity.** Most likely place Tina pushes back. Fix is a single-file prompt edit in `lib/peec/pr-influence-synopsis.ts`, no component changes.
2. **Lost at-a-glance scannability of the 6 KPIs.** The synopsis narrates them, but a reader who wants to eyeball "what was AI Visibility %" has to read prose, not a card. If Tina later wants any of those KPIs back, easy add: re-render them under the synopsis with a "Snapshot KPIs" eyebrow (same pattern as Overview FB-002d).
3. **Synopsis quality in demo mode.** Demo mode substitutes synthetic data and the synopsis runs against it, producing a synthetic-flavored narrative. The "Demo mode" badge above the card already signals that. Same risk as Overview demo mode, same mitigation.
4. **Synopsis fallback when Glean errors.** Same graceful "Synopsis is temporarily unavailable. Other metrics on this page are unaffected." copy as Overview. Rest of the page renders unaffected.
5. **Cache version `v1-glean-pri`.** First request after deploy is a guaranteed miss against Glean. If Glean is rate-limited or down at that exact moment for that exact (client, range) the fallback fires; cache then memoizes the fallback for 1h. Acceptable for an executive readout that the page can survive without.

---

### FB-008 — Recolor the Domain Types chart + legend with the Avenue Z brand palette

- **Status:** done
- **Source:** Tina via Thomas — screenshot of the two right-side boxes ("What kinds of sources do AI models cite?" + "What do these domain types mean?")
- **Author:** Tina
- **Type:** brand / visual
- **Scope:** `components/report-sections/peec-ai/index.tsx` only. Universal across every current and future AEO client.

#### Verbatim ask

> Revise color-coding of the two right-side boxes. They're all gray right now, and I think it would be better to use some of the Ave Z color palette.

Plus the attached brand reference: `Brand Code Guide/BRANDOFFICIAL copy 7.md` (yellow `#FFFC60`, green `#60FF80`, cyan `#60FDFF`, blue `#39A0FF`, purple `#6034FF`, text-muted `#8A8A8A`).

#### What was unambiguous

1. Recolor both right-side boxes on the AEO Overview Domain section: the bar chart ("What kinds of sources do AI models cite?") AND the matching legend ("What do these domain types mean?").
2. Use Avenue Z brand palette colors instead of the gray defaults that dominate the current view.
3. The chart bar and the legend dot for the same category MUST match (one source of truth).

#### What was inferred (explicit interpretation choices)

| Decision | What I chose | Why |
|---|---|---|
| **Extract a single shared color map** | New `DOMAIN_TYPE_COLORS` const at the top of the file. Both `DomainTypesChart` and `DomainTypeDefinitions` read from it. | Two render sites for the same data — keeping one map prevents the chart and legend from drifting if anyone tweaks a color later. |
| **Zero `#8A8A8A` grays in the result** | Initial proposal had 3 categories staying gray; Thomas pushed back that 3 grays was still too many. Revised so every category gets a brand color. | Tina's literal complaint was "they're all gray right now" — leaving 3 grays would only partially solve that. |
| **Five primary brand accents for the five highest-signal categories** | `Own` cyan, `UGC` green, `Editorial` blue, `Corporate` yellow, `Competitor` purple. All at 100% opacity. | One unique accent per primary category. Cyan stays on `Own` (was already brand cyan). Green stays on `UGC`. Blue stays on `Editorial`. Yellow is NEW for Corporate (loud, commercial). Purple is NEW for Competitor (attention, rival). |
| **Reference and Institutional use parent accents at 60% opacity** | `Reference: #39A0FF99` (Editorial-blue family). `Institutional: #6034FF99` (Competitor-purple family). | These two categories are semantic "secondary versions" of Editorial (news / info source) and Competitor (authority / influence). Brand-accent at lower opacity is a standard design technique to telegraph "kin but quieter" without introducing new colors that aren't in the brand doc. |
| **Brand-compliance check for opacity** | The Avenue Z brand doc itself uses opacity on accent colors (focus state `rgba(96,253,255,0.15)`, card borders `rgba(255,255,255,0.06)`). | Lowering accent opacity is consistent with how the brand doc uses these colors. Not off-brand. |
| **Other uses 20% white, not gray** | `#FFFFFF33`. | "Other" means "unclassified / miscellaneous." It needs to read as neutral but distinct from the brand-accent categories. White-at-20% is a soft neutral that doesn't look like the missing-color gray Tina flagged. |
| **Corporate = yellow, Competitor = purple** | Yellow for Corporate (commercial, attention-grabbing — fits the dominant category visually). Purple for Competitor (rivals — distinct from your-brand cyan). | Subjective brand-color assignment. Could swap if Tina prefers. Flagged in open risks. |
| **Removed the per-row `color` field from the legend's data array** | Legend rows used to carry their own hardcoded color. After extracting the shared map, the legend just reads `DOMAIN_TYPE_COLORS[type]` directly. | Removes duplication — one map governs both renders. Less drift risk. |
| **Replaced an em-dash in the UGC legend copy** | "User-generated content — Reddit, Quora, forums, etc." → "User-generated content. Reddit, Quora, forums, etc." | Lines I was editing for this item happened to contain an em-dash. House rule: no em-dashes in copy. Scrubbed only on the lines I was already touching, no codebase-wide cleanup. |

#### Files touched

| File | Change |
|---|---|
| `components/report-sections/peec-ai/index.tsx` | Added `DOMAIN_TYPE_COLORS` const map at the top of the file. Updated `DomainTypesChart` to reference it. Updated `DomainTypeDefinitions` to remove the per-row `color` field and reference the shared map instead. Scrubbed one em-dash in the UGC legend copy. |

#### Files NOT touched

- `lib/peec/brand-types.ts` — separate brand-category (not domain-type) data. Out of scope for this item.
- Dead `components/report-sections/profound-ai/index.tsx` — has its own duplicate definitions but is not imported / not routed.
- Tailwind config — color values are inline in this component, no global theme changes needed.
- Any other AEO section — strictly scoped to the Domain Types pair.

#### Scope of impact

- Every Peec client sees the new brand-accent colors automatically.
- Every Profound client sees them automatically (shared render path).
- No DB change, no per-client config, no backfill.
- Renders in both the internal dashboard and the client portal.

#### Verification

- TypeScript compilation: clean (`npx tsc --noEmit` zero errors).
- Audit grep: zero remaining references to the old `TYPE_COLORS` map name, zero remaining `'#8A8A8A'` gray literals in this file. Both renders now read from the same `DOMAIN_TYPE_COLORS` const.
- The chart bar and the legend dot for any given category are guaranteed to match (same source const).

#### Open risks

1. **Corporate-yellow vs Competitor-purple assignment.** Subjective. If Tina prefers the inverse (Corporate purple = serious enterprise, Competitor yellow = "watch this"), it's a two-line swap in the shared const.
2. **60% opacity on Reference / Institutional.** If they read as too muted in the actual rendered chart against the dark surface, easy to bump to 75% or 80%. Hex change only.
3. **Other at 20% white** may appear slightly different from a typical "neutral" expectation. If it reads as too faint, can be raised to 30-40% or swapped to a brand-neutral solution. Hex change only.

---

### FB-007 — Remove Brand Categories chart + definitions; stretch Leaderboard to full width

- **Status:** done
- **Source:** Tina via Thomas — annotated screenshot of the two sidebar cards
- **Author:** Tina
- **Type:** removal + layout change
- **Scope:** `components/report-sections/peec-ai/index.tsx` only. Universal across every current and future AEO client by virtue of living in the shared Overview render path.

#### Verbatim ask

> REMOVE: "Which categories of brands earn AI share of voice?" and "What do these brand categories mean?"
>
> this means the leaderboard: Which brands appear most often in AI answers? will need to be stretched out to fill in the gaps from those two sections going away and being removed.

#### What was unambiguous

1. Delete the BrandSOVChart card titled "Which categories of brands earn AI share of voice?"
2. Delete the BrandDefinitions card titled "What do these brand categories mean?"
3. The Leaderboard ("Which brands appear most often in AI answers?") must stretch to fill the now-empty right column.

#### What was inferred (explicit interpretation choices)

| Decision | What I chose | Why |
|---|---|---|
| **Drop the 2-column grid wrapper entirely** | Replaced `<div className="grid lg:grid-cols-[1fr_280px] items-stretch">{Rankings, [SOV, Definitions]}</div>` with just `<Rankings rankings={data.brandRankings} />`. | With the right column gone, the `1fr_280px` grid serves no purpose. Rankings now stretches to 100% width of its parent flex column naturally. Cleaner than keeping an empty grid. |
| **Delete the `BrandSOVChart` and `BrandDefinitions` function definitions** | Removed both functions (originally ~60 lines combined). | Tina explicitly asked to remove the sections. The helper functions are local to this file and were only referenced by the now-removed JSX. Leaving dead code would clutter the file and rot. |
| **Drop the `BRAND_TYPE_MAP / BRAND_TYPE_COLORS / BRAND_TYPE_DEFINITIONS` import** | Removed the entire import line. | All three exports were only referenced inside the two deleted functions. Audit grep confirmed zero remaining references in this file. The exports themselves still live at `lib/peec/brand-types.ts` for any future consumer; not deleted. |
| **Keep `AVENUE_Z` import** | The two removed blocks used `AVENUE_Z.brandTypes.text`, but `AVENUE_Z.domainTypes.text` is still referenced by the Domain Types section directly below (which Tina did NOT ask to remove). | Import line stays intact for the other named imports (`PEEC`, `AVENUE_Z`, `PROFOUND`). |
| **Did NOT touch the Domain Types section** | The block at the original `index.tsx:323-329` ("Which categories of domains earn AI share of voice?" + "What do these domain categories mean?") looks visually similar but is a different section about DOMAIN categories, not BRAND categories. Tina's ask was specifically about brand categories. | Strict literal read of Tina's screenshot. Domain-category section was not annotated as REMOVE. |
| **Did NOT touch `components/report-sections/profound-ai/index.tsx`** | That file has its own duplicate `BrandSOVChart` and `BrandDefinitions` definitions, but the file itself is dead code: no `import` of `profound-ai/index.tsx` anywhere in the codebase. The active Overview render path is the shared `peec-ai/index.tsx` for both providers. | Out of scope (dead code). Touching it risks breaking unexpected callers if any exist. |

#### Files touched

| File | Change |
|---|---|
| `components/report-sections/peec-ai/index.tsx` | Removed the `BRAND_TYPE_MAP, BRAND_TYPE_COLORS, BRAND_TYPE_DEFINITIONS` import. Deleted the `BrandSOVChart` and `BrandDefinitions` function definitions. Collapsed the Leaderboard grid wrapper down to a single `<Rankings rankings={data.brandRankings} />` so the table stretches to full width. |

#### Files NOT touched

- `components/report-sections/profound-ai/index.tsx` — dead code, never imported.
- `lib/peec/brand-types.ts` — kept as-is for any future consumer.
- Domain Types section below the Leaderboard — different section, not in Tina's ask.

#### Scope of impact

- Every Peec client on the AEO Overview tab sees the change automatically. No DB change, no per-client config, no backfill.
- Every Profound client on the AEO Overview tab also sees the change automatically — they share the same render path.
- Renders in both the internal dashboard and the client portal.

#### Verification

- TypeScript compilation: clean (`npx tsc --noEmit` zero errors).
- Audit grep: zero remaining references to `BrandSOVChart`, `BrandDefinitions`, `BRAND_TYPE_MAP`, `BRAND_TYPE_COLORS`, or `BRAND_TYPE_DEFINITIONS` in `peec-ai/index.tsx`.
- The Domain Types section directly below the Leaderboard is unchanged and still renders.

#### Open risks

1. **The Rankings table's column widths may render differently now that it has more horizontal space.** It uses a sortable table internal layout that responds to its container width. If columns look loose or oddly spaced, that's a table internal styling tweak, not a removal-related regression.
2. **Profound's dead-code Overview file (`profound-ai/index.tsx`) still has the removed cards.** If anyone ever wires that file in as a route again, those cards will reappear. Not a current concern.

---

### FB-006 — Biggest Winners / Biggest Losers cards on the AEO Overview tab (static)

- **Status:** done
- **Source:** Tina's "AEO Analysis" doc (Source: Profound, Period: Last 14 Days, Platform: ChatGPT, Analyst: Tina Fleming, 2026-06-16). Relayed by Thomas with two screenshots + pasted copy.
- **Author:** Tina
- **Type:** new UI (static)
- **Scope:** `components/report-sections/peec-ai/winners-losers-cards.tsx` (new), `components/report-sections/peec-ai/index.tsx`. Universal across every current and future AEO client by virtue of living in the shared Overview render path.

#### Verbatim ask

Tina annotated the Overview Model Breakdown screenshot with two side-by-side ADD blocks (`ADD: Winning Prompts`, `ADD: Losing Prompts`) and supplied the literal copy + data in her AEO Analysis doc:

> **The Biggest Winners**
> Prompts where we **gained** rank to our competitors
> Columns: Prompt | Rank | Delta
> [17 rows]

> **The Biggest Losers**
> Prompts where we **lost** rank to our competitors
> Columns: Prompt | Rank | Delta
> [20 rows]

#### What was unambiguous

1. Two new cards, side by side, on the AEO Overview tab.
2. Placement is between the Model Breakdown table and the Leaderboard (per the annotated screenshot).
3. Titles, subtitle copy, and the bolded `gained` / `lost` emphasis are exactly Tina's words.
4. Three columns per card: `Prompt`, `Rank`, `Delta`.
5. Rank is rendered with the `#` prefix (e.g. `#20`); delta is a signed integer.
6. Positive delta in green, negative in red.
7. The 37 rows (17 winners + 20 losers) Tina provided are the literal content to render.
8. **Tina's data is static for now** — confirmed explicitly by Thomas after I initially overengineered this. Render her exact rows as a fixed list. No data layer wiring.

#### What was inferred (explicit interpretation choices)

| Decision | What I chose | Why |
|---|---|---|
| **Static, hardcoded rows** | Two `const` arrays inside `winners-losers-cards.tsx` carrying Tina's exact 17 winners and 20 losers verbatim. No props on the component. No data layer fetch, no compute. Same content rendered on every client every render. | Thomas's explicit instruction: "tina only wanted winners and losers. and i gave you that data... its assumed they are static for now." Earlier draft computed these from real Peec data and was reverted as overengineering. |
| **Card shell + header styling** | `rounded-lg border border-white/[0.06] bg-bg-surface p-5` — matches the LLMBreakdownTable directly above. Title `text-lg font-bold text-white`; subtitle `text-sm text-text-muted` with the emphasized word inline-bolded white. | Page-wide visual consistency. No italics even though Tina's mockup has them (italics not used elsewhere on the dark AEO page). The bolded inline word delivers her emphasis. |
| **Side-by-side, symmetrical, scroll** | Outer `grid lg:grid-cols-2 gap-5 items-stretch` for equal width + equal height. Inner table body `max-h-[400px] overflow-y-auto` so the page footprint stays bounded. Header (title + subtitle + column row) stays above the scroll area. | Thomas's literal ask: same size, perfectly symmetrical, scroll to see all prompts so it doesn't demand a lot of vertical room. |
| **Column header treatment** | Small uppercase `text-text-muted` header row separated from data rows by a thin divider. `InfoTooltip` on the `Delta` column with copy: "Change in your brand's average rank position for each prompt over the period vs. the previous period of equal length. Positive means you moved up." | Matches the existing Model Breakdown table styling so the two stack visually. Tooltip disambiguates direction so positive=good is explicit. No em-dashes. |
| **Color palette** | Positive delta `#60FF80` (the page-wide brand green used in `SectionHeader`). Negative delta `#FF6B6B`. Tabular nums on rank + delta. | Reuse the existing brand green so winners feel "on-brand good." Red harmonizes with the dark surface without screaming. |
| **Refresh icon in Tina's mockup** | Skipped. | Tina's Winners screenshot has a small circle top-right; Losers doesn't. Looks like a Google Docs render artifact rather than a UX directive. A non-functional icon would mislead. Trivial add later if she actually wants it wired. |
| **Avenue Z is configured on Peec, not Profound** | Cards live in the shared Peec-AI Overview render path (`components/report-sections/peec-ai/index.tsx`) and render for every client that hits that path, regardless of provider. Static content is provider-agnostic. | Tina's doc header says "Source: Profound" because she pulled the analysis data from Profound externally to author the doc. The app's Avenue Z client is wired to Peec (`scripts/seed.ts:39`: `peecCustomerProjectId: 'or_043ae735-...'`). Either way, the cards render in the Overview shell that both providers go through. |

#### Files touched

| File | Change |
|---|---|
| `components/report-sections/peec-ai/winners-losers-cards.tsx` | **New.** Self-contained component. Two `PromptDelta[]` constants (`WINNERS`, `LOSERS`) with Tina's verbatim 37 rows. `WinnersLosersCards` renders two `PromptDeltaCard` instances inside a `grid lg:grid-cols-2 gap-5 items-stretch` wrapper. No props. Component owns the data and the layout. |
| `components/report-sections/peec-ai/index.tsx` | Imported `WinnersLosersCards`. Renders `<WinnersLosersCards />` (no props) between the existing `<LLM>` table render and the existing Leaderboard grid. |

#### Files NOT touched in the final state

- `lib/peec/client.ts` — no data layer changes
- `lib/profound/client.ts` — no data layer changes
- `lib/demo-data/peec.ts`, `lib/demo-data/profound.ts` — no fixture changes
- `PeecOverview` / `ProfoundOverview` types — unchanged

#### History on this item (kept for audit trail)

- Initial implementation (`364f696`) built this as a real feature: prior-period prompt fetch added to the existing Promise.all, parallel `priorPromptMetricsById` map, compute loop, sort, exposed via `PeecOverview.biggestWinners` / `biggestLosers`. Demo data carried Tina's 37 rows. Cards rendered computed real data per client.
- Thomas clarified the intent was static content for now. Reverted in `d9f8f70`: removed the data-layer additions, removed the type fields, removed the demo data arrays, moved Tina's 37 rows inline into the component as two `const` arrays, made the component take no props.
- **`d9f8f70` is the as-shipped state.** Earlier commit `364f696` is no longer reflective of the code and is fully superseded.

#### Scope of impact

- Every Peec client sees these two cards on the Overview tab with Tina's static rows. No per-client variation.
- Every Profound client also sees them (the cards live in the shared Overview render path).
- No DB change, no per-client config, no backfill, no fetch.

#### Verification

- TypeScript compilation: clean (`npx tsc --noEmit` zero errors after the revert).
- Audit grep: zero stragglers from the reverted data-layer plumbing (no remaining references to `PromptDelta` outside the component file, no `biggestWinners`/`biggestLosers` anywhere, no `priorPromptBrandsRes` / `priorPromptMetricsById`).
- 1:1 verbatim check between Tina's screenshots and her pasted copy text done at request time before any code. Match confirmed.
- The 37 rows in the component file match Tina's doc row-for-row (verified by eye against her pasted spec).

#### Open risks

1. **Static data drifts from reality.** Tina's snapshot is from 2026-06-16, Last 14 Days, ChatGPT-only, Profound source. Every render shows that same frozen snapshot regardless of who's viewing or when. Intentional per Thomas's instruction; flagged here so future-Thomas / Paul knows to swap to a live data source when Tina is ready.
2. **Same content shows on every client.** Avenue Z's prompts about AI SEO agencies will appear on iPullRank's portal, Shopify's portal, every Profound client's portal, etc. Confirmed intentional ("its assumed they are static for now"). If a non-Avenue-Z client logs in and sees Avenue Z's data here, that's the trade-off we accepted.
3. **Swap to live data later is mechanical, not architectural.** Component shell is reusable: replace the two `const` arrays with two props (`winners: PromptDelta[]`, `losers: PromptDelta[]`) and pass them from the data layer. No layout / styling / scroll changes needed.

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
