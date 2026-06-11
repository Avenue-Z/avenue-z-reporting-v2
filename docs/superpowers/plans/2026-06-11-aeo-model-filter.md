# AEO Model Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sticky, checkbox-based "AI model" filter to the **PR Influence** and **Content Impact** tabs of the Answer Engine Optimization section. Selecting a subset of models (ChatGPT, Perplexity, Gemini, Claude, Copilot, Google) filters the AI-citation data shown on those tabs.

**Architecture:** Mirror the existing `?dateRange=` + `?compareRange=` URL-sticky pattern proven in PRs #27/#29. Add a new `?models=` query param (comma-separated). A new `ModelFilter` UI primitive (Popover with checkboxes, styled like the date picker) lives in the sticky report header for these two tabs only. The selected models propagate through `page.tsx` → tab RSCs → tables. The backend already fetches per-model breakdowns of brand + domain metrics via `dimensions: ['model_channel_id']`; we expose this as a structured "by-model" dataset on the `PeecOverview` type and filter client-side. GA4 page traffic data has no AI-model dimension and is left untouched (with a one-line disclaimer on the affected KPI cards).

**Tech Stack:** Next.js 15 App Router · React Server Components · TypeScript strict · Tailwind v4 · shadcn/ui (`Popover`, `Button`) · existing patterns from PRs #27/#28/#29.

**Spec (verbatim from Thomas):**
> PR Influence Tab — Add a page filter for model selection (i.e. ChatGPT only, Gemini + Perplexity, etc. checkboxes)
> Content Impact Tab — Add a page filter for model selection (i.e. ChatGPT only, Gemini + Perplexity, etc. checkboxes)

**Branch:** `feat/aeo-model-filter` · **Base:** `main` (currently at `a3f6f75`)

---

## Locked-in defaults (decisions made, no further clarification needed)

1. **URL param shape:** `?models=ChatGPT,Gemini` (comma-separated, canonical model names — same casing as `MODEL_COLORS`).
2. **Default state:** All 6 models active. URL param is **omitted** when all 6 are selected (= no filter). Param is present only when a strict subset is selected.
3. **Stickiness:** AEO sub-tab navigation only (same scope as `dateRange`/`compareRange`). Mirrored through `components/layout/sidebar.tsx`. Leaving AEO and returning drops the filter — matches existing behavior for the other two params.
4. **Where the filter appears:** Sticky report header, immediately to the right of the date picker. Visible only on `?section=peec-ai&subsection=pr-influence` and `?section=peec-ai&subsection=content-impact`. **Not** on Overview, Technical Performance, GA4, or any non-AEO section.
5. **Filter scope per table** (locked in based on data availability — see "What filters and what doesn't" below).

---

## What filters and what doesn't (data reality)

| Surface | Filter affects? | Why |
|---|---|---|
| **PR Influence KPI: AI Visibility %** | YES | Recomputed from filtered `llmBreakdown` (visibility weighted by selected models). |
| **PR Influence KPI: Avg AI Position** | YES | Recomputed from filtered `llmBreakdown.position` (avg of selected). |
| **PR Influence KPI: # AI Citations** | YES | Recomputed from per-model domain citation breakdown (new derived dataset). |
| **PR Influence KPI: PR Placements Cited by AI** | YES | Per-placement `aiEnginesCiting` field intersected with selected models. |
| **PR Influence KPI: AI Referral Sessions** | NO | GA4 has no model dimension. Card shows total. Subtitle note added: "across all AI engines". |
| **PR Influence KPI: Editorial Share Brand Absent** | YES | Recomputed from filtered editorial-domain citations. |
| **PR Influence: PR Placement Matchback table** | YES | Filter rows by `aiEnginesCiting` ∩ selected. Recompute summary counters. |
| **PR Influence: Top Editorial Domains table** | YES | Citation counts recomputed from new per-model domain breakdown. |
| **PR Influence: Brand-Absent Editorial Domains table** | YES | Same — uses per-model domain breakdown. |
| **PR Influence: Prompt Cluster Opportunity Matrix** | YES | `brandCitationRate` + `competitorPresence` recomputed from per-model data. |
| **PR Influence: Next Pitch Opportunities** | YES | Derived from the above; cascades. |
| **Content Impact KPI strip (8 cards)** | MIXED | Peec-derived cards filter; GA4-derived cards don't (subtitle note). |
| **Content Impact: Planned Content Performance** | NO | GA4 + content-calendar driven. No model dimension. |
| **Content Impact: Owned Content Cited table** | YES | Per-model domain breakdown. |
| **Content Impact: Bot-Attention-No-Citations** | YES | Bot data already per-model (`botId → modelName` map). |
| **Content Impact: Competitor Domains Cited** | YES | Per-model domain breakdown. |
| **Content Impact: Competitor URLs Brand Absent** | YES | Per-model domain breakdown. |
| **Content Impact: AI Systems Interacting** | YES | Bot data already per-model. |
| **Content Impact: Content Team Recommendations** | YES | Derived from filtered upstream. |
| **Content Impact: Traffic/Citations comparison tables** | NO (demo only today) | Demo data — leave as-is. |

