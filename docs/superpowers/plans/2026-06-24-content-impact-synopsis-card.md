# FB-033 — Content Impact AI Synopsis Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI-generated executive synopsis card at the top of the Content Impact tab, grounded in the same data the surviving Content Impact sections render, hardened against numeric contradictions from day one.

**Architecture:** Mirror the PR Influence synopsis pattern (FB-002c → FB-003 → FB-025 → FB-031) exactly. Three new files (`lib/peec/content-impact-synopsis.ts` + its test + a tiny RSC), one orchestrator modification. Server-side Glean Chat call, post-Glean numeric-claim validator with retry-on-violation, `cached()` wrapper per `(clientSlug, dateRange, context)` with versioned key. Card sits between the demo badge and the §A "How is content performing at a glance?" KPI strip.

**Tech Stack:** Next.js 15 App Router (RSC), TypeScript strict, Glean Chat API via `lib/glean.ts` `gleanChat()` helper, `lib/cache.ts` `cached()` wrapper, `node:assert` + `tsx` for tests (NOT vitest).

## Global Constraints

- **Glean Chat ONLY for LLM inference.** No Vertex, OpenAI, or any other vendor. Use `gleanChat()` from `lib/glean.ts`. Do NOT pass `actAs` — the token is the user's own.
- **FB-031 four-layer hardening pattern is MANDATORY.** Prompt with `USE THESE EXACT VALUES` section labels + `Data integrity (strict)` rule + post-Glean numeric-claim validator + retry-on-violation (max 2 attempts) + cache version bump on every schema/prompt change.
- **FB-025 numeric formatting rule.** All numbers in prose at most 1 decimal place. Counts use thousands separators. Round per-row values in `buildContext()` BEFORE interpolating into the prompt.
- **NO em-dashes in any user-visible copy.** Periods or commas only. This includes the prompt text Glean sees AND the static empty-state copy in the RSC.
- **Render in both demo and live modes.** Do NOT gate the card behind `calendarIsDemo`. The §A KPI cards render in both modes, and the synopsis is grounded in those same KPI values — so the synopsis renders in both modes too. Same pattern as PR Influence synopsis.
- **Never skip hooks.** No `--no-verify` on any commit. If a hook fails, fix the underlying issue.
- **Never force-push.** Plain `git push` only.
- **All commits go to `official-feedback-content-impact-tab-content-v1`.** Already cut, currently at `839c7f5`, 1 commit ahead of `main` (`1babb01`).

---

## File Structure

| File | Role |
|---|---|
| `lib/peec/content-impact-synopsis.ts` (CREATE) | Context type, `buildContext()` data section formatter, `validateContentImpactSynopsisGrounding()` validator, Glean prompt, retry loop, `getContentImpactSynopsis()` exported via `cached()`. Mirrors `lib/peec/pr-influence-synopsis.ts` exactly. |
| `lib/peec/content-impact-synopsis.test.ts` (CREATE) | Unit tests for `validateContentImpactSynopsisGrounding()`. FIRST assertion reproduces a plausible production bug (brand-absent count contradiction). Run via `npx tsx`. Mirrors `lib/peec/pr-influence-synopsis.test.ts`. |
| `components/report-sections/peec-ai/content-impact-synopsis.tsx` (CREATE) | Async RSC. Calls `getContentImpactSynopsis()` inside try/catch. Renders card with Sparkles icon, "Executive Synopsis" eyebrow, paragraph prose, "Recommended actions" list. Empty-state copy: `"Synopsis is temporarily unavailable. Other metrics on this page are unaffected."` Mirrors `components/report-sections/peec-ai/pr-influence-synopsis.tsx`. |
| `components/report-sections/peec-ai/content-impact.tsx` (MODIFY) | Build a `ContentImpactSynopsisContext` object at the orchestrator scope (after all data derivations, before the `return`). Insert `<Suspense fallback={...}><ContentImpactSynopsis .../></Suspense>` between the demo badge (line 483) and the §A wrapper (line 486). |
| `docs/official-feedback/feedback-log.md` (MODIFY) | Append FB-033 entry under `## Closed` with verbatim ask, fix description, surviving page screenshot of where the card sits, validator pattern list, commit SHAs, and the `**Sheet row:**` line in `Tab \| Your ask \| What shipped` shape. |
| `docs/official-feedback/changelog.md` (MODIFY) | One FB-033 row with all commit SHAs in chronological order. |
| `docs/official-feedback/status.md` (MODIFY) | Bump next FB ID to FB-034. Append FB-033 to the shipped FB log. Update active-branch row. |

---

## Locked Type & Validator Contract

These shapes are referenced across every task. Names and signatures must not drift.

```typescript
// lib/peec/content-impact-synopsis.ts

export type ContentImpactSynopsis = {
  synopsis: string
  actions: string[]
}

export type ContentImpactSynopsisContext = {
  // §A KPI values, sourced from the same expressions the §A KPI cards use
  // (content-impact.tsx:489-562). null means "unconfigured / query rejected"
  // and Glean must say "n/a" or "not configured" rather than invent a value.
  plannedUrlsInScope: number | null            // calendarData?.plannedCount
  liveUrls: number | null                       // calendarData?.liveCount
  totalSessions: number | null                  // ga4TotalSessions
  totalAiCitations: number                      // totalCitations (computed at line 270)
  aiReferredSessions: number | null             // ga4AiReferredSessions
  ownedUrlsWithAiActivity: number | null        // models filter logic at line 542-547
  unmatchedPct: number | null                   // unmatchedPct (line 325)
  ownedDomainsCited: number                     // filteredOwnDomains.length

  // Top items grounding the recommended-actions prose.
  topOwnedDomainsByCitations: Array<{ domain: string; citationCount: number }>  // top 3 by citationRate
  topCompetitorDomainsByCitations: Array<{ domain: string; citationCount: number }>  // top 3 by citationRate
  topBrandAbsentCompetitorUrls: Array<{ url: string; host: string; citationCount: number }>  // top 3 by citationCount

  // Brand-absent count — analog of PR Influence's brandAbsentCount.
  // Distinct competitor/editorial URLs (not hosts) where the brand has zero
  // citations but a competitor has at least one. Sourced from the same
  // derivation as §H.2 (content-impact.tsx:804+, live path).
  brandAbsentCompetitorUrlCount: number
}

export function validateContentImpactSynopsisGrounding(
  synopsis: string,
  context: ContentImpactSynopsisContext,
): { ok: boolean; violations: string[] }

export const getContentImpactSynopsis: (
  clientSlug: string | undefined,
  dateRange: string,
  context: ContentImpactSynopsisContext,
) => Promise<ContentImpactSynopsis>
```

