# PR Influence Parts Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the peec-ai PR Influence tab from a hardcoded RSC onto the versioned-parts system, then hide the `sentiment-insights` part for the `renaissance` client via per-client config.

**Architecture:** Mirror the Overview migration. An async `buildPrInfluenceCtx()` performs all fetch + derivation (today's `pr-influence.tsx:199-492`) and returns a `PrInfluenceCtx` bag. Five pure-sync `PartImpl<PrInfluenceCtx>` render from that ctx; the two streaming parts return their existing `<Suspense>` + async child. The thin view resolves `PR_INFLUENCE_TEMPLATE` against the client's `reportSectionConfig['peec-ai:pr-influence']` override via `resolveSection`, then renders each resolved part.

**Tech Stack:** Next.js 16 RSC, TypeScript (strict), Drizzle + Neon Postgres, Vitest 3 + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-07-08-pr-influence-parts-migration-design.md`

## Global Constraints

- **Behavior-preserving:** the only functional change is renaissance hiding one part. Every other client renders the same sections, same order, same content — structurally equivalent modulo the per-part wrapper `<div>`.
- **`PartImpl.render` is pure synchronous** — no `await`, no fetching. Slow Glean/LLM calls stay inside the `<Suspense>` async children (`PRInfluenceSynopsis`, `SentimentInsightsSection`), which are **unchanged**.
- **View skips the wrapper `<div>` when a part renders `null`** (deliberate deviation from Overview) so a self-nulling part adds no `space-y-8` gap. `SHOW_AI_NARRATIVE` is `false` in this codebase, so `pr-synopsis` renders `null` and is the first body part.
- **Do not modify** presentational components (`pr-influence-tables.tsx`, `pr-influence-synopsis.tsx`, `synopsis-skeleton.tsx`, `sentiment-insights-section.tsx`, `sentiment-insights.tsx`) or the Sentiment lib (`lib/peec/sentiment-insights.ts`). Sentiment stays a real, shipping part — nothing is deleted.
- **`ds_id` / client identifiers** are never hardcoded; data access goes through existing lib helpers.
- **Config key** for this view is the string `'peec-ai:pr-influence'` (viewKey == template key here). It already carries commentary's `sharedParts`; body config is additive on the same key.
- **Test command:** `npx vitest run <path>`; typecheck: `npx tsc --noEmit`.

## Setup (execution-time, before Task 1)

Per the spec, work happens on a branch off `dev`, isolated from the current `feat/report-commentary` working tree (which holds unrelated uncommitted `visibility-chart.v2` changes). At execution start, use **superpowers:using-git-worktrees** to create a worktree off `dev` for branch `feat/report-parts-pr-influence`, then copy this plan and the spec into it (`docs/superpowers/{plans,specs}/`) and commit them as the first commit. All tasks below run in that worktree.

## File Structure

```
components/report-sections/peec-ai/
  pr-influence.tsx                       # MODIFY: becomes the thin view
  pr-influence/
    ctx.ts                               # CREATE: PrInfluenceCtx + buildPrInfluenceCtx + moved helpers
    template.ts                          # CREATE: PR_INFLUENCE_TEMPLATE
    ctx.snapshot.test.ts                 # CREATE: derivation snapshot (surface B)
    parts/
      registry.ts                        # CREATE: PR_INFLUENCE_PARTS
      pr-synopsis.tsx                     # CREATE
      pr-placement-matchback.tsx          # CREATE
      sentiment-insights.tsx              # CREATE
      editorial-and-clusters.tsx          # CREATE
      brand-absent-editorial.tsx          # CREATE
      __fixtures__/pr-influence-ctx.ts    # CREATE: FIXTURE_PR_INFLUENCE_CTX
      pr-synopsis.golden.test.tsx         # CREATE (+ 4 more, one per part)
      composition.golden.test.tsx         # CREATE: surface A (default + override)
      __snapshots__/                      # generated
    guard.test.ts                        # CREATE: CI guard for PR_INFLUENCE_PARTS
lib/report-sections/
  registries.ts                          # MODIFY: add 'peec-ai:pr-influence'
  combined-config.test.ts                # CREATE: validate + resolveSection with sharedParts+body
scripts/
  seed-pr-influence-template.ts          # CREATE: upsert + round-trip assert
  hide-sentiment-renaissance.ts          # CREATE: per-client set-union
```

---

### Task 1: Extract `buildPrInfluenceCtx` (mechanical move) + derivation snapshot

Standalone first commit. Move all fetch + derivation out of the RSC into `ctx.ts`; the view still renders the **existing inline JSX**, now reading from `ctx.*`. This isolates the un-diffable derivation move from the later composition change, and the snapshot test guards every later step.

**Files:**
- Create: `components/report-sections/peec-ai/pr-influence/ctx.ts`
- Create: `components/report-sections/peec-ai/pr-influence/ctx.snapshot.test.ts`
- Modify: `components/report-sections/peec-ai/pr-influence.tsx`

**Interfaces:**
- Produces: `type PrInfluenceCtx` and `async function buildPrInfluenceCtx(args: { clientSlug: string; dateRange?: string; models?: AEOModel[] | null }): Promise<PrInfluenceCtx>`.

- [ ] **Step 1: Create `ctx.ts` — type + builder (pure move of lines 199-492 + the two module helpers).**

```ts
// components/report-sections/peec-ai/pr-influence/ctx.ts
import { getPeecOverview } from '@/lib/peec/client'
import type { TrackedPrompt, TopDomain } from '@/lib/peec/client'
import { getDomainCoverage, getUrlCitations, domainPromptIds, avgCitationsByDomain, type DomainCoverage, type UrlCitation } from '@/lib/peec/url-citations'
import { getPRProofData } from '@/lib/pr-proof/client'
import type { PRPlacement } from '@/lib/pr-proof/types'
import { ga4Query, parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { isAiSource } from '@/lib/constants'
import { applyEnginesFilter, modelKeyOf } from '@/lib/peec/sentiment-insights'
import { getSentimentInsights } from '@/lib/peec/sentiment-insights'
import { filterDomainRowsByModel } from '@/lib/peec/by-model'
import type { AEOModel } from '@/lib/peec/models'
import type { PRInfluenceSynopsisContext } from '@/lib/peec/pr-influence-synopsis'
import type {
  TopEditorialDomainRow, BrandAbsentEditorialDomainRow,
  PromptClusterOpportunityRow, PRPlacementMatchbackRow,
} from '../pr-influence-tables'

export type PrInfluenceCtx = {
  clientSlug: string
  dateRange: string
  synopsisContext: PRInfluenceSynopsisContext
  matchbackTableRows: PRPlacementMatchbackRow[]
  totalPlacements: number
  placementsCitedByAI: number
  sentimentCitations: Parameters<typeof getSentimentInsights>[3]['citations']
  sentimentModelKey: string
  topEditorialRows: TopEditorialDomainRow[]
  opportunityTableRows: PromptClusterOpportunityRow[]
  brandAbsentTableRows: BrandAbsentEditorialDomainRow[]
  hasEditorialDomains: boolean
}

// MOVED VERBATIM from pr-influence.tsx (buildMatchback, computeOpportunityRows and their
// local types MatchbackRow / OpportunityRow). Copy them here unchanged.
// <<< paste buildMatchback + computeOpportunityRows exactly as they exist today >>>

export async function buildPrInfluenceCtx(args: {
  clientSlug: string
  dateRange?: string
  models?: AEOModel[] | null
}): Promise<PrInfluenceCtx> {
  const { clientSlug } = args
  const dateRange = args.dateRange ?? 'last_30_days'
  const models = args.models ?? null
  // <<< paste lines 199-492 of the current pr-influence.tsx VERBATIM here, EXCEPT:
  //     - do not re-derive dateRange (use the param above)
  //     - the function ends by RETURNING the ctx object below instead of rendering JSX >>>
  return {
    clientSlug, dateRange,
    synopsisContext, matchbackTableRows,
    totalPlacements: prData?.totalPlacements ?? 0,
    placementsCitedByAI,
    sentimentCitations, sentimentModelKey,
    topEditorialRows, opportunityTableRows,
    brandAbsentTableRows,
    hasEditorialDomains: editorialDomains.length > 0,
  }
}
```

Notes for the mechanical move: `synopsisContext`, `matchbackTableRows`, `placementsCitedByAI`, `sentimentCitations`, `sentimentModelKey`, `topEditorialRows`, `opportunityTableRows`, `brandAbsentTableRows`, `editorialDomains`, `prData` are all already computed by the pasted 199-492 block. Do **not** edit any derivation logic — this is a move, not a rewrite. Drop only imports that become unused in the RSC and add them here.

- [ ] **Step 2: Rewire `pr-influence.tsx` to build ctx, render existing JSX from `ctx.*`.**

Replace the body of `PRInfluenceReport` (lines 199-492 derivation) with a single call, and change the JSX to read from `ctx`:

```tsx
export async function PRInfluenceReport({ clientSlug, dateRange = 'last_30_days', models = null }: { clientSlug: string; dateRange?: string; models?: AEOModel[] | null }) {
  const ctx = await buildPrInfluenceCtx({ clientSlug, dateRange, models })
  return (
    <div className="space-y-8">
      <SharedPartsHeader viewKey="peec-ai:pr-influence" clientSlug={clientSlug} />
      <SectionHeader icon={Megaphone} title="How is AI-driven PR coverage performing?" subtitle="Where earned media earns LLM citations, which publications carry the most AI authority, and the opportunities to grow share of voice." />
      {SHOW_AI_NARRATIVE && (
        <Suspense fallback={<SynopsisSkeleton />}>
          <PRInfluenceSynopsis clientSlug={clientSlug} dateRange={dateRange} context={ctx.synopsisContext} />
        </Suspense>
      )}
      <PRPlacementMatchbackTable rows={ctx.matchbackTableRows} totalPlacements={ctx.totalPlacements} placementsCitedByAI={ctx.placementsCitedByAI} />
      <Suspense fallback={<SentimentSkeleton />}>
        <SentimentInsightsSection clientSlug={clientSlug} dateRange={dateRange} modelKey={ctx.sentimentModelKey} citations={ctx.sentimentCitations} />
      </Suspense>
      <div className="grid gap-6 lg:grid-cols-2">
        <TopEditorialDomainsTable rows={ctx.topEditorialRows} />
        <PromptClusterOpportunityMatrix rows={ctx.opportunityTableRows} />
      </div>
      <BrandAbsentEditorialDomainsTable rows={ctx.brandAbsentTableRows} hasEditorialDomains={ctx.hasEditorialDomains} />
    </div>
  )
}
```

Remove the now-unused imports/helpers from `pr-influence.tsx` (the moved `buildMatchback`, `computeOpportunityRows`, and imports only they used). Keep imports still referenced by the JSX (the table components, `Suspense`, `SectionHeader`, `SharedPartsHeader`, `Megaphone`, `SHOW_AI_NARRATIVE`, the skeletons, `PRInfluenceSynopsis`, `SentimentInsightsSection`).

- [ ] **Step 3: Write the derivation snapshot test.**

```ts
// components/report-sections/peec-ai/pr-influence/ctx.snapshot.test.ts
import { expect, test, vi, beforeEach } from 'vitest'
import { FIXTURE_PEEC_CTX } from '../parts/__fixtures__/peec-ctx'

vi.mock('@/lib/peec/client', () => ({ getPeecOverview: vi.fn() }))
vi.mock('@/lib/pr-proof/client', () => ({ getPRProofData: vi.fn() }))
vi.mock('@/lib/peec/url-citations', async (orig) => ({ ...(await orig<object>()), getDomainCoverage: vi.fn(), getUrlCitations: vi.fn() }))
vi.mock('@/lib/ga4/client', async (orig) => ({ ...(await orig<object>()), ga4Query: vi.fn() }))

import { getPeecOverview } from '@/lib/peec/client'
import { getPRProofData } from '@/lib/pr-proof/client'
import { getDomainCoverage, getUrlCitations } from '@/lib/peec/url-citations'
import { ga4Query } from '@/lib/ga4/client'
import { buildPrInfluenceCtx } from './ctx'

const EMPTY_COVERAGE = { promptIdsByDomain: {}, tagIdsByDomain: {}, tagIdsByUrlKey: {}, promptIdsByUrlKey: {}, tagNameById: {} }

beforeEach(() => {
  vi.mocked(getPeecOverview).mockResolvedValue(FIXTURE_PEEC_CTX.data as never)
  vi.mocked(getPRProofData).mockResolvedValue({ placements: [], totalPlacements: 0, uniqueDomains: [] } as never)
  vi.mocked(getDomainCoverage).mockResolvedValue(EMPTY_COVERAGE as never)
  vi.mocked(getUrlCitations).mockResolvedValue([] as never)
  vi.mocked(ga4Query).mockResolvedValue({ rows: [{ sessionSource: 'chatgpt.com', sessions: 100 }] } as never)
})

test('buildPrInfluenceCtx derivation — no model filter', async () => {
  const ctx = await buildPrInfluenceCtx({ clientSlug: 'fixture', dateRange: 'last_30_days', models: null })
  expect(ctx).toMatchSnapshot()
})

test('buildPrInfluenceCtx derivation — active model filter', async () => {
  const ctx = await buildPrInfluenceCtx({ clientSlug: 'fixture', dateRange: 'last_30_days', models: ['ChatGPT'] as never })
  expect(ctx).toMatchSnapshot()
})
```

- [ ] **Step 4: Run the test — expect it to fail before `ctx.ts` exists, pass after.**

Run: `npx vitest run components/report-sections/peec-ai/pr-influence/ctx.snapshot.test.ts`
Expected: PASS, writing 2 new snapshots. (If run before Step 1, FAIL with an import/module-resolution error for `./ctx`.)

- [ ] **Step 5: Typecheck.**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: `/verify` the extraction (mandatory — this commit has no automated old-vs-new diff).**

Use the `verify` skill to drive the running PR Influence tab for a real Peec-configured client and confirm the rendered sections/content are unchanged from before this commit.

- [ ] **Step 7: Commit.**

```bash
git add components/report-sections/peec-ai/pr-influence/ctx.ts \
        components/report-sections/peec-ai/pr-influence/ctx.snapshot.test.ts \
        components/report-sections/peec-ai/pr-influence/__snapshots__ \
        components/report-sections/peec-ai/pr-influence.tsx
git commit -m "refactor(pr-influence): extract buildPrInfluenceCtx (pure move) + derivation snapshot"
```

---

### Task 2: Build the five parts, registry, template, and fixture

**Files:**
- Create: `components/report-sections/peec-ai/pr-influence/parts/{pr-synopsis,pr-placement-matchback,sentiment-insights,editorial-and-clusters,brand-absent-editorial}.tsx`
- Create: `components/report-sections/peec-ai/pr-influence/parts/registry.ts`
- Create: `components/report-sections/peec-ai/pr-influence/template.ts`
- Create: `components/report-sections/peec-ai/pr-influence/parts/__fixtures__/pr-influence-ctx.ts`
- Create: 5 × `components/report-sections/peec-ai/pr-influence/parts/<id>.golden.test.tsx`

**Interfaces:**
- Consumes: `PrInfluenceCtx` (Task 1).
- Produces: `PR_INFLUENCE_PARTS: PartRegistry<PrInfluenceCtx>` (ids `pr-synopsis`, `pr-placement-matchback`, `sentiment-insights`, `editorial-and-clusters`, `brand-absent-editorial`, all v1, all `published: true`); `PR_INFLUENCE_TEMPLATE: SectionTemplate`; `FIXTURE_PR_INFLUENCE_CTX: PrInfluenceCtx`.

- [ ] **Step 1: Write the five part files.**

```tsx
// parts/pr-synopsis.tsx
import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { SHOW_AI_NARRATIVE } from '@/lib/constants'
import { PRInfluenceSynopsis } from '../../pr-influence-synopsis'
import { SynopsisSkeleton } from '../../synopsis-skeleton'
import type { PrInfluenceCtx } from '../ctx'

export const prSynopsisV1: PartImpl<PrInfluenceCtx> = {
  id: 'pr-synopsis', version: 1, published: true, defaultLabel: 'Executive Synopsis',
  render: (ctx) => {
    if (!SHOW_AI_NARRATIVE) return null
    return (
      <Suspense fallback={<SynopsisSkeleton />}>
        <PRInfluenceSynopsis clientSlug={ctx.clientSlug} dateRange={ctx.dateRange} context={ctx.synopsisContext} />
      </Suspense>
    )
  },
}
```

```tsx
// parts/pr-placement-matchback.tsx
import type { PartImpl } from '@/lib/report-sections/types'
import { PRPlacementMatchbackTable } from '../../pr-influence-tables'
import type { PrInfluenceCtx } from '../ctx'

export const prPlacementMatchbackV1: PartImpl<PrInfluenceCtx> = {
  id: 'pr-placement-matchback', version: 1, published: true, defaultLabel: 'PR Placement Matchback',
  render: (ctx) => (
    <PRPlacementMatchbackTable rows={ctx.matchbackTableRows} totalPlacements={ctx.totalPlacements} placementsCitedByAI={ctx.placementsCitedByAI} />
  ),
}
```

```tsx
// parts/sentiment-insights.tsx
import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { SentimentInsightsSection, SentimentSkeleton } from '../../sentiment-insights-section'
import type { PrInfluenceCtx } from '../ctx'

export const sentimentInsightsV1: PartImpl<PrInfluenceCtx> = {
  id: 'sentiment-insights', version: 1, published: true, defaultLabel: 'Sentiment Insights',
  render: (ctx) => (
    <Suspense fallback={<SentimentSkeleton />}>
      <SentimentInsightsSection clientSlug={ctx.clientSlug} dateRange={ctx.dateRange} modelKey={ctx.sentimentModelKey} citations={ctx.sentimentCitations} />
    </Suspense>
  ),
}
```

```tsx
// parts/editorial-and-clusters.tsx
import type { PartImpl } from '@/lib/report-sections/types'
import { TopEditorialDomainsTable, PromptClusterOpportunityMatrix } from '../../pr-influence-tables'
import type { PrInfluenceCtx } from '../ctx'

export const editorialAndClustersV1: PartImpl<PrInfluenceCtx> = {
  id: 'editorial-and-clusters', version: 1, published: true, defaultLabel: 'Editorial Domains & Prompt Clusters',
  render: (ctx) => (
    <div className="grid gap-6 lg:grid-cols-2">
      <TopEditorialDomainsTable rows={ctx.topEditorialRows} />
      <PromptClusterOpportunityMatrix rows={ctx.opportunityTableRows} />
    </div>
  ),
}
```

```tsx
// parts/brand-absent-editorial.tsx
import type { PartImpl } from '@/lib/report-sections/types'
import { BrandAbsentEditorialDomainsTable } from '../../pr-influence-tables'
import type { PrInfluenceCtx } from '../ctx'

export const brandAbsentEditorialV1: PartImpl<PrInfluenceCtx> = {
  id: 'brand-absent-editorial', version: 1, published: true, defaultLabel: 'Top Editorial Opportunities',
  render: (ctx) => (
    <BrandAbsentEditorialDomainsTable rows={ctx.brandAbsentTableRows} hasEditorialDomains={ctx.hasEditorialDomains} />
  ),
}
```

- [ ] **Step 2: Write the registry and template.**

```ts
// parts/registry.ts
import type { PartRegistry } from '@/lib/report-sections/types'
import type { PrInfluenceCtx } from '../ctx'
import { prSynopsisV1 } from './pr-synopsis'
import { prPlacementMatchbackV1 } from './pr-placement-matchback'
import { sentimentInsightsV1 } from './sentiment-insights'
import { editorialAndClustersV1 } from './editorial-and-clusters'
import { brandAbsentEditorialV1 } from './brand-absent-editorial'

export const PR_INFLUENCE_PARTS: PartRegistry<PrInfluenceCtx> = {
  'pr-synopsis':            { 1: prSynopsisV1 },
  'pr-placement-matchback': { 1: prPlacementMatchbackV1 },
  'sentiment-insights':     { 1: sentimentInsightsV1 },
  'editorial-and-clusters': { 1: editorialAndClustersV1 },
  'brand-absent-editorial': { 1: brandAbsentEditorialV1 },
}
```

```ts
// template.ts
import type { SectionTemplate } from '@/lib/report-sections/types'

// Order MUST match today's hardcoded PR Influence body sequence.
export const PR_INFLUENCE_TEMPLATE: SectionTemplate = {
  order: [
    { id: 'pr-synopsis', version: 1 },
    { id: 'pr-placement-matchback', version: 1 },
    { id: 'sentiment-insights', version: 1 },
    { id: 'editorial-and-clusters', version: 1 },
    { id: 'brand-absent-editorial', version: 1 },
  ],
  labels: {},
  thresholds: {},
}
```

- [ ] **Step 3: Write the fixture ctx.**

```ts
// parts/__fixtures__/pr-influence-ctx.ts
import type { PrInfluenceCtx } from '../../ctx'

export const FIXTURE_PR_INFLUENCE_CTX: PrInfluenceCtx = {
  clientSlug: 'fixture',
  dateRange: 'last_30_days',
  synopsisContext: {
    aiVisibility: 55, aiVisibilityDelta: 4, avgAiPosition: 2.1, avgAiPositionDelta: -0.3,
    totalAiCitations: 1200, totalPlacements: 8, placementsCitedByAI: 5,
    aiReferralSessions: 340, aiReferralSessionsDelta: 12, totalEditorialDomains: 6,
    brandAbsentCount: 3,
    topBrandAbsentDomains: [{ domain: 'example.com', citationCount: 40 }],
    topOpportunityClusters: [{ cluster: 'Pricing', score: 72 }],
  },
  matchbackTableRows: [
    { outlet: 'Example News', headline: 'Brand in the news', link: 'https://example.com/a', publicationDate: '2025-06-01', citedByAI: true, aiEnginesCiting: ['ChatGPT'] },
  ],
  totalPlacements: 8,
  placementsCitedByAI: 5,
  sentimentCitations: [] as never,
  sentimentModelKey: 'all',
  topEditorialRows: [
    { domain: 'example.com', citationCount: 42, citationCountDelta: 3, promptCoverage: 25, avgCitations: 1.4, hasPR: true },
  ],
  opportunityTableRows: [
    { cluster: 'Pricing', count: 5, editorialCitationDensity: 60, brandCitationRate: 55, brandMentionRate: 55, competitorPresence: 30, opportunityScore: 72 },
  ],
  brandAbsentTableRows: [
    { domain: 'rival.com', articleTitle: 'A competitor piece', articleUrl: 'https://rival.com/x', citationShare: 12, citationShareDelta: 2, competitorsMentioned: 'Rival' },
  ],
  hasEditorialDomains: true,
}
```

- [ ] **Step 4: Write the five per-part golden tests** (mirror `parts/kpi-cards.golden.test.tsx`). Repeated per id — example for two; write all five, substituting the id/import.

```tsx
// parts/pr-placement-matchback.golden.test.tsx
import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PR_INFLUENCE_PARTS } from './registry'
import { FIXTURE_PR_INFLUENCE_CTX } from './__fixtures__/pr-influence-ctx'

test('pr-placement-matchback@1 golden', () => {
  const impl = PR_INFLUENCE_PARTS['pr-placement-matchback'][1]
  const resolved = { id: impl.id, version: impl.version, label: impl.defaultLabel }
  const { container } = render(<TooltipProvider>{impl.render(FIXTURE_PR_INFLUENCE_CTX, resolved)}</TooltipProvider>)
  expect(container.textContent).not.toBe('')
  expect(container.firstChild).toMatchSnapshot()
})
```

```tsx
// parts/pr-synopsis.golden.test.tsx
import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PR_INFLUENCE_PARTS } from './registry'
import { FIXTURE_PR_INFLUENCE_CTX } from './__fixtures__/pr-influence-ctx'