**Empty state:** If user unchecks all 6 boxes, treat as "all selected" (= no filter applied). Don't show an empty dashboard.

---

## What already exists (DO NOT REDO)

| Path | Purpose | Reuse for this feature |
|---|---|---|
| `components/ui/popover.tsx` | shadcn Popover wrapper (uses Radix Portal) | Build the model-filter Popover on this. |
| `components/ui/tooltip.tsx`, `components/ui/info-tooltip.tsx` | Tooltip primitives from PR #28 | Reuse for column tooltips. |
| `components/report-sections/ga4/date-picker.tsx` | URL-writing date picker, single atomic `router.push` | **Reference implementation** for the ModelFilter's URL-write logic. |
| `components/layout/sidebar.tsx:486–530` | AEO sub-tab link builder; already forwards `dateRange` + `compareRange` | Add `models` forwarding alongside. |
| `app/dashboard/[clientSlug]/reports/page.tsx:132–160` | Reads URL params + renders sticky header pickers | Add `models` parsing + ModelFilter render. |
| `lib/peec/client.ts:351–362` | `Promise.all` calls with `/reports/domains` and `/reports/brands` including `dimensions: ['model_channel_id']` | Per-model raw data is **already being fetched**. We surface it in a usable shape. |
| `components/report-sections/peec-ai/llm-breakdown-table.tsx:8–15` | `MODEL_COLORS` (the canonical 6-model list) | Lift into `lib/peec/models.ts` for reuse. |
| `components/report-sections/peec-ai/pr-influence.tsx` + `pr-influence-tables.tsx` | The tab being filtered | Add filter wiring. |
| `components/report-sections/peec-ai/content-impact.tsx` + `content-impact-tables.tsx` | The other tab being filtered | Add filter wiring. |

---

## File structure

```
NEW:
  lib/peec/models.ts                                          # Canonical 6-model list + helpers
  components/report-sections/peec-ai/model-filter.tsx         # The Popover + checkbox UI
  lib/peec/by-model.ts                                        # Derives per-model domain/brand datasets from existing fetches

MODIFY:
  lib/peec/client.ts                                          # Add per-model derived fields to PeecOverview return
  components/layout/sidebar.tsx                               # Forward ?models= on AEO sub-tab links
  app/dashboard/[clientSlug]/reports/page.tsx                 # Read ?models=, render <ModelFilter> in sticky header
  components/report-sections/peec-ai/pr-influence.tsx         # Accept models prop, filter data
  components/report-sections/peec-ai/pr-influence-tables.tsx  # Filter rows by selected models where data supports it
  components/report-sections/peec-ai/content-impact.tsx       # Accept models prop, filter data
  components/report-sections/peec-ai/content-impact-tables.tsx# Filter rows by selected models where data supports it
```

**No new test files.** No test framework is wired for these UI files (confirmed in the prior 2026-06-09 plan). Verification step is `next build` + `eslint` + manual QA on Vercel preview — same pattern as PRs #27/#28/#29.

---

## Verification commands (used at every "Verify" step)

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint <touched paths>
```

Acceptable lint baseline: 2 pre-existing errors on main (`peec-ai/index.tsx:199` apostrophe, `sidebar.tsx:418` `any` cast). Any NEW error = fix before commit.

---

## Phase 1 — Canonical models module (no UI yet)

### Task 1.1: Create `lib/peec/models.ts`

**Files:**
- Create: `lib/peec/models.ts`

- [ ] **Step 1: Write the file**

```ts
// lib/peec/models.ts
/** Canonical AI model identifiers — used for filtering, color coding, and URL params. */
export const AEO_MODELS = ['ChatGPT', 'Perplexity', 'Gemini', 'Claude', 'Copilot', 'Google'] as const

export type AEOModel = (typeof AEO_MODELS)[number]

