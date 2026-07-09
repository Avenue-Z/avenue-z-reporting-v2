# PR Influence Parts Migration — Implementation Plan (re-baselined on `dev`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the peec-ai PR Influence tab from a hardcoded RSC onto the versioned-parts system, so its body sections become individually-addressable, per-client-configurable parts. Behavior-preserving: the rendered output is unchanged for every client.

**Architecture:** Mirror the Overview migration. An async `buildPrInfluenceCtx()` performs all fetch + derivation and returns a `PrInfluenceCtx` bag. Five pure-sync `PartImpl<PrInfluenceCtx>` render from that ctx; the two streaming parts (`pr-synopsis`, `sentiment-insights`) return their existing `<Suspense>` + async child. The thin view resolves `PR_INFLUENCE_TEMPLATE` against the client's `reportSectionConfig['peec-ai:pr-influence']` override via `resolveSection`, then renders each resolved part.

**Tech Stack:** Next.js 16 RSC, TypeScript (strict), Drizzle + Neon Postgres, Vitest 3 + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-07-08-pr-influence-parts-migration-design.md`

## Re-baseline note (READ FIRST)

This plan was first written against the `feat/report-commentary` tree, then re-baselined on `origin/dev` where two features had already landed:

- **FB-067** extracted the matchback into `lib/pr-proof/matchback.ts` as `computePlacementMatchback(placements, urlCitations, models) -> { rows, citedCount, totalPlacements }`. `buildMatchback` no longer exists in `pr-influence.tsx`; do not move or recreate it, call the existing helper.
- **FB-065** changed Sentiment Insights to Profound-sourced and gated it to `clientSlug === 'avenue-z'` (Profound is a single-account feed). `SentimentInsightsSection` now takes `{ dateRange, models }`, no `clientSlug`/`modelKey`/`citations`.

Consequence: renaissance already never renders Sentiment (it is not `avenue-z`), so the original "hide Sentiment for renaissance via config" is already satisfied on `dev`. There is no renaissance config write in this plan. The `sentiment-insights` part preserves the `avenue-z` gate internally, so migration is behavior-preserving. The deliverable is the parts infrastructure (per-client configurability of PR Influence), not a renaissance-specific change.

## Global Constraints

- **Behavior-preserving:** every client renders the same sections, same order, same content, structurally equivalent modulo the per-part wrapper `<div>`.
- **`PartImpl.render` is pure synchronous:** no `await`, no fetching. Slow Glean/Profound calls stay inside the `<Suspense>` async children (`PRInfluenceSynopsis`, `SentimentInsightsSection`), which are unchanged.
- **The `sentiment-insights` part keeps the `clientSlug === 'avenue-z'` gate** inside its `render` (returns `null` otherwise). This is a data-availability constraint (single Profound account), not a display preference: do not move it to config.
- **View skips the wrapper `<div>` when a part renders `null`** (deliberate deviation from Overview) so a self-nulling part adds no `space-y-8` gap. `SHOW_AI_NARRATIVE` is `false`, so `pr-synopsis` renders `null`; `sentiment-insights` renders `null` for every non-`avenue-z` client.
- **Do not modify** presentational components (`pr-influence-tables.tsx`, `pr-influence-synopsis.tsx`, `synopsis-skeleton.tsx`, `sentiment-insights-section.tsx`, `sentiment-insights.tsx`) or `lib/pr-proof/matchback.ts`.
- **Config key** for this view is the string `'peec-ai:pr-influence'` (viewKey == template key). It already carries commentary's `sharedParts`; body config is additive on the same key.
- **No em dashes or en dashes** in code, comments, or commit messages (dev team convention). Use periods, commas, parentheses, or colons.
- **Test command:** `npx vitest run <path>`; typecheck: `npx tsc --noEmit`.

## File Structure

```
components/report-sections/peec-ai/
  pr-influence.tsx                       # MODIFY: becomes the thin view
  pr-influence/
    ctx.ts                               # CREATE: PrInfluenceCtx + buildPrInfluenceCtx + moved computeOpportunityRows
    template.ts                          # CREATE: PR_INFLUENCE_TEMPLATE
    ctx.snapshot.test.ts                 # CREATE: derivation snapshot (surface B)
    parts/
      registry.ts                        # CREATE: PR_INFLUENCE_PARTS
      pr-synopsis.tsx                     # CREATE
      pr-placement-matchback.tsx          # CREATE
      sentiment-insights.tsx              # CREATE (keeps avenue-z gate)
      editorial-and-clusters.tsx          # CREATE
      brand-absent-editorial.tsx          # CREATE
      __fixtures__/pr-influence-ctx.ts    # CREATE: FIXTURE_PR_INFLUENCE_CTX
      pr-placement-matchback.golden.test.tsx  # CREATE (+ 4 more, one per part)
      composition.golden.test.tsx         # CREATE: surface A (default + avenue-z + hidden override)
      __snapshots__/                      # generated
    guard.test.ts                        # CREATE: CI guard for PR_INFLUENCE_PARTS