// SHOW_AI_NARRATIVE is false in this codebase → pr-synopsis renders null synchronously.
test('pr-synopsis@1 golden (null under SHOW_AI_NARRATIVE=false)', () => {
  const impl = PR_INFLUENCE_PARTS['pr-synopsis'][1]
  const resolved = { id: impl.id, version: impl.version, label: impl.defaultLabel }
  const { container } = render(<TooltipProvider>{impl.render(FIXTURE_PR_INFLUENCE_CTX, resolved)}</TooltipProvider>)
  expect(container.firstChild).toMatchSnapshot() // expected: null
})
```

For `sentiment-insights`, the render returns a `<Suspense>` wrapping an async server component; in RTL the snapshot captures the `SentimentSkeleton` fallback — assert it renders (`container.textContent` contains `Sentiment Insights`) and snapshot `container.firstChild`. Use the same shape as the matchback test with id `sentiment-insights`. Do likewise for `editorial-and-clusters` and `brand-absent-editorial` (pure renders, full content).

- [ ] **Step 5: Run the part golden tests.**

Run: `npx vitest run components/report-sections/peec-ai/pr-influence/parts`
Expected: PASS, writing 5 snapshots. Eyeball each snapshot to confirm it reproduces the corresponding section's markup.

- [ ] **Step 6: Typecheck.**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit.**

```bash
git add components/report-sections/peec-ai/pr-influence/parts components/report-sections/peec-ai/pr-influence/template.ts
git commit -m "feat(pr-influence): add parts, registry, template, fixture + per-part golden tests"
```

---

### Task 3: Wire `REGISTRIES`, guard test, and combined-config tests

**Files:**
- Modify: `lib/report-sections/registries.ts`
- Create: `components/report-sections/peec-ai/pr-influence/guard.test.ts`
- Create: `lib/report-sections/combined-config.test.ts`

**Interfaces:**
- Consumes: `PR_INFLUENCE_PARTS`, `PR_INFLUENCE_TEMPLATE` (Task 2); `SHARED_PARTS` (`@/components/report-sections/shared/parts/registry`).

- [ ] **Step 1: Add the registry entry.**

```ts
// lib/report-sections/registries.ts — add import + entry
import { PR_INFLUENCE_PARTS } from '@/components/report-sections/peec-ai/pr-influence/parts/registry'
// ...inside REGISTRIES:
  'peec-ai:pr-influence': PR_INFLUENCE_PARTS as unknown as PartRegistry<unknown>,