export const MODEL_COLORS: Record<AEOModel, string> = {
  ChatGPT:    '#10A37F',
  Perplexity: '#26C7C8',
  Gemini:     '#4285F4',
  Claude:     '#CC785C',
  Copilot:    '#0078D4',
  Google:     '#34A853',
}

/** Parse `?models=ChatGPT,Gemini` → canonical subset. Returns null when no filter is active
 *  (param missing, empty, or contains all 6 — treat all of those as "no filter"). */
export function parseModelsParam(raw: string | null | undefined): AEOModel[] | null {
  if (!raw) return null
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean)
  const valid = parts.filter((p): p is AEOModel => (AEO_MODELS as readonly string[]).includes(p))
  if (valid.length === 0) return null
  if (valid.length === AEO_MODELS.length) return null
  return Array.from(new Set(valid))
}

/** Serialize a subset back to URL form. Returns null when no filter should be written. */
export function serializeModelsParam(selected: AEOModel[]): string | null {
  if (selected.length === 0) return null
  if (selected.length === AEO_MODELS.length) return null
  const ordered = AEO_MODELS.filter((m) => selected.includes(m))
  return ordered.join(',')
}

/** Returns true when no filter is active (all models effectively selected). */
export function isAllModels(selected: AEOModel[] | null): boolean {
  return selected === null || selected.length === 0 || selected.length === AEO_MODELS.length
}
```

- [ ] **Step 2: Verify typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: zero output.

- [ ] **Step 3: Commit**

```bash
git add lib/peec/models.ts
git commit -m "feat(aeo): add canonical models module (parseModelsParam, MODEL_COLORS lifted)"
```

### Task 1.2: Migrate existing `MODEL_COLORS` usages to the shared module

**Files:**
- Modify: `components/report-sections/peec-ai/llm-breakdown-table.tsx` (replace inline `MODEL_COLORS` with import from `@/lib/peec/models`)
- Modify: `components/report-sections/profound-ai/llm-breakdown-table.tsx` (same)

- [ ] **Step 1: Edit `peec-ai/llm-breakdown-table.tsx`**

Replace the inline `const MODEL_COLORS: Record<string, string> = { ... }` block (currently lines 8-15) with:

```ts
import { MODEL_COLORS } from '@/lib/peec/models'
```

- [ ] **Step 2: Edit `profound-ai/llm-breakdown-table.tsx`**

Same replacement — remove inline declaration, add the import.

- [ ] **Step 3: Verify**

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint components/report-sections/peec-ai/llm-breakdown-table.tsx components/report-sections/profound-ai/llm-breakdown-table.tsx`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add components/report-sections/peec-ai/llm-breakdown-table.tsx components/report-sections/profound-ai/llm-breakdown-table.tsx
git commit -m "refactor(aeo): use shared MODEL_COLORS from lib/peec/models"
```

---

## Phase 2 — Backend: surface per-model derived data

`getPeecOverview` already fetches `/reports/domains` and `/reports/brands` with `dimensions: ['model_channel_id']` (lines 360-361 of `lib/peec/client.ts`). The raw response rows include `model_channel.id`. We currently roll these up into `llmBreakdown` (one row per model). To enable filtering on domain/brand tables, we add a NEW derived shape: per-domain-by-model citation counts and per-brand-by-model visibility.

### Task 2.1: Define `ByModel<T>` shape + add to `PeecOverview`

**Files:**
- Create: `lib/peec/by-model.ts`
- Modify: `lib/peec/client.ts` (extend `PeecOverview` type, populate the new fields)

- [ ] **Step 1: Write `lib/peec/by-model.ts`**

```ts
// lib/peec/by-model.ts
import type { AEOModel } from './models'

/** Maps an entity key (e.g. domain string) → per-model citation/visibility count. */
export type ByModel<K extends string = string, V = number> = Record<K, Partial<Record<AEOModel, V>>>

/** Sum the per-model values for a given key, restricted to the selected models.
 *  When `selected` is null, sums across all models. */
export function sumByModel<K extends string, V extends number>(
  byModel: ByModel<K, V>,
  key: K,
  selected: readonly AEOModel[] | null,
): number {
  const entry = byModel[key]
  if (!entry) return 0
  if (selected === null) {
    return Object.values(entry).reduce<number>((acc, v) => acc + (v ?? 0), 0)
  }
  return selected.reduce<number>((acc, m) => acc + (entry[m] ?? 0), 0)
}