lib/report-sections/
  registries.ts                          # MODIFY: add 'peec-ai:pr-influence'
  combined-config.test.ts                # CREATE: validate + resolveSection with sharedParts+body
scripts/
  seed-pr-influence-template.ts          # CREATE: upsert + round-trip assert
```

---

### Task 1: Extract `buildPrInfluenceCtx` (mechanical move) + derivation snapshot

Standalone first commit. Move `computeOpportunityRows` and the RSC body derivation into `ctx.ts`; the view still renders the existing inline JSX, now reading from `ctx.*`. This isolates the un-diffable derivation move from the later composition change, and the snapshot test guards every later step.

**Files:**
- Create: `components/report-sections/peec-ai/pr-influence/ctx.ts`
- Create: `components/report-sections/peec-ai/pr-influence/ctx.snapshot.test.ts`
- Modify: `components/report-sections/peec-ai/pr-influence.tsx`

**Interfaces:**
- Consumes: `computePlacementMatchback` and `MatchbackResult` from `@/lib/pr-proof/matchback` (existing).
- Produces: `type PrInfluenceCtx` and `async function buildPrInfluenceCtx(args: { clientSlug: string; dateRange?: string; models?: AEOModel[] | null }): Promise<PrInfluenceCtx>`.

- [ ] **Step 1: Create `ctx.ts`.**

```ts
// components/report-sections/peec-ai/pr-influence/ctx.ts
import { getPeecOverview } from '@/lib/peec/client'
import type { TrackedPrompt, TopDomain } from '@/lib/peec/client'
import { getDomainCoverage, getUrlCitations, domainPromptIds, avgCitationsByDomain, type DomainCoverage } from '@/lib/peec/url-citations'
import { getPRProofData } from '@/lib/pr-proof/client'
import { computePlacementMatchback, type MatchbackResult } from '@/lib/pr-proof/matchback'
import { ga4Query, parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { isAiSource } from '@/lib/constants'
import { filterDomainRowsByModel } from '@/lib/peec/by-model'
import type { AEOModel } from '@/lib/peec/models'
import type { PRInfluenceSynopsisContext } from '@/lib/peec/pr-influence-synopsis'
import type { TopEditorialDomainRow, BrandAbsentEditorialDomainRow, PromptClusterOpportunityRow } from '../pr-influence-tables'

export type PrInfluenceCtx = {
  clientSlug: string
  dateRange: string
  models: AEOModel[] | null
  synopsisContext: PRInfluenceSynopsisContext
  matchback: MatchbackResult
  totalPlacements: number
  topEditorialRows: TopEditorialDomainRow[]
  opportunityTableRows: PromptClusterOpportunityRow[]
  brandAbsentTableRows: BrandAbsentEditorialDomainRow[]
  hasEditorialDomains: boolean
}

// MOVED VERBATIM from pr-influence.tsx: the `OpportunityRow` type and
// `computeOpportunityRows` function (dev lines 46-134). Paste unchanged.
// <<< paste OpportunityRow + computeOpportunityRows here >>>

export async function buildPrInfluenceCtx(args: {
  clientSlug: string
  dateRange?: string
  models?: AEOModel[] | null
}): Promise<PrInfluenceCtx> {
  const { clientSlug } = args
  const dateRange = args.dateRange ?? 'last_30_days'
  const models = args.models ?? null
  // <<< paste the RSC body derivation (dev lines 139-399) VERBATIM here, EXCEPT:
  //     - use the `dateRange` / `models` locals above (do not re-declare from params)
  //     - keep the `const matchback = computePlacementMatchback(prData?.placements ?? [], urlCitations, models)` call
  //     - end by returning the ctx object below instead of building JSX >>>
  return {
    clientSlug, dateRange, models,
    synopsisContext,
    matchback,
    totalPlacements: prData?.totalPlacements ?? 0,
    topEditorialRows, opportunityTableRows, brandAbsentTableRows,
    hasEditorialDomains: editorialDomains.length > 0,
  }
}
```

The pasted 139-399 block already computes `synopsisContext`, `matchback`, `topEditorialRows`, `opportunityTableRows`, `brandAbsentTableRows`, `editorialDomains`, `prData`. Do not edit any derivation logic, this is a move.

- [ ] **Step 2: Rewire `pr-influence.tsx` to build ctx, render existing JSX from `ctx.*`.**

Replace the derivation body with one call; change the JSX data sources to `ctx.*`:

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
      <PRPlacementMatchbackTable rows={ctx.matchback.rows} totalPlacements={ctx.totalPlacements} placementsCitedByAI={ctx.matchback.citedCount} />
      {clientSlug === 'avenue-z' && (
        <Suspense fallback={<SentimentSkeleton />}>
          <SentimentInsightsSection dateRange={dateRange} models={models} />
        </Suspense>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <TopEditorialDomainsTable rows={ctx.topEditorialRows} />
        <PromptClusterOpportunityMatrix rows={ctx.opportunityTableRows} />
      </div>
      <BrandAbsentEditorialDomainsTable rows={ctx.brandAbsentTableRows} hasEditorialDomains={ctx.hasEditorialDomains} />
    </div>
  )
}
```

Delete now-unused imports/helpers from `pr-influence.tsx` (the moved `computeOpportunityRows`/`OpportunityRow`, and imports only the derivation used: `getPeecOverview`, `getPRProofData`, `computePlacementMatchback`, `ga4Query`/`parseDateRange`/`deriveCompareRange`, `isAiSource`, `getDomainCoverage`/`getUrlCitations`/`domainPromptIds`/`avgCitationsByDomain`, `filterDomainRowsByModel`, `TrackedPrompt`/`TopDomain`/`DomainCoverage`, and `MODEL_DISPLAY_LABELS` if now unused). Keep imports the JSX still references. `tsc` in Step 5 flags leftovers.

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

test('buildPrInfluenceCtx derivation, no model filter', async () => {
  const ctx = await buildPrInfluenceCtx({ clientSlug: 'fixture', dateRange: 'last_30_days', models: null })
  expect(ctx).toMatchSnapshot()
})

test('buildPrInfluenceCtx derivation, active model filter', async () => {
  const ctx = await buildPrInfluenceCtx({ clientSlug: 'fixture', dateRange: 'last_30_days', models: ['ChatGPT'] as never })
  expect(ctx).toMatchSnapshot()
})
```

- [ ] **Step 4: Run the test.**

Run: `npx vitest run components/report-sections/peec-ai/pr-influence/ctx.snapshot.test.ts`
Expected: PASS, writing 2 snapshots. (Before Step 1: FAIL, module `./ctx` not found.)

- [ ] **Step 5: Typecheck.**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: `/verify` the extraction (mandatory, no automated old-vs-new diff for this commit).**

Use the `verify` skill to drive the running PR Influence tab for a Peec-configured client and confirm the sections/content are unchanged from before this commit.

- [ ] **Step 7: Commit.**

```bash
git add components/report-sections/peec-ai/pr-influence/ctx.ts \
        components/report-sections/peec-ai/pr-influence/ctx.snapshot.test.ts \
        components/report-sections/peec-ai/pr-influence/__snapshots__ \
        components/report-sections/peec-ai/pr-influence.tsx
git commit -m "refactor(pr-influence): extract buildPrInfluenceCtx (pure move) plus derivation snapshot"
```

---

### Task 2: Build the five parts, registry, template, and fixture

**Files:**
- Create: `components/report-sections/peec-ai/pr-influence/parts/{pr-synopsis,pr-placement-matchback,sentiment-insights,editorial-and-clusters,brand-absent-editorial}.tsx`
- Create: `components/report-sections/peec-ai/pr-influence/parts/registry.ts`
- Create: `components/report-sections/peec-ai/pr-influence/template.ts`
- Create: `components/report-sections/peec-ai/pr-influence/parts/__fixtures__/pr-influence-ctx.ts`
- Create: 5 x `components/report-sections/peec-ai/pr-influence/parts/<id>.golden.test.tsx`

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
    <PRPlacementMatchbackTable rows={ctx.matchback.rows} totalPlacements={ctx.totalPlacements} placementsCitedByAI={ctx.matchback.citedCount} />
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
  // Profound is a single-account feed. Render only for Avenue Z; null otherwise
  // (so no client without a Profound account ever shows it). Preserves the
  // pre-migration slug gate exactly.
  render: (ctx) => {
    if (ctx.clientSlug !== 'avenue-z') return null
    return (
      <Suspense fallback={<SentimentSkeleton />}>
        <SentimentInsightsSection dateRange={ctx.dateRange} models={ctx.models} />
      </Suspense>
    )
  },
}
```

```tsx
// parts/editorial-and-clusters.tsx
import type { PartImpl } from '@/lib/report-sections/types'
import { TopEditorialDomainsTable, PromptClusterOpportunityMatrix } from '../../pr-influence-tables'
import type { PrInfluenceCtx } from '../ctx'

export const editorialAndClustersV1: PartImpl<PrInfluenceCtx> = {
  id: 'editorial-and-clusters', version: 1, published: true, defaultLabel: 'Editorial Domains and Prompt Clusters',
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

// Order MUST match today's hardcoded PR Influence body sequence (dev lines 412-457).
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
  clientSlug: 'fixture',           // not 'avenue-z' -> sentiment part renders null
  dateRange: 'last_30_days',
  models: null,
  synopsisContext: {
    aiVisibility: 55, aiVisibilityDelta: 4, avgAiPosition: 2.1, avgAiPositionDelta: -0.3,
    totalAiCitations: 1200, totalPlacements: 8, placementsCitedByAI: 5,
    aiReferralSessions: 340, aiReferralSessionsDelta: 12, totalEditorialDomains: 6,
    brandAbsentCount: 3,
    topBrandAbsentDomains: [{ domain: 'example.com', citationCount: 40 }],
    topOpportunityClusters: [{ cluster: 'Pricing', score: 72 }],
  },
  matchback: {
    rows: [
      { outlet: 'Example News', headline: 'Brand in the news', link: 'https://example.com/a', publicationDate: '2025-06-01', citedByAI: true, aiEnginesCiting: ['ChatGPT'] },
    ],
    citedCount: 1,
    totalPlacements: 8,
  },
  totalPlacements: 8,
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

- [ ] **Step 4: Write the five per-part golden tests** (mirror `parts/kpi-cards.golden.test.tsx`). Full code for the special cases; the pure-render parts follow the matchback template with their own id.

```tsx
// parts/pr-placement-matchback.golden.test.tsx  (template for editorial-and-clusters + brand-absent-editorial too)
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
// parts/pr-synopsis.golden.test.tsx  (renders null under SHOW_AI_NARRATIVE=false)
import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PR_INFLUENCE_PARTS } from './registry'
import { FIXTURE_PR_INFLUENCE_CTX } from './__fixtures__/pr-influence-ctx'

