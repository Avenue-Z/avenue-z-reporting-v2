# Edit a Block (header + narrative) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an editor change an existing header or narrative block in place (title, heading level, or markdown body) via the same builder used to create it, opened from a new "Edit…" kebab entry.

**Architecture:** Add an `updateBlock` mutation and a reverse `block→draft` mapper (`blockToManualDraft`), pre-seed the manual builder (`initial?`), add an `editing?` mode to the add-block dialog, and wire an "Edit…" kebab entry in the shared block chrome while removing the meaningless "Set range"/"Reset" entries for these data-less kinds.

**Tech Stack:** TypeScript (strict), Next.js 15 App Router, React, `tsx` + `node:assert` tests.

**Spec:** `docs/superpowers/specs/2026-06-25-edit-block-design.md`
**Branch:** `feat/dashboard-block-edit` (already created, off `feat/tc-dashboard-self-service-dash-system`).

## Global Constraints

- TypeScript strict; no `any` in new/changed code.
- Edit preserves block `id`, `range`, and `layout`; only name/format/binding/kind/headerLevel/narrativeBody change.
- Saves use the warm path: `saveDashboardConfig(slug, next)` + `router.refresh()` (no `revalidatePath`).
- Scope is header + narrative only; metric/chart kinds are untouched. No block-kind switching during edit.
- Range editing stays in the existing "Set range" menu (not part of edit).
- No new npm dependency.
- Tests run with `npx tsx <file>` and assert via `node:assert` (`console.log('ok')` at the end).

---

## Parallelization Map (for an agent fleet)

