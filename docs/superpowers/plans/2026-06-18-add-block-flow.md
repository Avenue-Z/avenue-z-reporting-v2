# Add-Block Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an editor create a new dashboard block from natural language via a modal (source → NL → resolver → editable preview card → confirm → save).

**Architecture:** A client modal runs a `pick → prompt → preview` state machine; a `proposeBlock` server action bridges to the existing server-side resolvers (`resolveBlockNL`/`resolveAggregateNL`); confirm builds the next config with pure `addBlock`/`applySelections` and persists via the existing `saveDashboardConfig` (which revalidates → the RSC page resolves and renders the new block).

**Tech Stack:** Next.js RSC + client components, TypeScript strict, `tsx` + `node:assert` for the pure logic. No new dependencies (a hand-rolled overlay, not a Dialog lib).

## Global Constraints

- TypeScript strict; **no `any`** in new files.
- Pure-logic tests are env-free: `npx tsx <file>.test.ts`, `node:assert` strict, top-level/`run()` wrapper, final `console.log('ok')`. UI components have **no unit tests** (no React test runner in-repo, as with #3) — verified by `tsc` + manual on the preview.
- Reuse: `saveDashboardConfig` + `canEditDashboard` + `auth` (`app/actions/dashboard.ts` / `@/auth`), `resolveBlockNL` (`@/lib/dashboard/nl/resolve`), `resolveAggregateNL` (`@/lib/dashboard/nl/aggregate-resolve`), `addBlock`/`applySelections` (this plan), and the dashboard `config-mutations` style (pure, returns a new config).
- Brand: match the existing components' tokens — `bg-bg-surface`, `border-white/[0.08]`, `text-text-muted`, `text-white`, `brand-cyan`, the gradient apply button (`from-brand-yellow via-brand-green to-brand-cyan`). (`frontend:brand-coherence` governs the UI.)
- Server-only modules (`resolveBlockNL` etc.) must not be imported into a `'use client'` file — only the `proposeBlock` server action calls them.
- A new block's `id` is `crypto.randomUUID()` assigned at confirm (replaces the `'__pending__'` sentinel). When the dashboard has no config yet, the first block creates a fresh `DashboardConfig` with `defaultRange { dateRange: 'last_30_days', compareRange: null }`.
- Commit per task with the message shown; stage only the task's files; never the unrelated paid-search edits.

---

## Inter-Component Dependency Map

```
  addBlock (T1)        applySelections + BlockSelections (T2)        proposeBlock action (T3)
  config-mutations     add-block/draft.ts                           app/actions/dashboard.ts
   (pure)               (pure; types only)                          (auth + resolvers, committed)
       │                     │   │                                         │
       │                     │   └──────────────┐                          │
       │                     ▼                  ▼                          │
       │            (BlockSelections type) BlockPreviewCard (T4)           │
       │                                    client UI                      │
       └──────────┬───────────────┬─────────────┘                         │
                  ▼               ▼                                        │
            AddBlockDialog (T5)  ◀──────────────────────────────────────-─┘
            client state machine (uses T1 addBlock, T2 applySelections, T3 proposeBlock, T4 card, saveDashboardConfig)
                  │
                  ▼
            AddBlockButton + shell/empty-state wiring (T6)
```

**Edges = imports/consumes.** T4 needs T2 (the `BlockSelections` type + reads proposal `alternatives`). T5 needs T1+T2+T3+T4. T6 needs T5.

### Parallelization waves

| Wave | Tasks (parallel) | Unblocked by |
|---|---|---|
| 0 | **T1 addBlock**, **T2 draft (applySelections)**, **T3 proposeBlock** | nothing — 3 disjoint, independent |
| 1 | **T4 BlockPreviewCard** | T2 |
| 2 | **T5 AddBlockDialog** | T1,T2,T3,T4 |
| 3 | **T6 AddBlockButton + wiring** | T5 |

Wave 0 fans out the testable logic + the server action (3-wide). The UI then assembles as a short sequential chain (card → dialog → entry-point), each task reviewed — the dependency chain is inherent to the UI.

---

## File Structure

```
components/dashboard/
  config-mutations.ts            # MODIFY: + addBlock
  config-mutations.test.ts       # MODIFY: + addBlock test
  add-block/
    draft.ts                     # NEW: BlockSelections, applySelections
    draft.test.ts                # NEW
    block-preview-card.tsx       # NEW (client)
    add-block-dialog.tsx         # NEW (client)
    add-block-button.tsx         # NEW (client)
  dashboard-shell.tsx            # MODIFY: render AddBlockButton in the control row
  metric-block-states.tsx        # MODIFY: EmptyDashboardState renders AddBlockButton (editors)
app/
  actions/dashboard.ts           # MODIFY: + proposeBlock server action
  dashboard/[clientSlug]/configurable-dashboard/page.tsx  # MODIFY: pass slug to EmptyDashboardState
```

---

## Task 1: `addBlock` mutation (`components/dashboard/config-mutations.ts`)

**Files:** Modify `components/dashboard/config-mutations.ts`, `components/dashboard/config-mutations.test.ts`.

**Interfaces:** Produces `addBlock(config: DashboardConfig, block: PersistedBlock): DashboardConfig`.

- [ ] **Step 1: Add the failing test** — append to `config-mutations.test.ts` before its final `console.log('ok')`:

```ts
import { addBlock } from './config-mutations'
{
  const base = { defaultRange: { dateRange: 'last_30_days', compareRange: null }, blocks: [] as PersistedBlock[] }
  const block = { id: 'n1', name: 'New', format: 'number' as const, range: null, binding: { source: 'triplewhale' as const, metric: 'sessions' } }
  const next = addBlock(base, block)
  assert.equal(next.blocks.length, 1)
  assert.equal(next.blocks[0].id, 'n1')
  assert.notEqual(next.blocks, base.blocks, 'new array')
  assert.equal(base.blocks.length, 0, 'input unchanged')
}
```
(If `PersistedBlock` isn't already imported in the test, add `import type { PersistedBlock } from '@/lib/dashboard/types'`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx components/dashboard/config-mutations.test.ts`
Expected: FAIL (`addBlock` is not exported)

- [ ] **Step 3: Implement** — add to `config-mutations.ts`:

```ts
/** Append a block to the dashboard (returns a new config). */
export function addBlock(config: DashboardConfig, block: PersistedBlock): DashboardConfig {
  return { ...config, blocks: [...config.blocks, block] }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx components/dashboard/config-mutations.test.ts`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/config-mutations.ts components/dashboard/config-mutations.test.ts
git commit -m "feat(dashboard): addBlock config mutation"
```

---

## Task 2: `applySelections` + `BlockSelections` (`components/dashboard/add-block/draft.ts`)

**Files:** Create `components/dashboard/add-block/draft.ts`, `components/dashboard/add-block/draft.test.ts`.

**Interfaces:**
- Consumes: `BlockConfig`, `MetricFormat` (`@/lib/dashboard/types`).
- Produces: `BlockSelections` (interface); `applySelections(proposalConfig: BlockConfig, selections: BlockSelections, id: string): BlockConfig`.

- [ ] **Step 1: Write the failing test**

```ts
// components/dashboard/add-block/draft.test.ts
// Run: npx tsx components/dashboard/add-block/draft.test.ts
import { strict as assert } from 'node:assert'
import { applySelections, type BlockSelections } from './draft'
import type { BlockConfig } from '@/lib/dashboard/types'

const sm: BlockConfig = {
  id: '__pending__', name: 'X', format: 'currency', range: null,
  binding: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: 'a1' },
}
// supermetrics: name/format/id set; metric+account swapped to chosen alternatives
{
  const sel: BlockSelections = { name: 'Spend', format: 'currency', metric: 'CostMicros', account: 'a2' }
  const b = applySelections(sm, sel, 'real-1')
  assert.equal(b.id, 'real-1'); assert.equal(b.name, 'Spend')
  assert.equal(b.binding.source, 'supermetrics')
  if (b.binding.source === 'supermetrics') { assert.equal(b.binding.metricField, 'CostMicros'); assert.equal(b.binding.account, 'a2') }
  assert.equal(b.range, null)
}
// supermetrics: no chosen alternatives → original binding fields preserved
{
  const b = applySelections(sm, { name: 'X', format: 'currency' }, 'real-2')
  if (b.binding.source === 'supermetrics') { assert.equal(b.binding.metricField, 'Cost'); assert.equal(b.binding.account, 'a1') }
}
// triplewhale: metric swapped; account selection ignored
{
  const tw: BlockConfig = { id: '__pending__', name: 'R', format: 'number', range: null, binding: { source: 'triplewhale', metric: 'revenue' } }
  const b = applySelections(tw, { name: 'Rev', format: 'currency', metric: 'blended_roas', account: 'ignored' }, 'real-3')
  if (b.binding.source === 'triplewhale') assert.equal(b.binding.metric, 'blended_roas')
  assert.equal(b.format, 'currency'); assert.equal(b.name, 'Rev')
}
// aggregate: binding untouched; only name/format/id applied
{
  const agg: BlockConfig = { id: '__pending__', name: 'ROAS', format: 'number', range: null,
    binding: { source: 'aggregate', op: '/', left: { source: 'triplewhale', metric: 'revenue' }, right: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: 'a1' } } }
  const b = applySelections(agg, { name: 'Blended ROAS', format: 'number', metric: 'x' }, 'real-4')
  assert.equal(b.binding.source, 'aggregate'); assert.equal(b.name, 'Blended ROAS'); assert.equal(b.id, 'real-4')
}
console.log('ok')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx components/dashboard/add-block/draft.test.ts`
Expected: FAIL with `Cannot find module './draft'`

- [ ] **Step 3: Write the implementation**

```ts
// components/dashboard/add-block/draft.ts
import type { BlockConfig, MetricFormat } from '@/lib/dashboard/types'