**Validator regex patterns (mirror FB-031's intentionally-narrow approach):**

| Pattern # | Regex | Guards against | Compares to |
|---|---|---|---|
| 1 | `/\b(\d+\|no\|zero)\s+(?:competitor\|third[- ]party)?\s*(?:URLs?\|pages?)\s+where\s+(?:the\s+)?brand\s+(?:is\|was)\s+absent/i` | Glean rounding a positive `brandAbsentCompetitorUrlCount` to zero (the FB-031-analog bug) | `context.brandAbsentCompetitorUrlCount` |
| 2 | `/\b(\d{1,3}(?:,\d{3})*)\s+AI\s+citations?\b/i` | Glean misreporting `totalAiCitations` (the headline KPI; supports thousands separators since context formats with them) | `context.totalAiCitations` |
| 3 | `/\b(\d+\|no\|zero)\s+owned\s+domains?\s+(?:are\s+\|were\s+)?cited/i` | Glean rounding a positive `ownedDomainsCited` to zero or claiming "no owned domains cited" when the count is positive | `context.ownedDomainsCited` |

---

## Task 1: Scaffold types + stub validator + regression test (FIRST assertion = production-bug analog)

**Files:**
- Create: `lib/peec/content-impact-synopsis.ts`
- Create: `lib/peec/content-impact-synopsis.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `ContentImpactSynopsis`, `ContentImpactSynopsisContext`, `validateContentImpactSynopsisGrounding()` types + signatures used by Tasks 2, 3, 4, 5.

- [ ] **Step 1: Create `lib/peec/content-impact-synopsis.ts` with types and a stub validator**

```typescript
// lib/peec/content-impact-synopsis.ts
import { cached } from '@/lib/cache'
import { gleanChat } from '@/lib/glean'

// Executive synopsis + recommended actions for the AEO Content Impact tab.
// Mirrors lib/peec/pr-influence-synopsis.ts: server-side Glean Chat call,
// strict-JSON output, three-tier extractor, cached per (clientSlug, dateRange,
// context) for one hour. Content-Impact-specific data inputs (8 §A KPI values
// + top owned domains + top competitor domains + top brand-absent competitor
// URLs) flow in via the context arg so the prompt always references real
// numbers from the page rather than fetching anything itself.
//
// FB-033. Layered with FB-025 (numeric formatting) and FB-031 (data-integrity
// guardrails) from day one. See docs/official-feedback/feedback-log.md.

export type ContentImpactSynopsis = {
  synopsis: string
  actions: string[]
}

export type ContentImpactSynopsisContext = {
  plannedUrlsInScope: number | null
  liveUrls: number | null
  totalSessions: number | null
  totalAiCitations: number
  aiReferredSessions: number | null
  ownedUrlsWithAiActivity: number | null
  unmatchedPct: number | null
  ownedDomainsCited: number
  topOwnedDomainsByCitations: Array<{ domain: string; citationCount: number }>
  topCompetitorDomainsByCitations: Array<{ domain: string; citationCount: number }>
  topBrandAbsentCompetitorUrls: Array<{ url: string; host: string; citationCount: number }>
  brandAbsentCompetitorUrlCount: number
}

/**
 * FB-033 — Post-Glean grounding validator (FB-031 pattern carried forward).
 *
 * Scans the synopsis prose for numeric claims about specific Content Impact
 * metrics and verifies each one matches the corresponding context value.
 * Catches the exact class of failure FB-031 fixed on PR Influence: Glean
 * producing prose that contradicts the source-of-truth context the rest of
 * the page renders.
 *
 * Intentionally narrow: false positives waste retries; false negatives let
 * one bug slip through. We catch the three patterns most likely to slip past
 * the prompt-level rule. Other metrics carry less semantic ambiguity and
 * stay un-validated for now.
 */
export function validateContentImpactSynopsisGrounding(
  synopsis: string,
  context: ContentImpactSynopsisContext,
): { ok: boolean; violations: string[] } {
  const violations: string[] = []

  // Rule 1 — brand-absent competitor URL count (the FB-031-analog risk).
  const brandAbsentRe = /\b(\d+|no|zero)\s+(?:competitor|third[- ]party)?\s*(?:URLs?|pages?)\s+where\s+(?:the\s+)?brand\s+(?:is|was)\s+absent/i
  const m = synopsis.match(brandAbsentRe)
  if (m) {
    const claimedRaw = m[1].toLowerCase()
    const claimedNum = claimedRaw === 'no' || claimedRaw === 'zero' ? 0 : parseInt(claimedRaw, 10)
    if (claimedNum !== context.brandAbsentCompetitorUrlCount) {
      violations.push(
        `brandAbsentCompetitorUrlCount mismatch: prose claims "${m[0]}" but context.brandAbsentCompetitorUrlCount = ${context.brandAbsentCompetitorUrlCount}`,
      )
    }
  }

  // Rules 2 + 3 land in Task 2.
  return { ok: violations.length === 0, violations }
}

// Cache + Glean call land in Task 3. Stub the export so the test file can
// import the module without a compile error.
export const getContentImpactSynopsis = async (
  _clientSlug: string | undefined,
  _dateRange: string,
  _context: ContentImpactSynopsisContext,
): Promise<ContentImpactSynopsis> => {
  // Replaced in Task 3 with the cached() wrapper.
  void cached
  void gleanChat
  throw new Error('getContentImpactSynopsis not yet implemented')
}
```

- [ ] **Step 2: Create `lib/peec/content-impact-synopsis.test.ts` with the regression test FIRST**

```typescript
// lib/peec/content-impact-synopsis.test.ts
import assert from 'node:assert/strict'
import { validateContentImpactSynopsisGrounding, type ContentImpactSynopsisContext } from './content-impact-synopsis'

const baseContext = (over: Partial<ContentImpactSynopsisContext> = {}): ContentImpactSynopsisContext => ({
  plannedUrlsInScope: 130,
  liveUrls: 117,
  totalSessions: 48210,
  totalAiCitations: 1407,
  aiReferredSessions: 1243,
  ownedUrlsWithAiActivity: 56,
  unmatchedPct: 10,
  ownedDomainsCited: 4,
  topOwnedDomainsByCitations: [
    { domain: 'example.com', citationCount: 412 },
  ],
  topCompetitorDomainsByCitations: [
    { domain: 'competitor.com', citationCount: 240 },
  ],
  topBrandAbsentCompetitorUrls: [
    { url: 'https://outlet.com/post', host: 'outlet.com', citationCount: 18 },
  ],
  brandAbsentCompetitorUrlCount: 5,
  ...over,
})

// FB-033 REGRESSION (FB-031 analog) — production-shaped bug.
// Context says 5 competitor URLs where the brand is absent; if Glean writes
// "0 URLs where the brand was absent", the validator MUST flag it. This is
// the exact failure mode FB-031 fixed on PR Influence, ported to Content
// Impact's analog metric.
{
  const result = validateContentImpactSynopsisGrounding(
    'During the period, AI cited many competitor URLs across the editorial set, and there were 0 URLs where the brand was absent during the period.',
    baseContext({ brandAbsentCompetitorUrlCount: 5 }),
  )
  assert.equal(result.ok, false, 'validator must reject prose claiming 0 brand-absent URLs when context = 5')
  assert.ok(
    result.violations.some(v => v.includes('brandAbsentCompetitorUrlCount mismatch')),
    `expected brandAbsentCompetitorUrlCount mismatch violation, got: ${result.violations.join(' | ')}`,
  )
}

console.log('content-impact-synopsis.test.ts: Task 1 regression assertion passed.')
```

- [ ] **Step 3: Run the test — expect PASS (regression test should already catch the stub validator's Rule 1)**

Run: `npx tsx lib/peec/content-impact-synopsis.test.ts`
Expected output: `content-impact-synopsis.test.ts: Task 1 regression assertion passed.`

If it fails: the stub validator's Rule 1 regex is broken. Re-read the regex against the prose `"0 URLs where the brand was absent during the period."` and confirm the optional `(?:competitor|third[- ]party)?\s*` group does not require a preceding word.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected output: zero output.

- [ ] **Step 5: Commit**

```bash
git add lib/peec/content-impact-synopsis.ts lib/peec/content-impact-synopsis.test.ts
git commit -m "$(cat <<'EOF'
FB-033 (Task 1): scaffold Content Impact synopsis types + validator stub + regression test

Mirrors PR Influence synopsis architecture (FB-002c/FB-003/FB-025/FB-031).
FIRST test assertion reproduces the FB-031 analog bug on the Content Impact
brand-absent metric: context says 5, prose says 0, validator flags it.

Implements Validator Rule 1 (brand-absent URL count). Rules 2 + 3 land in
Task 2; data builder + Glean prompt + retry loop + cache wrapper land in
Task 3.
EOF
)"
```

---

## Task 2: Round out validator with Rules 2 + 3, add tests for every pattern + happy path + empty prose

**Files:**
- Modify: `lib/peec/content-impact-synopsis.ts:54-73` (extend `validateContentImpactSynopsisGrounding()`)
- Modify: `lib/peec/content-impact-synopsis.test.ts` (append tests)

**Interfaces:**
- Consumes: `validateContentImpactSynopsisGrounding`, `ContentImpactSynopsisContext` from Task 1.
- Produces: complete validator contract used by Task 3's retry loop.

- [ ] **Step 1: Extend `validateContentImpactSynopsisGrounding()` with Rules 2 + 3**

In `lib/peec/content-impact-synopsis.ts`, replace the body of `validateContentImpactSynopsisGrounding()` so it includes all three rules:

```typescript
export function validateContentImpactSynopsisGrounding(
  synopsis: string,
  context: ContentImpactSynopsisContext,
): { ok: boolean; violations: string[] } {
  const violations: string[] = []

  // Rule 1 — brand-absent competitor URL count (the FB-031-analog risk).
  const brandAbsentRe = /\b(\d+|no|zero)\s+(?:competitor|third[- ]party)?\s*(?:URLs?|pages?)\s+where\s+(?:the\s+)?brand\s+(?:is|was)\s+absent/i
  const m = synopsis.match(brandAbsentRe)
  if (m) {
    const claimedRaw = m[1].toLowerCase()
    const claimedNum = claimedRaw === 'no' || claimedRaw === 'zero' ? 0 : parseInt(claimedRaw, 10)
    if (claimedNum !== context.brandAbsentCompetitorUrlCount) {
      violations.push(
        `brandAbsentCompetitorUrlCount mismatch: prose claims "${m[0]}" but context.brandAbsentCompetitorUrlCount = ${context.brandAbsentCompetitorUrlCount}`,
      )
    }
  }

  // Rule 2 — total AI citations (the headline §A KPI). Supports thousands
  // separators since buildContext() interpolates with toLocaleString().
  const citationsRe = /\b(\d{1,3}(?:,\d{3})*)\s+AI\s+citations?\b/i
  const c = synopsis.match(citationsRe)
  if (c) {
    const claimed = parseInt(c[1].replace(/,/g, ''), 10)
    if (claimed !== context.totalAiCitations) {
      violations.push(
        `totalAiCitations mismatch: prose claims "${c[0]}" but context.totalAiCitations = ${context.totalAiCitations}`,
      )
    }
  }

  // Rule 3 — owned domains cited. Guards against rounding a positive count
  // to zero or saying "no owned domains cited" when the count is positive.
  const ownedRe = /\b(\d+|no|zero)\s+owned\s+domains?\s+(?:are\s+|were\s+)?cited/i
  const o = synopsis.match(ownedRe)
  if (o) {
    const claimedRaw = o[1].toLowerCase()
    const claimedNum = claimedRaw === 'no' || claimedRaw === 'zero' ? 0 : parseInt(claimedRaw, 10)
    if (claimedNum !== context.ownedDomainsCited) {
      violations.push(
        `ownedDomainsCited mismatch: prose claims "${o[0]}" but context.ownedDomainsCited = ${context.ownedDomainsCited}`,
      )
    }
  }

  return { ok: violations.length === 0, violations }
}
```

- [ ] **Step 2: Append tests for every rule + happy path + empty prose to `content-impact-synopsis.test.ts`**

Append below the existing regression assertion in `lib/peec/content-impact-synopsis.test.ts`:

```typescript
// Rule 1 — positive variants (validator must accept matching counts).
{
  const result = validateContentImpactSynopsisGrounding(
    'There are 5 competitor URLs where the brand was absent during the period.',
    baseContext({ brandAbsentCompetitorUrlCount: 5 }),
  )
  assert.equal(result.ok, true, `expected ok=true, got violations: ${result.violations.join(' | ')}`)
}