Tasks 1–3 are independent — disjoint files, no shared state — and run concurrently in **Wave 1**.
**Wave 2** is Task 4 (integrates 1+2+3). **Wave 3** is Task 5 (consumes Task 4's `editing` prop).

```
Wave 1 (parallel)      Wave 2        Wave 3
  T1 updateBlock ──┐
  T2 blockToDraft ─┼─►  T4 dialog ──►  T5 chrome
  T3 form.initial ─┘
```

**File ownership (no two concurrent tasks touch the same file):**
| Task | Files |
|---|---|
| T1 | `components/dashboard/config-mutations.ts`, `…/config-mutations.test.ts` |
| T2 | `components/dashboard/add-block/build-config.ts`, `…/build-config.test.ts` |
| T3 | `components/dashboard/add-block/manual-block-form.tsx` |
| T4 | `components/dashboard/add-block/add-block-dialog.tsx` |
| T5 | `components/dashboard/block-chrome.tsx` |

**Locked interface contracts (agree before parallel start — implementers see only their own task):**
- **T1 produces:** `updateBlock(config: DashboardConfig, blockId: string, patch: Omit<BlockConfig, 'id'>): DashboardConfig`
- **T2 produces:** `blockToManualDraft(block: PersistedBlock): ManualDraft` (header & narrative only; throws on other kinds)
- **T3 produces:** `ManualBlockForm` gains optional prop `initial?: ManualDraft` (seeds name/format/header/narrative state)
- **T4 produces:** `AddBlockDialog` gains optional prop `editing?: PersistedBlock` (build step, pre-seeded, saves via `updateBlock`)

**Integration note:** T4 imports `updateBlock` (T1), `blockToManualDraft` (T2), and passes `initial` to `ManualBlockForm` (T3). If T4 is built before T1–T3 merge, stub against the exact signatures above. T5 imports `AddBlockDialog` and renders it with `editing={block}`.

---

### Task 1: `updateBlock` mutation

Pure config mutation. Independent — no consumers in this task.

**Files:**
- Modify: `components/dashboard/config-mutations.ts`
- Modify: `components/dashboard/config-mutations.test.ts`

**Interfaces:**
- Consumes: `DashboardConfig`, `BlockConfig` from `@/lib/dashboard/types`.
- Produces: `updateBlock(config, blockId, patch: Omit<BlockConfig, 'id'>): DashboardConfig`.

- [ ] **Step 1: Write the failing test**

Append to `components/dashboard/config-mutations.test.ts`. Add `updateBlock` to the existing `./config-mutations` import, and ensure `DashboardConfig` is imported from `@/lib/dashboard/types` (add it if absent):
```ts
// updateBlock: replaces editable fields; preserves id, range, layout; leaves others intact
{
  const cfg: DashboardConfig = {
    defaultRange: { dateRange: 'last_30_days', compareRange: 'previous_period' },
    blocks: [
      { id: 'h1', name: 'Old Title', format: 'number', range: { dateRange: 'last_7_days', compareRange: null },
        layout: { x: 0, y: 0, w: 12, h: 1 }, kind: 'header', headerLevel: 2,
        binding: { source: 'supermetrics', dsId: '__static__', metricField: '__static__', account: '__static__' } },
      { id: 'k1', name: 'KPI', format: 'currency', range: null,
        binding: { source: 'triplewhale', metric: 'revenue' } },
    ],
  }
  const patch = {
    name: 'New Title', format: 'number' as const, range: null, kind: 'header' as const, headerLevel: 1 as const,
    binding: { source: 'supermetrics' as const, dsId: '__static__', metricField: '__static__', account: '__static__' },
  }
  const next = updateBlock(cfg, 'h1', patch)
  const h = next.blocks.find((b) => b.id === 'h1')!
  assert.equal(h.name, 'New Title')
  assert.equal(h.headerLevel, 1)
  assert.equal(h.id, 'h1')
  assert.deepEqual(h.range, { dateRange: 'last_7_days', compareRange: null }) // preserved (patch.range was null)
  assert.deepEqual(h.layout, { x: 0, y: 0, w: 12, h: 1 })                     // preserved
  assert.equal(next.blocks.find((b) => b.id === 'k1')!.name, 'KPI')          // untouched
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx components/dashboard/config-mutations.test.ts`
Expected: FAIL — `updateBlock is not a function` (or import error).

- [ ] **Step 3: Write minimal implementation**

In `components/dashboard/config-mutations.ts`, change the import on line 1 to add `BlockConfig`:
```ts
import type { BlockConfig, DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'
```
Append the function:
```ts
/** Replace a block's editable fields by id, preserving its id, range, and layout.
 *  The builder always emits range:null, so the existing range is kept explicitly
 *  (range stays owned by the "Set range" flow). */
export function updateBlock(
  config: DashboardConfig,
  blockId: string,
  patch: Omit<BlockConfig, 'id'>,
): DashboardConfig {
  return {
    ...config,
    blocks: config.blocks.map((b) =>
      b.id === blockId
        ? { ...patch, id: b.id, range: b.range, ...(b.layout ? { layout: b.layout } : {}) }
        : b,
    ),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx components/dashboard/config-mutations.test.ts`
Expected: `ok`.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add components/dashboard/config-mutations.ts components/dashboard/config-mutations.test.ts
git commit -m "feat(dashboard): updateBlock mutation (preserve id/range/layout)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `blockToManualDraft` reverse-mapper

Pure function turning a persisted header/narrative block back into a builder draft.

**Files:**
- Modify: `components/dashboard/add-block/build-config.ts`
- Modify: `components/dashboard/add-block/build-config.test.ts`

**Interfaces:**
- Consumes: `PersistedBlock` from `@/lib/dashboard/types`; local `ManualDraft`, `buildBlockConfig`.
- Produces: `blockToManualDraft(block: PersistedBlock): ManualDraft`.

- [ ] **Step 1: Write the failing test**

Append to `components/dashboard/add-block/build-config.test.ts`. Add `blockToManualDraft` to the existing `./build-config` import (the file already imports `buildBlockConfig`):
```ts
// blockToManualDraft: header round-trips through buildBlockConfig (name, kind, level)
{
  const headerBlock = { id: 'h', name: 'Section A', format: 'number' as const, range: null,
    kind: 'header' as const, headerLevel: 1 as const,
    binding: { source: 'supermetrics' as const, dsId: '__static__', metricField: '__static__', account: '__static__' } }
  const draft = blockToManualDraft(headerBlock)
  assert.equal(draft.kind, 'header')
  const cfg = buildBlockConfig(draft)
  assert.equal(cfg.kind, 'header')
  assert.equal(cfg.name, 'Section A')
  assert.equal(cfg.headerLevel, 1)
}
// blockToManualDraft: narrative round-trips (name, kind, body)
{
  const narrativeBlock = { id: 'n', name: 'Notes', format: 'number' as const, range: null,
    kind: 'narrative' as const, narrativeBody: '## Hi\n- a',
    binding: { source: 'supermetrics' as const, dsId: '__static__', metricField: '__static__', account: '__static__' } }
  const draft = blockToManualDraft(narrativeBlock)
  assert.equal(draft.kind, 'narrative')
  const cfg = buildBlockConfig(draft)
  assert.equal(cfg.kind, 'narrative')
  assert.equal(cfg.name, 'Notes')
  assert.equal(cfg.narrativeBody, '## Hi\n- a')
}
// blockToManualDraft: missing headerLevel defaults to 2
{
  const headerBlock = { id: 'h', name: 'X', format: 'number' as const, range: null, kind: 'header' as const,
    binding: { source: 'supermetrics' as const, dsId: '__static__', metricField: '__static__', account: '__static__' } }
  const draft = blockToManualDraft(headerBlock)
  if (draft.kind === 'header') assert.equal(draft.header.level, 2)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx components/dashboard/add-block/build-config.test.ts`
Expected: FAIL — `blockToManualDraft` not exported.

- [ ] **Step 3: Write minimal implementation**

In `components/dashboard/add-block/build-config.ts`, add `PersistedBlock` to the `@/lib/dashboard/types` import (line 1), then append:
```ts
/** Reverse a persisted block into a builder draft so edit opens pre-filled.
 *  Scoped to the kinds we currently edit (header, narrative). */
export function blockToManualDraft(block: PersistedBlock): ManualDraft {
  const { name, format } = block
  if (block.kind === 'header') {
    return { kind: 'header', name, format, header: { source: 'header', level: block.headerLevel ?? 2 } }
  }
  if (block.kind === 'narrative') {
    return { kind: 'narrative', name, format, narrative: { source: 'narrative', body: block.narrativeBody ?? '' } }
  }
  throw new Error(`blockToManualDraft: unsupported kind ${block.kind ?? 'kpi'}`)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx components/dashboard/add-block/build-config.test.ts`
Expected: `ok`.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add components/dashboard/add-block/build-config.ts components/dashboard/add-block/build-config.test.ts
git commit -m "feat(dashboard): blockToManualDraft reverse-mapper (header, narrative)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `ManualBlockForm` accepts `initial?`

Pre-seed the builder's state from an existing draft. No isolated unit test (stateful client form with child builders that aren't server-renderable under `tsx`); gated by typecheck here and verified in Task 5's manual smoke.