```

- [ ] **Step 2: Write the guard test** (mirrors `components/report-sections/peec-ai/guard.test.ts`).

```ts
// components/report-sections/peec-ai/pr-influence/guard.test.ts
import { expect, test } from 'vitest'
import { assertReferencedPinsPublished, collectReferencedPins } from '@/lib/report-sections/registry'
import { PR_INFLUENCE_PARTS } from './parts/registry'
import { PR_INFLUENCE_TEMPLATE } from './template'

test('every PR Influence template pin exists and is published', () => {
  const violations = assertReferencedPinsPublished(PR_INFLUENCE_PARTS, collectReferencedPins(PR_INFLUENCE_TEMPLATE, []))
  expect(violations).toEqual([])
})
```

- [ ] **Step 3: Write the combined-config tests** (the novel `sharedParts` + body path).

```ts
// lib/report-sections/combined-config.test.ts
import { expect, test } from 'vitest'
import { parseReportSectionConfig } from './validate'
import { resolveSection } from './resolve'
import { PR_INFLUENCE_PARTS } from '@/components/report-sections/peec-ai/pr-influence/parts/registry'
import { PR_INFLUENCE_TEMPLATE } from '@/components/report-sections/peec-ai/pr-influence/template'
import { SHARED_PARTS } from '@/components/report-sections/shared/parts/registry'