test('pr-synopsis@1 renders null under SHOW_AI_NARRATIVE=false', () => {
  const impl = PR_INFLUENCE_PARTS['pr-synopsis'][1]
  const resolved = { id: impl.id, version: impl.version, label: impl.defaultLabel }
  const { container } = render(<TooltipProvider>{impl.render(FIXTURE_PR_INFLUENCE_CTX, resolved)}</TooltipProvider>)
  expect(container.firstChild).toBeNull()
})
```

```tsx
// parts/sentiment-insights.golden.test.tsx  (null off avenue-z; skeleton on avenue-z)
import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PR_INFLUENCE_PARTS } from './registry'
import { FIXTURE_PR_INFLUENCE_CTX } from './__fixtures__/pr-influence-ctx'

const impl = PR_INFLUENCE_PARTS['sentiment-insights'][1]
const resolved = { id: impl.id, version: impl.version, label: impl.defaultLabel }

test('sentiment-insights@1 renders null for a non-avenue-z client', () => {
  const { container } = render(<TooltipProvider>{impl.render(FIXTURE_PR_INFLUENCE_CTX, resolved)}</TooltipProvider>)
  expect(container.firstChild).toBeNull()
})

test('sentiment-insights@1 renders (skeleton fallback) for avenue-z', () => {
  const ctx = { ...FIXTURE_PR_INFLUENCE_CTX, clientSlug: 'avenue-z' }
  const { container } = render(<TooltipProvider>{impl.render(ctx, resolved)}</TooltipProvider>)
  expect(container.textContent).toContain('Sentiment Insights') // SentimentSkeleton header
  expect(container.firstChild).toMatchSnapshot()
})
```

Write `editorial-and-clusters.golden.test.tsx` and `brand-absent-editorial.golden.test.tsx` using the matchback template with their ids (both are pure renders with full content).

- [ ] **Step 5: Run the part golden tests.**

Run: `npx vitest run components/report-sections/peec-ai/pr-influence/parts`
Expected: PASS. Eyeball each snapshot to confirm it reproduces the corresponding section's markup.

- [ ] **Step 6: Typecheck + commit.**

```bash
npx tsc --noEmit
git add components/report-sections/peec-ai/pr-influence/parts components/report-sections/peec-ai/pr-influence/template.ts
git commit -m "feat(pr-influence): add parts, registry, template, fixture plus per-part golden tests"
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
// lib/report-sections/registries.ts, add import + entry
import { PR_INFLUENCE_PARTS } from '@/components/report-sections/peec-ai/pr-influence/parts/registry'
// ...inside REGISTRIES:
  'peec-ai:pr-influence': PR_INFLUENCE_PARTS as unknown as PartRegistry<unknown>,