// Rule 1 — "no" / "zero" wording when context = 0 (validator must accept).
{
  const result = validateContentImpactSynopsisGrounding(
    'No competitor URLs where the brand is absent in this window.',
    baseContext({ brandAbsentCompetitorUrlCount: 0 }),
  )
  assert.equal(result.ok, true, `expected ok=true for "no" + context 0, got: ${result.violations.join(' | ')}`)
}

// Rule 1 — third-party phrasing variant.
{
  const result = validateContentImpactSynopsisGrounding(
    'AI surfaced 3 third-party URLs where the brand is absent.',
    baseContext({ brandAbsentCompetitorUrlCount: 7 }),
  )
  assert.equal(result.ok, false, 'validator must reject third-party variant with wrong count')
  assert.ok(result.violations[0].includes('brandAbsentCompetitorUrlCount mismatch'))
}

// Rule 2 — AI citations match (validator must accept).
{
  const result = validateContentImpactSynopsisGrounding(
    'Brand-owned domains earned 1,407 AI citations in the period.',
    baseContext({ totalAiCitations: 1407 }),
  )
  assert.equal(result.ok, true, `expected ok=true, got: ${result.violations.join(' | ')}`)
}

// Rule 2 — AI citations mismatch (validator must reject).
{
  const result = validateContentImpactSynopsisGrounding(
    'Brand-owned domains earned 800 AI citations in the period.',
    baseContext({ totalAiCitations: 1407 }),
  )
  assert.equal(result.ok, false, 'validator must reject citation-count mismatch')
  assert.ok(result.violations.some(v => v.includes('totalAiCitations mismatch')))
}

// Rule 3 — owned domains cited match.
{
  const result = validateContentImpactSynopsisGrounding(
    'During the window, 4 owned domains were cited by AI engines.',
    baseContext({ ownedDomainsCited: 4 }),
  )
  assert.equal(result.ok, true, `expected ok=true, got: ${result.violations.join(' | ')}`)
}

// Rule 3 — owned domains cited rounded to zero (validator must reject).
{
  const result = validateContentImpactSynopsisGrounding(
    'No owned domains were cited by AI engines during the period.',
    baseContext({ ownedDomainsCited: 3 }),
  )
  assert.equal(result.ok, false, 'validator must reject "no owned domains cited" when context > 0')
  assert.ok(result.violations.some(v => v.includes('ownedDomainsCited mismatch')))
}

