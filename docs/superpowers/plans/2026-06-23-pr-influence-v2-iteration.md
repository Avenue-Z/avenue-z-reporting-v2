# PR Influence v2 Iteration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every ⚠️ row in Tina's PR Influence v1 scorecard CSV by shipping FB-025 through FB-030 as a single branch (`official-feedback-pr-influence-v2`) → one PR.

**Architecture:** Six surgical, mostly-independent fixes against the PR Influence RSC and its tables / synopsis / sentiment helpers. The heaviest fix (FB-026) wires the Sentiment Insights card from hardcoded Avenue Z sandbox content to live per-period per-model Glean-backed sentiment classification, mirroring the canonical `lib/peec/synopsis.ts` pattern. All other fixes are localized edits.

**Tech Stack:** Next.js 15 RSCs, TypeScript strict, Recharts, Glean Chat API (`gleanChat()` in `lib/glean.ts`), `cached()` wrapper (`lib/cache.ts`), `node:assert` + `tsx` for tests (NOT vitest — repo convention).

---

## Source feedback — Tina's PR Influence v1 CSV (single source of truth)

Path on disk: `/Users/thomaschangavenuez/Downloads/Reporting Dash Feedback (Thomas Score Card) - PR Influence Tab.csv`

8 ⚠️ rows → 6 FB items:

| FB | CSV row(s) | Tina's literal feedback | 1:1 fix |
|---|---|---|---|
| **FB-025** | E2 | Executive Synopsis returning raw floats (`2.6297537434931484`) | Round numeric interpolations in `buildContext()` + tighten Glean prompt + bump cache version |
| **FB-026** | E4 + E5 | Sentiment Insights card + pill are static; "exact copy of the example text I provided"; should react to date AND model | New Glean-backed `lib/peec/sentiment-insights.ts`; rewrite component as data-driven; lift Avenue Z sandbox gate; plumb dateRange + models from `pr-influence.tsx` |
| **FB-027** | E14 | Prompt Clusters bars too small; X-axis shouldn't always go to 100; should fit next "5" or "10" above max | Dynamic X-axis `domain={[0, upper]}` where upper = next 5 (≤10) or next 10 (>10) above max |
| **FB-028** | E16 + E17 | "There should be more than one pitch opportunity. Peec shows thousands of editorial URLs. Must be something wrong with one of the filters." | Switch from domain-row to URL-row; redefine brand-absent at URL level using `urlCitation.mentionsYourBrand === false`; drop the buggy `!prDomains.has` definition; drop the `retrievedDelta > 0` killer filter; drop "Delta of Citation Share" column |
| **FB-029** | E23 (REVISION) | Re-add PR Placement Matchback as a CHART right beneath Exec Summary. Literal new title + subtitle (below). | New simplified 5-column `<PRPlacementMatchbackTable>` (Publication / Article / Publish Date / Cited by AI? / AI Engines) reusing the still-live `filteredMatchbackRows`. Placed between `<PRInfluenceSynopsis>` and `<SentimentInsights>`. |
| **FB-030** | (last row) | Remove the footnote: "PR Influence on AI Visibility . Peec AI (live) . GA4 AI referral sessions (live) . N PR placements (...)" | Delete the trailing `<p className="text-xs text-text-muted">` block |

Literal text from Tina that MUST be used verbatim in code/copy:

- **FB-029 title:** `Which secured PR placements are showing up in AI citations?`
- **FB-029 subtitle:** `See which placements secured in the selected timeframe are being cited in AI-generated answers and how they are shaping brand visibility, sentiment, and reputation across your tracked prompts.`

---

## Literal-interpretation policy (carried from Overview v2)

1. **Tina's words drive the implementation.** Where she names a behavior (e.g. "date AND model"), ship both.
2. **Universal across clients** for design / UX. FB-026 specifically **lifts** the Avenue Z sandbox gate (precedent: FB-023).
3. **Truth-grounded data only.** Drop fields that can't be computed honestly (e.g. URL-level delta does not exist in Peec today; drop the column).
4. **No em-dashes in any copy written.** Use periods or commas. (The em-dash in section `### FB-NNN —` headings is structural convention.)
5. **No Neon migrations** (Paul rule, FB-024 precedent). All six fixes are code-only.
6. **Glean Chat API only** for any LLM inference. Use `gleanChat()` — do NOT pass `actAs` (token is a USER token).
7. **`node:assert` + `tsx` for tests.** NOT vitest.

---

## File structure

### Created

- `lib/peec/sentiment-insights.ts` — Glean-backed sentiment classification + theme extraction. Exports `getSentimentInsights`, `applyEnginesFilter`, types `SentimentInsights`, `SentimentInsightsContext`.
- `lib/peec/sentiment-insights.test.ts` — `node:assert` tests covering `applyEnginesFilter` + `extractJsonObject`.

### Modified

- `lib/peec/pr-influence-synopsis.ts` — Round numeric interpolations in `buildContext`. Tighten prompt format rule. Bump `version` from `v1-glean-pri` → `v2-glean-pri`.
- `components/report-sections/peec-ai/sentiment-insights.tsx` — Replace hardcoded `POSITIVE_THEMES` / `WEAKNESSES` const arrays + `SENTIMENT_PCT` constant + `SANDBOX_CLIENT_SLUG` gate with a props-driven view. Take `data: SentimentInsights | null` prop. Render empty state when null/zero themes.
- `components/report-sections/peec-ai/pr-influence-tables.tsx` — (1) Add new simplified `PRPlacementMatchbackTable` + `PRPlacementMatchbackRow` for FB-029. (2) FB-027: dynamic X-axis in `PromptClusterOpportunityMatrix`. (3) FB-028: drop `citationCountDelta` field from `BrandAbsentEditorialDomainRow` + drop "Delta of Citation Share" column.
- `components/report-sections/peec-ai/pr-influence.tsx` — (FB-025 cascade: nothing) (FB-026) fetch `getSentimentInsights` in parallel, pass to `<SentimentInsights data={...} />`. (FB-028) rewrite `brandAbsentTableRows` build from URL-level data. (FB-029) render `<PRPlacementMatchbackTable rows={filteredMatchbackRows} />` between Synopsis and SentimentInsights with Tina's literal title + subtitle. (FB-030) delete the trailing footnote `<p>` block.

### Docs (per-FB; touched in every task)

- `docs/official-feedback/feedback-log.md` — append decision log under `## Closed` (newest at top).
- `docs/official-feedback/changelog.md` — append one-line entry (newest at top).
- `docs/official-feedback/tina-scorecard.csv` for PR Influence is the Downloads file; status updates live in `feedback-log.md` only.
- `docs/official-feedback/status.md` — updated in Task 7 (final).

---

## Working preconditions (verify before Task 1)

- On branch `official-feedback-pr-influence-v2`, cut from `main` at `91a1971`.
- `git status` clean.
- `npx tsc --noEmit` zero output.
- `npx tsx lib/peec/winners-losers.test.ts` passes.

---

## Task 1: FB-025 — Synopsis decimals

**Files:**
- Modify: `lib/peec/pr-influence-synopsis.ts:36-87, 126-141, 151-163`

Tina (CSV E2):
> ISSUE: The executive synopsis is returning long decimals that are standing out as unnecessary. (Example: `growthmarketingpro.com at 2.6297537434931484 AI citations`)

Root cause: `buildContext()` interpolates `d.citationCount` directly (the Peec `retrieved` field is a float percentage). Glean obediently echoes the raw float into its prose.

Fix:
- In `buildContext()`, format `d.citationCount` with one decimal place.
- In the prompt string, add an explicit format rule the LLM cannot miss.
- Bump cache `version` to flush stale cached responses.

- [ ] **Step 1: Replace `buildContext()` body**

Open `lib/peec/pr-influence-synopsis.ts`. Locate lines 36-87. Replace the function with:

```ts
function buildContext(args: { context: PRInfluenceSynopsisContext; dateRange: string }): string {
  const { context: c, dateRange } = args
  const visStr = c.aiVisibility != null ? `${c.aiVisibility.toFixed(1)}%` : 'n/a'
  const visDeltaStr = c.aiVisibilityDelta != null
    ? `${c.aiVisibilityDelta >= 0 ? '+' : ''}${c.aiVisibilityDelta.toFixed(1)}pp`
    : 'n/a'
  const posStr = c.avgAiPosition != null ? `#${c.avgAiPosition.toFixed(1)}` : 'n/a'
  const posDeltaStr = c.avgAiPositionDelta != null
    ? `${c.avgAiPositionDelta >= 0 ? '+' : ''}${c.avgAiPositionDelta.toFixed(1)}`
    : 'n/a'
  const aiRefStr = c.aiReferralSessions != null ? c.aiReferralSessions.toLocaleString() : 'not configured'
  const aiRefDeltaStr = c.aiReferralSessionsDelta != null
    ? `${c.aiReferralSessionsDelta >= 0 ? '+' : ''}${c.aiReferralSessionsDelta.toFixed(1)}%`
    : 'n/a'
  const citationRate = c.totalPlacements > 0
    ? `${((c.placementsCitedByAI / c.totalPlacements) * 100).toFixed(1)}%`
    : 'n/a'

  // FB-025: round per-domain citation counts to 1 decimal before interpolation.
  // The Peec `retrieved` field is a float percentage; Glean echoed raw floats
  // like "2.6297537434931484 AI citations" into the prose verbatim.
  const brandAbsentBlock = c.topBrandAbsentDomains.length > 0
    ? `Top editorial domains citing AI but missing your brand (highest AI citation count):
${c.topBrandAbsentDomains.map((d, i) => `${i + 1}. ${d.domain} - ${d.citationCount.toFixed(1)} AI citations`).join('\n')}`
    : 'Top editorial domains where brand is absent: none reported in period.'

  // FB-025: opportunity score is a derived 0-100 number; round to integer.
  const opportunityBlock = c.topOpportunityClusters.length > 0
    ? `Top prompt-cluster opportunities (highest opportunity score):
${c.topOpportunityClusters.map((o, i) => `${i + 1}. ${o.cluster} - score ${Math.round(o.score)}`).join('\n')}`
    : 'Top prompt-cluster opportunities: none reported in period.'

  return `
Period: ${dateRange}
Data sources: Peec AI (visibility, citations, editorial domains), PR Proof Library (placements), GA4 (AI referral sessions)

Brand performance in AI answers:
- AI Visibility: ${visStr} (vs prior period: ${visDeltaStr})
- Average AI Position: ${posStr} (vs prior: ${posDeltaStr})
- Total AI Citations: ${c.totalAiCitations.toLocaleString()}

PR placement performance:
- Total PR placements in period: ${c.totalPlacements}
- Placements cited by AI engines: ${c.placementsCitedByAI} of ${c.totalPlacements} (${citationRate})

AI referral traffic (GA4):
- Sessions from AI sources: ${aiRefStr} (vs prior period: ${aiRefDeltaStr})

Editorial coverage:
- Total editorial domains cited by AI: ${c.totalEditorialDomains}
- Editorial domains where your brand is absent: ${c.brandAbsentCount}

${brandAbsentBlock}

${opportunityBlock}
`.trim()
}
```

- [ ] **Step 2: Tighten the prompt with an explicit format rule**

In the same file, locate `getPRInfluenceSynopsisImpl()` (lines 123-145). Replace the `const prompt = ...` block with:

```ts
  const prompt = `You are an executive analyst writing a concise overview for a marketing leadership team. Use the data below to write a 2 to 3 paragraph synopsis of how the brand's PR placements are translating into AI-engine visibility during the selected period, followed by 2 to 4 concrete recommended actions for the team. Focus on: how PR placements are converting to AI citations, where the brand is missing from key editorial domains, and which content or pitching moves would close those gaps.

Tone: executive, plain English, no jargon, no hype. Reference real numbers from the data. Do not fabricate metrics. If a metric is "n/a" or "not configured", do not invent a value. Do not use em-dashes; use periods and commas.

Number formatting (strict): Every number you output in prose must have at most 1 decimal place. Never echo raw floats with more than 1 decimal. Integers like placement counts stay as integers. Percentages render like "28.3%". Counts like "1,407" use thousands separators.

Output strictly valid JSON in this shape, with no markdown fences and no commentary before or after:
{
  "synopsis": "Two to three short paragraphs separated by \\n\\n. No bullets. No headings.",
  "actions": ["Short action statement 1", "Short action statement 2", "..."]
}

Data:
${dataSection}`
```

- [ ] **Step 3: Bump the cache version**

In the same file, locate the `cached(...)` call (lines 151-163). Change `version: 'v1-glean-pri'` to `version: 'v2-glean-pri'`. Final block:

```ts
export const getPRInfluenceSynopsis = cached(
  'glean',
  'getPRInfluenceSynopsis',
  getPRInfluenceSynopsisImpl,
  {
    version: 'v2-glean-pri',  // FB-025: rounded numerics in buildContext + stricter prompt format rule
    ttlSeconds: 3600,
    extractTags: ([clientSlug, dateRange]) => ({
      client: clientSlug,
      dateRange,
    }),
  },
)
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: zero output.

- [ ] **Step 5: Commit**

```bash
git add lib/peec/pr-influence-synopsis.ts
git commit -m "FB-025: round synopsis numerics + strict format rule (CSV E2)

Tina v1 CSV E2: 'executive synopsis is returning long decimals
that are standing out as unnecessary' — example 2.6297537434931484
AI citations rendered verbatim in prose.

Root cause: buildContext() interpolated d.citationCount (Peec
retrieved float %) directly into the Glean prompt; opportunity
score was passed as a raw float too.

Fix:
- d.citationCount.toFixed(1) + Math.round(o.score) in buildContext
- Added strict 'Number formatting' rule to the prompt: at most 1
  decimal in prose, integers stay integers, percentages render as
  '28.3%', counts use thousands separators.
- Bumped cache version v1-glean-pri -> v2-glean-pri to flush stale
  cached responses.

No render-layer changes. Universal across clients."
```

- [ ] **Step 6: Append feedback-log + changelog entries (newest at top)**