```

- [ ] **Step 2: Write the guard test.**

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
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck + commit.**

```bash
npx tsc --noEmit
git add lib/report-sections/registries.ts lib/report-sections/combined-config.test.ts components/report-sections/peec-ai/pr-influence/guard.test.ts
git commit -m "feat(report-sections): register pr-influence body registry plus guard and combined-config tests"
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

function renderComposition(ctx: typeof FIXTURE_PR_INFLUENCE_CTX, override: Parameters<typeof resolveSection>[1]) {
  const resolved = resolveSection(PR_INFLUENCE_TEMPLATE, override)
  return render(
    <TooltipProvider>
      <div className="space-y-8">
        {resolved.map((r) => {
          const impl = lookup(PR_INFLUENCE_PARTS, r.id, r.version)
          const node = impl?.render(ctx, r) ?? null
          return node == null ? null : <div key={`${r.id}@${r.version}`}>{node}</div>
        })}
      </div>
    </TooltipProvider>,
  )
}

test('default composition for a non-avenue-z client renders 3 visible parts (synopsis + sentiment null)', () => {
  const { container } = renderComposition(FIXTURE_PR_INFLUENCE_CTX, undefined)
  const spaceY = container.querySelector('.space-y-8')!
  // 5 template parts minus pr-synopsis (SHOW_AI_NARRATIVE=false) minus sentiment (not avenue-z) = 3.
  expect(spaceY.children.length).toBe(3)
  expect(spaceY.firstElementChild?.innerHTML).not.toBe('')
  expect(spaceY).toMatchSnapshot()
})