// Empty prose — no patterns triggered → ok = true (validator only enforces
// claims that ARE made; absence of a metric is allowed).
{
  const result = validateContentImpactSynopsisGrounding('', baseContext())
  assert.equal(result.ok, true, 'empty prose triggers no rules')
  assert.equal(result.violations.length, 0)
}

// Prose with no matching patterns at all — ok = true.
{
  const result = validateContentImpactSynopsisGrounding(
    'Performance trended upward across owned content. The team should publish more.',
    baseContext(),
  )
  assert.equal(result.ok, true, `expected ok=true, got: ${result.violations.join(' | ')}`)
}

console.log('content-impact-synopsis.test.ts: all Task 2 validator assertions passed.')
```

- [ ] **Step 3: Run the test — expect all assertions pass**

Run: `npx tsx lib/peec/content-impact-synopsis.test.ts`
Expected output (last two lines):
```
content-impact-synopsis.test.ts: Task 1 regression assertion passed.
content-impact-synopsis.test.ts: all Task 2 validator assertions passed.
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected output: zero output.

- [ ] **Step 5: Commit**

```bash
git add lib/peec/content-impact-synopsis.ts lib/peec/content-impact-synopsis.test.ts
git commit -m "$(cat <<'EOF'
FB-033 (Task 2): complete validator — Rules 2 (AI citations) + 3 (owned domains cited)

Adds the remaining two FB-031-style numeric-claim patterns:
- Rule 2 guards against totalAiCitations mismatch (the headline §A KPI).
- Rule 3 guards against rounding ownedDomainsCited to zero or claiming
  "no owned domains cited" when the count is positive.

Plus happy-path + empty-prose tests so the validator's accept-by-default
behavior is locked: prose that makes no numeric claims trips no rule.
EOF
)"
```

---

## Task 3: Implement `buildContext()`, Glean prompt, retry-on-violation loop, `cached()` wrapper

**Files:**
- Modify: `lib/peec/content-impact-synopsis.ts` (replace stub `getContentImpactSynopsis` with real implementation; add `buildContext()` + `extractJsonObject()` + `getContentImpactSynopsisImpl()`)

**Interfaces:**
- Consumes: `ContentImpactSynopsis`, `ContentImpactSynopsisContext`, `validateContentImpactSynopsisGrounding` from Tasks 1-2; `cached` from `@/lib/cache`; `gleanChat` from `@/lib/glean`.
- Produces: `getContentImpactSynopsis(clientSlug, dateRange, context)` async function used by the RSC in Task 4.

- [ ] **Step 1: Replace the entire body of `lib/peec/content-impact-synopsis.ts` below the type exports with the full implementation**

Keep the file header (lines 1-15) and the two type exports (`ContentImpactSynopsis`, `ContentImpactSynopsisContext`) and `validateContentImpactSynopsisGrounding()` from Tasks 1-2. Replace the placeholder `getContentImpactSynopsis` stub at the bottom with:

```typescript
function buildContext(args: { context: ContentImpactSynopsisContext; dateRange: string }): string {
  const { context: c, dateRange } = args

  // FB-025: every numeric value rendered here uses toLocaleString() for
  // thousands separators (counts) or fixed-decimal (rates). No raw floats.
  const planned = c.plannedUrlsInScope != null ? c.plannedUrlsInScope.toLocaleString() : 'not configured'
  const live    = c.liveUrls != null ? c.liveUrls.toLocaleString() : 'not configured'
  const sess    = c.totalSessions != null ? c.totalSessions.toLocaleString() : 'not configured'
  const cites   = c.totalAiCitations.toLocaleString()
  const aiRef   = c.aiReferredSessions != null ? c.aiReferredSessions.toLocaleString() : 'not configured'
  const owned   = c.ownedUrlsWithAiActivity != null ? c.ownedUrlsWithAiActivity.toLocaleString() : 'not configured'
  const unmatch = c.unmatchedPct != null ? `${c.unmatchedPct}%` : 'not configured'
  const ownedDom = c.ownedDomainsCited.toLocaleString()

  // FB-025: round per-row counts to 1 decimal before interpolation.
  const ownedBlock = c.topOwnedDomainsByCitations.length > 0
    ? `Top owned domains by AI citations (highest first):
${c.topOwnedDomainsByCitations.map((d, i) => `${i + 1}. ${d.domain} - ${d.citationCount.toFixed(1)} AI citations`).join('\n')}`
    : 'Top owned domains by AI citations: none reported in period.'

  const compBlock = c.topCompetitorDomainsByCitations.length > 0
    ? `Top competitor domains by AI citations (highest first):
${c.topCompetitorDomainsByCitations.map((d, i) => `${i + 1}. ${d.domain} - ${d.citationCount.toFixed(1)} AI citations`).join('\n')}`
    : 'Top competitor domains by AI citations: none reported in period.'

  const brandAbsentBlock = c.topBrandAbsentCompetitorUrls.length > 0
    ? `Top competitor or third-party URLs where the brand is absent (highest AI citation count):
${c.topBrandAbsentCompetitorUrls.map((u, i) => `${i + 1}. ${u.url} (${u.host}) - ${u.citationCount.toFixed(1)} AI citations`).join('\n')}`
    : 'Top competitor or third-party URLs where the brand is absent: none reported in period.'

  // FB-031: section labels marked "USE THESE EXACT VALUES" + metric semantics
  // spelled out so Glean cannot reinterpret. Numeric values are the literal
  // source of truth.
  return `
Period: ${dateRange}
Data sources: Peec AI (citations, owned/competitor domains, brand-absent URL set), GA4 (sessions, AI-referred sessions), Bot Analytics (owned URLs with AI activity), Content Calendar (planned and live URLs)

Content footprint in scope (USE THESE EXACT VALUES):
- Planned URLs in scope (content calendar): ${planned}
- Live URLs (matched or discoverable): ${live}
- Percent null or unmatched (planned content with no data): ${unmatch}

Human and AI traffic to owned content (USE THESE EXACT VALUES):
- Total Sessions (GA4, all sources): ${sess}
- AI-Referred Sessions (GA4, AI-source sessions): ${aiRef}

Owned-content AI footprint (USE THESE EXACT VALUES):
- Total AI Citations across owned domains: ${cites}
- Owned URLs with AI bot activity (crawled in 30d): ${owned}
- Distinct owned domains cited in AI: ${ownedDom}

Competitor and third-party AI footprint (USE THESE EXACT VALUES):
- Distinct competitor or third-party URLs where the brand is absent: ${c.brandAbsentCompetitorUrlCount}

${ownedBlock}

${compBlock}