/** Average the per-model values for a given key, restricted to the selected models. */
export function avgByModel<K extends string, V extends number>(
  byModel: ByModel<K, V>,
  key: K,
  selected: readonly AEOModel[] | null,
): number {
  const entry = byModel[key]
  if (!entry) return 0
  const models = selected ?? (Object.keys(entry) as AEOModel[])
  const vals = models.map((m) => entry[m]).filter((v): v is V => typeof v === 'number')
  if (vals.length === 0) return 0
  return vals.reduce<number>((a, b) => a + b, 0) / vals.length
}
```

- [ ] **Step 2: Extend `PeecOverview` in `lib/peec/client.ts`**

Locate the `PeecOverview` type definition. Add two new optional fields:

```ts
/** Per-domain citation counts broken out by AI model. Built from the per-model
 *  domain fetch already done for llmBreakdown. */
domainCitationsByModel: ByModel<string, number>
/** Per-brand visibility scores broken out by AI model. */
brandVisibilityByModel: ByModel<string, number>
```

Import `ByModel` from `'./by-model'`.

- [ ] **Step 3: Populate them in `getPeecOverviewImpl`**

Inside `getPeecOverviewImpl`, after the existing `Promise.all` resolves the per-model domain + brand responses, build the two `ByModel` records by iterating the raw rows. Use `normalizeSource(row.model_channel?.id)` (existing helper at `client.ts:447`) to map raw IDs to canonical `AEOModel` names. Skip rows where the model can't be normalized.

Pseudo (write the real version inline using the actual variable names you find when reading the file):

```ts
const domainCitationsByModel: ByModel<string, number> = {}
for (const row of perModelDomainRows) {
  const model = normalizeSource(row.model_channel?.id)
  if (!model) continue
  const domain = row.domain // adjust to actual field name
  if (!domainCitationsByModel[domain]) domainCitationsByModel[domain] = {}
  domainCitationsByModel[domain][model as AEOModel] =
    (domainCitationsByModel[domain][model as AEOModel] ?? 0) + (row.citations ?? 0)
}
// brandVisibilityByModel built the same way from perModelBrandRows
```

Return both on the `PeecOverview` object.

- [ ] **Step 4: Verify**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: zero errors. If the build complains about row field names, read the actual `ApiDomainRow` / `ApiBrandRow` types in `client.ts` and adjust.

- [ ] **Step 5: Commit**

```bash
git add lib/peec/by-model.ts lib/peec/client.ts
git commit -m "feat(aeo): surface per-model domain + brand citations on PeecOverview"
```

---

## Phase 3 — URL plumbing (sticky `?models=` param)

### Task 3.1: Read `?models=` in `page.tsx` and pass to AEO tabs

**Files:**
- Modify: `app/dashboard/[clientSlug]/reports/page.tsx`

- [ ] **Step 1: Add the URL parse**

Near the existing `const dateRange = …` line (around `page.tsx:132`), add:

```ts
import { parseModelsParam } from '@/lib/peec/models'
// ... existing imports ...

const modelsParam = typeof searchParams.models === 'string' ? searchParams.models : undefined
const models = parseModelsParam(modelsParam)
```

- [ ] **Step 2: Pass `models` to PR Influence and Content Impact tab components**

Find where `<PRInfluenceReport ... />` and `<ContentImpactReport ... />` are rendered. Add the `models={models}` prop to each.

- [ ] **Step 3: Verify**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: TS errors at the two render sites until we extend the component props in Phase 5. **Leave the errors for now** — they'll be fixed in Phase 5. Don't commit yet — bundle this with Task 3.2.

### Task 3.2: Forward `?models=` through sidebar AEO links

**Files:**
- Modify: `components/layout/sidebar.tsx`

Mirror the existing `dateRange` + `compareRange` plumbing. Four edits, exactly the same pattern as PR #29:

- [ ] **Step 1: Edit the Sidebar wrapper invocation (~line 109)**

After `compareRange={searchParams.get('compareRange')}`, add:

```tsx
models={searchParams.get('models')}
```

- [ ] **Step 2: Add `models` to `ClientSidebar` props (~line 326 + 338)**

In the destructured params block: `models,` after `compareRange,`.
In the TS type block: `models: string | null` after `compareRange: string | null`.

- [ ] **Step 3: Forward in AEO base link (~line 492)**

After `if (compareRange) aeoBaseParams.set('compareRange', compareRange)`, add:

```ts
if (models) aeoBaseParams.set('models', models)
```

- [ ] **Step 4: Forward in AEO sub-tab links (~line 527)**

After `if (compareRange) subParams.set('compareRange', compareRange)`, add:

```ts
if (models) subParams.set('models', models)
```

- [ ] **Step 5: Verify**

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint components/layout/sidebar.tsx`
Expected: zero new errors. (Pre-existing `any` cast at line 418 remains.)