const KEY = 'peec-ai:pr-influence'
const registries = { [KEY]: PR_INFLUENCE_PARTS as never }
const combined = { [KEY]: { hidden: ['sentiment-insights'], sharedParts: [{ id: 'commentary', version: 1 }] } }

test('validate: one key carries both body hidden and sharedParts, each against its own registry', () => {
  const cfg = parseReportSectionConfig(combined, registries, {}, SHARED_PARTS as never)
  expect(cfg[KEY].hidden).toEqual(['sentiment-insights'])
  expect(cfg[KEY].sharedParts).toEqual([{ id: 'commentary', version: 1 }])
})

test('validate: an unknown shared pin is rejected even alongside valid body config', () => {
  const bad = { [KEY]: { hidden: ['sentiment-insights'], sharedParts: [{ id: 'nope', version: 1 }] } }
  expect(() => parseReportSectionConfig(bad, registries, {}, SHARED_PARTS as never)).toThrow()
})

test('resolveSection drops the hidden body part and ignores sharedParts', () => {
  const resolved = resolveSection(PR_INFLUENCE_TEMPLATE, combined[KEY] as never)
  const ids = resolved.map((r) => r.id)
  expect(ids).toEqual(['pr-synopsis', 'pr-placement-matchback', 'editorial-and-clusters', 'brand-absent-editorial'])
  expect(ids).not.toContain('sentiment-insights')
})
```

- [ ] **Step 4: Run the tests.**

Run: `npx vitest run components/report-sections/peec-ai/pr-influence/guard.test.ts lib/report-sections/combined-config.test.ts`
Expected: PASS (all cases). The middle test proves `sharedParts` still validates against `SHARED_PARTS` even with body config present.

- [ ] **Step 5: Typecheck + commit.**

```bash
npx tsc --noEmit
git add lib/report-sections/registries.ts lib/report-sections/combined-config.test.ts components/report-sections/peec-ai/pr-influence/guard.test.ts
git commit -m "feat(report-sections): register pr-influence body registry + guard & combined-config tests"
```

---

### Task 4: Refactor the view onto the parts template + composition golden tests

**Files:**
- Modify: `components/report-sections/peec-ai/pr-influence.tsx`
- Create: `components/report-sections/peec-ai/pr-influence/parts/composition.golden.test.tsx`

**Interfaces:**
- Consumes: `buildPrInfluenceCtx`, `PR_INFLUENCE_TEMPLATE`, `PR_INFLUENCE_PARTS`, `resolveSection`, `lookup`, `getSectionTemplate`, `getClientBySlug`.

- [ ] **Step 1: Write the composition golden test first (surface A).**

```tsx
// parts/composition.golden.test.tsx
import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { resolveSection } from '@/lib/report-sections/resolve'
import { lookup } from '@/lib/report-sections/registry'
import { PR_INFLUENCE_PARTS } from './registry'
import { PR_INFLUENCE_TEMPLATE } from '../template'
import { FIXTURE_PR_INFLUENCE_CTX } from './__fixtures__/pr-influence-ctx'