/** User's choices on the preview card. metric/account are chosen alternative values (leaf only). */
export interface BlockSelections {
  name: string
  format: MetricFormat
  metric?: string
  account?: string
}

/**
 * Turn a resolver proposal's config into the final block: apply name/format/id,
 * and (for leaf bindings) swap in the chosen metric/account alternative values.
 * Aggregate bindings are left as-resolved (operand alternatives are deferred).
 */
export function applySelections(proposalConfig: BlockConfig, selections: BlockSelections, id: string): BlockConfig {
  const binding = structuredClone(proposalConfig.binding)
  if (binding.source === 'supermetrics') {
    if (selections.metric) binding.metricField = selections.metric
    if (selections.account) binding.account = selections.account
  } else if (binding.source === 'triplewhale') {
    if (selections.metric) binding.metric = selections.metric
  }
  return { id, name: selections.name, format: selections.format, range: proposalConfig.range, binding }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx components/dashboard/add-block/draft.test.ts`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add components/dashboard/add-block/draft.ts components/dashboard/add-block/draft.test.ts
git commit -m "feat(dashboard): applySelections (proposal + selections → block)"
```

---

## Task 3: `proposeBlock` server action (`app/actions/dashboard.ts`)

**Files:** Modify `app/actions/dashboard.ts`.

**Interfaces:**
- Consumes: `auth` (`@/auth`), `canEditDashboard` (`@/lib/dashboard/permissions`) — both already imported by this file; `resolveBlockNL` (`@/lib/dashboard/nl/resolve`), `resolveAggregateNL` (`@/lib/dashboard/nl/aggregate-resolve`); `ResolutionResult` (`@/lib/dashboard/nl/types`), `AggregateResolutionResult` (`@/lib/dashboard/nl/aggregate-types`).
- Produces: `ProposeBlockInput` (type); `proposeBlock(input): Promise<ResolutionResult | AggregateResolutionResult>`.

**Note:** thin server action — auth + resolver dispatch; the resolvers are already tested and never throw, so this is verified by the tsc gate (no unit test).

- [ ] **Step 1: Add the imports + types at the top of `app/actions/dashboard.ts`**

```ts
import { resolveBlockNL } from '@/lib/dashboard/nl/resolve'
import { resolveAggregateNL } from '@/lib/dashboard/nl/aggregate-resolve'
import type { ResolutionResult } from '@/lib/dashboard/nl/types'
import type { AggregateResolutionResult } from '@/lib/dashboard/nl/aggregate-types'

export type ProposeBlockInput = {
  source: 'supermetrics' | 'triplewhale' | 'aggregate'
  prompt: string // NL prompt for leaf sources; the formula for aggregate
  slug: string
}
```

- [ ] **Step 2: Add the action (after `saveDashboardConfig`)**

```ts
/**
 * Resolve a natural-language block request into a proposal (or clarify/error)
 * via the server-side resolvers. Same edit-permission gate as save.
 */
export async function proposeBlock(
  input: ProposeBlockInput,
): Promise<ResolutionResult | AggregateResolutionResult> {
  const session = await auth()
  if (!session?.user) return { kind: 'error', error: 'unauthenticated' }
  if (!canEditDashboard(session.user.role, session.user.clientSlug, input.slug)) {
    return { kind: 'error', error: 'forbidden' }
  }
  const actAsEmail = session.user.email ?? ''
  if (input.source === 'aggregate') {
    return resolveAggregateNL({ formula: input.prompt, actAsEmail })
  }
  return resolveBlockNL({ source: input.source, prompt: input.prompt, actAsEmail })
}
```

- [ ] **Step 3: Type-check gate**

Run: `npx tsc --noEmit 2>&1 | grep "app/actions/dashboard" || echo "action ok"`
Expected: `action ok`

- [ ] **Step 4: Commit**

```bash
git add app/actions/dashboard.ts
git commit -m "feat(dashboard): proposeBlock server action (NL → proposal)"
```

---

## Task 4: Block preview card (`components/dashboard/add-block/block-preview-card.tsx`)

**Files:** Create `components/dashboard/add-block/block-preview-card.tsx` (client).

**Interfaces:**
- Consumes: `BlockSelections` (T2, `./draft`); `BlockProposal` (`@/lib/dashboard/nl/types`), `AggregateProposal` (`@/lib/dashboard/nl/aggregate-types`); `MetricFormat` (`@/lib/dashboard/types`).
- Produces: `BlockPreviewCard` component with props `{ proposal: BlockProposal | AggregateProposal; pending: boolean; onConfirm: (s: BlockSelections) => void; onCancel: () => void }`.

**Note:** UI — verified by `tsc` + manual (no unit test).

- [ ] **Step 1: Write the component**

```tsx
// components/dashboard/add-block/block-preview-card.tsx
'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { MetricFormat } from '@/lib/dashboard/types'
import type { BlockProposal } from '@/lib/dashboard/nl/types'
import type { AggregateProposal } from '@/lib/dashboard/nl/aggregate-types'
import type { BlockSelections } from './draft'

const FORMATS: MetricFormat[] = ['currency', 'percent', 'count', 'number']

export function BlockPreviewCard({
  proposal,
  pending,
  onConfirm,
  onCancel,
}: {
  proposal: BlockProposal | AggregateProposal
  pending: boolean
  onConfirm: (s: BlockSelections) => void
  onCancel: () => void
}) {
  const cfg = proposal.config
  const binding = cfg.binding
  const isLeaf = binding.source !== 'aggregate'
  // current best-guess metric/account values (leaf only)
  const currentMetric = binding.source === 'supermetrics' ? binding.metricField : binding.source === 'triplewhale' ? binding.metric : ''
  const currentAccount = binding.source === 'supermetrics' ? binding.account : ''
  // leaf alternatives (BlockProposal); aggregate has none in v1
  const leafAlts = isLeaf ? (proposal as BlockProposal).alternatives : undefined

  const [name, setName] = useState(cfg.name)
  const [format, setFormat] = useState<MetricFormat>(cfg.format)
  const [metric, setMetric] = useState(currentMetric)
  const [account, setAccount] = useState(currentAccount)

  const metricOptions = dedupe([{ value: currentMetric, label: currentMetric }, ...(leafAlts?.metric ?? []).map((c) => ({ value: c.value, label: c.label }))])
  const accountOptions = dedupe([{ value: currentAccount, label: currentAccount }, ...(leafAlts?.account ?? []).map((c) => ({ value: c.value, label: c.label }))])

  const label = 'block w-full rounded-md border border-white/10 bg-bg-surface px-3 py-2 text-sm text-white'

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">Preview</p>

      <Field label="Name">
        <input className={label} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>

      <Field label="Source"><span className="text-sm text-white/80">{binding.source}</span></Field>

      {isLeaf && (
        <>
          <Field label="Metric">
            {metricOptions.length > 1 ? (
              <select className={label} value={metric} onChange={(e) => setMetric(e.target.value)}>
                {metricOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : <span className="text-sm text-white/80">{currentMetric}</span>}
          </Field>
          {currentAccount !== '' && (
            <Field label="Account">
              {accountOptions.length > 1 ? (
                <select className={label} value={account} onChange={(e) => setAccount(e.target.value)}>
                  {accountOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : <span className="text-sm text-white/80">{currentAccount}</span>}
            </Field>
          )}
        </>
      )}

      {!isLeaf && (
        <Field label="Formula">
          <span className="text-sm text-white/80">{describeAggregate(proposal as AggregateProposal)}</span>
        </Field>
      )}

      <Field label="Format">
        <select className={label} value={format} onChange={(e) => setFormat(e.target.value as MetricFormat)}>
          {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </Field>

      <div className="mt-2 flex justify-end gap-2">
        <button className="rounded-md px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]" onClick={onCancel} disabled={pending}>Back</button>
        <button
          className="rounded-[100px] bg-gradient-to-r from-brand-yellow via-brand-green to-brand-cyan px-4 py-1.5 text-xs font-bold text-black hover:opacity-90 disabled:opacity-40"
          onClick={() => onConfirm({ name, format, ...(isLeaf ? { metric, ...(currentAccount !== '' ? { account } : {}) } : {}) })}
          disabled={pending || name.trim() === ''}
        >
          {pending ? 'Adding…' : 'Add block'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={cn('text-[10px] font-extrabold uppercase tracking-widest text-text-muted')}>{label}</span>
      {children}
    </label>
  )
}

function dedupe(opts: { value: string; label: string }[]): { value: string; label: string }[] {
  const seen = new Set<string>()
  return opts.filter((o) => o.value !== '' && !seen.has(o.value) && (seen.add(o.value), true)).slice(0, 6)
}

function describeAggregate(p: AggregateProposal): string {
  const b = p.config.binding
  if (b.source !== 'aggregate') return p.config.name
  const leaf = (x: typeof b.left) => (x.source === 'supermetrics' ? x.metricField : x.metric)
  return `${leaf(b.left)} ${b.op} ${leaf(b.right)}`
}
```

- [ ] **Step 2: Type-check gate**

Run: `npx tsc --noEmit 2>&1 | grep "block-preview-card" || echo "card ok"`
Expected: `card ok`

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/add-block/block-preview-card.tsx
git commit -m "feat(dashboard): block preview card (alternative dropdowns + name/format)"
```

---

## Task 5: Add-block dialog (`components/dashboard/add-block/add-block-dialog.tsx`)

**Files:** Create `components/dashboard/add-block/add-block-dialog.tsx` (client).

**Interfaces:**
- Consumes: `proposeBlock`/`ProposeBlockInput` (T3, `@/app/actions/dashboard`), `saveDashboardConfig` (`@/app/actions/dashboard`); `addBlock` (T1, `../config-mutations`); `applySelections`/`BlockSelections` (T2, `./draft`); `BlockPreviewCard` (T4); `DashboardConfig` (`@/lib/dashboard/types`); `BlockProposal`/`AggregateProposal`.
- Produces: `AddBlockDialog` with props `{ slug: string; config: DashboardConfig | null; onClose: () => void }`.

**Note:** UI — verified by `tsc` + manual.

- [ ] **Step 1: Write the component**

```tsx
// components/dashboard/add-block/add-block-dialog.tsx
'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { proposeBlock, saveDashboardConfig, type ProposeBlockInput } from '@/app/actions/dashboard'
import { addBlock } from '../config-mutations'
import { applySelections, type BlockSelections } from './draft'
import { BlockPreviewCard } from './block-preview-card'
import type { DashboardConfig } from '@/lib/dashboard/types'
import type { BlockProposal } from '@/lib/dashboard/nl/types'
import type { AggregateProposal } from '@/lib/dashboard/nl/aggregate-types'

type Source = ProposeBlockInput['source']
const SOURCES: { value: Source; label: string }[] = [
  { value: 'supermetrics', label: 'Supermetrics' },
  { value: 'triplewhale', label: 'TripleWhale' },
  { value: 'aggregate', label: 'Aggregate (formula)' },
]
const DEFAULT_CONFIG: DashboardConfig = { defaultRange: { dateRange: 'last_30_days', compareRange: null }, blocks: [] }

export function AddBlockDialog({ slug, config, onClose }: { slug: string; config: DashboardConfig | null; onClose: () => void }) {
  const router = useRouter()
  const [step, setStep] = useState<'pick' | 'prompt' | 'preview'>('pick')
  const [source, setSource] = useState<Source>('supermetrics')
  const [prompt, setPrompt] = useState('')
  const [clarify, setClarify] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [proposal, setProposal] = useState<BlockProposal | AggregateProposal | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function resolve() {
    setClarify(null); setError(null)
    startTransition(async () => {
      const r = await proposeBlock({ source, prompt, slug })
      if (r.kind === 'clarify') setClarify(r.question)
      else if (r.kind === 'error') setError(r.error)
      else { setProposal(r.proposal); setStep('preview') }
    })
  }

  function confirm(sel: BlockSelections) {
    if (!proposal) return
    setError(null)
    startTransition(async () => {
      const id = crypto.randomUUID()
      const block = applySelections(proposal.config, sel, id)
      const next = addBlock(config ?? DEFAULT_CONFIG, block)
      const res = await saveDashboardConfig(slug, next)
      if (!res.ok) setError(res.error)
      else { onClose(); router.refresh() }
    })
  }

  const input = 'block w-full rounded-md border border-white/10 bg-bg-surface px-3 py-2 text-sm text-white'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-white/[0.08] bg-[#1a1a1a] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-bold text-white">Add block</p>
          <button className="text-text-muted hover:text-white" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {step === 'pick' && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">Source</p>
            {SOURCES.map((s) => (
              <button key={s.value} onClick={() => { setSource(s.value); setStep('prompt') }}
                className="rounded-md border border-white/10 px-3 py-2 text-left text-sm text-white/90 hover:border-white/25 hover:bg-white/[0.04]">
                {s.label}
              </button>
            ))}
          </div>
        )}

        {step === 'prompt' && (
          <div className="flex flex-col gap-3">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">
              {source === 'aggregate' ? 'Formula' : 'Describe the metric'} · {source}
            </p>
            <textarea className={cn(input, 'min-h-[88px] resize-y')} value={prompt} onChange={(e) => setPrompt(e.target.value)}
              placeholder={source === 'aggregate' ? 'blended ROAS = TripleWhale revenue ÷ Supermetrics ad spend' : 'Facebook ad spend last 30 days'} />
            {clarify && <p className="text-xs text-brand-cyan">{clarify}</p>}
            {error && <p className="text-xs text-[#FF6666]">Error: {error}</p>}
            <div className="flex justify-between">
              <button className="rounded-md px-3 py-1.5 text-xs text-white/70 hover:bg-white/[0.06]" onClick={() => setStep('pick')} disabled={pending}>Back</button>
              <button className="rounded-[100px] bg-gradient-to-r from-brand-yellow via-brand-green to-brand-cyan px-4 py-1.5 text-xs font-bold text-black hover:opacity-90 disabled:opacity-40"
                onClick={resolve} disabled={pending || prompt.trim() === ''}>{pending ? 'Resolving…' : 'Resolve'}</button>
            </div>
          </div>
        )}

        {step === 'preview' && proposal && (
          <>
            <BlockPreviewCard proposal={proposal} pending={pending} onConfirm={confirm} onCancel={() => setStep('prompt')} />
            {error && <p className="mt-2 text-xs text-[#FF6666]">Error: {error}</p>}
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check gate**

Run: `npx tsc --noEmit 2>&1 | grep "add-block-dialog" || echo "dialog ok"`
Expected: `dialog ok`

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/add-block/add-block-dialog.tsx
git commit -m "feat(dashboard): add-block dialog (pick → prompt → preview state machine)"
```

---

## Task 6: Add-block button + wiring (`add-block-button.tsx` + shell + empty state + page)

**Files:** Create `components/dashboard/add-block/add-block-button.tsx`; modify `components/dashboard/dashboard-shell.tsx`, `components/dashboard/metric-block-states.tsx`, `app/dashboard/[clientSlug]/configurable-dashboard/page.tsx`.

**Interfaces:**
- Consumes: `AddBlockDialog` (T5); `DashboardConfig` (`@/lib/dashboard/types`).
- Produces: `AddBlockButton` with props `{ slug: string; config: DashboardConfig | null }`.

**Note:** UI wiring — verified by `tsc` + the full suite + manual.

- [ ] **Step 1: Create the button**

```tsx
// components/dashboard/add-block/add-block-button.tsx
'use client'

import { useState } from 'react'
import { AddBlockDialog } from './add-block-dialog'
import type { DashboardConfig } from '@/lib/dashboard/types'

export function AddBlockButton({ slug, config }: { slug: string; config: DashboardConfig | null }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-white/10 bg-bg-surface px-4 py-2 text-sm font-bold text-white transition-colors hover:border-white/25"
      >
        + Add block
      </button>
      {open && <AddBlockDialog slug={slug} config={config} onClose={() => setOpen(false)} />}
    </>
  )
}
```

- [ ] **Step 2: Wire into the shell control row** — in `components/dashboard/dashboard-shell.tsx`, import the button and render it (editors only) next to the global control:

```tsx
import { AddBlockButton } from './add-block/add-block-button'
```
Replace the control-row `<div className="flex justify-end">…</div>` with:
```tsx
      <div className="flex items-center justify-between gap-3">
        {canEdit ? <AddBlockButton slug={slug} config={config} /> : <span />}
        <GlobalTimeControl activeDefault={activeDefault} />
      </div>
```

- [ ] **Step 3: Wire into the empty state** — in `components/dashboard/metric-block-states.tsx`, give `EmptyDashboardState` a `slug` prop and render the button for editors:

```tsx
import { AddBlockButton } from './add-block/add-block-button'
```
```tsx
export function EmptyDashboardState({ canEdit, slug }: { canEdit: boolean; slug: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-lg border border-dashed border-white/[0.08] bg-bg-surface/40 p-12 text-center">
      <p className="text-lg font-bold text-white">No blocks yet</p>
      <p className="mt-2 max-w-md text-sm text-text-muted">
        {canEdit ? 'Add a metric block to start building this dashboard.' : 'This dashboard has not been configured yet.'}
      </p>
      {canEdit && <div className="mt-5"><AddBlockButton slug={slug} config={null} /></div>}
    </div>
  )
}
```

- [ ] **Step 4: Pass `slug` to `EmptyDashboardState` in the page** — in `app/dashboard/[clientSlug]/configurable-dashboard/page.tsx`, both `EmptyDashboardState` usages (the `!config` branch and the shell's internal one) need `slug`. The page's `!config` branch:

```tsx
        <EmptyDashboardState canEdit={canEdit} slug={clientSlug} />
```
And in `dashboard-shell.tsx`'s empty branch, pass slug:
```tsx
  if (config.blocks.length === 0) {
    return <EmptyDashboardState canEdit={canEdit} slug={slug} />
  }
```

- [ ] **Step 5: Type-check + full suite**

Run:
```bash
npx tsc --noEmit 2>&1 | grep -E "components/dashboard|app/dashboard/\[clientSlug\]/configurable-dashboard" || echo "no new type errors"
npx tsx components/dashboard/config-mutations.test.ts
npx tsx components/dashboard/add-block/draft.test.ts
```
Expected: `no new type errors`, and both tests print `ok`.

- [ ] **Step 6: Production build (de-risk the preview)**

Run: `npm run build 2>&1 | tail -5`
Expected: build completes; the `configurable-dashboard` route compiles.

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/add-block/add-block-button.tsx components/dashboard/dashboard-shell.tsx components/dashboard/metric-block-states.tsx app/dashboard/[clientSlug]/configurable-dashboard/page.tsx
git commit -m "feat(dashboard): + Add block entry point (shell + empty state)"
```

---

## Self-Review

**Spec coverage** (against `2026-06-18-add-block-flow-design.md`):
- §3 flow (modal state machine, server action bridge, save+revalidate) → T5, T3, T6. ✅
- §4 `proposeBlock` (auth → permission → resolver dispatch, never-throws) → T3. ✅
- §5 `addBlock` + `applySelections` (leaf swaps; aggregate name/format only) → T1, T2 + tests. ✅
- §6 components (button, dialog, preview card with dropdowns + name/format; aggregate confirm-only) → T6, T5, T4. ✅
- §7 error/clarify/edge (forbidden, clarify loop, save failure, empty prompt, first-block-from-null-config) → T5 (states) + DEFAULT_CONFIG. ✅
- §8 testing (pure addBlock/applySelections; UI tsc+manual) → T1/T2 tests; T4/T5/T6 tsc gates + build. ✅
- §9 files → matches File Structure. ✅
- §10 out-of-scope (edit-existing-via-NL, operand dropdowns) → none included. ✅

**Placeholder scan:** none. ✅

**Type consistency:** `BlockSelections`/`applySelections` (T2) consumed identically in T4/T5; `addBlock` (T1) in T5; `proposeBlock`/`ProposeBlockInput` (T3) in T5; `AddBlockDialog` props (T5) match `AddBlockButton` usage (T6); `EmptyDashboardState` gains `slug` consistently in T6 (shell + page); `proposal.config` is a `BlockConfig` in both proposal types, fed to `applySelections`. ✅

**Out-of-band:** do not stage the unrelated uncommitted paid-search edits.