- [ ] **Step 6: Commit (combined with 3.1)**

```bash
git add app/dashboard/[clientSlug]/reports/page.tsx components/layout/sidebar.tsx
git commit -m "feat(aeo): plumb ?models= URL param through page.tsx and sidebar"
```

(Acceptable to have leftover TS errors at the tab-component render sites — Phase 5 fixes them.)

---

## Phase 4 — ModelFilter UI primitive

### Task 4.1: Create `components/report-sections/peec-ai/model-filter.tsx`

**Files:**
- Create: `components/report-sections/peec-ai/model-filter.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client'

import { useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { ChevronDown, Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { AEO_MODELS, MODEL_COLORS, serializeModelsParam, type AEOModel } from '@/lib/peec/models'
import { cn } from '@/lib/utils'

export function ModelFilter({ selected }: { selected: AEOModel[] | null }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Treat null (no filter) as all-selected in the UI.
  const effectiveSelected: AEOModel[] = selected ?? Array.from(AEO_MODELS)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<AEOModel[]>(effectiveSelected)

  const handleOpenChange = (next: boolean) => {
    if (next) setPending(effectiveSelected)
    setOpen(next)
  }

  const toggle = (m: AEOModel) => {
    setPending((cur) =>
      cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]
    )
  }

  const handleApply = () => {
    const params = new URLSearchParams(searchParams.toString())
    const serialized = serializeModelsParam(pending)
    if (serialized) params.set('models', serialized)
    else params.delete('models')
    router.push(`${pathname}?${params.toString()}`)
    setOpen(false)
  }

  const handleSelectAll = () => setPending(Array.from(AEO_MODELS))
  const handleClear = () => setPending([])

  const isFiltered = selected !== null
  const label = isFiltered
    ? `${effectiveSelected.length}/${AEO_MODELS.length} models`
    : 'All models'

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-9 gap-2 border-white/[0.08] bg-bg-surface text-xs font-semibold text-white hover:bg-white/[0.06]',
            isFiltered && 'ring-1 ring-[#60FDFF]/40'
          )}
        >
          {label}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-64 rounded-md border border-white/[0.08] bg-bg-surface p-2 shadow-xl"
      >
        <div className="px-2 pb-2 pt-1 text-[10px] font-bold uppercase tracking-widest text-text-muted">
          AI Model
        </div>
        <ul className="space-y-px">
          {AEO_MODELS.map((m) => {
            const checked = pending.includes(m)
            return (
              <li key={m}>
                <button
                  type="button"
                  onClick={() => toggle(m)}
                  className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-sm text-white hover:bg-white/[0.04]"
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border',
                      checked ? 'border-transparent bg-[#60FDFF]' : 'border-white/30 bg-transparent'
                    )}
                  >
                    {checked && <Check className="h-3 w-3 text-bg-canvas" strokeWidth={3} />}
                  </span>
                  <span
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: MODEL_COLORS[m] }}
                  />
                  <span className="flex-1">{m}</span>
                </button>
              </li>
            )
          })}
        </ul>
        <div className="mt-2 flex items-center justify-between border-t border-white/[0.06] pt-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-[11px] text-text-muted hover:text-white"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="text-[11px] text-text-muted hover:text-white"
            >
              Clear
            </button>
          </div>
          <Button size="sm" className="h-7 px-3 text-xs" onClick={handleApply}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
```

- [ ] **Step 2: Verify**

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint components/report-sections/peec-ai/model-filter.tsx`
Expected: zero errors.

- [ ] **Step 3: Render the filter in `page.tsx`**

In `app/dashboard/[clientSlug]/reports/page.tsx`, inside the existing `<StickyReportHeader>` block, add a new sibling renderer for the AEO sub-tabs that need it:

```tsx
{activeSection === 'peec-ai'
  && (subsection === 'pr-influence' || subsection === 'content-impact') && (
  <Suspense fallback={null}>
    <ModelFilter selected={models} />
  </Suspense>
)}
```

Import: `import { ModelFilter } from '@/components/report-sections/peec-ai/model-filter'`.

- [ ] **Step 4: Verify**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: still has the leftover Phase 3 errors at the tab-render sites (`models` prop unknown). Phase 5 fixes.

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/peec-ai/model-filter.tsx app/dashboard/[clientSlug]/reports/page.tsx
git commit -m "feat(aeo): add ModelFilter Popover + render it for PR Influence and Content Impact"
```