function renderComposition(override: Parameters<typeof resolveSection>[1]) {
  const resolved = resolveSection(PR_INFLUENCE_TEMPLATE, override)
  return render(
    <TooltipProvider>
      <div className="space-y-8">
        {resolved.map((r) => {
          const impl = lookup(PR_INFLUENCE_PARTS, r.id, r.version)
          const node = impl?.render(FIXTURE_PR_INFLUENCE_CTX, r) ?? null
          return node == null ? null : <div key={`${r.id}@${r.version}`}>{node}</div>
        })}
      </div>
    </TooltipProvider>,
  )
}

test('default composition renders the four visible parts, no leading empty div', () => {
  const { container } = renderComposition(undefined)
  const spaceY = container.querySelector('.space-y-8')!
  // pr-synopsis is null (SHOW_AI_NARRATIVE=false) → NOT wrapped; 4 wrapper divs remain.
  expect(spaceY.children.length).toBe(4)
  expect(spaceY.firstElementChild?.innerHTML).not.toBe('') // first child is matchback, never empty
  expect(spaceY).toMatchSnapshot()
})

test('renaissance override hides sentiment-insights, order otherwise intact', () => {
  const { container } = renderComposition({ hidden: ['sentiment-insights'] })
  const spaceY = container.querySelector('.space-y-8')!
  expect(spaceY.children.length).toBe(3)
  expect(spaceY.textContent).not.toContain('Sentiment Insights')
})
```

- [ ] **Step 2: Run it — expect FAIL until the fixture/parts resolve cleanly, then PASS.**

Run: `npx vitest run components/report-sections/peec-ai/pr-influence/parts/composition.golden.test.tsx`
Expected: PASS, writing 1 snapshot. (`children.length === 4` confirms the empty-wrapper fix: 5 template parts minus the self-nulling `pr-synopsis`.)

- [ ] **Step 3: Refactor `pr-influence.tsx` to the thin view.**

```tsx
import { Suspense } from 'react'  // still needed? remove if no longer referenced
import { getClientBySlug, getSectionTemplate } from '@/lib/db/queries'
import { resolveSection } from '@/lib/report-sections/resolve'
import { lookup } from '@/lib/report-sections/registry'
import { Megaphone } from 'lucide-react'
import { SectionHeader } from './section-header'
import { SharedPartsHeader } from '@/components/report-sections/shared/shared-parts-header'
import type { AEOModel } from '@/lib/peec/models'
import { buildPrInfluenceCtx } from './pr-influence/ctx'
import { PR_INFLUENCE_PARTS } from './pr-influence/parts/registry'
import { PR_INFLUENCE_TEMPLATE } from './pr-influence/template'