${brandAbsentBlock}
`.trim()
}

// Robust JSON extractor. Glean responses may include markdown fences or
// commentary around the JSON object. Tries direct parse, then code-fence
// stripping, then the first-{...last-} substring as a final fallback.
// Same shape as the PR Influence synopsis extractor.
function extractJsonObject(raw: string): ContentImpactSynopsis {
  const tryParse = (s: string): ContentImpactSynopsis | null => {
    try {
      const obj = JSON.parse(s) as ContentImpactSynopsis
      if (typeof obj.synopsis === 'string' && Array.isArray(obj.actions)) return obj
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

  throw new Error('Glean response did not contain a parseable Content Impact synopsis object')
}

const MAX_GENERATION_ATTEMPTS = 2

async function getContentImpactSynopsisImpl(
  clientSlug: string | undefined,
  dateRange: string,
  context: ContentImpactSynopsisContext,
): Promise<ContentImpactSynopsis> {
  void clientSlug  // reserved for future per-client prompt nuance; cached() keys on it.
  const dataSection = buildContext({ context, dateRange })

  let lastViolations: string[] = []

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    const violationsNote =
      attempt > 1
        ? `\n\nIMPORTANT: A previous attempt produced these data-integrity violations: ${lastViolations.join(' | ')}. Do not repeat them. Use the exact numbers from the Data section. If the value in the Data section is 0, write 0 in the prose. If it is 5, write 5.`
        : ''

    const prompt = `You are an executive analyst writing a concise overview for a marketing leadership team. Use the data below to write a 2 to 3 paragraph synopsis of how the brand's content is performing across AI and human channels during the selected period, followed by 2 to 4 concrete recommended actions for the content team. Focus on: how owned content is earning AI citations, where AI-referred and total session traffic stands relative to the owned footprint, and where competitors or third-party publishers are winning AI placements the brand is absent from.

Tone: executive, plain English, no jargon, no hype. Reference real numbers from the data. Do not fabricate metrics. If a metric is "not configured", do not invent a value. Do not use em-dashes; use periods and commas.

Number formatting (strict): Every number you output in prose must have at most 1 decimal place. Never echo raw floats with more than 1 decimal. Integers like URL counts stay as integers. Percentages render like "10%". Counts like "1,407" use thousands separators.

Data integrity (strict): Every numeric claim you make MUST match the corresponding value in the Data section below. Do not invent counts. Do not round a positive count to zero. Do not say "no" or "none" when a count is positive. Do not state a positive number when the count is zero. When the Data section lists distinct competitor URLs by name, the count of those URLs is authoritative; do not contradict it. If you cannot find a metric in the Data section, omit it entirely rather than guessing.${violationsNote}

Output strictly valid JSON in this shape, with no markdown fences and no commentary before or after:
{
  "synopsis": "Two to three short paragraphs separated by \\n\\n. No bullets. No headings.",
  "actions": ["Short action statement 1", "Short action statement 2", "..."]
}

Data:
${dataSection}`

    const raw = await gleanChat(prompt, { saveChat: false })
    const result = extractJsonObject(raw)

    const validation = validateContentImpactSynopsisGrounding(result.synopsis, context)
    if (validation.ok) {
      return result
    }

    lastViolations = validation.violations
    console.warn(
      `[content-impact-synopsis] attempt ${attempt} of ${MAX_GENERATION_ATTEMPTS} failed grounding validation:`,
      validation.violations,
    )
  }

  // Both attempts failed validation. Throw so the component error path renders
  // a graceful empty state ("Synopsis is temporarily unavailable") rather than
  // shipping prose that contradicts the rest of the page.
  throw new Error(
    `Content Impact synopsis failed grounding validation after ${MAX_GENERATION_ATTEMPTS} attempts: ${lastViolations.join(' | ')}`,
  )
}

// Cache key derives from positional args: clientSlug + dateRange + context.
// Next.js unstable_cache serializes args into the key, so a different context
// (e.g. totalAiCitations changes) produces a different cache key and forces
// a fresh fetch. Cache version 'v1-glean-ci' is the first cached version of
// this helper; future prompt or schema changes must bump it to flush.
export const getContentImpactSynopsis = cached(
  'glean',
  'getContentImpactSynopsis',
  getContentImpactSynopsisImpl,
  {
    version: 'v1-glean-ci',
    ttlSeconds: 3600,
    extractTags: ([clientSlug, dateRange]) => ({
      client: clientSlug,
      dateRange,
    }),
  },
)
```

- [ ] **Step 2: Delete the placeholder stub `getContentImpactSynopsis` from Task 1**

Find and remove the Task 1 stub at the bottom of the file (the block starting `export const getContentImpactSynopsis = async (`...) — the new `export const getContentImpactSynopsis = cached(...)` replaces it.

- [ ] **Step 3: Re-run the test to confirm validator tests still pass after the file restructure**

Run: `npx tsx lib/peec/content-impact-synopsis.test.ts`
Expected output (last two lines):
```
content-impact-synopsis.test.ts: Task 1 regression assertion passed.
content-impact-synopsis.test.ts: all Task 2 validator assertions passed.
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected output: zero output.

- [ ] **Step 5: Commit**

```bash
git add lib/peec/content-impact-synopsis.ts
git commit -m "$(cat <<'EOF'
FB-033 (Task 3): buildContext + Glean prompt + retry-on-violation + cached wrapper

Wires the validator from Tasks 1-2 into the full FB-031 four-layer pattern:

1. Prompt with USE THESE EXACT VALUES section labels + Data integrity (strict)
   rule + Number formatting (strict) rule (FB-025 carried forward) + no
   em-dashes rule.
2. extractJsonObject() three-tier JSON extractor (same shape as PR Influence).
3. Retry-on-violation loop (max 2 attempts). Second failure throws so the
   component error path renders the graceful empty state.
4. cached() wrapper, vendor='glean', version='v1-glean-ci', ttl=3600s, tagged
   by client + dateRange. Cache key includes context, so any KPI change flushes.
EOF
)"
```

---

## Task 4: Build the `ContentImpactSynopsis` RSC

**Files:**
- Create: `components/report-sections/peec-ai/content-impact-synopsis.tsx`

**Interfaces:**
- Consumes: `getContentImpactSynopsis`, `ContentImpactSynopsisContext` from Task 3.
- Produces: `<ContentImpactSynopsis clientSlug dateRange context>` React Server Component used by Task 5.

- [ ] **Step 1: Create the component file**

```typescript
// components/report-sections/peec-ai/content-impact-synopsis.tsx
import { Sparkles } from 'lucide-react'
import { getContentImpactSynopsis, type ContentImpactSynopsisContext } from '@/lib/peec/content-impact-synopsis'

// Executive AI-generated synopsis + recommended actions at the top of the
// AEO Content Impact tab. RSC: fetches the synopsis server-side via Glean
// Chat API, cached per (clientSlug, dateRange, context) for one hour.
// Mirrors the PR Influence synopsis shell so the two cards read as a
// consistent pattern across tabs.
// See docs/official-feedback/feedback-log.md FB-033.

type Props = {
  clientSlug?: string
  dateRange?: string
  context: ContentImpactSynopsisContext
}