---

## Phase 5 — Apply filter on PR Influence tab

### Task 5.1: Extend `PRInfluenceReport` props and thread `models` through

**Files:**
- Modify: `components/report-sections/peec-ai/pr-influence.tsx`

- [ ] **Step 1: Add `models` to the prop signature (~line 167)**

```tsx
import type { AEOModel } from '@/lib/peec/models'

export async function PRInfluenceReport({
  clientSlug,
  dateRange = 'last_30_days',
  demoMode = false,
  models,
}: {
  clientSlug: string
  dateRange?: string
  demoMode?: boolean
  models?: AEOModel[] | null
})
```

- [ ] **Step 2: Use `models` when computing KPI values**

After the existing `Promise.allSettled` block, locate where the 6 KPI cards' values are computed. Recompute the affected three (AI Visibility %, Avg AI Position, # AI Citations) using `peecData.brandVisibilityByModel`, `peecData.llmBreakdown` filtered by `models`, and `peecData.domainCitationsByModel`. Reference the existing logic to keep the math semantics.

Example — AI Visibility %:

```ts
const visibilityByModel = peecData?.llmBreakdown ?? []
const filteredLLM = models
  ? visibilityByModel.filter((row) => models.includes(row.model as AEOModel))
  : visibilityByModel
const aiVisibilityPct = filteredLLM.length > 0
  ? filteredLLM.reduce((s, r) => s + r.visibility, 0) / filteredLLM.length
  : 0
```

Apply parallel logic to Avg AI Position and # AI Citations.

- [ ] **Step 3: Filter PR Placement Matchback rows**

Find where `prPlacementRows` is built (search for `aiEnginesCiting`). When `models` is set, filter:

```ts
const filteredPRRows = models
  ? prPlacementRows.filter((r) => {
      const engines = r.aiEnginesCiting.split(',').map((e) => e.trim())
      return engines.some((e) => models.includes(e as AEOModel))
    })
  : prPlacementRows
```

Pass `filteredPRRows` to `<PRPlacementMatchbackTable rows={...} />`. Recompute `totalPlacements` and `placementsCitedByAI` from the filtered set.

- [ ] **Step 4: Filter editorial-domain tables**

For `TopEditorialDomainsTable`, `BrandAbsentEditorialDomainsTable`, and the prompt-cluster matrix:

```ts
import { sumByModel } from '@/lib/peec/by-model'

const editorialRows = baseEditorialRows.map((row) => ({
  ...row,
  citationCount: sumByModel(peecData.domainCitationsByModel, row.domain, models ?? null),
}))
// re-sort by citationCount; drop rows whose filtered count is 0
const visibleEditorial = editorialRows
  .filter((r) => r.citationCount > 0)
  .sort((a, b) => b.citationCount - a.citationCount)
```

Apply the same pattern to `brandAbsentRows` and the prompt-cluster matrix's `editorialCitationDensity` field.

- [ ] **Step 5: AI Referral Sessions subtitle note**

Find the AI Referral Sessions KpiCard. Add `subtitle="across all AI engines"` (or extend its existing subtitle) when `models !== null`, so the user knows this card isn't filtered.

- [ ] **Step 6: Verify**

Run:
```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint components/report-sections/peec-ai/pr-influence.tsx
```
Expected: zero new errors.

- [ ] **Step 7: Commit**

```bash
git add components/report-sections/peec-ai/pr-influence.tsx
git commit -m "feat(aeo/pr-influence): apply model filter to KPIs + tables"
```

### Task 5.2: Update `pr-influence-tables.tsx` if any table needs per-model awareness

**Files:**
- Modify: `components/report-sections/peec-ai/pr-influence-tables.tsx`

- [ ] **Step 1: Audit which tables already get pre-filtered data from the RSC**

Open the file. Confirm that each exported table takes its `rows` prop and renders them as-is (no internal aggregation across models). If yes — no changes needed; the RSC-side filter from Task 5.1 already handles everything.

- [ ] **Step 2: If any table internally aggregates** (e.g. computes its own "Total citations" from `rows`), confirm the sum/avg now reflects only filtered rows. Add a small note column or subtitle if a row's `citationCount` could legitimately be 0 due to filtering (vs the row not existing).

