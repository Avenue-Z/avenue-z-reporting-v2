# AEO Snapshot KPI Model-Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all three AEO Overview "Snapshot KPIs" (Visibility, Citation Share, AI Referral Traffic) respond to the AI model filter.

**Architecture:** Two pure helpers (per-model citation aggregation; GA4 source→model mapping) feed the data layer and component. The Peec overview gains per-model citation totals (derived where the brand's own domain is known); Profound gets the fields empty for type parity. The Overview component recomputes Citation Share from the per-model totals and AI Referral Traffic from model-mapped GA4 sources when a filter is active, hiding deltas while filtered (existing convention). Visibility is already model-aware and is only verified.

**Tech Stack:** Next.js 16 (RSC), TypeScript (strict), Recharts, GA4 Data API. Tests are standalone `node:assert` scripts run with `npx tsx <file>` (print `ok`); no test runner. Component/data-layer changes are verified with `npx tsc --noEmit` AND `npm run build` (the Next build is the only check that catches client/server bundling errors).

## Global Constraints

- Canonical model strings (`AEOModel`, from `lib/peec/models.ts`): `ChatGPT`, `Perplexity`, `Gemini`, `Claude`, `Copilot`, `Google`. Use these EXACT strings everywhere.
- `parseModelsParam` returns a non-null `AEOModel[]` for a single/subset selection and `null` for none/all. `modelActive = models != null`.
- Existing convention: when `modelActive`, KPI deltas are HIDDEN (no per-model prior-period data is fetched).
- AI Referral Traffic is mapped to a model by GA4 referrer domain. Unmapped AI referrers (you.com, phind.com, poe.com, chat.mistral.ai, kagi.com, search.brave.com) and the `Google` (AI Overview) model are excluded from a filtered view; the unfiltered total is unchanged.
- Profound has no per-model citation data → its `totalCitationsByModel`/`yourBrandCitationsByModel` are `{}`, so model-filtered Citation Share on the Profound tab renders `--`.
- Tests: standalone `node:assert` scripts ending in `console.log('ok')`, run with `npx tsx <path>`. The two pure-helper tests need NO env (the modules import only types). Do not add env to those runs.
- Verify the data-layer and component tasks with `npx tsc --noEmit`; verify the component task additionally with `npm run build`.
- Branch: `feat/aeo-tab-iterations`. Commit after each task; do not push.

---

## Interconnected Components & Parallelization

**Five tasks over disjoint file sets.**

| Task | Files (exclusive) | Depends on |
|---|---|---|
| 1. Per-model citation helpers | `lib/peec/by-model.ts`, `lib/peec/by-model.test.ts` | — |
| 2. GA4 source→model map | `lib/constants.ts`, `lib/constants.test.ts` | — |
| 3. Peec per-model citation totals | `lib/peec/client.ts`, `lib/demo-data/peec.ts` | Task 1 |
| 4. Profound parity (empty fields) | `lib/profound/client.ts`, `lib/demo-data/profound.ts` | — |
| 5. Overview component wiring | `components/report-sections/peec-ai/index.tsx` | Tasks 1, 2, 3, 4 |

- **No file is shared between tasks** → no merge collisions.
- **Cross-task contracts (interfaces):**
  - Task 1 produces `citationTotalsByModel(byModel, isYours) → { totalByModel, yourByModel }` and `sumModelMap(map, selected) → number` in `lib/peec/by-model.ts`.
  - Task 2 produces `aiSourceModel(source) → AEOModel | null` in `lib/constants.ts`.
  - Task 3 adds `totalCitationsByModel` and `yourBrandCitationsByModel` (`Partial<Record<AEOModel, number>>`) to `PeecOverview`.
  - Task 4 adds the SAME two fields to `ProfoundOverview` (empty `{}`).
  - Task 5 consumes all of the above. It reads the two new fields off `data` (which is typed as the shared overview shape), so BOTH Task 3 and Task 4 must have added the fields before Task 5 type-checks.
- **Parallel waves:** Wave 1 = Tasks 1, 2, 4 (parallel). Wave 2 = Task 3 (needs Task 1). Wave 3 = Task 5 (needs 1, 2, 3, 4).
- **Execution-environment caveat (from prior rounds):** the harness's worktree isolation branches from a stale base, so a worktree's copy of these files may predate `main`. Prefer running the wave's tasks in the MAIN working tree without letting implementers commit or run `npm run build`; the controller then commits each task's files separately and runs a single build to validate the combined result. If worktrees are used, integrate per-file and do NOT overwrite whole files from a stale base.

---

## Task 1: Per-model citation aggregation helpers

**Files:**
- Modify: `lib/peec/by-model.ts`
- Create: `lib/peec/by-model.test.ts`

**Interfaces:**
- Consumes: `AEOModel`, `ByModel` (already in the file).
- Produces: `citationTotalsByModel(byModel: ByModel<string, number>, isYours: (domain: string) => boolean): { totalByModel: Partial<Record<AEOModel, number>>; yourByModel: Partial<Record<AEOModel, number>> }` and `sumModelMap(map: Partial<Record<AEOModel, number>>, selected: readonly AEOModel[] | null): number`.

- [ ] **Step 1: Write the failing test**

Create `lib/peec/by-model.test.ts`:

```typescript
import { strict as assert } from 'node:assert'
import { citationTotalsByModel, sumModelMap } from './by-model'

const map = {
  'me.com':    { ChatGPT: 10, Gemini: 5 },
  'other.com': { ChatGPT: 20, Gemini: 0, Claude: 7 },
}
const { totalByModel, yourByModel } = citationTotalsByModel(map, (d) => d === 'me.com')
assert.equal(totalByModel.ChatGPT, 30)        // 10 + 20
assert.equal(totalByModel.Gemini, 5)          // 5 + 0
assert.equal(totalByModel.Claude, 7)          // 0 + 7
assert.equal(yourByModel.ChatGPT, 10)         // only me.com
assert.equal(yourByModel.Gemini, 5)
assert.equal(yourByModel.Claude ?? 0, 0)      // me.com has no Claude

assert.equal(sumModelMap(totalByModel, ['ChatGPT']), 30)
assert.equal(sumModelMap(totalByModel, ['ChatGPT', 'Gemini']), 35)
assert.equal(sumModelMap(totalByModel, null), 42)   // 30 + 5 + 7 across all models
assert.equal(sumModelMap(yourByModel, ['Claude']), 0)

console.log('ok')
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx lib/peec/by-model.test.ts`
Expected: FAIL — `citationTotalsByModel`/`sumModelMap` are not exported.

- [ ] **Step 3: Add the helpers**

Append to `lib/peec/by-model.ts`:

```typescript
/** Aggregate a per-domain × per-model citation map into per-model totals (all
 *  domains) and per-model your-brand totals. `isYours(domain)` decides which
 *  domains count as the client's own brand. */
export function citationTotalsByModel(
  byModel: ByModel<string, number>,
  isYours: (domain: string) => boolean,
): { totalByModel: Partial<Record<AEOModel, number>>; yourByModel: Partial<Record<AEOModel, number>> } {
  const totalByModel: Partial<Record<AEOModel, number>> = {}
  const yourByModel: Partial<Record<AEOModel, number>> = {}
  for (const [domain, perModel] of Object.entries(byModel)) {
    const mine = isYours(domain)
    for (const [model, value] of Object.entries(perModel) as [AEOModel, number][]) {
      const v = value ?? 0
      totalByModel[model] = (totalByModel[model] ?? 0) + v
      if (mine) yourByModel[model] = (yourByModel[model] ?? 0) + v
    }
  }
  return { totalByModel, yourByModel }
}

/** Sum a single-level per-model map over the selected models (all models when
 *  `selected` is null). */
export function sumModelMap(
  map: Partial<Record<AEOModel, number>>,
  selected: readonly AEOModel[] | null,
): number {
  const models = selected ?? (Object.keys(map) as AEOModel[])
  return models.reduce<number>((acc, m) => acc + (map[m] ?? 0), 0)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx lib/peec/by-model.test.ts`
Expected: PASS — prints `ok`.

- [ ] **Step 5: Commit**

```bash
git add lib/peec/by-model.ts lib/peec/by-model.test.ts
git commit -m "feat(peec): per-model citation aggregation helpers"
```

---

## Task 2: GA4 referrer → AEO model mapping

**Files:**
- Modify: `lib/constants.ts`
- Create: `lib/constants.test.ts`

**Interfaces:**
- Consumes: `AEOModel` (type-only import from `@/lib/peec/models`).
- Produces: `AI_SOURCE_TO_MODEL` and `aiSourceModel(source: unknown): AEOModel | null`.

- [ ] **Step 1: Write the failing test**

Create `lib/constants.test.ts`:

```typescript
import { strict as assert } from 'node:assert'
import { aiSourceModel } from './constants'

assert.equal(aiSourceModel('chatgpt.com'), 'ChatGPT')
assert.equal(aiSourceModel('chat.openai.com'), 'ChatGPT')
assert.equal(aiSourceModel('perplexity.ai'), 'Perplexity')
assert.equal(aiSourceModel('claude.ai'), 'Claude')
assert.equal(aiSourceModel('gemini.google.com'), 'Gemini')
assert.equal(aiSourceModel('copilot.microsoft.com'), 'Copilot')
assert.equal(aiSourceModel('www.bing.com'), 'Copilot')
assert.equal(aiSourceModel('you.com'), null)     // generic AI search — unmapped
assert.equal(aiSourceModel('google.com'), null)  // plain google — not AI-Overview attributable
assert.equal(aiSourceModel(null), null)
console.log('ok')
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx lib/constants.test.ts`
Expected: FAIL — `aiSourceModel` is not exported.

- [ ] **Step 3: Add the map and helper**

In `lib/constants.ts`, add this import at the very top of the file (above `CHART_COLORS`):

```typescript
import type { AEOModel } from '@/lib/peec/models'
```

Then, immediately AFTER the existing `isAiSource` function (right after its closing `}` near line 49), add:

```typescript
/** Maps a known AI referrer domain to the AEO model it represents. Generic AI
 *  search engines (you.com, phind, poe, mistral, kagi, brave) and Google AI
 *  Overview have no clean GA4 referrer signal and are intentionally unmapped. */
export const AI_SOURCE_TO_MODEL: { domain: string; model: AEOModel }[] = [
  { domain: 'chat.openai.com',       model: 'ChatGPT'    },
  { domain: 'chatgpt.com',           model: 'ChatGPT'    },
  { domain: 'perplexity.ai',         model: 'Perplexity' },
  { domain: 'claude.ai',             model: 'Claude'     },
  { domain: 'gemini.google.com',     model: 'Gemini'     },
  { domain: 'bard.google.com',       model: 'Gemini'     },
  { domain: 'copilot.microsoft.com', model: 'Copilot'    },
  { domain: 'bing.com',              model: 'Copilot'    },
]

/** Map a GA4 sessionSource to its AEO model, or null when the source is not a
 *  model-attributable AI referrer. First match wins. */
export function aiSourceModel(source: unknown): AEOModel | null {
  const s = String(source ?? '').toLowerCase()
  for (const { domain, model } of AI_SOURCE_TO_MODEL) {
    if (s.includes(domain)) return model
  }
  return null
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx lib/constants.test.ts`
Expected: PASS — prints `ok`.

- [ ] **Step 5: Commit**

```bash
git add lib/constants.ts lib/constants.test.ts
git commit -m "feat(aeo): map GA4 referrer domains to AEO models"
```

---

## Task 3: Peec per-model citation totals (client + demo)

**Files:**
- Modify: `lib/peec/client.ts` (PeecOverview type + compute + return)
- Modify: `lib/demo-data/peec.ts` (populate demo)

**Interfaces:**
- Consumes: `citationTotalsByModel` (Task 1); `urlJoinKey`, `yourDomainKey`, `domainCitationsByModel` (already in `client.ts`).
- Produces: `PeecOverview.totalCitationsByModel` and `PeecOverview.yourBrandCitationsByModel` (`Partial<Record<AEOModel, number>>`).

- [ ] **Step 1: Import the helper in `lib/peec/client.ts`**

Find the existing import of `ByModel` from `'./by-model'` and add `citationTotalsByModel` to it. For example, if the line is `import type { ByModel } from './by-model'`, change it to two imports:

```typescript
import type { ByModel } from './by-model'
import { citationTotalsByModel } from './by-model'
```

(If `ByModel` is imported together with values already, just add `citationTotalsByModel` to the value import. Verify with `grep -n "by-model" lib/peec/client.ts`.)

- [ ] **Step 2: Add the two fields to the `PeecOverview` type**

In `lib/peec/client.ts`, immediately after the `brandVisibilityByModel: ByModel<string, number>` line in the `PeecOverview` type (around line 204), add:

```typescript
  /** Per-model citation totals across all tracked domains, and per-model
   *  citations to the client's own domain. Used for model-filtered Citation
   *  Share on the Overview. */
  totalCitationsByModel: Partial<Record<AEOModel, number>>
  yourBrandCitationsByModel: Partial<Record<AEOModel, number>>
```

- [ ] **Step 3: Compute them before the overview return**

In `lib/peec/client.ts`, after the loop that builds `domainCitationsByModel` (it ends around line 731, before `brandVisibilityByModel` is built) — anywhere after `domainCitationsByModel` is fully built and `yourDomainKey` is in scope, and before the final `return {` (line ~778) — add:

```typescript
  const { totalByModel: totalCitationsByModel, yourByModel: yourBrandCitationsByModel } =
    citationTotalsByModel(domainCitationsByModel, (domain) => urlJoinKey(domain) === yourDomainKey)
```

- [ ] **Step 4: Add them to the return object**

In the final `return { ... }` of the overview builder (around line 778-796), after the `brandVisibilityByModel,` line, add:

```typescript
    totalCitationsByModel,
    yourBrandCitationsByModel,
```

- [ ] **Step 5: Populate the demo data**

In `lib/demo-data/peec.ts`, add this import near the top (with the other `@/lib/peec` imports):

```typescript
import { citationTotalsByModel } from '@/lib/peec/by-model'
```

Then, immediately after the `DOMAIN_CITATIONS_BY_MODEL` constant (after its closing `}` around line 139), add:

```typescript
// Demo your-brand domain = avenuez.com (exact host, matching the real client's
// exact-host citation match). blog.avenuez.com is a separate host, excluded.
const { totalByModel: DEMO_TOTAL_CITATIONS_BY_MODEL, yourByModel: DEMO_YOUR_CITATIONS_BY_MODEL } =
  citationTotalsByModel(DOMAIN_CITATIONS_BY_MODEL, (d) => d === 'avenuez.com')
```

Then in the `samplePeecOverview()` return object, after the `brandVisibilityByModel: BRAND_VISIBILITY_BY_MODEL,` line (line 175), add:

```typescript
    totalCitationsByModel: DEMO_TOTAL_CITATIONS_BY_MODEL,
    yourBrandCitationsByModel: DEMO_YOUR_CITATIONS_BY_MODEL,
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0. (If it errors that `data.totalCitationsByModel` is missing on the Profound branch, that is Task 4's job — when running tasks independently this is expected until Task 4 lands.)

- [ ] **Step 7: Commit**

```bash
git add lib/peec/client.ts lib/demo-data/peec.ts
git commit -m "feat(peec): expose per-model citation totals for model-filtered Citation Share"
```

---

## Task 4: Profound parity — empty per-model citation fields

**Files:**
- Modify: `lib/profound/client.ts` (ProfoundOverview type + return)
- Modify: `lib/demo-data/profound.ts` (sample return)

**Interfaces:**
- Consumes: `AEOModel` (already imported in `profound/client.ts`).
- Produces: `ProfoundOverview.totalCitationsByModel` and `ProfoundOverview.yourBrandCitationsByModel` (always `{}`).

- [ ] **Step 1: Add the two fields to the `ProfoundOverview` type**

In `lib/profound/client.ts`, immediately after the `llmBreakdown: LLMBreakdown[]` line in the `ProfoundOverview` type (around line 143), add:

```typescript
  /** Profound exposes no per-model citation data (v1). Always empty — Citation
   *  Share renders `--` on the Profound tab when a model filter is active. */
  totalCitationsByModel: Partial<Record<AEOModel, number>>
  yourBrandCitationsByModel: Partial<Record<AEOModel, number>>
```

- [ ] **Step 2: Add them to the real overview return**

In `lib/profound/client.ts`, in the overview builder's final `return { ... }` (around line 559-575), after the `llmBreakdown,` line, add:

```typescript
    totalCitationsByModel: {},
    yourBrandCitationsByModel: {},
```

- [ ] **Step 3: Add them to the demo return**

In `lib/demo-data/profound.ts`, in `sampleProfoundOverview()`'s return (around line 97-123), after the `llmBreakdown:  LLM_BREAKDOWN,` line, add:

```typescript
    totalCitationsByModel: {},
    yourBrandCitationsByModel: {},
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0 for the Profound files. (If it errors in `peec-ai/index.tsx` about these fields, that is Task 5's consumer wiring — expected until Task 5 lands when running tasks independently.)

- [ ] **Step 5: Commit**

```bash
git add lib/profound/client.ts lib/demo-data/profound.ts
git commit -m "feat(profound): add empty per-model citation fields for type parity"
```

---

## Task 5: Overview component — model-aware Citation Share & AI Referral Traffic

**Files:**
- Modify: `components/report-sections/peec-ai/index.tsx`

**Interfaces:**
- Consumes: `sumModelMap` (Task 1), `aiSourceModel` (Task 2), `PeecOverview`/`ProfoundOverview` per-model citation fields (Tasks 3, 4). `models`, `modelActive`, `isAiSource`, `GA4Row` already in scope.
- Produces: model-aware Snapshot KPI strip.

- [ ] **Step 1: Add imports**

In `components/report-sections/peec-ai/index.tsx`:
- Add `sumModelMap` to the existing import from `'@/lib/peec/by-model'` (grep `by-model` to find it; if none, add `import { sumModelMap } from '@/lib/peec/by-model'`).
- Add `aiSourceModel` to the existing import from `'@/lib/constants'` (the one that already imports `isAiSource`).

- [ ] **Step 2: Make AI Referral Traffic model-aware in `PeecAIReport`**

In the `PeecAIReport` function, replace the `sumAiSessions` definition (around lines 335-338) with a model-aware version:

```typescript
  const matchesAiFilter = (source: unknown): boolean => {
    if (!models) return isAiSource(source)
    const m = aiSourceModel(source)
    return m != null && models.includes(m)
  }
  const sumAiSessions = (rows: GA4Row[] | undefined | null) =>
    (rows ?? [])
      .filter((r) => matchesAiFilter(r.sessionSource))
      .reduce((sum, r) => sum + ((r.sessions as number) ?? 0), 0)
```

(The `aiTraffic` object that follows is unchanged — it already calls `sumAiSessions` for current and prior. When a model is selected the value reflects only that model's referrer sessions; the delta is hidden in Step 4.)

- [ ] **Step 3: Compute model-aware Citation Share in `ProviderSection`**

In `ProviderSection`, immediately after the existing `citationShareDelta` line (around line 190), add:

```typescript
  // Model-filtered Citation Share: recompute from per-model citation totals when
  // a model is selected. Profound's maps are empty → denom 0 → null → '--'.
  // Delta hidden while filtered (no per-model prior-period data).
  const citShareNumer = sumModelMap(data.yourBrandCitationsByModel, models)
  const citShareDenom = sumModelMap(data.totalCitationsByModel, models)
  const citationShareValue = modelActive
    ? (citShareDenom > 0 ? (citShareNumer / citShareDenom) * 100 : null)
    : citationShareNow
  const citationShareDeltaShown = modelActive ? undefined : citationShareDelta
```

- [ ] **Step 4: Wire the values into the Snapshot KPI cards**

In the Snapshot KPI array (around lines 231-252):

Replace the **Citation Share** card object with:

```typescript
              {
                title: 'Citation Share',
                value: citationShareValue != null ? `${citationShareValue.toFixed(1)}%` : '--',
                delta: citationShareDeltaShown,
                subtitle: modelActive
                  ? `${citShareNumer.toLocaleString()} of ${citShareDenom.toLocaleString()} citations`
                  : `${data.yourBrandCitations.toLocaleString()} of ${data.totalCitations.toLocaleString()} citations`,
                tooltip: `Share of total tracked-domain citations attributed to your brand's own domain in the selected date range vs. the previous period. Sourced from ${label}.`,
              },
```

In the **AI Referral Traffic** card object, change its `delta` line from `delta: aiTrafficDelta,` to:

```typescript
                delta: modelActive ? undefined : aiTrafficDelta,
```

(Leave the Visibility card unchanged — it is already model-aware.)

- [ ] **Step 5: Type-check, build, and smoke-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm run build`
Expected: "Compiled successfully"; exit 0.

Manual smoke (controller/human): open the AEO Overview in demo mode, select a single model (e.g. ChatGPT). Confirm ALL THREE Snapshot KPIs change: Visibility, Citation Share (number moves; deltas disappear while filtered), AI Referral Traffic (reflects only that model's referrer sessions). Switch to the Profound tab with a model selected → Citation Share shows `--`. If Visibility does NOT change on model select, root-cause the `models` wiring (e.g. `llmBreakdown[].model` values vs `AEO_MODELS`) and fix here.

- [ ] **Step 6: Commit**

```bash
git add components/report-sections/peec-ai/index.tsx
git commit -m "feat(aeo): make Snapshot KPIs respond to the model filter"
```

---

## Self-Review

**Spec coverage:**
- Item A (Citation Share model-aware; Profound `--`): Tasks 1, 3, 4, 5. ✓
- Item B (AI Referral Traffic model-aware via source→model map): Tasks 2, 5. ✓
- Item C (verify Visibility; fix if broken): Task 5 Step 5. ✓
- Convention (hide deltas while filtered): Task 5 Steps 3-4. ✓
- Out-of-scope (per-model prior/deltas, Profound per-model data, generic AI/Google AIO attribution, legend) untouched. ✓

**Type consistency:** `citationTotalsByModel`/`sumModelMap` (Task 1) and `aiSourceModel` (Task 2) signatures match their consumers in Tasks 3/5. The two new overview fields use the identical name and type (`Partial<Record<AEOModel, number>>`) in `PeecOverview` (Task 3), `ProfoundOverview` (Task 4), and the component reads (Task 5). Canonical model strings used throughout.

**Placeholder scan:** none — every code step shows full code; every run step has an exact command and expected result.

**Parallel-safety:** disjoint file sets per task (table above); the only cross-task dependency is type/helper contracts, documented in the Interconnected Components section. Tasks 3 and 4 each leave the branch type-incomplete for the OTHER provider/consumer until Task 5 lands; this is expected when running tasks independently and resolves once the wave completes (call out for reviewers).