export async function PRInfluenceReport({ clientSlug, dateRange = 'last_30_days', models = null }: { clientSlug: string; dateRange?: string; models?: AEOModel[] | null }) {
  const config = await getClientBySlug(clientSlug)
  const ctx = await buildPrInfluenceCtx({ clientSlug, dateRange, models })
  const template = (await getSectionTemplate('peec-ai:pr-influence')) ?? PR_INFLUENCE_TEMPLATE
  const override = config?.reportSectionConfig?.['peec-ai:pr-influence']
  const resolved = resolveSection(template, override)

  return (
    <div className="space-y-8">
      <SharedPartsHeader viewKey="peec-ai:pr-influence" clientSlug={clientSlug} />
      <SectionHeader icon={Megaphone} title="How is AI-driven PR coverage performing?" subtitle="Where earned media earns LLM citations, which publications carry the most AI authority, and the opportunities to grow share of voice." />
      {resolved.map((r) => {
        const impl = lookup(PR_INFLUENCE_PARTS, r.id, r.version)
        const node = impl?.render(ctx, r) ?? null
        return node == null ? null : <div key={`${r.id}@${r.version}`}>{node}</div>
      })}
    </div>
  )
}
```

Delete every import now unused (the table components, skeletons, `PRInfluenceSynopsis`, `SentimentInsightsSection`, `SHOW_AI_NARRATIVE`, and `Suspense` if nothing references it — those now live in the part files). `tsc` in Step 5 catches leftovers.

- [ ] **Step 4: `/verify` a non-renaissance client is unchanged (pre-seed, hits the code fallback).**

Drive the running PR Influence tab for a Peec-configured non-renaissance client; confirm identical to before Task 4. (The seeded-DB path is verified in Task 5.)

- [ ] **Step 5: Typecheck + full section tests + commit.**

```bash
npx tsc --noEmit
npx vitest run components/report-sections/peec-ai
git add components/report-sections/peec-ai/pr-influence.tsx components/report-sections/peec-ai/pr-influence/parts/composition.golden.test.tsx components/report-sections/peec-ai/pr-influence/parts/__snapshots__
git commit -m "refactor(pr-influence): render body via parts template + composition golden tests"
```

---

### Task 5: Seed the template row (upsert + round-trip assertion)

**Files:**
- Create: `scripts/seed-pr-influence-template.ts`

- [ ] **Step 1: Write the seed script** (mirrors `scripts/seed-section-templates.ts`, but upserts and asserts round-trip).

```ts
// scripts/seed-pr-influence-template.ts
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { sectionTemplates } from '@/lib/db/schema'
import { PR_INFLUENCE_TEMPLATE } from '@/components/report-sections/peec-ai/pr-influence/template'
import { parseSectionTemplate } from '@/lib/report-sections/validate'
import { PR_INFLUENCE_PARTS } from '@/components/report-sections/peec-ai/pr-influence/parts/registry'