- [ ] **Step 3: Verify**

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint components/report-sections/peec-ai/pr-influence-tables.tsx`
Expected: zero new errors.

- [ ] **Step 4: Commit (if any changes were made)**

```bash
git add components/report-sections/peec-ai/pr-influence-tables.tsx
git commit -m "fix(aeo/pr-influence): adjust table aggregates to respect model filter"
```

If no changes needed, skip this commit.

---

## Phase 6 — Apply filter on Content Impact tab

### Task 6.1: Extend `ContentImpactReport` props and thread `models` through

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact.tsx`

- [ ] **Step 1: Add `models` to the prop signature (~line 171)**

```tsx
import type { AEOModel } from '@/lib/peec/models'

export async function ContentImpactReport({
  clientSlug,
  dateRange,
  demoMode = false,
  models,
}: {
  clientSlug: string
  dateRange?: string
  demoMode?: boolean
  models?: AEOModel[] | null
})
```

- [ ] **Step 2: Filter Owned Content Cited, Competitor Domains Cited, Competitor URLs Brand Absent**

Same pattern as PR Influence: recompute the `citationCount` for each row via `sumByModel(peecData.domainCitationsByModel, row.domain, models ?? null)`. Drop rows with 0 filtered citations and re-sort.

- [ ] **Step 3: Filter bot-data tables (AI Systems Interacting, Bot-Attention-No-Citations)**

The bot data already has `botId` / `botName` identifying the model. Add a `botToModel` mapping helper inline or in `lib/peec/by-model.ts`:

```ts
const BOT_TO_MODEL: Record<string, AEOModel> = {
  GPTBot: 'ChatGPT',
  ClaudeBot: 'Claude',
  PerplexityBot: 'Perplexity',
  // …extend with actual botId values found in agentData.bots
}
```

Then filter `agentData.bots`:

```ts
const filteredBots = models
  ? agentData.bots.filter((b) => {
      const m = BOT_TO_MODEL[b.botId]
      return m ? models.includes(m) : false
    })
  : agentData.bots
```

Pass filtered bots to `AISystemsInteractingTable` and `BotAttentionNoCitationsTable`. Adjust `visitsByBot` sums similarly.

- [ ] **Step 4: KPI strip — distinguish GA4 cards from Peec cards**