test('avenue-z renders 4 visible parts (sentiment appears)', () => {
  const ctx = { ...FIXTURE_PR_INFLUENCE_CTX, clientSlug: 'avenue-z' }
  const { container } = renderComposition(ctx, undefined)
  expect(container.querySelector('.space-y-8')!.children.length).toBe(4)
  expect(container.textContent).toContain('Sentiment Insights')
})

test('hidden override drops sentiment-insights even on avenue-z', () => {
  const ctx = { ...FIXTURE_PR_INFLUENCE_CTX, clientSlug: 'avenue-z' }
  const { container } = renderComposition(ctx, { hidden: ['sentiment-insights'] })
  // avenue-z would show 4, but the override removes sentiment before render -> 3.
  expect(container.querySelector('.space-y-8')!.children.length).toBe(3)
  expect(container.textContent).not.toContain('Sentiment Insights')
})
```

- [ ] **Step 2: Run it.**

Run: `npx vitest run components/report-sections/peec-ai/pr-influence/parts/composition.golden.test.tsx`
Expected: PASS, writing 1 snapshot. The assertions prove the empty-wrapper fix (self-nulling parts add no child) and that config `hidden` works independently of the internal avenue-z gate.

- [ ] **Step 3: Refactor `pr-influence.tsx` to the thin view.**

```tsx
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

Delete every now-unused import (`Suspense`, the table components, skeletons, `PRInfluenceSynopsis`, `SentimentInsightsSection`, `SHOW_AI_NARRATIVE`, etc.), they live in the part files now. `tsc` in Step 5 catches leftovers.

- [ ] **Step 4: `/verify` a non-renaissance, non-avenue-z client is unchanged (pre-seed, hits the code fallback).**

Drive the PR Influence tab for a Peec-configured client; confirm identical to before Task 4.

- [ ] **Step 5: Typecheck + section tests + commit.**