const KEY = 'peec-ai:pr-influence'

async function main() {
  await db.insert(sectionTemplates)
    .values({ sectionSlug: KEY, composition: PR_INFLUENCE_TEMPLATE })
    .onConflictDoUpdate({ target: sectionTemplates.sectionSlug, set: { composition: PR_INFLUENCE_TEMPLATE, updatedAt: new Date() } })

  // Round-trip assertion: the persisted row must parse and deep-equal the constant.
  const rows = await db.select().from(sectionTemplates).where(eq(sectionTemplates.sectionSlug, KEY)).limit(1)
  const persisted = parseSectionTemplate(rows[0]?.composition, PR_INFLUENCE_PARTS as never)
  const a = JSON.stringify(persisted)
  const b = JSON.stringify(PR_INFLUENCE_TEMPLATE)
  if (a !== b) throw new Error(`seeded row diverges from PR_INFLUENCE_TEMPLATE:\n  db=${a}\n  code=${b}`)
  console.log(`Seeded + verified section_templates['${KEY}'].`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Run it against the target DB.**

Run: `npx tsx scripts/seed-pr-influence-template.ts`
Expected: `Seeded + verified section_templates['peec-ai:pr-influence'].` (throws loudly on any divergence).

- [ ] **Step 3: `/verify` a non-renaissance client AFTER seeding (the production DB-row path).**

Drive the tab for a Peec-configured non-renaissance client and confirm all five parts render, identical to pre-migration — this is the "DB row present, no override" path every other client runs.

- [ ] **Step 4: Commit.**

```bash
git add scripts/seed-pr-influence-template.ts
git commit -m "chore(pr-influence): seed section_templates row with round-trip assertion"
```

---

### Task 6: Hide `sentiment-insights` for renaissance (per-client set-union)

**Files:**
- Create: `scripts/hide-sentiment-renaissance.ts`

- [ ] **Step 1: Write the hide script** (mirrors `enable-commentary-renaissance.ts`; set-union on `hidden`, preserving `sharedParts`).

```ts
// scripts/hide-sentiment-renaissance.ts
// Hides the `sentiment-insights` part on peec-ai:pr-influence for `renaissance`,
// preserving the existing commentary sharedParts opt-in. Idempotent.
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { clients } from '@/lib/db/schema'
import type { ReportSectionConfig } from '@/lib/report-sections/types'

const SLUG = 'renaissance'
const KEY = 'peec-ai:pr-influence'
const PART = 'sentiment-insights'

async function main() {
  const row = await db.query.clients.findFirst({ where: eq(clients.slug, SLUG) })
  if (!row) throw new Error(`client "${SLUG}" not found`)

  const cfg: ReportSectionConfig = { ...(row.reportSectionConfig ?? {}) }
  // NOTE: existing is guaranteed here because renaissance already has a commentary
  // override on this key. A future client without one needs `existing?.hidden`.
  const existing = cfg[KEY] ?? {}
  const hidden = [...new Set([...(existing.hidden ?? []), PART])]
  cfg[KEY] = { ...existing, hidden } // spread preserves existing.sharedParts

  const already = (existing.hidden ?? []).includes(PART)
  if (already) {
    console.log(`No change — ${PART} already hidden on ${KEY} for ${SLUG}.`)
  } else {
    await db.update(clients).set({ reportSectionConfig: cfg, updatedAt: new Date() }).where(eq(clients.slug, SLUG))
    console.log(`Hid ${PART} on ${KEY} for ${SLUG}.`)
  }
  console.log(`Final ${KEY} override: ${JSON.stringify(cfg[KEY])}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Run it.**

Run: `npx tsx scripts/hide-sentiment-renaissance.ts`
Expected: `Hid sentiment-insights on peec-ai:pr-influence for renaissance.` and the printed override contains **both** `hidden:["sentiment-insights"]` and `sharedParts:[{"id":"commentary","version":1}]`.

- [ ] **Step 3: Run again to confirm idempotency.**

Run: `npx tsx scripts/hide-sentiment-renaissance.ts`
Expected: `No change — sentiment-insights already hidden…`; override still shows the commentary `sharedParts` intact (not duplicated, not dropped).

- [ ] **Step 4: Commit.**

```bash
git add scripts/hide-sentiment-renaissance.ts
git commit -m "chore(pr-influence): hide sentiment-insights for renaissance (preserve commentary)"
```

---

### Task 7: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck + test suite for the touched areas.**

Run: `npx tsc --noEmit && npx vitest run components/report-sections lib/report-sections`
Expected: all green.

- [ ] **Step 2: `/verify` renaissance.**

Drive the running PR Influence tab as renaissance: **Sentiment Insights is absent**, the other four sections render in order, and the commentary header still renders (sharedParts preserved).

- [ ] **Step 3: `/verify` a non-renaissance client.**

Drive the tab as a Peec-configured non-renaissance client: all five sections render, including Sentiment Insights — unchanged from pre-migration.

- [ ] **Step 4: Confirm success criteria.**

Check each success criterion in the spec (§Success criteria) against the results above. All must hold before the branch is offered for review/merge (which requires the `self-reviewed` label + green checks + Thomas's go-ahead, per CLAUDE.md).

---

## Self-Review

- **Spec coverage:** Approach (Tasks 1-4), five body parts + combined grid (Task 2), fixed chrome + empty-wrapper fix (Tasks 1, 4), framework wiring incl. the verified `resolveSection`/`validate.ts` split + regression tests (Task 3), template seed + source-of-truth round-trip (Task 5), per-client set-union hide preserving `sharedParts` + portability caveat (Task 6), both parity surfaces A (Task 4) + B (Task 1) with the residual-risk `/verify` (Tasks 1, 4-7), non-goals respected (no component deletions, grid kept combined). Covered.
- **Placeholder scan:** the only intentional "paste verbatim" is the mechanical move in Task 1 (buildMatchback / computeOpportunityRows / lines 199-492) — this is a *move*, and reproducing ~290 lines inline would invite drift; the instruction is to copy the existing code unchanged, which is the safest form. All other steps carry complete code.
- **Type consistency:** part export names (`prSynopsisV1`, `prPlacementMatchbackV1`, `sentimentInsightsV1`, `editorialAndClustersV1`, `brandAbsentEditorialV1`), ids, `PrInfluenceCtx` field names, and `PR_INFLUENCE_PARTS`/`PR_INFLUENCE_TEMPLATE` are consistent across Tasks 1-6. Row types match `pr-influence-tables.tsx` interfaces; `PRInfluenceSynopsisContext` fields match `lib/peec/pr-influence-synopsis.ts`.