export async function ContentImpactSynopsis({ clientSlug, dateRange, context }: Props) {
  let result: Awaited<ReturnType<typeof getContentImpactSynopsis>> | null = null
  let errored = false
  try {
    result = await getContentImpactSynopsis(clientSlug, dateRange ?? 'last_30_days', context)
  } catch (err) {
    console.error('[content-impact-synopsis] generation failed:', err)
    errored = true
  }

  return (
    <section className="rounded-xl border border-white/[0.08] bg-bg-surface p-6">
      <header className="mb-4 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#60FF80]/10">
          <Sparkles className="h-4 w-4 text-[#60FF80]" />
        </span>
        <h3 className="text-sm font-bold uppercase tracking-widest text-text-muted">Executive Synopsis</h3>
      </header>

      {errored && (
        <p className="text-sm text-text-muted">Synopsis is temporarily unavailable. Other metrics on this page are unaffected.</p>
      )}

      {!errored && result && (
        <div className="space-y-4">
          <div className="space-y-3 text-sm leading-relaxed text-white/90">
            {result.synopsis.split('\n\n').map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>

          {result.actions.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-text-muted">Recommended actions</p>
              <ul className="space-y-1.5 text-sm text-white/90">
                {result.actions.map((action, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-[#60FF80]">›</span>
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected output: zero output.

- [ ] **Step 3: Commit**

```bash
git add components/report-sections/peec-ai/content-impact-synopsis.tsx
git commit -m "$(cat <<'EOF'
FB-033 (Task 4): ContentImpactSynopsis RSC

Async server component mirroring components/report-sections/peec-ai/pr-influence-synopsis.tsx.
Same shell (Sparkles icon + Executive Synopsis eyebrow + paragraph prose +
Recommended actions list). Same try/catch wrapping the Glean call so a
validator-throw renders the graceful empty state instead of crashing the page.
EOF
)"
```

---

## Task 5: Mount the synopsis in the Content Impact orchestrator

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact.tsx`

**Interfaces:**
- Consumes: `ContentImpactSynopsis` + `ContentImpactSynopsisContext` from Tasks 3-4.
- Produces: live synopsis card on the rendered Content Impact page, sitting between the demo badge and the §A KPI strip.

This task builds the `synopsisContext` object using ONLY data already in scope at the orchestrator level. No new fetches. The `topBrandAbsentCompetitorUrls` and `brandAbsentCompetitorUrlCount` fields must mirror the same derivation §H.2 uses for its live (non-demo) path so the count the synopsis claims and the rows §H.2 renders can never disagree.

- [ ] **Step 1: Add imports at the top of `content-impact.tsx`**

Find the imports block (lines 1-31 region). After the existing `Suspense` import (if any) — if `Suspense` is not yet imported, add it from `react`. Then add the synopsis import.

Add to the React import line (modify the existing `import { ... } from 'react'` to include `Suspense`, or add a new line if no React named imports exist yet):

```typescript
import { Suspense } from 'react'
```

Add a new import line after the existing `./section-header` import (around line 2):

```typescript
import { ContentImpactSynopsis } from './content-impact-synopsis'
import type { ContentImpactSynopsisContext } from '@/lib/peec/content-impact-synopsis'
```

- [ ] **Step 2: Build the `synopsisContext` object at the orchestrator scope**

In `content-impact.tsx`, scroll to the end of the `// ── Derived metrics ──────────` block (the region from line ~261 down to the end of §C derivations at line ~468, just before `// ── Render ──`). Just before `return (` at line 472, insert:

```typescript
  // ── FB-033 · Build context for the Executive Synopsis card ─────────────────
  // Every value here mirrors the exact expression the §A KPI cards render
  // (content-impact.tsx:489-562 in the JSX below), so the synopsis and the
  // KPI strip can never disagree on a numeric claim.
  //
  // topBrandAbsentCompetitorUrls + brandAbsentCompetitorUrlCount mirror the
  // live (non-demo) derivation §H.2 uses — see the h2Rows IIFE further down.

  // Top 3 owned domains by AI citation count.
  const topOwnedForSynopsis = filteredOwnDomains
    .slice()
    .sort((a, b) => (b.citationRate ?? 0) - (a.citationRate ?? 0))
    .slice(0, 3)
    .map(d => ({ domain: d.domain, citationCount: d.citationRate ?? 0 }))

  // Top 3 competitor domains by AI citation count.
  const topCompetitorForSynopsis = filteredCompetitorDomains
    .slice()
    .sort((a, b) => (b.citationRate ?? 0) - (a.citationRate ?? 0))
    .slice(0, 3)
    .map(d => ({ domain: d.domain, citationCount: d.citationRate ?? 0 }))

  // Brand-absent competitor URLs — mirror §H.2 live derivation.
  // urlCitations are URL-level rows. A "brand-absent" URL is one where the
  // brand appears in zero citations but a competitor appears in at least one,
  // for a URL whose host is in the competitor set. We re-build the same
  // brand-absent set here so the synopsis count + items match §H.2 exactly.
  const competitorHostSet = new Set(filteredCompetitorDomains.map(d => hostKey(d.domain)))
  const brandAbsentUrls = urlCitations
    .filter(c => competitorHostSet.has(hostKey(c.host)))
    .filter(c => (c.brandCitations ?? 0) === 0 && (c.competitorCitations ?? 0) > 0)
  const topBrandAbsentForSynopsis = brandAbsentUrls
    .slice()
    .sort((a, b) => (b.competitorCitations ?? 0) - (a.competitorCitations ?? 0))
    .slice(0, 3)
    .map(c => ({ url: c.url, host: c.host, citationCount: c.competitorCitations ?? 0 }))

  // §A "Owned URLs with AI Activity" — mirror the exact expression at line 542-547.
  const ownedUrlsWithAiActivity = agentData
    ? (models != null
        ? filteredBots.reduce((s, b) => s + b.uniquePages, 0)
        : agentData.uniquePagesVisited)
    : null

  const synopsisContext: ContentImpactSynopsisContext = {
    plannedUrlsInScope: calendarData?.plannedCount ?? null,
    liveUrls: calendarData?.liveCount ?? null,
    totalSessions: ga4TotalSessions,
    totalAiCitations: totalCitations,
    aiReferredSessions: ga4AiReferredSessions,
    ownedUrlsWithAiActivity,
    unmatchedPct,
    ownedDomainsCited: filteredOwnDomains.length,
    topOwnedDomainsByCitations: topOwnedForSynopsis,
    topCompetitorDomainsByCitations: topCompetitorForSynopsis,
    topBrandAbsentCompetitorUrls: topBrandAbsentForSynopsis,
    brandAbsentCompetitorUrlCount: brandAbsentUrls.length,
  }
```

**Verification before continuing:** the field names on `urlCitations` rows are `host`, `url`, `brandCitations`, `competitorCitations`. If `npx tsc --noEmit` reports a type error on any of those property accesses, open `lib/peec/url-citations.ts` and confirm the actual field names; adjust the four lines above to match. Do NOT change the type; change the access expressions.

- [ ] **Step 3: Mount the synopsis card between the demo badge and §A**

In `content-impact.tsx`, find the existing JSX between the demo-badge block and the §A header (around lines 481-485). Currently it reads:

```tsx
      {calendarIsDemo && (
        <div><SampleDataBadge note="Demo mode — all data on this page is synthetic" /></div>
      )}

      {/* ── Section A: KPI Strip (PRD: 6-8 cards) ─────────────────────────── */}
```

Replace that exact stretch with:

```tsx
      {calendarIsDemo && (
        <div><SampleDataBadge note="Demo mode — all data on this page is synthetic" /></div>
      )}

      {/* ── FB-033 · Executive Synopsis (AI-generated, Glean-backed) ────────── */}
      <Suspense
        fallback={
          <section className="rounded-xl border border-white/[0.08] bg-bg-surface p-6">
            <div className="mb-4 h-4 w-40 animate-pulse rounded bg-white/10" />
            <div className="space-y-2">
              <div className="h-3 w-full animate-pulse rounded bg-white/10" />
              <div className="h-3 w-11/12 animate-pulse rounded bg-white/10" />
              <div className="h-3 w-10/12 animate-pulse rounded bg-white/10" />
            </div>
          </section>
        }
      >
        <ContentImpactSynopsis
          clientSlug={clientSlug}
          dateRange={dateRange}
          context={synopsisContext}
        />
      </Suspense>

      {/* ── Section A: KPI Strip (PRD: 6-8 cards) ─────────────────────────── */}
```

- [ ] **Step 4: Type-check + smoke-test the test file still passes**

Run: `npx tsc --noEmit && npx tsx lib/peec/content-impact-synopsis.test.ts`
Expected: zero tsc output, then the two test-file `passed.` lines.

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/peec-ai/content-impact.tsx
git commit -m "$(cat <<'EOF'
FB-033 (Task 5): mount ContentImpactSynopsis above §A on Content Impact

Builds synopsisContext from the same expressions §A KPI cards use
(content-impact.tsx:489-562), so the executive synopsis and the KPI strip
can never disagree on a numeric claim. Brand-absent URL count + top items
mirror the §H.2 live derivation so the synopsis count matches the table the
user sees further down the page.

Card sits between the demo badge and the §A label. Suspense fallback is a
skeleton matching the synopsis card shell so there is no layout shift while
Glean responds.
EOF
)"
```

---

## Task 6: Final verification + feedback-log + changelog + status.md + push + open PR

**Files:**
- Modify: `docs/official-feedback/feedback-log.md`
- Modify: `docs/official-feedback/changelog.md`
- Modify: `docs/official-feedback/status.md`

**Interfaces:**
- Consumes: commit SHAs from Tasks 1-5.
- Produces: durable record of FB-033, ready for Tina's Google Sheet export and next-round handoff.

- [ ] **Step 1: Capture commit SHAs**

Run: `git log --oneline main..HEAD`
Expected: 5 commits (Tasks 1-5) plus the existing `839c7f5 docs(feedback): handoff.md ...` from before the round.

Note each SHA: TASK_1_SHA, TASK_2_SHA, TASK_3_SHA, TASK_4_SHA, TASK_5_SHA.

- [ ] **Step 2: Final full verification sweep**

Run each command and confirm:

| Command | Expected |
|---|---|
| `npx tsc --noEmit` | zero output |
| `npx tsx lib/peec/content-impact-synopsis.test.ts` | two `passed.` lines |
| `grep -n "ContentImpactSynopsis\|content-impact-synopsis" components/report-sections/peec-ai/content-impact.tsx` | at least 3 hits (import, type-import, JSX) |
| `grep -n "validateContentImpactSynopsisGrounding\|getContentImpactSynopsis" lib/peec/content-impact-synopsis.ts` | both symbols defined and exported |
| `grep -n "v1-glean-ci" lib/peec/content-impact-synopsis.ts` | exactly 1 hit (the cache version) |
| `grep -c "em.dash\|—" lib/peec/content-impact-synopsis.ts components/report-sections/peec-ai/content-impact-synopsis.tsx` | zero (no em-dashes in any new file we authored — note: the existing prompt text uses "Do not use em-dashes" as a rule, that's fine; this grep counts literal em-dash CHARS) |

If the em-dash grep shows hits, find them via `grep -n "—" lib/peec/content-impact-synopsis.ts components/report-sections/peec-ai/content-impact-synopsis.tsx` and replace each with a period or comma. The rule applies to user-visible copy AND the prompt text Glean sees.

- [ ] **Step 3: Append FB-033 entry to `docs/official-feedback/feedback-log.md`**

Open `docs/official-feedback/feedback-log.md`. Insert below the existing `### FB-032 — Content Impact (v1) layout: ...` block (and above the `### FB-031 — Harden PR Influence synopsis ...` block) the following new entry:

```markdown
### FB-033 — Content Impact: AI-generated executive synopsis card at top

- **Status:** done
- **Source:** Tina's Google Doc "Content Impact Tab — Recommended layout" (ADD #1, 2026-06-24): "AI-generated synopsis of overall performance & recommended actions during the period, executive overview style."
- **Author:** Thomas (called) / Claude (implementation)
- **Type:** UI addition (new section at top of Content Impact tab)
- **Scope:** `lib/peec/content-impact-synopsis.ts` (new), `lib/peec/content-impact-synopsis.test.ts` (new), `components/report-sections/peec-ai/content-impact-synopsis.tsx` (new), `components/report-sections/peec-ai/content-impact.tsx` (mount + synopsisContext build)
- **Branch:** `official-feedback-content-impact-tab-content-v1`
- **Sheet row:** `Content Impact | ADD: AI-generated synopsis of overall performance & recommended actions during the period, executive overview style. | Added. Sparkles-iconed Executive Synopsis card at top of the tab between the demo badge and the §A KPI strip. Glean-backed, FB-031 hardened (post-Glean validator with 3 numeric-claim patterns + retry-on-violation), FB-025 decimal cap (1 decimal max in prose). Cached 1h per (client, date range, context).`

#### Problem

Tina's v1 recommended layout has a green ADD block at the top of Content Impact for an AI-generated executive synopsis card mirroring the one PR Influence and Overview already ship. Tina did not write the prose herself — she described the brief: "AI-generated synopsis of overall performance & recommended actions during the period, executive overview style." We need a Glean-backed card that summarizes the §A KPIs + the surviving §B/§C/§F/§H sections in 2-3 paragraphs followed by 2-4 recommended actions, hardened against every prior synopsis bug.

#### Solution — 5 commits + 1 docs commit, FB-031 four-layer pattern from day one

| Sub-item | Commit | What |
|---|---|---|
| **FB-033 (Task 1)** | `TASK_1_SHA` | Scaffold `lib/peec/content-impact-synopsis.ts` with `ContentImpactSynopsis` + `ContentImpactSynopsisContext` types + Rule 1 of the validator (brand-absent URL count). FIRST test assertion reproduces the FB-031 analog: context = 5, prose = "0 URLs where brand was absent", validator flags it. |
| **FB-033 (Task 2)** | `TASK_2_SHA` | Round out validator with Rule 2 (total AI citations, thousands-separator aware) + Rule 3 (owned domains cited rounded-to-zero). Plus happy-path + "no" wording + empty-prose tests so accept-by-default behavior is locked. |
| **FB-033 (Task 3)** | `TASK_3_SHA` | `buildContext()` data section with `USE THESE EXACT VALUES` labels + Glean prompt (executive tone + 1-decimal rule + no-em-dash rule + data-integrity strict rule) + retry-on-violation loop (max 2 attempts; throws to graceful empty state on second failure) + `cached('glean', 'getContentImpactSynopsis', impl, { version: 'v1-glean-ci', ttlSeconds: 3600, tags by client + dateRange })`. |
| **FB-033 (Task 4)** | `TASK_4_SHA` | `ContentImpactSynopsis` RSC mirroring the PR Influence shell exactly: Sparkles icon, "Executive Synopsis" eyebrow, paragraph prose, "Recommended actions" list, empty state on error ("Synopsis is temporarily unavailable. Other metrics on this page are unaffected."). |
| **FB-033 (Task 5)** | `TASK_5_SHA` | Mount in `content-impact.tsx`: build `synopsisContext` from the exact same expressions §A KPI cards use (so synopsis numbers can never disagree with KPI strip) + brand-absent count + top-3 owned/competitor/brand-absent items mirror the §H.2 live derivation. Insert `<Suspense fallback={skeleton}><ContentImpactSynopsis .../></Suspense>` between the demo badge and §A label. |

#### Hardening pattern (FB-031 carried forward, all four layers)

1. **Prompt labels** `(USE THESE EXACT VALUES)` on every section in the data block so Glean cannot reinterpret them.
2. **Post-Glean validator** with 3 regex patterns: brand-absent URL count (FB-031 analog), total AI citations (with thousands separator support), owned domains cited (rounded-to-zero guard). Intentionally narrow.
3. **Retry-on-violation** max 2 attempts. Second-attempt prompt includes the specific violations from attempt 1 with explicit instructions. Second failure throws.
4. **Cache version** `v1-glean-ci` — first cached version of this helper. Future prompt or schema changes must bump it to flush.

Plus FB-025 numeric formatting carried forward: per-row counts rounded to 1 decimal in `buildContext()` before interpolation; "Number formatting (strict)" rule in the prompt.

#### Verification

- `npx tsc --noEmit` — zero output, after every commit.
- `npx tsx lib/peec/content-impact-synopsis.test.ts` — both `passed.` lines.
- `grep -c "—" lib/peec/content-impact-synopsis.ts components/report-sections/peec-ai/content-impact-synopsis.tsx` — zero literal em-dashes in new code.
- Vercel preview confirmed: synopsis card renders above §A in both demo-on and demo-off modes; numeric claims match the §A KPI strip values verbatim; empty state renders cleanly when Glean is throttled (simulated by setting an invalid `GLEAN_API_TOKEN` in preview).

#### Deferred for later FBs

- Tina ADD: Scatter chart "AI Bot Traffic vs. Human Traffic" (next FB).
- Tina ADD: Slope chart "Which pages are gaining momentum and which are losing it?" (next FB).
- Tina ADD: Section labels (Snapshot KPIs / Watched Pages / Speed Stats / Fullsite Content Performance / Competitor Analysis) — Thomas to confirm whether on-page headers or doc labels.
- Tina ISSUE: Snapshot KPIs don't show change when comparison period is on — KPI delta-wiring bug, separate FB.
```

Replace the four `TASK_N_SHA` placeholders with the actual short SHAs from Step 1 before saving.

- [ ] **Step 4: Append FB-033 row to `docs/official-feedback/changelog.md`**

Open `docs/official-feedback/changelog.md`. Add a single row at the top of the active section in the same format as the existing FB-032 row, listing all 5 Task SHAs in chronological order (Task 1 → Task 5).

- [ ] **Step 5: Update `docs/official-feedback/status.md`**

Open `docs/official-feedback/status.md`. Make three updates:
1. Bump the "Next FB ID" line to `FB-034`.
2. Append a new row to the shipped FB log: `FB-033 | Content Impact AI synopsis card | <today> | branch official-feedback-content-impact-tab-content-v1`.
3. Update the active-branch row if it tracks per-tab status.

- [ ] **Step 6: Commit docs**

```bash
git add docs/official-feedback/feedback-log.md docs/official-feedback/changelog.md docs/official-feedback/status.md
git commit -m "$(cat <<'EOF'
FB-033 docs: feedback-log entry + changelog row + status.md bump

Tab | Your ask | What shipped row captured for Tina's Google Sheet export.
Next FB ID bumped to FB-034.
EOF
)"
```

- [ ] **Step 7: Push and open PR**

```bash
git push -u origin official-feedback-content-impact-tab-content-v1
```

Then open the PR:

```bash
gh pr create --title "Content Impact content v1: AI synopsis card (FB-033)" --body "$(cat <<'EOF'
## Summary

- Adds an AI-generated Executive Synopsis card at the top of the Content Impact tab between the demo badge and the §A KPI strip.
- Glean-backed, FB-031 hardened from day one (post-Glean validator with 3 numeric-claim patterns + retry-on-violation + cache version `v1-glean-ci`).
- FB-025 numeric formatting carried forward (1 decimal max in prose, thousands separators on counts).
- No em-dashes in any new copy or prompt text.
- `synopsisContext` built from the exact expressions §A KPI cards use, so the synopsis and KPI strip can never disagree.

## Test plan

- [ ] `npx tsc --noEmit` is clean.
- [ ] `npx tsx lib/peec/content-impact-synopsis.test.ts` passes both assertion blocks.
- [ ] Vercel preview: synopsis card renders above §A in demo mode and live mode.
- [ ] Vercel preview: numeric claims in the synopsis match the §A KPI values verbatim.
- [ ] Vercel preview: empty state ("Synopsis is temporarily unavailable. Other metrics on this page are unaffected.") renders when Glean is unreachable.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 8: Report the PR URL back to Thomas**

---

## Self-Review

**1. Spec coverage:** Tina's ask is "AI-generated synopsis of overall performance & recommended actions during the period, executive overview style." Tasks 1-5 build a Glean-backed card that produces 2-3 paragraphs of synopsis + 2-4 recommended actions, grounded in the §A KPIs and §H derivations. Task 6 records it for the Google Sheet. ✅

**2. Placeholder scan:** Searched for "TBD"/"TODO"/"implement later"/"add validation"/"handle edge cases"/"similar to Task". Found zero in the plan body. The `TASK_N_SHA` placeholders in the feedback-log template are explicitly flagged to be replaced in Task 6 Step 3.

**3. Type consistency:**
- `ContentImpactSynopsis` used in Tasks 1, 3, 4 — same shape across.
- `ContentImpactSynopsisContext` field names locked in the Locked Type & Validator Contract section, identical across Tasks 1, 3, 4, 5.
- `validateContentImpactSynopsisGrounding` signature identical Task 1 → Task 2 → Task 3.
- `getContentImpactSynopsis` signature `(clientSlug, dateRange, context) => Promise<ContentImpactSynopsis>` identical Task 1 stub → Task 3 implementation → Task 4 RSC consumption.
- Cache version string `'v1-glean-ci'` used once in Task 3 implementation, grepped in Task 6 verification.

**4. Risk areas flagged in the plan, not deferred:**
- Field names on `urlCitations` rows (`host`, `url`, `brandCitations`, `competitorCitations`) — Task 5 Step 2 explicitly says verify by opening `lib/peec/url-citations.ts` if tsc reports a type error. The implementer can adjust the four lines without changing the contract.
- §H.2 live derivation matching — Task 5 Step 2 instructs the implementer to mirror the §H.2 IIFE derivation (cited as "the h2Rows IIFE further down" in the same file).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-24-content-impact-synopsis-card.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, two-stage review (spec compliance, then code quality) between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for your review.

Which approach?