```bash
npx tsc --noEmit
npx vitest run components/report-sections/peec-ai
git add components/report-sections/peec-ai/pr-influence.tsx components/report-sections/peec-ai/pr-influence/parts/composition.golden.test.tsx components/report-sections/peec-ai/pr-influence/parts/__snapshots__
git commit -m "refactor(pr-influence): render body via parts template plus composition golden tests"
```

---

### Task 5: Seed the template row (upsert + round-trip assertion)

**Files:**
- Create: `scripts/seed-pr-influence-template.ts`

- [ ] **Step 1: Write the seed script** (mirrors `scripts/seed-section-templates.ts`, upserts, asserts round-trip).

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

  const rows = await db.select().from(sectionTemplates).where(eq(sectionTemplates.sectionSlug, KEY)).limit(1)
  const persisted = parseSectionTemplate(rows[0]?.composition, PR_INFLUENCE_PARTS as never)
  if (JSON.stringify(persisted) !== JSON.stringify(PR_INFLUENCE_TEMPLATE)) {
    throw new Error(`seeded row diverges from PR_INFLUENCE_TEMPLATE:\n  db=${JSON.stringify(persisted)}\n  code=${JSON.stringify(PR_INFLUENCE_TEMPLATE)}`)
  }
  console.log(`Seeded and verified section_templates['${KEY}'].`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Run it against the target DB.**

Run: `npx tsx scripts/seed-pr-influence-template.ts`
Expected: `Seeded and verified section_templates['peec-ai:pr-influence'].` (throws on any divergence).

- [ ] **Step 3: `/verify` after seeding (the production DB-row path).**

Drive the tab for a Peec-configured client and confirm all visible parts render, identical to pre-migration. Confirm avenue-z still shows Sentiment.

- [ ] **Step 4: Commit.**

```bash
git add scripts/seed-pr-influence-template.ts
git commit -m "chore(pr-influence): seed section_templates row with round-trip assertion"
```

---

### Task 6: Final verification

**Files:** none.

- [ ] **Step 1: Full typecheck + tests for the touched areas.**

Run: `npx tsc --noEmit && npx vitest run components/report-sections lib/report-sections`
Expected: all green.

- [ ] **Step 2: `/verify` avenue-z.**

Drive PR Influence as avenue-z: Sentiment Insights renders, all five sections present, order intact.

- [ ] **Step 3: `/verify` renaissance and one other Peec client.**

Drive as renaissance: Sentiment Insights absent (avenue-z gate), the other four sections render, commentary header present (sharedParts preserved). Drive as another Peec client: unchanged from pre-migration.

- [ ] **Step 4: Confirm success criteria + open the PR.**

Check each spec success criterion against results. Then follow the CLAUDE.md merge process: self-review comment, `self-reviewed` label, green checks, and explicit go-ahead from Thomas before any merge to `main`. This branch targets `dev`; confirm the intended integration target with Thomas.

---

## Self-Review

- **Spec coverage:** Approach (Tasks 1-4), five body parts + combined grid (Task 2), fixed chrome + empty-wrapper fix (Tasks 1, 4), framework wiring incl. the verified `resolveSection`/`validate.ts` split + regression tests (Task 3), template seed + round-trip source-of-truth (Task 5), both parity surfaces A (Task 4) + B (Task 1) with the residual-risk `/verify` (Tasks 1, 4-6). Divergence from the original spec (dev already hides Sentiment from renaissance via the avenue-z gate; matchback already extracted) is documented in the Re-baseline note; the renaissance config write is intentionally dropped as a no-op, and that decision is recorded here rather than applied silently. The combined-config `hidden: ['sentiment-insights']` test still demonstrates the per-client capability the migration delivers.
- **Placeholder scan:** the only intentional "paste verbatim" is the mechanical move in Task 1 (`computeOpportunityRows` + dev lines 139-399); reproducing it inline would invite drift, so the instruction is to copy existing code unchanged. All other steps carry complete code.
- **Type consistency:** part export names (`prSynopsisV1`, `prPlacementMatchbackV1`, `sentimentInsightsV1`, `editorialAndClustersV1`, `brandAbsentEditorialV1`), ids, `PrInfluenceCtx` fields (`matchback`, `models`, `totalPlacements`, row arrays), and `PR_INFLUENCE_PARTS`/`PR_INFLUENCE_TEMPLATE` are consistent across tasks. `matchback: MatchbackResult` matches `lib/pr-proof/matchback.ts`; `SentimentInsightsSection({ dateRange, models })` and `PRInfluenceSynopsis({ clientSlug, dateRange, context })` match dev signatures; row types match `pr-influence-tables.tsx`.