**Files:**
- Modify: `components/dashboard/add-block/manual-block-form.tsx`

**Interfaces:**
- Consumes: `ManualDraft` (already imported in this file).
- Produces: `ManualBlockForm` prop `initial?: ManualDraft`.

- [ ] **Step 1: Add the `initial` prop and seed state**

In `components/dashboard/add-block/manual-block-form.tsx`, add `initial,` to the destructured props and `initial?: ManualDraft` to the props type. Then replace the `name`, `format`, `header`, and `narrative` `useState` initializers (currently lines ~51, ~52, ~60, ~61) with these seeded versions:
```tsx
  const [name, setName] = useState(initial?.name ?? '')
  const [format, setFormat] = useState<MetricFormat>(initial?.format ?? 'number')
  // …leave leaf/calc/op/left/right/bar/line/pills/table initializers unchanged…
  const [header, setHeader] = useState<HeaderDraft>(() =>
    initial?.kind === 'header' ? initial.header : { source: 'header', level: 2 })
  const [narrative, setNarrative] = useState<NarrativeDraft>(() =>
    initial?.kind === 'narrative' ? initial.narrative : { source: 'narrative', body: '' })
```
(`HeaderDraft` and `NarrativeDraft` are already imported in this file. The other kinds' initializers keep their current blank defaults — they aren't edited in this scope.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` → clean.

- [ ] **Step 3: Lint the changed file**

Run: `npx eslint components/dashboard/add-block/manual-block-form.tsx` → clean.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/add-block/manual-block-form.tsx
git commit -m "feat(dashboard): ManualBlockForm accepts an initial draft seed

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `AddBlockDialog` `editing?` mode

Wire Tasks 1–3 into the dialog: pre-seed, retitle, and save via `updateBlock`. Depends on T1, T2, T3.

**Files:**
- Modify: `components/dashboard/add-block/add-block-dialog.tsx`

**Interfaces:**
- Consumes: `updateBlock` (T1), `blockToManualDraft` (T2), `ManualBlockForm` `initial?` (T3); `PersistedBlock`.
- Produces: `AddBlockDialog` prop `editing?: PersistedBlock`.

- [ ] **Step 1: Extend imports**

In `components/dashboard/add-block/add-block-dialog.tsx`:
- Line 7 import: `import { addBlock, updateBlock } from '../config-mutations'`
- Add: `import { blockToManualDraft } from './build-config'`
- Line 11 types import: add `PersistedBlock` →
  `import type { BlockConfig, BlockKind, DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'`

- [ ] **Step 2: Add `editing` prop + seed initial state**

Change the signature and the first state hooks:
```tsx
export function AddBlockDialog({ slug, config, onClose, editing }: {
  slug: string; config: DashboardConfig | null; onClose: () => void; editing?: PersistedBlock
}) {
  const router = useRouter()
  const initial = editing ? blockToManualDraft(editing) : undefined
  const [step, setStep] = useState<'kind' | 'pick' | 'mode' | 'prompt' | 'preview' | 'build'>(editing ? 'build' : 'kind')
  const [kind, setKind] = useState<BlockKind>(editing?.kind ?? 'kpi')
  const [source, setSource] = useState<Source>('supermetrics')
```

- [ ] **Step 3: Branch `confirmManual` on editing**

Replace `confirmManual`:
```tsx
  function confirmManual(cfg: Omit<BlockConfig, 'id'>) {
    setError(null)
    startTransition(async () => {
      const next = editing
        ? updateBlock(config ?? DEFAULT_CONFIG, editing.id, cfg)
        : addBlock(config ?? DEFAULT_CONFIG, { id: crypto.randomUUID(), ...cfg })
      const res = await saveDashboardConfig(slug, next)
      if (!res.ok) { setError(res.error); return }
      onClose(); router.refresh()
    })
  }
```

- [ ] **Step 4: Retitle the dialog + seed the build step**

Change the title (line ~106):
```tsx
          <p className="text-sm font-bold text-white">{editing ? 'Edit block' : 'Add block'}</p>
```
Change the `build` step's `ManualBlockForm` to pass `initial` and an edit-aware `onBack`:
```tsx
        {step === 'build' && (
          <>
            <ManualBlockForm
              kind={kind}
              source={source as 'supermetrics' | 'triplewhale' | 'aggregate' | 'calculated'}
              slug={slug}
              pending={pending}
              initial={initial}
              onConfirm={confirmManual}
              onBack={editing ? onClose : () => setStep(isStaticKind ? 'kind' : isDataChartKind ? 'pick' : 'mode')}
            />
            {error && <p className="mt-2 text-xs text-[#FF6666]">Error: {error}</p>}
          </>
        )}
```

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit` → clean.
Run: `npx eslint components/dashboard/add-block/add-block-dialog.tsx` → clean.

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/add-block/add-block-dialog.tsx
git commit -m "feat(dashboard): AddBlockDialog editing mode (pre-seed + updateBlock)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `BlockChrome` kebab — add "Edit…", drop "Set range"/"Reset" for static kinds

Surface the edit flow and clean up the meaningless range entries for header/narrative. Depends on T4.

**Files:**
- Modify: `components/dashboard/block-chrome.tsx`

**Interfaces:**
- Consumes: `AddBlockDialog` `editing?` (T4).
- Produces: user-facing "Edit…" entry on header/narrative blocks.

- [ ] **Step 1: Import the dialog + add open-state + static flag**

In `components/dashboard/block-chrome.tsx`:
- Add import: `import { AddBlockDialog } from './add-block/add-block-dialog'`
- Inside `BlockChrome`, add state near the other hooks: `const [editOpen, setEditOpen] = useState(false)`
- Add: `const isStatic = block.kind === 'header' || block.kind === 'narrative'`

- [ ] **Step 2: Render the edit dialog (mounted only when open)**

Inside the top-level `<div className="relative">`, after `{children}`, add:
```tsx
      {canEdit && editOpen && (
        <AddBlockDialog slug={slug} config={config} editing={block} onClose={() => setEditOpen(false)} />
      )}
```

- [ ] **Step 3: Swap the menu entries for static kinds**

Replace the `view === 'menu'` block so static kinds show "Edit…" + "Delete" (no range entries), and other kinds keep today's "Set range…" / "Reset to inherit" / "Delete":
```tsx
            {view === 'menu' && (
              <div className="flex flex-col">
                {isStatic ? (
                  <button className="px-3 py-2 text-left text-[13px] text-white/80 hover:bg-white/[0.06]"
                    onClick={() => { setMenuOpen(false); setEditOpen(true) }}>Edit…</button>
                ) : (
                  <>
                    <button className="px-3 py-2 text-left text-[13px] text-white/80 hover:bg-white/[0.06]" onClick={() => setView('range')}>Set range…</button>
                    {isOverridden && (
                      <button className="px-3 py-2 text-left text-[13px] text-white/80 hover:bg-white/[0.06]" onClick={() => setView('confirm-reset')}>Reset to inherit</button>
                    )}
                  </>
                )}
                <button className="px-3 py-2 text-left text-[13px] text-[#FF6666] hover:bg-white/[0.06]" onClick={() => setView('confirm-delete')}>Delete block</button>
              </div>
            )}
```

- [ ] **Step 4: Typecheck + lint + build**

Run: `npx tsc --noEmit` → clean.
Run: `npx eslint components/dashboard/block-chrome.tsx` → clean.
Run: `npm run build` → succeeds (confirms no import cycle: `block-chrome` → `add-block-dialog` does not loop back).

- [ ] **Step 5: Manual smoke (executor note)**

Dev server on `/dashboard/<slug>/configurable-dashboard` (use a client with header + narrative blocks, e.g. `avenue-z` / `kind-patches`):
1. Kebab a **header** → menu shows **Edit… / Delete block** (no "Set range"). Click Edit → dialog opens titled "Edit block", pre-filled with the current title + level → change level to H1 → Save → header re-renders larger, position unchanged.
2. Kebab a **narrative** → Edit → dialog pre-filled with title + markdown body → edit the body → Save → renders updated markdown, position unchanged.
3. Kebab a **KPI tile** → menu still shows **Set range… / Delete** (unchanged), no "Edit…".

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/block-chrome.tsx
git commit -m "feat(dashboard): edit header/narrative via kebab; drop range entries for static blocks

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** updateBlock (T1); blockToManualDraft for header+narrative (T2); ManualBlockForm `initial?` (T3); AddBlockDialog `editing?` + updateBlock save + retitle (T4); kebab "Edit…" + remove Set range/Reset for static (T5). ✅
- **Placeholder scan:** none — full code in every code step; T3/T4/T5 UI steps are typecheck/lint/build-gated with an explicit manual smoke (no isolated unit test is feasible for the stateful client form/dialog under `tsx`).
- **Type consistency:** `updateBlock(config, id, Omit<BlockConfig,'id'>)` matches the `confirmManual` call in T4; `blockToManualDraft(block): ManualDraft` matches `initial` consumed by `ManualBlockForm` (T3) and passed by the dialog (T4); `editing?: PersistedBlock` matches T5's `editing={block}`; `isStatic` uses `block.kind` (`'header' | 'narrative'`), both valid `BlockKind`s.
- **Range preservation:** builder emits `range: null`; `updateBlock` keeps `b.range` (T1 test asserts it). ✅
- **No cycle:** `block-chrome` imports `add-block-dialog`; neither `add-block-dialog` nor its transitive imports import `block-chrome` (verified by `npm run build` in T5). ✅
- **Parallelization:** Wave 1 (T1/T2/T3) disjoint files; Wave 2 (T4) integrates; Wave 3 (T5) consumes. Contracts locked above. ✅