Find the 8 KPI cards. For each, decide: is it derived from Peec/agent data (filter applies) or GA4 (filter doesn't apply)? When `models !== null`, add a subtle subtitle `"across all AI engines"` to the GA4-derived cards. Leave Peec/agent-derived cards as-is (their values already reflect the filter).

- [ ] **Step 5: Leave demo-only tables alone**

Per the table in "What filters and what doesn't" above, do NOT touch `RepeatedCompetitorPagesTable`, `TrafficNoCitationsTable`, `CitationsLittleTrafficTable`, or `PlannedContentPerformanceTable`. They use GA4 / demo data and cannot be filtered by model.

- [ ] **Step 6: Verify**

Run:
```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint components/report-sections/peec-ai/content-impact.tsx
```
Expected: zero new errors.

- [ ] **Step 7: Commit**

```bash
git add components/report-sections/peec-ai/content-impact.tsx
git commit -m "feat(aeo/content-impact): apply model filter to KPIs, citation tables, and bot tables"
```

### Task 6.2: Update `content-impact-tables.tsx` if needed

**Files:**
- Modify: `components/report-sections/peec-ai/content-impact-tables.tsx`

- [ ] **Step 1: Audit** the same way as Task 5.2 — confirm tables render rows as-is.

- [ ] **Step 2: If any table internally aggregates**, adjust.

- [ ] **Step 3: Verify and commit if changes made.**

---

## Phase 7 — End-to-end verification + ship

### Task 7.1: Full build + lint

- [ ] **Step 1: Lint touched files**

```bash
./node_modules/.bin/eslint \
  lib/peec/models.ts \
  lib/peec/by-model.ts \
  lib/peec/client.ts \
  components/layout/sidebar.tsx \
  'app/dashboard/[clientSlug]/reports/page.tsx' \
  components/report-sections/peec-ai/model-filter.tsx \
  components/report-sections/peec-ai/pr-influence.tsx \
  components/report-sections/peec-ai/pr-influence-tables.tsx \
  components/report-sections/peec-ai/content-impact.tsx \
  components/report-sections/peec-ai/content-impact-tables.tsx \
  components/report-sections/peec-ai/llm-breakdown-table.tsx \
  components/report-sections/profound-ai/llm-breakdown-table.tsx
```
Expected: zero NEW errors. (Pre-existing baseline OK.)

- [ ] **Step 2: Typecheck**

```bash
./node_modules/.bin/tsc --noEmit
```
Expected: zero output.

- [ ] **Step 3: Push and open PR**

```bash
git push -u origin feat/aeo-model-filter
gh pr create --title "feat(aeo): add AI model filter to PR Influence + Content Impact" \
  --body "$(cat docs/superpowers/plans/2026-06-11-aeo-model-filter.md | head -30)"
```

### Task 7.2: Manual QA on Vercel preview

- [ ] **Step 1: Open the preview URL from PR description.**
- [ ] **Step 2: Navigate to PR Influence. Click the new "All models" button — verify the Popover opens with all 6 checked.**
- [ ] **Step 3: Uncheck Claude + Copilot, click Apply. URL should now contain `?models=ChatGPT,Perplexity,Gemini,Google`. The 3 affected KPIs should change. The PR Matchback table should drop rows whose `aiEnginesCiting` is only Claude or Copilot.**
- [ ] **Step 4: Switch to Content Impact sub-tab.** URL should preserve `?models=...`. The filter button should still show "4/6 models". Citation tables should reflect the filter.
- [ ] **Step 5: Switch back to Overview sub-tab.** The filter button should NOT render (not on Overview). URL still contains `?models=...` (sticky). Switch back to PR Influence — filter still applied.
- [ ] **Step 6: Click "Select all" then Apply.** URL should drop `?models=` entirely. UI returns to all-models state.
- [ ] **Step 7: Refresh the browser with `?models=ChatGPT` in URL.** Filter state should persist (only ChatGPT checked).

### Task 7.3: Merge + document outcome

- [ ] **Step 1: Merge PR after QA passes.**
- [ ] **Step 2: Verify Vercel Production deploys clean.**
- [ ] **Step 3: Append an "Outcome" section to this plan file** documenting:
  - PR # and merge SHA
  - Files added/modified
  - Any deferred items
  - Lint baseline state

```bash
git add docs/superpowers/plans/2026-06-11-aeo-model-filter.md
git commit -m "docs: record outcome of 2026-06-11-aeo-model-filter plan"
git push
```

---

## Spec coverage check

| Spec item | Task | Status |
|---|---|---|
| "PR Influence Tab — Add a page filter for model selection (checkboxes)" | Phase 4 (UI) + Phase 5 (apply) | ✅ Covered |
| "Content Impact Tab — Add a page filter for model selection (checkboxes)" | Phase 4 (UI) + Phase 6 (apply) | ✅ Covered |
| "ChatGPT only, Gemini + Perplexity, etc." (arbitrary subsets allowed) | Task 4.1 (checkbox UI allows any subset) | ✅ Covered |
| Implicit: filter is discoverable + stateful | Task 4.1 (button label shows "N/6 models", ring when active) + Task 3.x (URL sticky) | ✅ Covered |
| Implicit: filter persists across sub-tab nav | Task 3.2 (sidebar forwarding) | ✅ Covered |

---

## Risks & mitigations

- **Backend row-field assumptions in Task 2.3.** The plan pseudo-code uses `row.domain` and `row.citations`. The real field names in `ApiDomainRow` and `ApiBrandRow` may differ — the engineer must open `lib/peec/client.ts` and use the actual property names. If the row shape doesn't include a citation count, the agent assigned to Task 2.3 must report back before committing.
- **`BOT_TO_MODEL` map is illustrative.** The engineer assigned to Task 6.3 must inspect `agentData.bots[].botId` values in real or demo data and produce the complete real mapping before applying the filter.
- **GA4 cards stay unfiltered.** Documented as a non-goal here. If Thomas later wants GA4 referrer-based segmentation (e.g. "AI Referral Sessions from chatgpt.com only"), that's a follow-up — not in scope.
- **Demo mode.** Demo data may not include `model_channel` IDs. In demo mode, the filter may be a no-op or may filter to nothing. Acceptable for v1; real data drives the QA pass.

---

## Open follow-ups (deferred — not in scope for this PR)

- GA4 referrer-domain-based model segmentation (would require mapping each `AI_REFERRER_DOMAINS` entry to an `AEOModel`).
- Per-prompt filtering and date-range coupling (the model filter currently operates over the YTD data already in `PeecOverview`).
- Profound section model filter — Profound has the same data shape but its tabs (Overview Profound section) are not in scope.
- Surface "filter affects N of M tables on this page" indicator.