In `docs/official-feedback/feedback-log.md`, under `## Closed`, prepend a new `### FB-025 — ...` block with: status, source (CSV E2 + Tina's verbatim text), scope, problem, solution, files touched, verification, open risks.

In `docs/official-feedback/changelog.md`, after the `---` divider line, prepend:

```
FB-025 | 2026-06-23 | <SHA> | a | Synopsis decimals fix per Tina v1 CSV E2. buildContext (lib/peec/pr-influence-synopsis.ts) now interpolates d.citationCount.toFixed(1) and Math.round(o.score) instead of raw floats. Prompt strengthened with 'Number formatting (strict)' rule: at most 1 decimal in prose, integers stay integers, percentages render as N.N%, counts use thousands separators. Cache version v1-glean-pri -> v2-glean-pri to flush stale responses. No render changes.
```

Backfill the `<SHA>` placeholder after the docs commit lands:

```bash
git add docs/official-feedback/feedback-log.md docs/official-feedback/changelog.md
git commit -m "docs(feedback): FB-025 decision log + changelog"
SHA=$(git rev-parse HEAD~1)
sed -i '' "s/<SHA>/${SHA:0:7}/" docs/official-feedback/changelog.md
git add docs/official-feedback/changelog.md
git commit -m "docs(feedback): backfill FB-025 SHA"
```

---

## Task 2: FB-026 — Sentiment Insights live (Glean-backed, date + model reactive)

**Files:**
- Create: `lib/peec/sentiment-insights.ts`
- Create: `lib/peec/sentiment-insights.test.ts`
- Modify: `components/report-sections/peec-ai/sentiment-insights.tsx` (full rewrite of data flow; preserve accordion UI)
- Modify: `components/report-sections/peec-ai/pr-influence.tsx` (fetch + pass data, drop sandbox-only invocation)

Tina (CSV E4 + E5, identical complaint on both card + pill):
> ISSUE: This seems like static copy and should be pulling actual data. It doesn't change when a new date range or model is selected and is an exact copy of the example text I provided.

Heaviest item in this batch. Net-new Glean-backed analytical pipeline.

### 2.1 — New helper `lib/peec/sentiment-insights.ts`

- [ ] **Step 1: Create the helper file**

```ts
// lib/peec/sentiment-insights.ts
// FB-026: live Glean-backed sentiment classification + theme extraction for
// the AEO PR Influence Sentiment Insights card. Mirrors the canonical pattern
// in lib/peec/synopsis.ts: single-shot Glean Chat call, strict-JSON output,
// three-tier extractor, cached per (clientSlug, dateRange, modelKey) for 1h.
//
// Tina v1 CSV E4 + E5: the card was hardcoded Avenue Z sandbox content with
// no data flow. This module wires it to the real per-URL citation data
// (UrlCitation[] from lib/peec/url-citations.ts) and produces a per-period
// per-model sentiment readout that the component renders verbatim.
import { cached } from '@/lib/cache'
import { gleanChat } from '@/lib/glean'
import type { UrlCitation } from '@/lib/peec/url-citations'
import type { AEOModel } from '@/lib/peec/models'

export type SentimentTheme = { title: string; urls: string[] }
export type SentimentNegativeTheme = { title: string; explanation: string; urls: string[] }

export type SentimentInsights = {
  sentimentPct: number   // 0-100, share of analyzed URLs classified as positive
  positiveThemes: SentimentTheme[]
  negativeThemes: SentimentNegativeTheme[]
  analyzedUrlCount: number  // how many URLs went into the analysis (for trust)
}

export type SentimentInsightsContext = {
  citations: UrlCitation[]  // already filtered to period + model by the caller
}

/**
 * Filter URL citations to only those cited by at least one of the selected
 * AI engines. With `models=null`, returns the input unchanged. Mirrors the
 * filteredMatchbackRows logic in pr-influence.tsx: URLs with no engines at
 * all are DROPPED when a filter is active (no model-specific signal).
 */
export function applyEnginesFilter(
  citations: UrlCitation[],
  models: AEOModel[] | null,
): UrlCitation[] {
  if (!models || models.length === 0) return citations
  const set = new Set<string>(models)
  return citations.filter((c) => c.engines.length > 0 && c.engines.some((e) => set.has(e)))
}

/**
 * Build the data block fed into the Glean prompt. Caps at 60 URLs to keep
 * the prompt size bounded. Sort by citationCount desc so the most cited URLs
 * always make it into the analysis.
 */
function buildContext(args: { citations: UrlCitation[]; dateRange: string }): string {
  const { citations, dateRange } = args
  const ranked = [...citations].sort((a, b) => b.citationCount - a.citationCount).slice(0, 60)
  const lines = ranked.map((c, i) => {
    const titleStr = c.title ? c.title.replace(/\s+/g, ' ').trim().slice(0, 200) : '(no title)'
    return `${i + 1}. URL: ${c.url}\n   Title: ${titleStr}\n   Domain: ${c.domain}\n   Mentions your brand: ${c.mentionsYourBrand ? 'yes' : 'no'}\n   Engines citing: ${c.engines.length > 0 ? c.engines.join(', ') : 'unknown'}`
  })
  return `
Period: ${dateRange}
Analyzed citations: ${ranked.length} (top by citation count from ${citations.length} total AI-cited URLs)

Citations:
${lines.join('\n\n')}
`.trim()
}

function extractJsonObject(raw: string): SentimentInsights {
  const tryParse = (s: string): SentimentInsights | null => {
    try {
      const obj = JSON.parse(s) as Partial<SentimentInsights>
      if (
        typeof obj.sentimentPct === 'number' &&
        Array.isArray(obj.positiveThemes) &&
        Array.isArray(obj.negativeThemes) &&
        typeof obj.analyzedUrlCount === 'number'
      ) {
        return obj as SentimentInsights
      }
      return null
    } catch {
      return null
    }
  }

  const direct = tryParse(raw.trim())
  if (direct) return direct

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced && fenced[1]) {
    const inner = tryParse(fenced[1].trim())
    if (inner) return inner
  }

  const first = raw.indexOf('{')
  const last  = raw.lastIndexOf('}')
  if (first !== -1 && last > first) {
    const span = tryParse(raw.slice(first, last + 1))
    if (span) return span
  }

  throw new Error('Glean response did not contain a parseable Sentiment Insights object')
}

const EMPTY: SentimentInsights = {
  sentimentPct: 0,
  positiveThemes: [],
  negativeThemes: [],
  analyzedUrlCount: 0,
}

async function getSentimentInsightsImpl(
  _clientSlug: string | undefined,
  dateRange: string,
  _modelKey: string,
  context: SentimentInsightsContext,
): Promise<SentimentInsights> {
  if (context.citations.length === 0) return EMPTY

  const dataSection = buildContext({ citations: context.citations, dateRange })

  const prompt = `You are a senior brand-analyst reading AI-cited articles to classify how each one talks about a brand. Use ONLY the URLs and titles below. Do not invent sources, themes, or claims.

For each URL, decide if its tone toward the brand is positive, negative, or neutral, based on the title and what the URL implies. Then group the positive URLs into a small number of distinct themes (3 to 8), each with a short title that names the positive pattern. Do the same for negative URLs (0 to 4 themes). Each theme must reference the actual URLs it groups.

Tone: plain English, no jargon. Do not use em-dashes; use periods and commas. Theme titles are short noun phrases like "Strong AI visibility gains" or "Unproven impact". Negative-theme explanations are one short sentence.

Output strictly valid JSON in this shape, with no markdown fences and no commentary before or after:
{
  "sentimentPct": 0-100 number representing the share of analyzed URLs classified as positive (round to 1 decimal),
  "positiveThemes": [{ "title": "short noun phrase", "urls": ["https://..."] }],
  "negativeThemes": [{ "title": "short noun phrase", "explanation": "one short sentence", "urls": ["https://..."] }],
  "analyzedUrlCount": integer number of URLs you actually classified
}

Data:
${dataSection}`

  const raw = await gleanChat(prompt, { saveChat: false })
  return extractJsonObject(raw)
}

/**
 * Cached entry point. Cache key derives from positional args:
 *   clientSlug + dateRange + modelKey
 * where modelKey is a stable sorted-joined string of selected models, or
 * "all" when no filter is active. context.citations is passed for the prompt
 * but the cache wrapper keys on the primitive args only — context varies in
 * lockstep with dateRange + modelKey. One-hour TTL.
 */
export const getSentimentInsights = cached(
  'glean',
  'getSentimentInsights',
  getSentimentInsightsImpl,
  {
    version: 'v1-glean-sentiment',
    ttlSeconds: 3600,
    extractTags: ([clientSlug, dateRange, modelKey]) => ({
      client: clientSlug,
      dateRange,
      models: modelKey,
    }),
  },
)

/** Stable cache-key fragment for the active model filter. */
export function modelKeyOf(models: AEOModel[] | null): string {
  if (!models || models.length === 0) return 'all'
  return [...models].sort().join(',')
}
```

- [ ] **Step 2: Type-check the new helper**

Run: `npx tsc --noEmit`
Expected: zero output.

### 2.2 — Tests for the helper

- [ ] **Step 3: Create the test file**

```ts
// lib/peec/sentiment-insights.test.ts
// Run: npx tsx lib/peec/sentiment-insights.test.ts
// FB-026: unit tests for the Sentiment Insights helper. Two parts:
//   - applyEnginesFilter:  per-engine filter, drops URLs with no engines
//                          when a filter is active, no-op when models=null.
//   - modelKeyOf:          stable cache key fragment.
import { strict as assert } from 'node:assert'
import { applyEnginesFilter, modelKeyOf } from './sentiment-insights'
import type { UrlCitation } from './url-citations'

function makeCitation(over: Partial<UrlCitation>): UrlCitation {
  return {
    url: 'https://example.com/a',
    urlKey: 'example.com/a',
    domain: 'example.com',
    classification: 'editorial',
    title: null,
    citationCount: 1,
    citationRate: 0,
    citationAvg: 0,
    engines: [],
    mentionedBrandIds: [],
    competitorBrandNames: [],
    mentionsYourBrand: false,
    ...over,
  }
}

// --- applyEnginesFilter ---

// models=null returns input unchanged
{
  const a = makeCitation({ url: 'a', engines: ['ChatGPT'] })
  const b = makeCitation({ url: 'b', engines: [] })
  const out = applyEnginesFilter([a, b], null)
  assert.equal(out.length, 2)
}

// models=[] (empty array) is treated like null and returns input unchanged
{
  const a = makeCitation({ url: 'a', engines: ['ChatGPT'] })
  const out = applyEnginesFilter([a], [])
  assert.equal(out.length, 1)
}

// models=[ChatGPT] keeps only citations cited by ChatGPT
{
  const a = makeCitation({ url: 'a', engines: ['ChatGPT'] })
  const b = makeCitation({ url: 'b', engines: ['Perplexity'] })
  const c = makeCitation({ url: 'c', engines: ['ChatGPT', 'Gemini'] })
  const out = applyEnginesFilter([a, b, c], ['ChatGPT'])
  assert.deepEqual(out.map(x => x.url), ['a', 'c'])
}

// models=[ChatGPT, Gemini] keeps citations matching ANY of the selected
{
  const a = makeCitation({ url: 'a', engines: ['ChatGPT'] })
  const b = makeCitation({ url: 'b', engines: ['Gemini'] })
  const c = makeCitation({ url: 'c', engines: ['Perplexity'] })
  const out = applyEnginesFilter([a, b, c], ['ChatGPT', 'Gemini'])
  assert.deepEqual(out.map(x => x.url), ['a', 'b'])
}

// citations with no engines at all are DROPPED when a filter is active
// (no model-specific signal — same rule as filteredMatchbackRows in pr-influence.tsx)
{
  const noEngines = makeCitation({ url: 'a', engines: [] })
  const out = applyEnginesFilter([noEngines], ['ChatGPT'])
  assert.deepEqual(out, [])
}

// --- modelKeyOf ---

// null → 'all'
assert.equal(modelKeyOf(null), 'all')

// empty array → 'all'
assert.equal(modelKeyOf([]), 'all')

// single model → that model name
assert.equal(modelKeyOf(['ChatGPT']), 'ChatGPT')

// multiple models → sorted comma-join (stable cache key)
assert.equal(modelKeyOf(['Perplexity', 'ChatGPT']), 'ChatGPT,Perplexity')
assert.equal(modelKeyOf(['ChatGPT', 'Perplexity']), 'ChatGPT,Perplexity')

console.log('lib/peec/sentiment-insights.test.ts: all assertions passed')
```

- [ ] **Step 4: Run the test**

Run: `npx tsx lib/peec/sentiment-insights.test.ts`
Expected: `lib/peec/sentiment-insights.test.ts: all assertions passed`

### 2.3 — Rewrite the component as data-driven

- [ ] **Step 5: Replace `components/report-sections/peec-ai/sentiment-insights.tsx`**

Open the file and replace its entire contents with:

```tsx
'use client'

// components/report-sections/peec-ai/sentiment-insights.tsx
// FB-026: data-driven Sentiment Insights card. Previously this file held
// hardcoded Avenue Z sandbox content (POSITIVE_THEMES / WEAKNESSES const
// arrays + a fixed 89.4% pill, gated to clientSlug==='avenue-z'). Tina v1
// CSV E4 + E5: card and pill must react to date AND model. The sandbox gate
// is LIFTED (precedent: FB-023). The component now takes `data` as a prop
// and renders accordions over the live themes returned by the Glean-backed
// helper at lib/peec/sentiment-insights.ts.

import { useState } from 'react'
import { Sparkles, ChevronRight } from 'lucide-react'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import type { SentimentInsights as SentimentInsightsData } from '@/lib/peec/sentiment-insights'

const HEADLINE_TOOLTIP =
  'Share of analyzed AI-cited URLs classified as positive in tone toward your brand. Themes are grouped from URL titles and metadata by the Glean Chat API.'

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function pctLabel(p: number): string {
  if (p >= 75) return 'Positive'
  if (p >= 45) return 'Mixed'
  return 'Negative'
}

function pctTint(p: number): { ring: string; bg: string; text: string } {
  if (p >= 75) return { ring: 'border-[#60FF80]/30', bg: 'bg-[#60FF80]/10', text: 'text-[#60FF80]' }
  if (p >= 45) return { ring: 'border-[#FFD700]/30', bg: 'bg-[#FFD700]/10', text: 'text-[#FFD700]' }
  return { ring: 'border-[#FF4444]/30', bg: 'bg-[#FF4444]/10', text: 'text-[#FF4444]' }
}

function ThemeAccordion({
  title,
  count,
  expanded,
  onToggle,
  children,
}: {
  title: string
  count?: number
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-md border border-white/[0.06] bg-white/[0.02]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-text-muted transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        <span className="flex-1 text-sm font-semibold text-white">{title}</span>
        {count !== undefined && (
          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-bold tabular-nums text-text-muted">
            {count}
          </span>
        )}
      </button>
      {expanded && <div className="border-t border-white/[0.06] px-3 py-3">{children}</div>}
    </div>
  )
}

export function SentimentInsights({ data }: { data: SentimentInsightsData | null }) {
  const [openPos, setOpenPos]   = useState<Set<number>>(new Set())
  const [openNeg, setOpenNeg]   = useState<Set<number>>(new Set())

  const togglePos = (i: number) => {
    const next = new Set(openPos)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    setOpenPos(next)
  }
  const toggleNeg = (i: number) => {
    const next = new Set(openNeg)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    setOpenNeg(next)
  }

  const noData = !data || data.analyzedUrlCount === 0

  return (
    <section className="rounded-xl border border-white/[0.08] bg-bg-surface p-6">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#60FF80]/10">
          <Sparkles className="h-4 w-4 text-[#60FF80]" />
        </span>
        <h3 className="text-sm font-bold uppercase tracking-widest text-text-muted">Sentiment Insights</h3>
        <InfoTooltip text={HEADLINE_TOOLTIP} />
        {!noData && (() => {
          const tint = pctTint(data!.sentimentPct)
          return (
            <span
              className={`ml-auto inline-flex items-center gap-2 rounded-full border ${tint.ring} ${tint.bg} px-3 py-1 text-xs font-bold uppercase tracking-widest ${tint.text}`}
              title="Sentiment headline for the selected date range and model"
            >
              {pctLabel(data!.sentimentPct)}
              <span className="tabular-nums">{data!.sentimentPct.toFixed(1)}%</span>
            </span>
          )
        })()}
      </header>

      {noData && (
        <p className="text-sm text-text-muted">
          Not enough AI-cited URLs in this date range or model selection to classify sentiment. Try a wider date range or all-models view.
        </p>
      )}

      {!noData && (
        <div className="grid gap-5 lg:grid-cols-2 items-stretch">
          {/* Positive Themes */}
          <div className="flex flex-col rounded-lg border border-white/[0.06] bg-bg-surface p-4">
            <h4 className="mb-1 text-base font-bold text-white">Positive Themes</h4>
            <p className="mb-3 text-xs text-text-muted">
              What AI-cited sources say <span className="font-bold text-white">positively</span> about the brand. Click a theme to see the citing sources.
            </p>
            <div className="flex-1 space-y-2 overflow-y-auto pr-1 max-h-[400px]">
              {data!.positiveThemes.length === 0 ? (
                <p className="text-xs text-text-muted">No positive themes detected in this period.</p>
              ) : (
                data!.positiveThemes.map((theme, i) => (
                  <ThemeAccordion
                    key={`${theme.title}-${i}`}
                    title={theme.title}
                    count={theme.urls.length}
                    expanded={openPos.has(i)}
                    onToggle={() => togglePos(i)}
                  >
                    <ul className="space-y-1.5">
                      {theme.urls.map((url) => (
                        <li key={url} className="flex gap-2 text-xs leading-relaxed">
                          <span className="text-[#60FF80]">›</span>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="break-all text-white/80 underline-offset-2 hover:text-white hover:underline"
                            title={url}
                          >
                            {hostOf(url)}
                            <span className="text-text-muted"> · {url.replace(/^https?:\/\/[^/]+/, '') || '/'}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </ThemeAccordion>
                ))
              )}
            </div>
          </div>

          {/* Negative Themes */}
          <div className="flex flex-col rounded-lg border border-white/[0.06] bg-bg-surface p-4">
            <h4 className="mb-1 text-base font-bold text-white">Negative Themes</h4>
            <p className="mb-3 text-xs text-text-muted">
              What AI-cited sources flag as <span className="font-bold text-white">gaps</span>. Click a theme to see the explanation.
            </p>
            <div className="flex-1 space-y-2 overflow-y-auto pr-1 max-h-[400px]">
              {data!.negativeThemes.length === 0 ? (
                <p className="text-xs text-text-muted">No negative themes detected in this period.</p>
              ) : (
                data!.negativeThemes.map((w, i) => (
                  <ThemeAccordion
                    key={`${w.title}-${i}`}
                    title={w.title}
                    count={w.urls.length}
                    expanded={openNeg.has(i)}
                    onToggle={() => toggleNeg(i)}
                  >
                    <p className="mb-2 text-xs leading-relaxed text-white/80">{w.explanation}</p>
                    {w.urls.length > 0 && (
                      <ul className="space-y-1.5">
                        {w.urls.map((url) => (
                          <li key={url} className="flex gap-2 text-xs leading-relaxed">
                            <span className="text-[#FF4444]">›</span>
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="break-all text-white/80 underline-offset-2 hover:text-white hover:underline"
                              title={url}
                            >
                              {hostOf(url)}
                              <span className="text-text-muted"> · {url.replace(/^https?:\/\/[^/]+/, '') || '/'}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </ThemeAccordion>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: zero output.

### 2.4 — Wire the data through `pr-influence.tsx`

- [ ] **Step 7: Add imports**

Open `components/report-sections/peec-ai/pr-influence.tsx`. After the existing imports near the top (around line 17 — the `SentimentInsights` import), add:

```ts
import { getSentimentInsights, applyEnginesFilter, modelKeyOf } from '@/lib/peec/sentiment-insights'
```

- [ ] **Step 8: Compute filtered citations + fetch sentiment**

Inside the `PRInfluenceReport` function, locate the block right after `placementsCitedByAI` is computed (around line 354). Insert the following block immediately AFTER `const placementsCitedByAI = filteredMatchbackRows.filter(r => r.citedByAI).length`:

```ts
  // ── FB-026 · Sentiment Insights (live, date + model reactive) ─────────────
  // Filter per-URL citations to the active model selection (same engines-rule
  // as filteredMatchbackRows above: URLs with no engines at all are dropped
  // when a filter is active). Then call the Glean-backed sentiment helper;
  // it returns an empty insights object when there is no data to analyze,
  // and the component renders an honest empty state.
  const sentimentCitations = applyEnginesFilter(urlCitations, models)
  const sentimentModelKey  = modelKeyOf(models)
  let sentimentData: Awaited<ReturnType<typeof getSentimentInsights>> | null = null
  if (!demoMode) {
    try {
      sentimentData = await getSentimentInsights(clientSlug, dateRange, sentimentModelKey, {
        citations: sentimentCitations,
      })
    } catch (e) {
      console.error('[pr-influence] sentiment insights generation failed:', e)
      sentimentData = null
    }
  }
```

- [ ] **Step 9: Replace the SentimentInsights invocation in JSX**

Locate the existing JSX line (around line 520):

```tsx
      <SentimentInsights clientSlug={clientSlug} />
```

Replace with:

```tsx
      <SentimentInsights data={sentimentData} />
```

Update the surrounding comment block too — replace the `{/* ── FB-010 + FB-011 · Sentiment Insights ── */}` comment with:

```tsx
      {/* ── FB-026 · Sentiment Insights (live, Glean-backed, date + model reactive) ── */}
```

- [ ] **Step 10: Type-check**

Run: `npx tsc --noEmit`
Expected: zero output.

- [ ] **Step 11: Re-run the helper test**

Run: `npx tsx lib/peec/sentiment-insights.test.ts`
Expected: `lib/peec/sentiment-insights.test.ts: all assertions passed`

- [ ] **Step 12: Re-run the prior test suite to confirm no regression**

Run: `npx tsx lib/peec/winners-losers.test.ts`
Expected: `lib/peec/winners-losers.test.ts: all assertions passed`

- [ ] **Step 13: Commit**

```bash
git add lib/peec/sentiment-insights.ts lib/peec/sentiment-insights.test.ts \
        components/report-sections/peec-ai/sentiment-insights.tsx \
        components/report-sections/peec-ai/pr-influence.tsx
git commit -m "FB-026: live Glean-backed Sentiment Insights, date + model reactive (CSV E4 + E5)

Tina v1 CSV E4 + E5: 'This seems like static copy and should be
pulling actual data. It doesn't change when a new date range or
model is selected and is an exact copy of the example text I
provided.'

Pre-FB-026 sentiment-insights.tsx held hardcoded Avenue Z sandbox
content (POSITIVE_THEMES / WEAKNESSES const arrays + fixed 89.4%
pill, gated to clientSlug==='avenue-z').

Fix:
- New lib/peec/sentiment-insights.ts: Glean-backed sentiment
  classifier + theme extractor over UrlCitation[]. Returns
  {sentimentPct, positiveThemes[], negativeThemes[],
  analyzedUrlCount}. Mirrors lib/peec/synopsis.ts pattern: strict
  JSON output, three-tier extractor, cached per
  (clientSlug, dateRange, modelKey) for 1h.
- applyEnginesFilter() mirrors the filteredMatchbackRows engines
  rule: URLs with no engines at all are DROPPED when a model
  filter is active.
- modelKeyOf() produces a stable sorted-comma-join cache key
  fragment ('all' when no filter).
- 10 assertions in lib/peec/sentiment-insights.test.ts (node:assert
  + tsx, matching repo convention).
- sentiment-insights.tsx rewritten props-driven; sandbox gate
  lifted (precedent: FB-023). Pill tint + label now derive from
  the live sentimentPct. Empty state when zero analyzed URLs.
- pr-influence.tsx fetches getSentimentInsights in parallel with
  the existing data flow, passes data via props.

Universal across clients. Demo mode preserved (skips the Glean
call and shows the empty state in demo runs)."
```

- [ ] **Step 14: Decision log + changelog (newest at top) + SHA backfill commit**

Same pattern as Task 1 Step 6: append `### FB-026 — ...` block to `feedback-log.md` and one-line entry to `changelog.md`, then run the SHA backfill commit.

---

## Task 3: FB-027 — Prompt Clusters dynamic X-axis

**Files:**
- Modify: `components/report-sections/peec-ai/pr-influence-tables.tsx:256-334` (PromptClusterOpportunityMatrix)

Tina (CSV E14):
> ISSUE: The bars are appearing very small, can we have this chart dynamically adjust to better show the relativity of rows? For example, if the highest value of one of the rows is only 3.1%, the X-axis doesn't need to go all the way up to 100%. Maybe it could be adjusted to the next highest "5" or "10".

Root cause: line 292 has `domain={[0, 100]}` hard-pinned.

Fix: compute `upper = next 5 (if max ≤ 10) or next 10 (if max > 10)` from the chart data and pass that as the domain.

- [ ] **Step 1: Replace the PromptClusterOpportunityMatrix body**

Open `components/report-sections/peec-ai/pr-influence-tables.tsx`. Locate the export `export function PromptClusterOpportunityMatrix` (around line 256). Replace its body (from the function open to the closing `}`) with:

```tsx
export function PromptClusterOpportunityMatrix({
  rows,
}: {
  rows: PromptClusterOpportunityRow[]
}) {
  // FB-012 — simple horizontal bar chart: Topic × % citation share from editorial sources.
  // Sorted descending so the top opportunity is at the top.
  const chartData = [...rows]
    .sort((a, b) => b.editorialCitationDensity - a.editorialCitationDensity)
    .map((r) => ({
      topic: r.cluster,
      value: Number(r.editorialCitationDensity.toFixed(1)),
    }))
  // FB-019: tighter per-row spacing + explicit barSize so bars stay visually
  // prominent at the side-by-side height.
  const chartHeight = Math.max(200, chartData.length * 24 + 36)

  // FB-027 — dynamic X-axis upper bound. Tina v1 CSV E14: a 3.1% top value
  // against a 0-100 axis renders as anemic slivers. Round the max value up
  // to the next 5 (when max ≤ 10) or the next 10 (when max > 10). Falls back
  // to 5 when chartData is empty or max is exactly 0 so the axis still
  // renders gridlines.
  const maxValue = chartData.length > 0 ? Math.max(...chartData.map((d) => d.value)) : 0
  const upper =
    maxValue === 0
      ? 5
      : maxValue <= 10
        ? Math.ceil(maxValue / 5) * 5
        : Math.ceil(maxValue / 10) * 10

  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-surface p-6">
      <SectionHeading
        title="Which prompt clusters offer the biggest PR opportunity?"
        tooltip={PEEC.citations.text}
        subtitle="Topics ranked by share of citations earned from editorial sources. Higher share means a stronger candidate for the next PR pitch."
      />
      {chartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <RechartsBarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
            barCategoryGap={4}
          >
            <XAxis
              type="number"
              domain={[0, upper]}
              tick={{ fill: '#8A8A8A', fontSize: 11 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
              tickLine={false}
              tickFormatter={(v: number) => `${v}%`}
            />
            <YAxis
              type="category"
              dataKey="topic"
              width={120}
              tick={{ fill: 'rgba(255,255,255,0.8)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <RechartsTooltip
              cursor={{ fill: 'rgba(57,160,255,0.06)' }}
              contentStyle={{
                background: '#272727',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              labelStyle={{ color: '#FFFFFF', fontWeight: 600 }}
              itemStyle={{ color: '#FFFFFF' }}
              formatter={(v: number | undefined) => [`${(v ?? 0).toFixed(1)}%`, 'Citation Share']}
            />
            <Bar dataKey="value" barSize={14} radius={[0, 4, 4, 0]}>
              {chartData.map((d) => (
                <Cell key={d.topic} fill="#39A0FF" />
              ))}
            </Bar>
          </RechartsBarChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
          <p className="text-xs text-text-muted">
            No tracked prompts yet. Add prompts in Peec AI to populate the chart.
          </p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero output.

- [ ] **Step 3: Commit**

```bash
git add components/report-sections/peec-ai/pr-influence-tables.tsx
git commit -m "FB-027: dynamic X-axis on Prompt Clusters chart (CSV E14)

Tina v1 CSV E14: 'The bars are appearing very small, can we have
this chart dynamically adjust to better show the relativity of
rows? For example, if the highest value of one of the rows is
only 3.1%, the X-axis doesn't need to go all the way up to 100%.
Maybe it could be adjusted to the next highest \"5\" or \"10\".'

Fix: compute upper = next 5 (when max ≤ 10) or next 10 (when max
> 10) from chartData. Pass to <XAxis domain={[0, upper]}>.
Fallback to 5 when chartData is empty so the axis still renders.

One file, one block, no surrounding refactor."
```

- [ ] **Step 4: Decision log + changelog + SHA backfill commit**

Same pattern as Task 1 Step 6.

---

## Task 4: FB-028 — Top Editorial Opportunities filter fix (URL-level brand-absent)

**Files:**
- Modify: `components/report-sections/peec-ai/pr-influence.tsx:361-454` (brand-absent compute)
- Modify: `components/report-sections/peec-ai/pr-influence-tables.tsx:140-242` (BrandAbsentEditorialDomainRow shape + table columns)

Tina (CSV E16 + E17):
> ISSUE: There should be more than one pitch opportunity here. When I look in Peec and look at URLs and filter to editorial, there are thousands of articles.
> See issue above, there must be something wrong with one of the filters.

Root cause (multiple compounding bugs):
1. `brandAbsentDomains = editorialDomains.filter(d => !prDomains.has(d.domain.toLowerCase()))` defines "brand absent" as "domain not in our PR placement list." This is the **wrong definition**. A brand may have no PR placement on a domain but the brand may still be mentioned in editorial articles cited there.
2. `brandAbsentRowsFiltered = brandAbsentDomains.filter((d) => d.retrievedDelta > 0)` further culls everything where Peec did not show a positive period-over-period delta at the domain level.
3. `.slice(0, 20)` caps the already-collapsed list.
4. Result: the table commonly shows 0-1 rows even when Peec has hundreds of brand-absent editorial URLs.

Fix:
- Switch the row source from `editorialDomains` to `urlCitations` (URL-level).
- Define brand-absent properly: `urlCitation.mentionsYourBrand === false`.
- Restrict to editorial hosts using the editorialDomains set we already compute (cross-reference by host).
- Drop the "not in PR placement list" misdefinition entirely.
- Drop the `retrievedDelta > 0` filter entirely — URL-level delta is not exposed by Peec, so we can't gate by it honestly.
- Drop the "Delta of Citation Share" column from the table (no source of truth).
- Sort by URL citation count desc, slice to 50.
- Group multiple URLs per host: take the highest-cited brand-absent URL per host (matches the existing `topBrandAbsentUrlByHost` map already computed at lines 335-341 — reuse it).

### 4.1 — Update the row type and table columns

- [ ] **Step 1: Edit `BrandAbsentEditorialDomainRow` type**

Open `components/report-sections/peec-ai/pr-influence-tables.tsx`. Locate the export `BrandAbsentEditorialDomainRow` interface (around line 140) and replace it with:

```ts
export interface BrandAbsentEditorialDomainRow {
  domain: string
  articleTitle: string | null
  articleUrl: string | null
  citationCount: number  // FB-028: URL-level citation count, not domain retrieved %.
  competitorsMentioned: string | null
}
```

(Removed `citationCountDelta: number` field — no URL-level delta in Peec today.)

- [ ] **Step 2: Edit `BrandAbsentEditorialDomainsTable` columns**

In the same file, locate `BrandAbsentEditorialDomainsTable` (around line 149). Replace the `columns` array definition (the const block inside the function, before `return`) with:

```tsx
  const columns: SortableColumn<BrandAbsentEditorialDomainRow>[] = [
    {
      key: 'domain',
      label: 'Publication',
      align: 'left',
      accessor: (r) => r.domain,
      render: (r) => <span className="font-medium text-white">{r.domain}</span>,
    },
    {
      key: 'articleTitle',
      label: 'Article',
      align: 'left',
      accessor: (r) => r.articleTitle ?? '',
      render: (r) => {
        if (!r.articleTitle && !r.articleUrl) {
          return <span className="text-white/20">--</span>
        }
        const text = r.articleTitle ?? r.articleUrl!.replace(/^https?:\/\//, '')
        if (r.articleUrl) {
          return (
            <a
              href={r.articleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block max-w-[240px] truncate text-white/80 hover:text-[#39A0FF] hover:underline"
              title={r.articleTitle ?? r.articleUrl}
            >
              {text}
            </a>
          )
        }
        return <span className="block max-w-[240px] truncate text-white/80" title={text}>{text}</span>
      },
    },
    {
      key: 'competitorsMentioned',
      label: 'Competitors Mentioned',
      align: 'left',
      tooltip:
        'Competing brands mentioned in this article. (Peec AI source data.)',
      accessor: (r) => r.competitorsMentioned ?? '',
      render: (r) =>
        r.competitorsMentioned ? (
          <span className="text-[11px] text-white/70">{r.competitorsMentioned}</span>
        ) : (
          <span className="text-white/40">--</span>
        ),
    },
    {
      key: 'citationCount',
      label: 'AI Citations',
      align: 'right',
      tooltip: 'Number of times this URL is cited by tracked AI engines in the selected period. (Peec AI source data.)',
      accessor: (r) => r.citationCount,
      render: (r) => <span className="tabular-nums text-white">{r.citationCount.toLocaleString()}</span>,
    },
  ]
```

(Removed the `citationCountDelta` column entirely. Removed the `Delta of Citation Share` column entirely. Renamed `Citation Share` → `AI Citations` because the value is now a count, not a percentage.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: zero output. (Errors expected on `pr-influence.tsx` from removed fields — that's the next step.)

### 4.2 — Rewrite the brand-absent compute in pr-influence.tsx

- [ ] **Step 4: Replace the brand-absent compute block**

Open `components/report-sections/peec-ai/pr-influence.tsx`. Locate the block starting at `// Brand-absent editorial domains (Section D)` (around line 361) and ending at the close of the `brandAbsentTableRows` assignment (around line 454). Replace the ENTIRE block with:

```ts
  // ── FB-028 · Top Editorial Opportunities (URL-level brand-absent) ──────────
  // Tina v1 CSV E16 + E17: "There should be more than one pitch opportunity
  // here. When I look in Peec and look at URLs and filter to editorial, there
  // are thousands of articles." Pre-FB-028 logic defined "brand absent" as
  // "domain not in our PR placement list" AND further required a positive
  // period-over-period delta on the domain — both of which collapsed the
  // table to 0-1 rows. The correct definition is at the URL level:
  // mentionsYourBrand === false. Editorial type comes from cross-referencing
  // the host against the editorialDomains set (Peec /reports/domains response
  // with type='Editorial').
  //
  // Per-host: take the highest-cited brand-absent URL (one row per host so
  // the table reads cleanly even when a single editorial domain has many
  // brand-absent URLs). topBrandAbsentUrlByHost was already built above for
  // this exact purpose.
  //
  // URL-level delta is not exposed by Peec today, so we drop the "Delta of
  // Citation Share" column entirely rather than ship a misleading value.
  // synopsisContext.brandAbsentCount continues to use the host-level count
  // for executive prose accuracy (separate from this table).
  const editorialHostSet = new Set(editorialDomains.map((d) => hostKey(d.domain)))

  const brandAbsentDomains = Array.from(editorialHostSet)  // distinct editorial hosts
    .filter((h) => topBrandAbsentUrlByHost.has(h))         // host has ≥1 brand-absent URL
    .map((h) => ({ host: h, topUrl: topBrandAbsentUrlByHost.get(h)! }))

  const brandAbsentTableRowsAll: BrandAbsentEditorialDomainRow[] = brandAbsentDomains
    .sort((a, b) => b.topUrl.citationCount - a.topUrl.citationCount)
    .slice(0, 50)
    .map(({ host, topUrl }) => {
      const competitors = topUrl.competitorBrandNames
      return {
        domain: host,
        articleTitle: topUrl.title ?? null,
        articleUrl: topUrl.url ?? null,
        citationCount: topUrl.citationCount,
        competitorsMentioned: competitors.length > 0 ? competitors.join(', ') : 'None',
      }
    })

  // Demo mode: keep the original demo arrays for the demo path so the demo
  // tab still renders example rows. Real client view goes through the URL-
  // level path above.
  const DEMO_BRAND_ABSENT_TITLES = [
    'How AI is reshaping editorial coverage',
    'Inside the AEO playbook for 2026',
    'Five brands winning in AI search',
    'The new SEO is AEO',
    'Why traditional PR is broken',
    'What ChatGPT cites and why it matters',
    'The agencies leading AI-first marketing',
    'How brand visibility is changing in the LLM era',
  ]
  const DEMO_BRAND_ABSENT_SLUGS = [
    'ai-editorial-shift', 'aeo-playbook-2026', 'brands-winning-ai-search',
    'aeo-new-seo', 'pr-is-broken', 'what-chatgpt-cites',
    'ai-first-agencies', 'brand-visibility-llm-era',
  ]
  const DEMO_BRAND_ABSENT_COMPETITORS = [
    ['Ogilvy', 'Edelman'],
    ['Weber Shandwick'],
    ['FleishmanHillard', 'BCW'],
    ['Burson'],
    ['Edelman', 'Praytell'],
    ['Ogilvy'],
    ['BCW', 'Weber Shandwick'],
    ['FleishmanHillard'],
  ]
  const demoBrandAbsentRows: BrandAbsentEditorialDomainRow[] = prIsDemo
    ? editorialDomains.slice(0, 8).map((d, i) => {
        const slug = DEMO_BRAND_ABSENT_SLUGS[i % DEMO_BRAND_ABSENT_SLUGS.length]
        return {
          domain: d.domain,
          articleTitle: DEMO_BRAND_ABSENT_TITLES[i % DEMO_BRAND_ABSENT_TITLES.length],
          articleUrl: `https://${d.domain}/${slug}`,
          citationCount: Math.round((d.retrieved ?? 1) * 10),
          competitorsMentioned: DEMO_BRAND_ABSENT_COMPETITORS[i % DEMO_BRAND_ABSENT_COMPETITORS.length].join(', '),
        }
      })
    : []

  const brandAbsentTableRows: BrandAbsentEditorialDomainRow[] = prIsDemo
    ? demoBrandAbsentRows
    : brandAbsentTableRowsAll
```

- [ ] **Step 5: Update synopsis context to use the new compute**

Locate the `synopsisContext` object (around line 473-493). Replace its body with:

```ts
  const synopsisContext: PRInfluenceSynopsisContext = {
    aiVisibility:           youMetrics ? youMetrics.visibility : null,
    aiVisibilityDelta:      youMetrics ? youMetrics.visibilityDelta : null,
    avgAiPosition:          youMetrics ? youMetrics.position : null,
    avgAiPositionDelta:     youMetrics ? youMetrics.positionDelta : null,
    totalAiCitations:       data?.totalCitations ?? 0,
    totalPlacements:        prData?.totalPlacements ?? 0,
    placementsCitedByAI,
    aiReferralSessions:     aiReferralOk ? aiSessions : null,
    aiReferralSessionsDelta: aiSessionsDelta ?? null,
    totalEditorialDomains:  editorialDomains.length,
    brandAbsentCount:       brandAbsentTableRowsAll.length,
    topBrandAbsentDomains:  brandAbsentTableRowsAll.slice(0, 5).map((d) => ({
      domain: d.domain,
      citationCount: d.citationCount,
    })),
    topOpportunityClusters: opportunityRows.slice(0, 3).map(o => ({
      cluster: o.cluster,
      score: o.opportunityScore,
    })),
  }
```

(Synopsis context now references `brandAbsentTableRowsAll` — the URL-level list — instead of the deleted `brandAbsentDomains` host-list. Counts and top-5 alike.)

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: zero output.

- [ ] **Step 7: Re-run tests**

```bash
npx tsx lib/peec/winners-losers.test.ts
npx tsx lib/peec/sentiment-insights.test.ts
```
Both expected: `all assertions passed`.

- [ ] **Step 8: Commit**

```bash
git add components/report-sections/peec-ai/pr-influence.tsx \
        components/report-sections/peec-ai/pr-influence-tables.tsx
git commit -m "FB-028: URL-level brand-absent filter, drop misleading delta col (CSV E16 + E17)

Tina v1 CSV E16 + E17: 'There should be more than one pitch
opportunity here. When I look in Peec and look at URLs and
filter to editorial, there are thousands of articles. Must be
something wrong with one of the filters.'

Root causes (multiple compounding):
1. brandAbsentDomains used !prDomains.has(d.domain) as the
   definition of 'brand absent' — that's 'no PR placement on
   this domain', not 'brand not mentioned in articles cited
   on this domain'. Wrong definition.
2. brandAbsentRowsFiltered required d.retrievedDelta > 0
   (positive period-over-period delta at domain level), which
   culled almost every remaining row.
3. .slice(0, 20) capped the collapsed list.
4. Net result: 0-1 rows in production even when Peec has
   hundreds of brand-absent editorial URLs.

Fix:
- Switched row source from data.topDomains (editorial) to
  urlCitations (URL-level), filtered to mentionsYourBrand=false.
- Editorial restriction via cross-ref against editorialDomains
  host set (existing data.topDomains type='Editorial').
- One row per host (highest-cited brand-absent URL), via
  topBrandAbsentUrlByHost already computed above.
- Dropped the 'not in PR placement list' misdefinition entirely.
- Dropped the d.retrievedDelta > 0 filter entirely.
- Dropped 'Delta of Citation Share' column — URL-level delta is
  not in the Peec response; better to omit than mislead.
- Renamed 'Citation Share' column to 'AI Citations' (value is
  now a count, not a percentage).
- Cap raised from 20 to 50 rows.

Synopsis context (brandAbsentCount + topBrandAbsentDomains) now
references the URL-level list too, for consistency between the
table and the executive prose.

Demo mode preserved with its own demo arrays.

Universal across clients."
```

- [ ] **Step 9: Decision log + changelog + SHA backfill commit**

Same pattern as Task 1 Step 6.

---

## Task 5: FB-029 — Restore PR Placement Matchback (new title + subtitle, under Exec Summary)

**Files:**
- Modify: `components/report-sections/peec-ai/pr-influence-tables.tsx` (add new `PRPlacementMatchbackTable` export)
- Modify: `components/report-sections/peec-ai/pr-influence.tsx` (import + render between Synopsis and Sentiment)

Tina (CSV E23 — REVISION):
> REVISION: We would like to add a chart right beneath the exec summary that is showing this information requested from the PRD. I think the PR placement matchback was the answer to this but somehow got left out of the outline or maybe accidentally was deleted.
>
> "Did placements achieved by the PR team get cited in AI?
> The dashboard must compare a maintained list of PR-secured placements against the list of editorial URLs cited in tracked AI answers."
>
> Title: **Which secured PR placements are showing up in AI citations?**
> Subtitle: **See which placements secured in the selected timeframe are being cited in AI-generated answers and how they are shaping brand visibility, sentiment, and reputation across your tracked prompts.**

The data layer (`buildMatchback()`, `matchbackRows`, `filteredMatchbackRows`, `placementsCitedByAI`) is still alive in `pr-influence.tsx` (kept after FB-015 for the synopsis context). Only the render + component were ripped out. Restore as a focused 5-column table matching Tina's title (which / placements / showing up / AI citations).

### 5.1 — Add the new component

- [ ] **Step 1: Append `PRPlacementMatchbackTable` to `pr-influence-tables.tsx`**

Open `components/report-sections/peec-ai/pr-influence-tables.tsx`. Append the following block at the very end of the file (after the last export):

```tsx
// ─── 5. PR Placement Matchback (FB-029 — restored under Exec Summary) ────────
// Tina v1 CSV E23 REVISION. The PRD ask: 'Did placements achieved by the
// PR team get cited in AI? The dashboard must compare a maintained list of
// PR-secured placements against the list of editorial URLs cited in tracked
// AI answers.' This component is the answer. Lives directly under the
// Executive Synopsis. Reuses filteredMatchbackRows from pr-influence.tsx
// (already date + model aware). Five columns mapped to Tina's literal
// title: which placement (Publication + Article), when (Publish Date),
// is it showing up in AI citations (Cited by AI? + AI Engines).

export interface PRPlacementMatchbackRow {
  outlet: string
  headline: string
  link: string
  publicationDate: string
  citedByAI: boolean
  aiEnginesCiting: string[]
}

export function PRPlacementMatchbackTable({
  rows,
  totalPlacements,
  placementsCitedByAI,
}: {
  rows: PRPlacementMatchbackRow[]
  totalPlacements: number
  placementsCitedByAI: number
}) {
  const citationRatePct =
    totalPlacements > 0 ? (placementsCitedByAI / totalPlacements) * 100 : 0

  const columns: SortableColumn<PRPlacementMatchbackRow>[] = [
    {
      key: 'outlet',
      label: 'Publication',
      align: 'left',
      accessor: (r) => r.outlet,
      render: (r) => <span className="font-medium text-white">{r.outlet}</span>,
    },
    {
      key: 'headline',
      label: 'Article',
      align: 'left',
      accessor: (r) => r.headline,
      render: (r) => (
        <a
          href={r.link}
          target="_blank"
          rel="noopener noreferrer"
          className="block max-w-[280px] truncate text-white/80 hover:text-[#39A0FF] hover:underline"
          title={r.headline}
        >
          {r.headline}
        </a>
      ),
    },
    {
      key: 'publicationDate',
      label: 'Publish Date',
      align: 'left',
      accessor: (r) => r.publicationDate,
      render: (r) => (
        <span className="tabular-nums text-white/60">{r.publicationDate || '--'}</span>
      ),
    },
    {
      key: 'citedByAI',
      label: 'Cited by AI',
      align: 'left',
      tooltip:
        'Whether this URL or its domain has been cited by any tracked AI engine in Peec AI data. (Peec AI source data.)',
      accessor: (r) => (r.citedByAI ? 1 : 0),
      render: (r) => (
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold',
            r.citedByAI ? 'bg-[#60FDFF]/10 text-[#60FDFF]' : 'bg-white/[0.06] text-white/40',
          )}
        >
          {r.citedByAI ? 'Yes' : 'No'}
        </span>
      ),
    },
    {
      key: 'aiEnginesCiting',
      label: 'AI Engines',
      align: 'left',
      tooltip:
        'List of AI engines (ChatGPT, Perplexity, Gemini, Claude, Copilot, Google) where this URL or its domain was cited. (Peec AI source data.)',
      accessor: (r) => r.aiEnginesCiting.join(', '),
      render: (r) =>
        r.aiEnginesCiting.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {r.aiEnginesCiting.map((e) => (
              <span
                key={e}
                className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] font-semibold text-white/80"
              >
                {e}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-white/40">--</span>
        ),
    },
  ]

  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-surface p-6">
      <SectionHeading
        title="Which secured PR placements are showing up in AI citations?"
        tooltip="Compares your PR-secured placements (PR Proof Library) against the editorial URLs cited in tracked AI answers (Peec AI)."
        subtitle="See which placements secured in the selected timeframe are being cited in AI-generated answers and how they are shaping brand visibility, sentiment, and reputation across your tracked prompts."
      />
      {totalPlacements > 0 && (
        <p className="mb-4 text-xs text-text-muted">
          <span className="font-bold tabular-nums text-white">{placementsCitedByAI}</span> of {totalPlacements} placements cited by AI (<span className="tabular-nums">{citationRatePct.toFixed(1)}%</span>)
        </p>
      )}
      {rows.length > 0 ? (
        <SortableTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.link || r.headline}
          initialPageSize={15}
          emptyMessage="No PR placements in the selected timeframe."
        />
      ) : (
        <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-white/[0.08]">
          <p className="text-xs text-text-muted">
            No PR placements in the selected timeframe.
          </p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero output. (The new export is not yet imported anywhere; that's fine.)

### 5.2 — Render the table under the Exec Summary

- [ ] **Step 3: Update the import in pr-influence.tsx**

Open `components/report-sections/peec-ai/pr-influence.tsx`. Locate the import block that pulls from `./pr-influence-tables` (around lines 20-27). Replace it with:

```ts
import {
  TopEditorialDomainsTable,
  BrandAbsentEditorialDomainsTable,
  PromptClusterOpportunityMatrix,
  PRPlacementMatchbackTable,
  type TopEditorialDomainRow,
  type BrandAbsentEditorialDomainRow,
  type PromptClusterOpportunityRow,
  type PRPlacementMatchbackRow,
} from './pr-influence-tables'
```

- [ ] **Step 4: Build the matchback row list for the table**

Inside `PRInfluenceReport`, locate the block right after `const placementsCitedByAI = filteredMatchbackRows.filter(r => r.citedByAI).length` (around line 354). Insert the following block immediately AFTER that line and BEFORE the FB-026 sentiment block added in Task 2:

```ts
  // ── FB-029 · PR Placement Matchback rows for the new card ─────────────────
  // Tina v1 CSV E23 REVISION. The data layer (buildMatchback,
  // filteredMatchbackRows) survived FB-015's removal; the render + component
  // were what got deleted. Map filteredMatchbackRows to the simplified 5-col
  // row shape that matches Tina's literal title.
  const matchbackTableRows: PRPlacementMatchbackRow[] = filteredMatchbackRows.map((r) => ({
    outlet: r.outlet ?? r.domain,
    headline: r.headline ?? r.domain,
    link: r.link ?? '',
    publicationDate: r.publicationDate ?? '',
    citedByAI: r.citedByAI,
    aiEnginesCiting: r.aiEnginesCiting,
  }))
```

- [ ] **Step 5: Render the new card between Synopsis and SentimentInsights**

In the same file, locate the JSX block containing `<PRInfluenceSynopsis>` and the comment immediately after it (around lines 508-520). Replace the block from `<PRInfluenceSynopsis>` through the existing `<SentimentInsights data={sentimentData} />` line with:

```tsx
      {/* ── FB-009-a · Executive Synopsis (replaces the prior Section A KPI Strip per Tina's FB-009-b ask) ── */}
      <PRInfluenceSynopsis
        clientSlug={clientSlug}
        dateRange={dateRange}
        context={synopsisContext}
      />

      {/* ── FB-029 · PR Placement Matchback (restored under Exec Summary per Tina v1 CSV E23 REVISION) ── */}
      <PRPlacementMatchbackTable
        rows={matchbackTableRows}
        totalPlacements={prData?.totalPlacements ?? 0}
        placementsCitedByAI={placementsCitedByAI}
      />

      {/* ── FB-026 · Sentiment Insights (live, Glean-backed, date + model reactive) ── */}
      <SentimentInsights data={sentimentData} />
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: zero output.

- [ ] **Step 7: Commit**

```bash
git add components/report-sections/peec-ai/pr-influence.tsx \
        components/report-sections/peec-ai/pr-influence-tables.tsx
git commit -m "FB-029: restore PR Placement Matchback under Exec Summary (CSV E23 REVISION)

Tina v1 CSV E23 REVISION: 'We would like to add a chart right
beneath the exec summary that is showing this information
requested from the PRD. I think the PR placement matchback was
the answer to this but somehow got left out of the outline or
maybe accidentally was deleted.' (Removed in FB-015 #81b2277.)

Tina's PRD-quoted ask: 'Did placements achieved by the PR team
get cited in AI? The dashboard must compare a maintained list
of PR-secured placements against the list of editorial URLs
cited in tracked AI answers.'

Tina's literal title:    'Which secured PR placements are showing up in AI citations?'
Tina's literal subtitle: 'See which placements secured in the
                          selected timeframe are being cited in
                          AI-generated answers and how they are
                          shaping brand visibility, sentiment,
                          and reputation across your tracked prompts.'

Fix:
- New focused PRPlacementMatchbackTable in pr-influence-tables.tsx
  (5 cols: Publication / Article / Publish Date / Cited by AI? /
  AI Engines). Simpler than the original 13-col version.
- Rendered between <PRInfluenceSynopsis> and <SentimentInsights>
  in pr-influence.tsx with Tina's literal title + subtitle.
- Reuses filteredMatchbackRows (date + model aware) and
  placementsCitedByAI — both already computed.
- 'N of M placements cited by AI (rate%)' summary line above
  the table for instant readability.

Universal across clients."
```

- [ ] **Step 8: Decision log + changelog + SHA backfill commit**

Same pattern as Task 1 Step 6.

---

## Task 6: FB-030 — Remove the bottom footnote

**Files:**
- Modify: `components/report-sections/peec-ai/pr-influence.tsx:541-546`

Tina (CSV last row):
> REMOVE: This footnote at the very bottom of report. "PR Influence on AI Visibility . Peec AI (live) . GA4 AI referral sessions (live) . 3 PR placements (2025-06-06 to 2026-01-27)"

- [ ] **Step 1: Delete the footnote `<p>` block**

Open `components/report-sections/peec-ai/pr-influence.tsx`. Locate this block (around lines 541-546):

```tsx
      <p className="text-xs text-text-muted">
        PR Influence on AI Visibility
        {data && ' . Peec AI (live)'}
        {aiSessions > 0 && ` . GA4 AI referral sessions (live)`}
        {prData && prData.totalPlacements > 0 && ` . ${prData.totalPlacements} PR placements (${prData.dateRange?.earliest} to ${prData.dateRange?.latest})`}
      </p>
```

Delete it entirely. No replacement.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero output.

- [ ] **Step 3: Confirm the footnote string is gone**

Run: `grep -n "PR Influence on AI Visibility" components/report-sections/peec-ai/pr-influence.tsx`
Expected: only matches in the top comment header on line 30 (`// PR Influence on AI Visibility`); zero matches in JSX.

- [ ] **Step 4: Commit**

```bash
git add components/report-sections/peec-ai/pr-influence.tsx
git commit -m "FB-030: remove bottom footnote (CSV last row)

Tina v1 CSV last row: 'REMOVE: This footnote at the very bottom
of report. PR Influence on AI Visibility . Peec AI (live) . GA4
AI referral sessions (live) . 3 PR placements (2025-06-06 to
2026-01-27)'

One-block deletion. No replacement.

Universal across clients."
```

- [ ] **Step 5: Decision log + changelog + SHA backfill commit**

Same pattern as Task 1 Step 6.

---

## Task 7: Final verification, status.md, push branch, open PR

- [ ] **Step 1: Final clean type-check**

Run: `npx tsc --noEmit`
Expected: zero output.

- [ ] **Step 2: Re-run every test**

```bash
npx tsx lib/peec/winners-losers.test.ts
npx tsx lib/peec/sentiment-insights.test.ts
```
Both expected: `all assertions passed`.

- [ ] **Step 3: Surgical grep sweep — confirm every ⚠️ anchor is gone**

```bash
echo "FB-025 anchor (raw float interpolation) — expect zero matches:"
grep -n '\${d.citationCount}' lib/peec/pr-influence-synopsis.ts || echo "  (clean)"
echo "FB-026 anchor (sandbox + hardcoded sentiment) — expect zero matches:"
grep -nE "SANDBOX_CLIENT_SLUG = 'avenue-z'|SENTIMENT_PCT = 89\\.4|POSITIVE_THEMES: PositiveTheme" components/report-sections/peec-ai/sentiment-insights.tsx || echo "  (clean)"
echo "FB-027 anchor (hard 0-100 X-axis) — expect zero matches:"
grep -n 'domain={\\[0, 100\\]}' components/report-sections/peec-ai/pr-influence-tables.tsx || echo "  (clean)"
echo "FB-028 anchor (PR-list brand-absent misdefinition + delta killer) — expect zero matches:"
grep -nE '!prDomains\\.has|retrievedDelta > 0' components/report-sections/peec-ai/pr-influence.tsx || echo "  (clean)"
echo "FB-029 anchor (PRPlacementMatchbackTable) — expect ≥2 matches (export + import + render):"
grep -nE 'PRPlacementMatchbackTable' components/report-sections/peec-ai/pr-influence.tsx components/report-sections/peec-ai/pr-influence-tables.tsx
echo "FB-030 anchor (footnote string in JSX) — expect ONE match only (the comment header on line 30):"
grep -n 'PR Influence on AI Visibility' components/report-sections/peec-ai/pr-influence.tsx
```

- [ ] **Step 4: Update `docs/official-feedback/status.md`**

Open `docs/official-feedback/status.md`. Update:

(a) **Active branch section** (lines 20-25): replace the current `## Active branch` content with:

```markdown
## Active branch

- **Branch:** `official-feedback-pr-influence-v2` (cut from `main` at `91a1971`)
- **PR:** to be opened in this task.
- **Round:** PR Influence v2 — closes every ⚠️ row in Tina's PR Influence v1 CSV.
- **Next FB ID:** **FB-031**.
```

(b) **Shipped FB log table** (line 70+): append these six rows BELOW the existing FB-024 row:

```markdown
| **FB-025** | PR Influence (v2) | this branch (PR future) | `<FB025_SHA>` | Synopsis decimals fix per Tina v1 CSV E2. buildContext in lib/peec/pr-influence-synopsis.ts now interpolates d.citationCount.toFixed(1) + Math.round(o.score). Prompt strengthened with explicit 'Number formatting (strict)' rule. Cache version v1-glean-pri -> v2-glean-pri. |
| **FB-026** | PR Influence (v2) | this branch (PR future) | `<FB026_SHA>` | Sentiment Insights wired to live Glean-backed classification per Tina v1 CSV E4 + E5. New lib/peec/sentiment-insights.ts (Glean-backed, cached per dateRange + modelKey). sentiment-insights.tsx rewritten props-driven; sandbox gate LIFTED (precedent: FB-023). 10 unit tests (node:assert + tsx). Date + model reactive. |
| **FB-027** | PR Influence (v2) | this branch (PR future) | `<FB027_SHA>` | Prompt Clusters chart X-axis is now dynamic per Tina v1 CSV E14. domain={[0, upper]} where upper = next 5 (max ≤ 10) or next 10 (max > 10). Fallback to 5 when empty. One-block edit in PromptClusterOpportunityMatrix. |
| **FB-028** | PR Influence (v2) | this branch (PR future) | `<FB028_SHA>` | Top Editorial Opportunities filter rewritten per Tina v1 CSV E16 + E17. Switched row source from data.topDomains (editorial, domain-rows) to urlCitations (URL-rows). Brand-absent now defined at URL level via mentionsYourBrand=false (was 'not in PR placement list' — wrong def). Editorial restriction via cross-ref against editorialDomains host set. Dropped d.retrievedDelta > 0 filter entirely. Dropped 'Delta of Citation Share' column entirely (no URL-level delta in Peec). Renamed 'Citation Share' -> 'AI Citations'. Cap raised to 50. Synopsis context updated to match. |
| **FB-029** | PR Influence (v2) | this branch (PR future) | `<FB029_SHA>` | PR Placement Matchback restored under Exec Summary per Tina v1 CSV E23 REVISION. New focused 5-col PRPlacementMatchbackTable (Publication / Article / Publish Date / Cited by AI? / AI Engines). Tina's literal title + subtitle. Rendered between <PRInfluenceSynopsis> and <SentimentInsights>. Reuses filteredMatchbackRows (date + model aware). 'N of M placements cited by AI (rate%)' summary above the table. |
| **FB-030** | PR Influence (v2) | this branch (PR future) | `<FB030_SHA>` | Removed bottom footnote per Tina v1 CSV last row ('PR Influence on AI Visibility . Peec AI (live) . GA4 AI referral sessions (live) . N PR placements ...'). One-block deletion. |
```

(c) **Per-tab workflow table** (around line 50): add a new row for PR Influence (v2):

```markdown
| **PR Influence (v2)** | `official-feedback-pr-influence-v2` | (this PR) | **OPEN — in review** |
```

(d) **Next FB ID** footer (around line 64): change `Next ID is FB-025` to `Next ID is FB-031`.

- [ ] **Step 5: Commit status.md**

```bash
git add docs/official-feedback/status.md
git commit -m "docs(feedback): mark PR Influence v2 batch shipped (FB-025 through FB-030)"
```

- [ ] **Step 6: Push the branch**

```bash
git push -u origin official-feedback-pr-influence-v2
```

- [ ] **Step 7: Open the PR**

```bash
gh pr create --title "PR Influence v2: Tina CSV feedback (FB-025 through FB-030)" --body "$(cat <<'EOF'
## Summary

Closes every ⚠️ row in Tina's PR Influence v1 scorecard CSV. Six surgical fixes shipped as one branch / one PR per Avenue Z workstream convention.

| FB | CSV row | Fix |
|---|---|---|
| FB-025 | E2 | Synopsis: round numerics in `buildContext`; strict format rule in prompt; cache bump v1 → v2-glean-pri. |
| FB-026 | E4 + E5 | Sentiment Insights wired to live Glean-backed classification over `UrlCitation[]`; sandbox gate LIFTED; date + model reactive; 10 unit tests. |
| FB-027 | E14 | Prompt Clusters X-axis dynamic: `upper = next 5 (≤10) or next 10 (>10)` above max. |
| FB-028 | E16 + E17 | Top Editorial Opportunities filter rewritten: URL-level brand-absent (`mentionsYourBrand=false`); dropped buggy `!prDomains.has` def + dropped `retrievedDelta > 0` killer filter + dropped "Delta of Citation Share" column. |
| FB-029 | E23 | PR Placement Matchback restored under Exec Summary as focused 5-col card with Tina's literal title + subtitle. |
| FB-030 | last row | Bottom footnote removed entirely. |

## What stayed the same

- Universal across clients (no per-client sandbox conditionals introduced; FB-026 specifically LIFTED the existing Avenue Z gate).
- No Neon migrations (Paul rule).
- No em-dashes in any copy written.
- All ✅ rows from V1 not touched.

## Test plan

- [x] `npx tsc --noEmit` zero output.
- [x] `npx tsx lib/peec/winners-losers.test.ts` passes (16 assertions).
- [x] `npx tsx lib/peec/sentiment-insights.test.ts` passes (10 assertions).
- [x] Grep sweep — every ⚠️ anchor confirmed gone (FB-025/026/027/028/030); FB-029 anchor confirmed present.
- [ ] Vercel preview: spot-check PR Influence tab renders without console errors on Avenue Z client.
- [ ] Vercel preview: confirm Sentiment Insights card now reacts to date + model selection.
- [ ] Vercel preview: confirm Top Editorial Opportunities now shows >1 row.

## Docs

- `docs/official-feedback/feedback-log.md` — six new `### FB-NNN —` decision logs (newest at top).
- `docs/official-feedback/changelog.md` — six new one-line entries (newest at top, SHAs backfilled).
- `docs/official-feedback/status.md` — Active branch + Shipped FB log + per-tab workflow + Next FB ID updated.
EOF
)"
```

- [ ] **Step 8: Final lockstep verification**

```bash
echo "Branch: $(git branch --show-current)"
echo "Local HEAD:  $(git rev-parse HEAD)"
echo "Remote HEAD: $(git rev-parse @{u})"
git status --short
gh pr view --json state,url,title
```

Expected: branch `official-feedback-pr-influence-v2`, local SHA = remote SHA, working tree clean, PR `OPEN`.

---

## Self-review (run-before-execution checklist)

### 1. Spec coverage

| CSV ⚠️ row | FB | Task |
|---|---|---|
| E2 | FB-025 | Task 1 |
| E4 | FB-026 | Task 2 |
| E5 | FB-026 | Task 2 |
| E14 | FB-027 | Task 3 |
| E16 | FB-028 | Task 4 |
| E17 | FB-028 | Task 4 |
| E23 | FB-029 | Task 5 |
| last row | FB-030 | Task 6 |

Coverage 8/8. No gaps.

### 2. Placeholder scan

- No "TBD", "TODO", "implement later", "fill in details" anywhere in the plan.
- Every code block is complete and inline.
- Test code blocks contain the actual `assert.equal`/`assert.deepEqual` calls.
- SHA placeholder `<SHA>` / `<FB025_SHA>` etc. used ONLY in docs commit messages, with explicit `sed` backfill steps documented in Task 1 Step 6 (template) — and the same template referenced ("same pattern as Task 1 Step 6") in subsequent tasks rather than re-pasting. This is a deliberate cross-reference, not a placeholder for missing code.

### 3. Type consistency

- `SentimentInsights` type defined in Task 2.1 → consumed in Task 2.3 (component prop) + Task 2.4 (sentiment data variable). Names match.
- `BrandAbsentEditorialDomainRow` shape changed in Task 4.1 → Task 4.2 produces rows in the new shape. Field names match (`domain`, `articleTitle`, `articleUrl`, `citationCount`, `competitorsMentioned`). `citationCountDelta` removed in both places.
- `PRPlacementMatchbackRow` defined in Task 5.1 → built + rendered in Task 5.2. Field names match.
- `applyEnginesFilter` defined in Task 2.1 → consumed in Task 2.4 (pr-influence.tsx). Same signature.
- `modelKeyOf` defined in Task 2.1 → consumed in Task 2.4. Same signature.
- `getSentimentInsights` cache-arg order: `(clientSlug, dateRange, modelKey, context)` defined in Task 2.1 → invoked in Task 2.4 with the same arg order. Match.

### 4. Risks I'm flagging now

- **FB-028 editorial pool size:** the URL-level filter cross-references the host set derived from `data.topDomains.filter(d=>d.type==='Editorial')`. If Peec's `/reports/domains` response is itself capped small (e.g. top 50), the URL-level expansion will still be bounded by that host set. If Tina's "thousands of articles" assertion implies a much wider universe than what `data.topDomains` returns, the subagent can additionally cross-reference `urlCitation.classification === 'editorial'` (string value verified during execution by inspecting one row in a real run). Documented here so the subagent does NOT silently hit the cap.
- **FB-026 prompt quality:** the helper caps the prompt at top-60 URLs by `citationCount` desc. If a client has fewer than ~10 cited URLs in the period, the empty-state path will be common. That is the honest behavior (we won't fabricate themes from thin air); document it in the component empty-state copy (already done).
- **FB-029 outlet/headline/link/publicationDate fields:** these come from `PRPlacement` (the `@/lib/pr-proof/types` shape). The pre-FB-015 component referenced exactly these field names from the same `MatchbackRow` type, so the field-access lines in Task 5 Step 4 are name-compatible with what `buildMatchback()` produces. No new fields invented.
- **FB-026 cache key collision:** if `models=[ChatGPT, Perplexity]` and `models=[Perplexity, ChatGPT]` ever both land, `modelKeyOf` sorts them so they produce the same cache key. Verified in the test (Task 2.2 Step 3).

---

## Execution preconditions checklist (one final read before kicking off Task 1)

- [ ] On branch `official-feedback-pr-influence-v2`.
- [ ] `git rev-parse HEAD` equals `91a1971`.
- [ ] `git status --short` empty.
- [ ] `npx tsc --noEmit` zero output.
- [ ] `npx tsx lib/peec/winners-losers.test.ts` passes.
- [ ] Plan file (this document) saved at `docs/superpowers/plans/2026-06-23-pr-influence-v2-iteration.md` and committed (optional — typically only landed in the final FB commit).
