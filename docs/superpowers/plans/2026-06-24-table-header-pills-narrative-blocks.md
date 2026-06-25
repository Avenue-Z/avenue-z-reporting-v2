# Table + Header + Pills + Narrative Block Kinds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the remaining four block kinds — `header`, `narrative`, `pills`, `table` — so analysts can compose the full visual vocabulary of a paid-media reporting page (titles, prose, KPI strip, sortable data table) entirely from the dashboard UI, no engineer involvement.

**Architecture:** Each new kind is a body component wrapped by the existing `<BlockChrome>` (extracted in sub-project #3). Static kinds (`header`, `narrative`) store their content directly on `BlockConfig` and need no resolver. `pills` reuses the KPI scalar pipeline (`resolveBlock` + leaf binding only, v1) with a compact body layout. `table` reuses `resolveGroupedBlock` from sub-project #2 (single-dim, single-metric v1) and renders its `GroupedResult` rows through the existing `<DataTable>` primitive — adding a sortable, paginated table with optional prev-period column.

**Tech Stack:** Next.js 16 App Router (RSC + Suspense streaming), TypeScript strict, Drizzle ORM (no migration needed — `blocks` is JSONB), react-markdown ^10.1.0 (already installed) for narrative rendering, the existing `<DataTable>` from `components/charts/data-table.tsx`, `<BlockChrome>` from sub-project #3.

## Global Constraints

- TypeScript strict — **no `any` in new code.** Recharts/lib types must be respected; cast only via discriminated union narrowing.
- Tests are pure tsx + `node:assert` IIFE (no test runner, no .env loading). Run with `npx tsx <file>`.
- Typecheck command is `./node_modules/.bin/tsc --noEmit` — NOT `npx tsc` (the latter resolves a different binary in this environment).
- Conventional commit prefixes: `feat|refactor|docs(dashboard|charts):`. Footer on every commit: `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`.
- Compile-green at every commit boundary. Existing KPI/Bar/Line behavior byte-identical at every task gate.
- All Supermetrics API calls server-side only. No `ds_id` hardcoded — pull from `lib/supermetrics/constants.ts`. Client data is in DB via `lib/db/queries.ts` (always `await`).
- All async data fetching for new block kinds streams via Suspense + async RSC + `Promise<ResolveResult | GroupedResult | SeriesResult>` — matches Paul's progressive-streaming pattern. Static kinds (`header`, `narrative`) render synchronously inside `BlockChrome` and have no Suspense boundary.
- v1 scope: tables are **single-dim, single-metric**. Multi-metric tables are sub-project #5. Pills accept **leaf bindings only** (no aggregate/calculated in v1). These constraints must be reflected in builder UI (no extra options shown) and resolver gates (graceful `invalid-metric` for unsupported bindings).
- Stacked PR pattern: PR #76 base stays `feat/configurable-dashboard-rnd`. Never modify the parent branch directly. Never force-push.
- Parent branch sync check at task start: `git fetch origin && git log --oneline HEAD..origin/feat/configurable-dashboard-rnd`. If non-empty, merge before proceeding.

---

## File Structure

**New files (created in this plan):**

| Path | Responsibility |
|---|---|
| `components/dashboard/blocks/header-block.tsx` | Static header RSC — name + heading level inside `<BlockChrome>`. No Suspense. |
| `components/dashboard/blocks/header-block-body.tsx` | Presentation of the header text (h1/h2/h3 styling). |
| `components/dashboard/blocks/narrative-block.tsx` | Static narrative RSC — name + body inside `<BlockChrome>`. No Suspense. |
| `components/dashboard/blocks/narrative-block-body.tsx` | Renders `BlockConfig.narrativeBody` via react-markdown. |
| `components/dashboard/blocks/pills-block.tsx` | Async RSC — `Promise<ResolveResult>` streamed via Suspense inside `<BlockChrome>`. |
| `components/dashboard/blocks/pills-block-body.tsx` | Compact KPI presentation (small font, optional delta inline). |
| `components/dashboard/blocks/table-block.tsx` | Async RSC — `Promise<GroupedResult>` streamed via Suspense inside `<BlockChrome>`. |
| `components/dashboard/blocks/table-block-body.tsx` | Renders `GroupedResult.rows` via `<DataTable>` with optional Compare column. |
| `lib/dashboard/table.ts` | Pure adapter `toTableInput(r): TableInput` — converts `GroupedResult` rows to `<DataTable>` columns+rows. |
| `lib/dashboard/table.test.ts` | Tests for `toTableInput`. |
| `components/dashboard/add-block/header-builder.tsx` | Manual builder for header — name + headerLevel select. |
| `components/dashboard/add-block/narrative-builder.tsx` | Manual builder for narrative — name + textarea body. |
| `components/dashboard/add-block/pills-builder.tsx` | Manual builder for pills — leaf builder, no aggregate/calculated. |
| `components/dashboard/add-block/table-builder.tsx` | Manual builder for table — leaf + dimension picker (reuses `<DimensionPicker>`). |

**Modified files:**

| Path | Why |
|---|---|
| `lib/dashboard/types.ts` | Add `'pills'` to `BlockKind` union. Add `headerLevel?: 1 \| 2 \| 3` and `narrativeBody?: string` annotations to `BlockConfig`. |
| `components/dashboard/block-grid-defaults.ts` | Add `pills` entry to `DEFAULT_LAYOUT`. |
| `app/dashboard/[clientSlug]/configurable-dashboard/page.tsx` | Dispatcher: add cases for `'header' \| 'narrative' \| 'pills' \| 'table'` in `renderBlockNode`. |
| `components/dashboard/add-block/add-block-dialog.tsx` | Flip `available: true` on 4 KIND_OPTIONS rows; add 'pills' row; route static kinds (`header`, `narrative`) directly from 'kind' → 'build' (skipping 'pick'); add table + pills entries to SOURCES_BY_KIND. |
| `components/dashboard/add-block/manual-block-form.tsx` | Dispatch on new kinds (`header`, `narrative`, `pills`, `table`) → new builders. |
| `components/dashboard/add-block/build-config.ts` | Add `HeaderDraft`, `NarrativeDraft`, `PillsDraft`, `TableDraft` types and `xToBlockConfig` helpers. Extend `ManualDraft` union, `buildBlockConfig`, `isDraftComplete`. |
| `components/dashboard/add-block/build-config.test.ts` | Coverage for new converters and completeness predicates. |
| `lib/dashboard/adapters/supermetrics.ts` | (Already constrains length 1 — leave for v1 tables; spec'd for v2 multi-metric tables.) NO CHANGE. |
| `lib/dashboard/adapters/triplewhale.ts` | NO CHANGE. |

**Total: 14 new files, 7 modified files, 8 tasks.**

---

## Task 1: Type-layer foundation + grid defaults

Adds the `'pills'` discriminator, expands `BlockConfig` with header/narrative annotations, and registers the new layout default. This is pure type-layer work — no rendering, no resolver. Compile-green at the end; existing KPI/Bar/Line untouched.

**Files:**
- Modify: `lib/dashboard/types.ts:48` (BlockKind union) and `lib/dashboard/types.ts:58-72` (BlockConfig fields).
- Modify: `components/dashboard/block-grid-defaults.ts:6-13` (add `pills` entry).
- Test: `lib/dashboard/types.test.ts` (new file — tiny type-shape sanity test).

**Interfaces:**
- Consumes: nothing new. Reads existing `BlockKind`, `BlockConfig`.
- Produces:
  - `BlockKind` now includes `'pills'`.
  - `BlockConfig` now optionally carries `headerLevel?: 1 | 2 | 3` (ignored by all kinds except `header`) and `narrativeBody?: string` (ignored by all kinds except `narrative`).
  - `DEFAULT_LAYOUT['pills']` exists with shape `{ w: 4, h: 1, minW: 2, minH: 1 }`.

- [ ] **Step 1: Write the failing test**

Create `lib/dashboard/types.test.ts`:

```typescript
// lib/dashboard/types.test.ts
// Run: npx tsx lib/dashboard/types.test.ts
import { strict as assert } from 'node:assert'
import type { BlockKind, BlockConfig } from './types'
import { DEFAULT_LAYOUT } from '../../components/dashboard/block-grid-defaults'

// Type-level: 'pills' is assignable to BlockKind
const k: BlockKind = 'pills'
assert.equal(k, 'pills')

// Type-level: BlockConfig accepts new annotations
const h: BlockConfig = {
  id: 'h', name: 'Q3 Performance', kind: 'header', format: 'number', range: null,
  binding: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' },
  headerLevel: 2,
}
assert.equal(h.headerLevel, 2)

const n: BlockConfig = {
  id: 'n', name: 'Notes', kind: 'narrative', format: 'number', range: null,
  binding: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' },
  narrativeBody: '## Highlights\n- Cost down 12%',
}
assert.equal(n.narrativeBody?.startsWith('## '), true)

// Runtime: pills layout default exists
assert.equal(DEFAULT_LAYOUT.pills.w, 4)
assert.equal(DEFAULT_LAYOUT.pills.h, 1)
assert.equal(DEFAULT_LAYOUT.pills.minW, 2)
assert.equal(DEFAULT_LAYOUT.pills.minH, 1)

console.log('ok')
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx tsx lib/dashboard/types.test.ts
```

Expected: TypeScript error — `Type '"pills"' is not assignable to type 'BlockKind'` (and `headerLevel`/`narrativeBody` unknown properties).

- [ ] **Step 3: Add `'pills'` to BlockKind union**

Edit `lib/dashboard/types.ts:48`:

```typescript
/** Block kind discriminator. Default at parse/render time is 'kpi' for back-compat. */
export type BlockKind = 'kpi' | 'pills' | 'bar' | 'line' | 'table' | 'narrative' | 'header'
```

- [ ] **Step 4: Add header/narrative annotations to BlockConfig**

Edit `lib/dashboard/types.ts:58-72` — add two new optional fields immediately after `ceiling?`:

```typescript
export interface BlockConfig {
  id: string
  name: string
  /** Renderer + resolver mode. Omitted = 'kpi' (back-compat). */
  kind?: BlockKind
  binding: Binding
  format: MetricFormat
  range: { dateRange: string; compareRange: string | null } | null // null = inherit global
  /** KPI-only annotations (ignored by other kinds). */
  subLabel?: string
  /** Green when value ≥ target and < ceiling. */
  target?: number
  /** Orange when value ≥ ceiling. */
  ceiling?: number
  /** Header-only: heading level (1 = largest). Default 2. */
  headerLevel?: 1 | 2 | 3
  /** Narrative-only: markdown body (rendered via react-markdown). */
  narrativeBody?: string
}
```

- [ ] **Step 5: Add `pills` to DEFAULT_LAYOUT**

Edit `components/dashboard/block-grid-defaults.ts:6-13` — insert `pills` between `kpi` and `bar`:

```typescript
export const DEFAULT_LAYOUT: Record<BlockKind, { w: number; h: number; minW: number; minH: number }> = {
  kpi:       { w: 3,  h: 2, minW: 2, minH: 2 },   // 4-per-row — matches today's lg:grid-cols-4 visual
  pills:     { w: 4,  h: 1, minW: 2, minH: 1 },   // compact horizontal KPI strip
  bar:       { w: 6,  h: 4, minW: 4, minH: 3 },
  line:      { w: 6,  h: 4, minW: 4, minH: 3 },
  table:     { w: 8,  h: 5, minW: 4, minH: 3 },
  narrative: { w: 12, h: 3, minW: 4, minH: 2 },
  header:    { w: 12, h: 1, minW: 4, minH: 1 },
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npx tsx lib/dashboard/types.test.ts
```

Expected: `ok` printed, exit 0.

- [ ] **Step 7: Verify whole-tree typecheck**

```bash
./node_modules/.bin/tsc --noEmit
```

Expected: no output, exit 0. (If `Record<BlockKind, ...>` exhaustiveness fires elsewhere, that's the layout-default catching us — Task 1 already supplies the `pills` entry.)

- [ ] **Step 8: Commit**

```bash
git add lib/dashboard/types.ts lib/dashboard/types.test.ts components/dashboard/block-grid-defaults.ts
git commit -m "$(cat <<'EOF'
feat(dashboard): add 'pills' kind + header/narrative annotations

Adds the 'pills' discriminator to BlockKind (sub-project #4 prep) and two
optional BlockConfig annotations — headerLevel for header blocks and
narrativeBody for narrative blocks. Registers a compact 4×1 grid default
for pills.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: HeaderBlock (static, no resolver)

A section heading that spans the grid. No data, no Suspense, no resolver. Renders as h1/h2/h3 based on `block.headerLevel ?? 2`. Still wrapped in `<BlockChrome>` so it gets the kebab (Delete, Reset range though range is meaningless — we still show the menu for delete).

**Files:**
- Create: `components/dashboard/blocks/header-block.tsx`
- Create: `components/dashboard/blocks/header-block-body.tsx`

**Interfaces:**
- Consumes: `<BlockChrome>` from `components/dashboard/block-chrome.tsx`; `PersistedBlock`, `DashboardConfig` from `lib/dashboard/types.ts`.
- Produces:
  - `<HeaderBlockBody>` — pure presentation. Props: `{ name: string; level?: 1 | 2 | 3 }`. Renders the heading.
  - `<HeaderBlock>` — server component. Props: `{ block: PersistedBlock; canEdit: boolean; slug: string; config: DashboardConfig; activeDefault: { dateRange: string; compareRange: string | null } }`. Wraps body in `<BlockChrome>`.

- [ ] **Step 1: Write the failing test**

Create `components/dashboard/blocks/header-block-body.test.tsx`:

```typescript
// components/dashboard/blocks/header-block-body.test.tsx
// Run: npx tsx components/dashboard/blocks/header-block-body.test.tsx
import { strict as assert } from 'node:assert'
import { renderToString } from 'react-dom/server'
import { HeaderBlockBody } from './header-block-body'

// Default level (undefined) → h2
{
  const html = renderToString(<HeaderBlockBody name="Section title" />)
  assert.equal(html.includes('<h2'), true, 'default renders h2')
  assert.equal(html.includes('Section title'), true)
}

// Explicit level 1 → h1
{
  const html = renderToString(<HeaderBlockBody name="Big title" level={1} />)
  assert.equal(html.includes('<h1'), true)
}

// Explicit level 3 → h3
{
  const html = renderToString(<HeaderBlockBody name="Small title" level={3} />)
  assert.equal(html.includes('<h3'), true)
}

console.log('ok')
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx tsx components/dashboard/blocks/header-block-body.test.tsx
```

Expected: FAIL with "Cannot find module './header-block-body'".

- [ ] **Step 3: Implement `HeaderBlockBody`**

Create `components/dashboard/blocks/header-block-body.tsx`:

```tsx
/** Static section header. Pure presentation — no data fetching. The kebab
 *  on the surrounding <BlockChrome> handles delete; range overrides are
 *  meaningless here (no data) but the menu still shows them for uniformity. */
export function HeaderBlockBody({ name, level }: { name: string; level?: 1 | 2 | 3 }) {
  const lvl = level ?? 2
  const cls =
    lvl === 1 ? 'text-2xl font-extrabold uppercase tracking-widest text-white'
    : lvl === 2 ? 'text-lg font-extrabold uppercase tracking-widest text-white/90'
    : 'text-sm font-extrabold uppercase tracking-widest text-text-muted'
  if (lvl === 1) return <h1 className={`px-1 py-2 ${cls}`}>{name}</h1>
  if (lvl === 2) return <h2 className={`px-1 py-2 ${cls}`}>{name}</h2>
  return <h3 className={`px-1 py-2 ${cls}`}>{name}</h3>
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx tsx components/dashboard/blocks/header-block-body.test.tsx
```

Expected: `ok`.

- [ ] **Step 5: Implement `HeaderBlock` server component**

Create `components/dashboard/blocks/header-block.tsx`:

```tsx
import { BlockChrome } from '../block-chrome'
import { HeaderBlockBody } from './header-block-body'
import type { DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'

/** Static section header block. Renders synchronously — no Suspense, no resolver. */
export function HeaderBlock({
  block, canEdit, slug, config, activeDefault,
}: {
  block: PersistedBlock
  canEdit: boolean
  slug: string
  config: DashboardConfig
  activeDefault: { dateRange: string; compareRange: string | null }
}) {
  return (
    <BlockChrome block={block} canEdit={canEdit} slug={slug} config={config} activeDefault={activeDefault}>
      <HeaderBlockBody name={block.name} level={block.headerLevel} />
    </BlockChrome>
  )
}
```

- [ ] **Step 6: Typecheck**

```bash
./node_modules/.bin/tsc --noEmit
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/blocks/header-block.tsx components/dashboard/blocks/header-block-body.tsx components/dashboard/blocks/header-block-body.test.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): add HeaderBlock — static section heading

Pure presentation. h1/h2/h3 from block.headerLevel (default 2). Wrapped
in BlockChrome for uniform kebab/delete. No Suspense, no resolver.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: NarrativeBlock (static prose, markdown)

Free-text panel for analyst commentary. Body is stored as markdown in `block.narrativeBody` and rendered via the already-installed `react-markdown` package. No data, no Suspense.

**Files:**
- Create: `components/dashboard/blocks/narrative-block.tsx`
- Create: `components/dashboard/blocks/narrative-block-body.tsx`

**Interfaces:**
- Consumes: `<BlockChrome>`, `PersistedBlock`, `DashboardConfig`. New dep: `react-markdown` (already in package.json at ^10.1.0).
- Produces:
  - `<NarrativeBlockBody>` — pure presentation. Props: `{ name: string; body?: string }`. Renders name as a small label, body as markdown.
  - `<NarrativeBlock>` — server component. Same shape as `HeaderBlock`.

- [ ] **Step 1: Write the failing test**

Create `components/dashboard/blocks/narrative-block-body.test.tsx`:

```typescript
// components/dashboard/blocks/narrative-block-body.test.tsx
// Run: npx tsx components/dashboard/blocks/narrative-block-body.test.tsx
//
// Behavioral test only — we don't assert react-markdown's exact HTML output
// (that's version-dependent and react-markdown's ESM-only deps can fail to
// resolve under tsx in some setups). The visual fidelity is verified at the
// final smoke test by manually adding a markdown narrative block in the UI.
import { strict as assert } from 'node:assert'
import { renderToString } from 'react-dom/server'
import { NarrativeBlockBody } from './narrative-block-body'

// Empty body → placeholder copy visible
{
  const html = renderToString(<NarrativeBlockBody name="Notes" />)
  assert.equal(html.includes('Notes'), true, 'name visible')
  assert.equal(html.includes('No content yet'), true, 'empty placeholder shown')
}

// Whitespace-only body still shows placeholder (not interpreted as content)
{
  const html = renderToString(<NarrativeBlockBody name="Notes" body="   " />)
  assert.equal(html.includes('No content yet'), true, 'whitespace treated as empty')
}

// Non-empty body → placeholder is gone (we don't assert exact rendered HTML)
{
  const html = renderToString(<NarrativeBlockBody name="Notes" body="Highlights" />)
  assert.equal(html.includes('Notes'), true)
  assert.equal(html.includes('No content yet'), false, 'placeholder hidden when body present')
  assert.equal(html.includes('Highlights'), true, 'body content present somewhere')
}

console.log('ok')
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx tsx components/dashboard/blocks/narrative-block-body.test.tsx
```

Expected: FAIL with "Cannot find module './narrative-block-body'".

- [ ] **Step 3: Implement `NarrativeBlockBody`**

Create `components/dashboard/blocks/narrative-block-body.tsx`:

```tsx
import ReactMarkdown from 'react-markdown'

/** Static narrative panel. `body` is markdown rendered via react-markdown.
 *  Empty body shows a quiet placeholder so the empty state is legible. */
export function NarrativeBlockBody({ name, body }: { name: string; body?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface px-6 py-5 h-full">
      <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">{name}</p>
      <div className="mt-3 prose prose-invert max-w-none text-sm text-white/90">
        {body && body.trim() !== ''
          ? <ReactMarkdown>{body}</ReactMarkdown>
          : <p className="italic text-text-muted">No content yet — edit this block to add notes.</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx tsx components/dashboard/blocks/narrative-block-body.test.tsx
```

Expected: `ok`.

- [ ] **Step 5: Implement `NarrativeBlock` server component**

Create `components/dashboard/blocks/narrative-block.tsx`:

```tsx
import { BlockChrome } from '../block-chrome'
import { NarrativeBlockBody } from './narrative-block-body'
import type { DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'

/** Static narrative block. Renders synchronously — body is stored on the
 *  block config as markdown; react-markdown renders it inline. */
export function NarrativeBlock({
  block, canEdit, slug, config, activeDefault,
}: {
  block: PersistedBlock
  canEdit: boolean
  slug: string
  config: DashboardConfig
  activeDefault: { dateRange: string; compareRange: string | null }
}) {
  return (
    <BlockChrome block={block} canEdit={canEdit} slug={slug} config={config} activeDefault={activeDefault}>
      <NarrativeBlockBody name={block.name} body={block.narrativeBody} />
    </BlockChrome>
  )
}
```

- [ ] **Step 6: Typecheck**

```bash
./node_modules/.bin/tsc --noEmit
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/blocks/narrative-block.tsx components/dashboard/blocks/narrative-block-body.tsx components/dashboard/blocks/narrative-block-body.test.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): add NarrativeBlock — markdown prose panel

Renders block.narrativeBody via react-markdown. Empty body shows a quiet
placeholder. Same BlockChrome wrapping as the other kinds.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: PillsBlock (compact KPI variant, streaming)

A small KPI tile sized for a horizontal strip. Reuses Paul's KPI streaming pattern (`Promise<ResolveResult>` + Suspense + `<BlockValue>` + `<BlockDelta>`). Differs from KPI only in body layout (smaller fonts, value + delta on one line, no `subLabel`). v1 accepts **leaf bindings only** — aggregate/calculated produce `invalid-metric` (rejected at the builder, also gracefully handled at render).

**Files:**
- Create: `components/dashboard/blocks/pills-block.tsx`
- Create: `components/dashboard/blocks/pills-block-body.tsx`

**Interfaces:**
- Consumes: `resolveBlock`, `ResolveResult` from `lib/dashboard/resolve.ts` + `lib/dashboard/types.ts`. `<BlockValue>`, `<BlockDelta>` from existing block primitives. `ValueSkeleton`, `DeltaSkeleton` from `components/dashboard/metric-block-states.tsx`. `<BlockChrome>`, `detachBadgeLabel`, `DetachBadge` from `components/dashboard/block-chrome.tsx`. `resolveCompareIso` from `lib/paid-search/base.ts`.
- Produces:
  - `<PillsBlockBody>` — pure presentation. Props: `{ name: ReactNode; value: ReactNode; delta: ReactNode; badge?: ReactNode }`. Compact: name on top (small caps), value + delta on the same baseline.
  - `<PillsBlock>` — server component. Props: `{ block: PersistedBlock; canEdit: boolean; slug: string; config: DashboardConfig; activeDefault: { dateRange: string; compareRange: string | null } }`. Builds two resolve promises (current + prior, same as KPI dispatcher in `page.tsx`), streams them through `<BlockValue>` / `<BlockDelta>` inside `<PillsBlockBody>`, wrapped in `<BlockChrome>`.

- [ ] **Step 1: Write the failing test**

Create `components/dashboard/blocks/pills-block-body.test.tsx`:

```typescript
// components/dashboard/blocks/pills-block-body.test.tsx
// Run: npx tsx components/dashboard/blocks/pills-block-body.test.tsx
import { strict as assert } from 'node:assert'
import { renderToString } from 'react-dom/server'
import { PillsBlockBody } from './pills-block-body'

// Renders name + value + delta in one row container
{
  const html = renderToString(<PillsBlockBody name="Sessions" value="$1.2k" delta="↑ 5%" />)
  assert.equal(html.includes('Sessions'), true)
  assert.equal(html.includes('$1.2k'), true)
  assert.equal(html.includes('↑ 5%'), true)
}

// Badge slot renders when provided
{
  const html = renderToString(<PillsBlockBody name="X" value="1" delta="0" badge={<span>BADGE</span>} />)
  assert.equal(html.includes('BADGE'), true)
}

console.log('ok')
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx tsx components/dashboard/blocks/pills-block-body.test.tsx
```

Expected: FAIL with "Cannot find module './pills-block-body'".

- [ ] **Step 3: Implement `PillsBlockBody`**

Create `components/dashboard/blocks/pills-block-body.tsx`:

```tsx
import type { ReactNode } from 'react'

/** Compact KPI body for a horizontal pills strip. Name (small caps) + value +
 *  inline delta — designed for a 4×1 grid cell. No sub-label, no target/ceiling
 *  badges (those live on full KPI tiles). */
export function PillsBlockBody({
  name, value, delta, badge,
}: {
  name: ReactNode
  value: ReactNode
  delta: ReactNode
  badge?: ReactNode
}) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface px-4 py-3 h-full flex items-center justify-between gap-3">
      <div className="flex flex-col min-w-0">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted truncate">{name}</p>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="text-base font-bold text-white">{value}</span>
          <span className="text-[11px] text-text-muted">{delta}</span>
        </div>
      </div>
      {badge}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx tsx components/dashboard/blocks/pills-block-body.test.tsx
```

Expected: `ok`.

- [ ] **Step 5: Implement `PillsBlock` server component**

Create `components/dashboard/blocks/pills-block.tsx`:

```tsx
import { Suspense } from 'react'
import { resolveBlock } from '@/lib/dashboard/resolve'
import { resolveCompareIso } from '@/lib/paid-search/base'
import { BlockValue } from '../block-value'
import { BlockDelta } from '../block-delta'
import { ValueSkeleton, DeltaSkeleton } from '../metric-block-states'
import { BlockChrome, DetachBadge, detachBadgeLabel } from '../block-chrome'
import { PillsBlockBody } from './pills-block-body'
import type { DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'

/** Compact KPI block. Streams value + delta progressively via Suspense, same
 *  pattern as MetricBlockShell — just a tighter body. */
export function PillsBlock({
  block, canEdit, slug, config, activeDefault,
}: {
  block: PersistedBlock
  canEdit: boolean
  slug: string
  config: DashboardConfig
  activeDefault: { dateRange: string; compareRange: string | null }
}) {
  const eff = block.range ?? activeDefault
  const ctx = { slug }
  const blockNoRange = { ...block, range: null }
  const valuePromise = resolveBlock(blockNoRange, { dateRange: eff.dateRange, compareRange: null }, ctx)
  const compareIso = resolveCompareIso(eff.dateRange, eff.compareRange)
  const prevPromise = compareIso
    ? resolveBlock(blockNoRange, { dateRange: compareIso, compareRange: null }, ctx)
    : null

  const label = detachBadgeLabel(block)
  const badge = label !== null ? <DetachBadge label={label} canEdit={false} onReset={() => {}} /> : null

  return (
    <BlockChrome block={block} canEdit={canEdit} slug={slug} config={config} activeDefault={activeDefault}>
      <PillsBlockBody
        name={block.name}
        value={
          <Suspense fallback={<ValueSkeleton />}>
            <BlockValue valuePromise={valuePromise} slug={slug} />
          </Suspense>
        }
        delta={
          <Suspense fallback={<DeltaSkeleton />}>
            <BlockDelta valuePromise={valuePromise} prevPromise={prevPromise} compareRange={eff.compareRange} />
          </Suspense>
        }
        badge={badge}
      />
    </BlockChrome>
  )
}
```

- [ ] **Step 6: Typecheck**

```bash
./node_modules/.bin/tsc --noEmit
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/blocks/pills-block.tsx components/dashboard/blocks/pills-block-body.tsx components/dashboard/blocks/pills-block-body.test.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): add PillsBlock — compact KPI variant

Same Suspense + BlockValue/BlockDelta streaming as MetricBlockShell but
renders into a tighter 4×1 cell. v1 accepts leaf bindings only; aggregate
and calculated are rejected upstream at the builder.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: TableBlock + chart-input adapter (streaming)

Renders sub-project #2's `GroupedResult` as a sortable table via the existing `<DataTable>`. v1: single-dim, single-metric. When `hasCompare` (any row has `prevValue`), an additional "Prev" column appears. Reuses `resolveGroupedBlock` — same path as Bar — so no resolver changes are needed.

**Files:**
- Create: `lib/dashboard/table.ts` — pure adapter `toTableInput`.
- Create: `lib/dashboard/table.test.ts` — coverage for the adapter.
- Create: `components/dashboard/blocks/table-block.tsx`
- Create: `components/dashboard/blocks/table-block-body.tsx`
- Modify: `components/dashboard/chart-skeleton.tsx` — extend `kind` union to include `'table'` so the same shimmer can sit inside `<TableBlock>`.

**Interfaces:**
- Consumes: `GroupedResult` from `lib/dashboard/types.ts`; `resolveGroupedBlock` from `lib/dashboard/resolve.ts`; `<DataTable>` from `components/charts/data-table.tsx`; `formatMetric` from `lib/dashboard/format.ts`; `<BlockChrome>`; `<ChartSkeleton>` from `components/dashboard/chart-skeleton.tsx` (current signature `{ kind: 'bar' | 'line' }` — extended to `'bar' | 'line' | 'table'` in this task); `<BlockBodyError>` from `components/dashboard/metric-block-states.tsx`.
- Produces:
  - `toTableInput(r: { ok: true; rows: GroupedRow[]; format: MetricFormat }): TableInput` — converts to `<DataTable>` props. `TableInput = { columns: { key: string; label: string; align?: 'left'|'right'; sortable?: boolean; sortValue?: (row: Record<string, ReactNode>) => number | string }[]; rows: Record<string, ReactNode>[]; defaultSort: { key: string; dir: 'asc' | 'desc' } | undefined }`. Format-aware: numeric columns are right-aligned and sortable.
  - `<TableBlockBody>` — Props: `{ block: PersistedBlock; groupedPromise: Promise<GroupedResult>; slug: string }`. Async; awaits the promise, renders `<DataTable>` or `<BlockBodyError>`.
  - `<TableBlock>` — Props match `<BarBlock>`: `{ block; groupedPromise; canEdit; slug; config; activeDefault }`. Wraps body in Suspense + BlockChrome.

- [ ] **Step 1: Write failing test for `toTableInput`**

Create `lib/dashboard/table.test.ts`:

```typescript
// lib/dashboard/table.test.ts
// Run: npx tsx lib/dashboard/table.test.ts
import { strict as assert } from 'node:assert'
import { toTableInput } from './table'
import type { GroupedRow, MetricFormat } from './types'

// Single-dim, no compare → 2 cols (dim + value), 3 rows, sorted desc by value default
{
  const rows: GroupedRow[] = [
    { dim: { Channel: 'Google' }, value: 1500 },
    { dim: { Channel: 'Meta' }, value: 800 },
    { dim: { Channel: 'TikTok' }, value: 200 },
  ]
  const r = toTableInput({ ok: true, rows, format: 'currency' as MetricFormat })
  assert.equal(r.columns.length, 2, '2 columns (dim + value)')
  assert.equal(r.columns[0].key, 'Channel')
  assert.equal(r.columns[1].key, '__value__')
  assert.equal(r.columns[1].align, 'right')
  assert.equal(r.rows.length, 3)
  assert.equal(r.defaultSort?.key, '__value__')
  assert.equal(r.defaultSort?.dir, 'desc')
}

// With compare → 3 cols (dim + value + prev)
{
  const rows: GroupedRow[] = [
    { dim: { Channel: 'Google' }, value: 1500, prevValue: 1000 },
    { dim: { Channel: 'Meta' }, value: 800, prevValue: 900 },
  ]
  const r = toTableInput({ ok: true, rows, format: 'currency' as MetricFormat })
  assert.equal(r.columns.length, 3)
  assert.equal(r.columns[2].key, '__prev__')
}

// undefined value (prior-only dim) renders as em-dash, sorts as -Infinity
{
  const rows: GroupedRow[] = [
    { dim: { Channel: 'Google' }, value: 100 },
    { dim: { Channel: 'New' }, value: undefined, prevValue: 50 },
  ]
  const r = toTableInput({ ok: true, rows, format: 'number' as MetricFormat })
  const sv = r.columns[1].sortValue!
  // The row whose value is undefined should sort below the row with value 100.
  const undefRow = r.rows.find((row) => row.Channel === 'New')!
  const valRow = r.rows.find((row) => row.Channel === 'Google')!
  assert.equal(typeof sv(undefRow), 'number')
  assert.equal((sv(undefRow) as number) < (sv(valRow) as number), true)
}

console.log('ok')
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx tsx lib/dashboard/table.test.ts
```

Expected: FAIL with "Cannot find module './table'".

- [ ] **Step 3: Implement `toTableInput`**

Create `lib/dashboard/table.ts`:

```typescript
import type { ReactNode } from 'react'
import type { GroupedRow, MetricFormat } from './types'
import { formatMetric } from './format'

export interface TableInput {
  columns: {
    key: string
    label: string
    align?: 'left' | 'right'
    sortable?: boolean
    sortValue?: (row: Record<string, ReactNode>) => number | string
  }[]
  rows: Record<string, ReactNode>[]
  defaultSort: { key: string; dir: 'asc' | 'desc' } | undefined
}

/** Convert a GroupedResult into props for <DataTable>. v1: single-dim, single-metric.
 *  Compare column appears iff any row has a defined prevValue. Numeric columns are
 *  right-aligned and sortable; undefined values sort below all defined values. */
export function toTableInput(
  r: { ok: true; rows: GroupedRow[]; format: MetricFormat },
): TableInput {
  // v1: single dim → take the first (and only) dim key from the first row.
  const dimKey = r.rows.length > 0 ? Object.keys(r.rows[0].dim)[0] : 'dim'
  const hasCompare = r.rows.some((row) => row.prevValue !== undefined)

  const VALUE = '__value__'
  const PREV = '__prev__'

  const sortNumeric = (key: typeof VALUE | typeof PREV) =>
    (row: Record<string, ReactNode>) => {
      const n = row[`${key}__sort`]
      return typeof n === 'number' ? n : -Infinity
    }

  const columns: TableInput['columns'] = [
    { key: dimKey, label: dimKey, align: 'left', sortable: true, sortValue: (row) => String(row[dimKey] ?? '') },
    { key: VALUE, label: 'Value', align: 'right', sortable: true, sortValue: sortNumeric(VALUE) },
  ]
  if (hasCompare) {
    columns.push({ key: PREV, label: 'Prev', align: 'right', sortable: true, sortValue: sortNumeric(PREV) })
  }

  const rows = r.rows.map((row) => {
    const out: Record<string, ReactNode> = {
      [dimKey]: row.dim[dimKey] ?? '',
      [VALUE]: row.value === undefined ? '—' : formatMetric(row.value, r.format),
      [`${VALUE}__sort`]: row.value ?? -Infinity,
    }
    if (hasCompare) {
      out[PREV] = row.prevValue === undefined ? '—' : formatMetric(row.prevValue, r.format)
      out[`${PREV}__sort`] = row.prevValue ?? -Infinity
    }
    return out
  })

  return { columns, rows, defaultSort: { key: VALUE, dir: 'desc' } }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx tsx lib/dashboard/table.test.ts
```

Expected: `ok`.

- [ ] **Step 5: Extend `<ChartSkeleton>` to accept `'table'`**

Edit `components/dashboard/chart-skeleton.tsx:3` — broaden the `kind` union from `'bar' | 'line'` to include `'table'`:

```tsx
/** Full-height shimmer used as the Suspense fallback for chart-like bodies
 *  (Bar, Line, Table). Lives inside <BlockChrome>'s card so the block's name
 *  + chrome paint instantly. */
export function ChartSkeleton({ kind }: { kind: 'bar' | 'line' | 'table' }) {
  return (
    <div
      className="h-full w-full min-h-[180px] animate-pulse rounded-lg border border-white/[0.06] bg-white/[0.04]"
      aria-busy="true"
      aria-label={`Loading ${kind} chart`}
    />
  )
}
```

- [ ] **Step 6: Implement `TableBlockBody`**

Create `components/dashboard/blocks/table-block-body.tsx`:

```tsx
import { DataTable } from '@/components/charts/data-table'
import { BlockBodyError } from '../metric-block-states'
import { toTableInput } from '@/lib/dashboard/table'
import type { GroupedResult, PersistedBlock } from '@/lib/dashboard/types'

/** Async body — awaits the GroupedResult promise; renders <DataTable> or error.
 *  Matches BarBlockBody's pattern: empty rows → 'no-data' error card. */
export async function TableBlockBody({
  block, groupedPromise, slug,
}: {
  block: PersistedBlock
  groupedPromise: Promise<GroupedResult>
  slug: string
}) {
  const r = await groupedPromise
  if (!r.ok) return <BlockBodyError name={block.name} error={r.error} slug={slug} />
  if (r.rows.length === 0) return <BlockBodyError name={block.name} error="no-data" slug={slug} />

  const t = toTableInput(r)
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface px-6 py-5 h-full flex flex-col">
      <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">{block.name}</p>
      <div className="mt-3 flex-1 min-h-0 overflow-auto">
        <DataTable columns={t.columns} rows={t.rows} defaultSort={t.defaultSort} />
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Implement `TableBlock` server component**

Create `components/dashboard/blocks/table-block.tsx`:

```tsx
import { Suspense } from 'react'
import { BlockChrome } from '../block-chrome'
import { ChartSkeleton } from '../chart-skeleton'
import { TableBlockBody } from './table-block-body'
import type { DashboardConfig, GroupedResult, PersistedBlock } from '@/lib/dashboard/types'

/** Streams a GroupedResult into <DataTable>. Same call-shape as BarBlock —
 *  the page dispatcher builds the promise via resolveGroupedBlock. */
export function TableBlock({
  block, groupedPromise, canEdit, slug, config, activeDefault,
}: {
  block: PersistedBlock
  groupedPromise: Promise<GroupedResult>
  canEdit: boolean
  slug: string
  config: DashboardConfig
  activeDefault: { dateRange: string; compareRange: string | null }
}) {
  return (
    <BlockChrome block={block} canEdit={canEdit} slug={slug} config={config} activeDefault={activeDefault}>
      <Suspense fallback={<ChartSkeleton kind="table" />}>
        <TableBlockBody block={block} groupedPromise={groupedPromise} slug={slug} />
      </Suspense>
    </BlockChrome>
  )
}
```

- [ ] **Step 8: Typecheck**

```bash
./node_modules/.bin/tsc --noEmit
```

Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add lib/dashboard/table.ts lib/dashboard/table.test.ts components/dashboard/blocks/table-block.tsx components/dashboard/blocks/table-block-body.tsx components/dashboard/chart-skeleton.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): add TableBlock — sortable data table

Streams sub-project #2's GroupedResult through the existing DataTable
primitive. Single-dim, single-metric v1. Compare column appears when any
row has a defined prevValue. Default sort: value desc. Empty rows render
as the standard 'no-data' error card. Extends <ChartSkeleton> with a
'table' kind so the same shimmer pattern applies.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Page dispatcher — wire all four new kinds

Adds the four new switch cases to `renderBlockNode` in `app/dashboard/[clientSlug]/configurable-dashboard/page.tsx`. KPI/Bar/Line branches stay byte-identical. Static kinds (`header`, `narrative`) build no promise; data kinds (`pills`, `table`) build the same promise shape as their KPI / Bar siblings.

**Files:**
- Modify: `app/dashboard/[clientSlug]/configurable-dashboard/page.tsx:97-167` (the `renderBlockNode` switch).

**Interfaces:**
- Consumes: `HeaderBlock`, `NarrativeBlock`, `PillsBlock`, `TableBlock` from `@/components/dashboard/blocks/*`; `resolveGroupedBlock` from `@/lib/dashboard/resolve` (already imported).
- Produces: dispatcher returns a real `ReactNode` for every `BlockKind`. `default` still returns `<UnsupportedBlockState>` (now unreachable for the seven known kinds, kept as the future-proofing fallback).

- [ ] **Step 1: Read the current dispatcher**

Confirm `app/dashboard/[clientSlug]/configurable-dashboard/page.tsx:97-169` looks like the imports + switch from sub-project #3 (lines 88-169). Imports at the top of the file at lines 10-17 include `MetricBlockShell`, `BarBlock`, `LineBlock`, `UnsupportedBlockState`.

- [ ] **Step 2: Add the four block imports**

In `app/dashboard/[clientSlug]/configurable-dashboard/page.tsx`, just after the existing block imports (around line 17), add:

```tsx
import { HeaderBlock } from '@/components/dashboard/blocks/header-block'
import { NarrativeBlock } from '@/components/dashboard/blocks/narrative-block'
import { PillsBlock } from '@/components/dashboard/blocks/pills-block'
import { TableBlock } from '@/components/dashboard/blocks/table-block'
```

- [ ] **Step 3: Add the four switch cases**

In `app/dashboard/[clientSlug]/configurable-dashboard/page.tsx`, in `renderBlockNode`, add these cases between the existing `'line'` case and the `default`:

```tsx
    case 'pills': {
      return (
        <PillsBlock
          block={block}
          canEdit={canEdit}
          slug={clientSlug}
          config={config}
          activeDefault={activeDefault}
        />
      )
    }
    case 'table': {
      const eff = block.range ?? activeDefault
      const groupedPromise = resolveGroupedBlock(
        block,
        { dateRange: eff.dateRange, compareRange: eff.compareRange },
        { slug: clientSlug },
      )
      return (
        <TableBlock
          block={block}
          groupedPromise={groupedPromise}
          canEdit={canEdit}
          slug={clientSlug}
          config={config}
          activeDefault={activeDefault}
        />
      )
    }
    case 'header': {
      return (
        <HeaderBlock
          block={block}
          canEdit={canEdit}
          slug={clientSlug}
          config={config}
          activeDefault={activeDefault}
        />
      )
    }
    case 'narrative': {
      return (
        <NarrativeBlock
          block={block}
          canEdit={canEdit}
          slug={clientSlug}
          config={config}
          activeDefault={activeDefault}
        />
      )
    }
```

- [ ] **Step 4: Typecheck**

```bash
./node_modules/.bin/tsc --noEmit
```

Expected: clean. If anywhere fires "Type 'BlockKind' is not assignable" it's because the switch's exhaustiveness now sees `'pills'`. Confirm the `default` case still narrows safely.

- [ ] **Step 5: Boot test the dev server**

```bash
npm run dev
```

Visit `http://localhost:3000/dashboard/renaissance/configurable-dashboard` — the page should render with no changes to existing blocks (since no DB row has the new kinds yet). Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/\[clientSlug\]/configurable-dashboard/page.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): dispatch header/narrative/pills/table block kinds

Adds the four new switch cases to renderBlockNode. KPI/Bar/Line branches
unchanged. Header and narrative dispatch synchronously; pills and table
build the same Promise shapes as their KPI / Bar siblings and let the
block component handle the Suspense boundary.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Add-block dialog — flip availability + skip 'pick' for static kinds

Activates the four "Coming v2" rows (table, narrative, header) and adds the new `pills` row. The dialog already has the 3-step flow (`kind` → `pick` → `mode|build`). Static kinds (`header`, `narrative`) have no data source, so they go directly from `kind` → `build` (skipping `pick`). Chart-like kinds (`pills`, `table`) follow the same path as Bar/Line: `kind` → `pick` → `build`.

**Files:**
- Modify: `components/dashboard/add-block/add-block-dialog.tsx:17-38` (`KIND_OPTIONS`, `SOURCES_BY_KIND`).
- Modify: `components/dashboard/add-block/add-block-dialog.tsx:96` (`isChartKind` narrowing).
- Modify: `components/dashboard/add-block/add-block-dialog.tsx:106-138` (kind-step + pick-step button handlers).

**Interfaces:**
- Consumes: `BlockKind` from `lib/dashboard/types.ts` (already includes `'pills'` after Task 1).
- Produces: clicking any of the four new kind rows navigates correctly — `header`/`narrative` jump to `'build'`; `pills`/`table` jump to `'pick'`. From `'pick'`, all four data kinds jump to `'build'` (chart-like; no AI/manual `'mode'` step in v1).

- [ ] **Step 1: Update `KIND_OPTIONS`**

In `components/dashboard/add-block/add-block-dialog.tsx:17-24`, replace the constant with:

```tsx
const KIND_OPTIONS: { value: BlockKind; label: string; available: boolean; hint?: string }[] = [
  { value: 'kpi',       label: 'KPI tile',         available: true  },
  { value: 'pills',     label: 'Pills (compact KPI)', available: true },
  { value: 'bar',       label: 'Bar chart',        available: true  },
  { value: 'line',      label: 'Line chart',       available: true  },
  { value: 'table',     label: 'Table',            available: true  },
  { value: 'narrative', label: 'Narrative panel',  available: true  },
  { value: 'header',    label: 'Section header',   available: true  },
]
```

- [ ] **Step 2: Update `SOURCES_BY_KIND`**

In `components/dashboard/add-block/add-block-dialog.tsx:26-38`, replace with:

```tsx
const SOURCES_BY_KIND: Record<BlockKind, { value: Source; label: string }[]> = {
  kpi: [
    { value: 'supermetrics', label: 'Supermetrics' },
    { value: 'triplewhale',  label: 'TripleWhale' },
    { value: 'aggregate',    label: 'Aggregate (formula)' },
    { value: 'calculated',   label: 'Calculated (weighted sum)' },
  ],
  pills:     [{ value: 'supermetrics', label: 'Supermetrics' }, { value: 'triplewhale', label: 'TripleWhale' }],
  bar:       [{ value: 'supermetrics', label: 'Supermetrics' }, { value: 'triplewhale', label: 'TripleWhale' }],
  line:      [{ value: 'supermetrics', label: 'Supermetrics' }, { value: 'triplewhale', label: 'TripleWhale' }],
  table:     [{ value: 'supermetrics', label: 'Supermetrics' }, { value: 'triplewhale', label: 'TripleWhale' }],
  narrative: [],
  header:    [],
}
```

- [ ] **Step 3: Update `isChartKind` and routing**

In `components/dashboard/add-block/add-block-dialog.tsx:96`, replace the single `isChartKind` line with two narrowings:

```tsx
  // Bar/Line/Pills/Table are leaf-only — skip the AI/manual mode step and go directly to 'build'.
  // KPI keeps the full prompt/mode flow.
  const isDataChartKind = kind === 'bar' || kind === 'line' || kind === 'pills' || kind === 'table'
  // Static kinds need no data source — skip 'pick' entirely and jump from 'kind' → 'build'.
  const isStaticKind = kind === 'header' || kind === 'narrative'
```

- [ ] **Step 4: Update the kind-step button to skip 'pick' for static kinds**

In `components/dashboard/add-block/add-block-dialog.tsx:109-122`, replace the kind-step `<button>` `onClick` with:

```tsx
                onClick={() => {
                  setKind(k.value)
                  setSource(SOURCES_BY_KIND[k.value][0]?.value ?? 'supermetrics')
                  // Static kinds (header/narrative) have no source step — jump straight to 'build'.
                  setStep(k.value === 'header' || k.value === 'narrative' ? 'build' : 'pick')
                }}
```

- [ ] **Step 5: Update the pick-step button**

In `components/dashboard/add-block/add-block-dialog.tsx:131`, replace the pick-step `<button>` `onClick` with the new narrowing name:

```tsx
              <button key={s.value} onClick={() => { setSource(s.value); setStep(isDataChartKind ? 'build' : 'mode') }}
```

- [ ] **Step 6: Update the build-step Back button**

In `components/dashboard/add-block/add-block-dialog.tsx:165`, the existing Back goes to `pick` for chart kinds and `mode` for KPI. Update it to handle static kinds by jumping back to `kind`:

```tsx
              onBack={() => setStep(isStaticKind ? 'kind' : isDataChartKind ? 'pick' : 'mode')}
```

- [ ] **Step 7: Typecheck**

```bash
./node_modules/.bin/tsc --noEmit
```

Expected: clean. `KIND_OPTIONS` and `SOURCES_BY_KIND` are exhaustive — TypeScript will refuse to compile if any `BlockKind` (incl. `'pills'`) is missing.

- [ ] **Step 8: Commit**

```bash
git add components/dashboard/add-block/add-block-dialog.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): unlock pills/table/narrative/header in Add block dialog

Flips available=true on the four pending rows + adds the 'pills' option.
Routes static kinds (header, narrative) from 'kind' directly to 'build'
(no source step). Data chart kinds (pills/table/bar/line) follow the
existing chart-like flow: kind → pick → build.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Manual builders + draft conversion + ManualBlockForm dispatch

Adds four new builder components (one per new kind) and extends `build-config.ts` with the matching draft types and converters. `ManualBlockForm` dispatches to the correct builder based on `kind`. Pills uses the existing `<LeafBuilder>` directly (no new builder needed beyond a thin wrapper for shape consistency).

**Files:**
- Create: `components/dashboard/add-block/header-builder.tsx`
- Create: `components/dashboard/add-block/narrative-builder.tsx`
- Create: `components/dashboard/add-block/pills-builder.tsx`
- Create: `components/dashboard/add-block/table-builder.tsx`
- Modify: `components/dashboard/add-block/build-config.ts` (add draft types + converters + extend `ManualDraft`/`buildBlockConfig`/`isDraftComplete`).
- Modify: `components/dashboard/add-block/build-config.test.ts` (add coverage).
- Modify: `components/dashboard/add-block/manual-block-form.tsx` (dispatch).

**Interfaces:**
- Consumes: `<LeafBuilder>`, `<DimensionPicker>` from sibling files; `LeafDraft`, `leafToBinding`, `isLeafComplete` from `build-config.ts`; `BlockConfig`, `Granularity` from `lib/dashboard/types.ts`.
- Produces:
  - `HeaderDraft = { source: 'header'; level: 1 | 2 | 3 }`
  - `NarrativeDraft = { source: 'narrative'; body: string }`
  - `PillsDraft = { source: 'pills'; leaf: LeafDraft }`
  - `TableDraft = { source: 'table'; leaf: LeafDraft; dimension: string }`
  - `headerToBlockConfig`, `narrativeToBlockConfig`, `pillsToBlockConfig`, `tableToBlockConfig` functions.
  - `ManualDraft` union extended; `buildBlockConfig` dispatches; `isDraftComplete` covers.
  - New manual-block-form branches for each kind, each rendering the matching builder.

- [ ] **Step 1: Write failing test extension**

Append to `components/dashboard/add-block/build-config.test.ts` (before the final `console.log('ok')` and `run().catch`):

```typescript
// header draft → header config (no binding semantics — synthesize a no-op leaf)
{
  const cfg = buildBlockConfig({ kind: 'header', name: 'Q3', format: 'number',
    header: { source: 'header', level: 1 } })
  assert.equal(cfg.kind, 'header')
  assert.equal(cfg.headerLevel, 1)
}

// narrative draft → narrative config
{
  const cfg = buildBlockConfig({ kind: 'narrative', name: 'Notes', format: 'number',
    narrative: { source: 'narrative', body: '## Hi' } })
  assert.equal(cfg.kind, 'narrative')
  assert.equal(cfg.narrativeBody, '## Hi')
}

// pills draft → pills config (kind='pills', leaf binding)
{
  const cfg = buildBlockConfig({ kind: 'pills', name: 'Sessions', format: 'count',
    pills: { source: 'pills', leaf: { source: 'supermetrics', dsId: 'GAWA', metricField: 'sessions', account: '1' } } })
  assert.equal(cfg.kind, 'pills')
  assert.equal(cfg.binding.source, 'supermetrics')
}

// table draft → table config (kind='table', leaf binding with single dim)
{
  const cfg = buildBlockConfig({ kind: 'table', name: 'By channel', format: 'currency',
    table: { source: 'table', leaf: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' }, dimension: 'Channel' } })
  assert.equal(cfg.kind, 'table')
  if (cfg.binding.source === 'supermetrics') {
    assert.deepEqual(cfg.binding.dimensions, ['Channel'])
  } else {
    throw new Error('expected supermetrics binding')
  }
}

// isDraftComplete: empty narrative body still completes (name required, body optional in v1)
assert.equal(isDraftComplete({ kind: 'narrative', name: 'X', format: 'number', narrative: { source: 'narrative', body: '' } }), true)
// isDraftComplete: header always completes once name set
assert.equal(isDraftComplete({ kind: 'header', name: 'X', format: 'number', header: { source: 'header', level: 2 } }), true)
// isDraftComplete: pills requires a complete leaf
assert.equal(isDraftComplete({ kind: 'pills', name: 'X', format: 'count', pills: { source: 'pills', leaf: { source: 'supermetrics', dsId: '', metricField: '', account: '' } } }), false)
// isDraftComplete: table requires complete leaf + dimension
assert.equal(isDraftComplete({ kind: 'table', name: 'X', format: 'count', table: { source: 'table', leaf: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' }, dimension: '' } }), false)
assert.equal(isDraftComplete({ kind: 'table', name: 'X', format: 'count', table: { source: 'table', leaf: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' }, dimension: 'Channel' } }), true)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx tsx components/dashboard/add-block/build-config.test.ts
```

Expected: FAIL — `buildBlockConfig` doesn't recognize the new kinds; `ManualDraft` doesn't include them.

- [ ] **Step 3: Extend `build-config.ts` with the four draft types**

In `components/dashboard/add-block/build-config.ts`, after the existing `LineDraft` block (line ~47), add:

```typescript
/** Header block draft: static heading. No data binding. */
export type HeaderDraft = {
  source: 'header'
  level: 1 | 2 | 3
}

/** Narrative block draft: static markdown prose. No data binding. */
export type NarrativeDraft = {
  source: 'narrative'
  body: string
}

/** Pills block draft: a single leaf (v1 — no aggregate/calculated). */
export type PillsDraft = {
  source: 'pills'
  leaf: LeafDraft
}

/** Table block draft: a leaf + a single dimension column (v1 single-dim, single-metric). */
export type TableDraft = {
  source: 'table'
  leaf: LeafDraft
  dimension: string
}
```

- [ ] **Step 4: Extend `ManualDraft` union**

In `components/dashboard/add-block/build-config.ts`, replace the `ManualDraft` definition with:

```typescript
export type ManualDraft =
  | { kind: 'leaf'; name: string; format: MetricFormat; leaf: LeafDraft }
  | { kind: 'calculated'; name: string; format: MetricFormat; calc: CalculatedDraft }
  | { kind: 'aggregate'; name: string; format: MetricFormat; op: AggregateBinding['op']; left: OperandDraft; right: OperandDraft }
  | { kind: 'bar'; name: string; format: MetricFormat; bar: BarDraft }
  | { kind: 'line'; name: string; format: MetricFormat; line: LineDraft }
  | { kind: 'pills'; name: string; format: MetricFormat; pills: PillsDraft }
  | { kind: 'table'; name: string; format: MetricFormat; table: TableDraft }
  | { kind: 'header'; name: string; format: MetricFormat; header: HeaderDraft }
  | { kind: 'narrative'; name: string; format: MetricFormat; narrative: NarrativeDraft }
```

- [ ] **Step 5: Add the four `xToBlockConfig` helpers**

Append to `components/dashboard/add-block/build-config.ts` (after `lineToBlockConfig`):

```typescript
/** Convert a pills draft into a Pills block config (kind: 'pills', scalar leaf binding). */
export function pillsToBlockConfig(d: PillsDraft, name: string, format: MetricFormat): Omit<BlockConfig, 'id'> {
  return { name, format, range: null, binding: leafToBinding(d.leaf), kind: 'pills' }
}

/** Convert a table draft into a Table block config (kind: 'table', leaf binding with one dim). */
export function tableToBlockConfig(d: TableDraft, name: string, format: MetricFormat): Omit<BlockConfig, 'id'> {
  const base = leafToBinding(d.leaf)
  const binding: LeafBinding = { ...base, dimensions: [d.dimension] }
  return { name, format, range: null, binding, kind: 'table' }
}

/** Convert a header draft into a Header block config (kind: 'header'). Binding is a
 *  placeholder leaf — header bodies ignore it. We synthesize one so BlockConfig stays
 *  unconditionally typed. */
export function headerToBlockConfig(d: HeaderDraft, name: string, format: MetricFormat): Omit<BlockConfig, 'id'> {
  const placeholder: LeafBinding = { source: 'supermetrics', dsId: '__static__', metricField: '__static__', account: '__static__' }
  return { name, format, range: null, binding: placeholder, kind: 'header', headerLevel: d.level }
}

/** Convert a narrative draft into a Narrative block config (kind: 'narrative'). Same
 *  placeholder-binding rationale as headerToBlockConfig. */
export function narrativeToBlockConfig(d: NarrativeDraft, name: string, format: MetricFormat): Omit<BlockConfig, 'id'> {
  const placeholder: LeafBinding = { source: 'supermetrics', dsId: '__static__', metricField: '__static__', account: '__static__' }
  return { name, format, range: null, binding: placeholder, kind: 'narrative', narrativeBody: d.body }
}
```

- [ ] **Step 6: Extend `buildBlockConfig` dispatch**

Replace `buildBlockConfig` in `components/dashboard/add-block/build-config.ts` with:

```typescript
/** Assemble the final block config (id is assigned later, at confirm). */
export function buildBlockConfig(d: ManualDraft): Omit<BlockConfig, 'id'> {
  if (d.kind === 'leaf')       return { name: d.name, format: d.format, range: null, binding: leafToBinding(d.leaf) }
  if (d.kind === 'calculated') return { name: d.name, format: d.format, range: null, binding: calculatedToBinding(d.calc) }
  if (d.kind === 'aggregate')  return { name: d.name, format: d.format, range: null,
    binding: { source: 'aggregate' as const, op: d.op, left: operandToBinding(d.left), right: operandToBinding(d.right) } }
  if (d.kind === 'bar')        return barToBlockConfig(d.bar, d.name, d.format)
  if (d.kind === 'line')       return lineToBlockConfig(d.line, d.name, d.format)
  if (d.kind === 'pills')      return pillsToBlockConfig(d.pills, d.name, d.format)
  if (d.kind === 'table')      return tableToBlockConfig(d.table, d.name, d.format)
  if (d.kind === 'header')     return headerToBlockConfig(d.header, d.name, d.format)
  return narrativeToBlockConfig(d.narrative, d.name, d.format)
}
```

- [ ] **Step 7: Extend `isDraftComplete`**

Replace `isDraftComplete` in `components/dashboard/add-block/build-config.ts` with:

```typescript
export function isDraftComplete(d: ManualDraft): boolean {
  if (d.name.trim() === '') return false
  if (d.kind === 'leaf')       return isLeafComplete(d.leaf)
  if (d.kind === 'calculated') return isCalculatedComplete(d.calc)
  if (d.kind === 'aggregate')  return isOperandComplete(d.left) && isOperandComplete(d.right)
  if (d.kind === 'bar')        return isLeafComplete(d.bar.leaf) && d.bar.dimension.trim() !== ''
  if (d.kind === 'line')       return isLeafComplete(d.line.leaf) && (GRANULARITIES as string[]).includes(d.line.granularity)
  if (d.kind === 'pills')      return isLeafComplete(d.pills.leaf)
  if (d.kind === 'table')      return isLeafComplete(d.table.leaf) && d.table.dimension.trim() !== ''
  if (d.kind === 'header')     return true
  return true // narrative — name is required (checked above); body is optional in v1
}
```

- [ ] **Step 8: Run test to verify it passes**

```bash
npx tsx components/dashboard/add-block/build-config.test.ts
```

Expected: `ok`.

- [ ] **Step 9: Create `HeaderBuilder`**

Create `components/dashboard/add-block/header-builder.tsx`:

```tsx
'use client'

import type { HeaderDraft } from './build-config'

const ctrl = 'block w-full rounded-md border border-white/10 bg-bg-surface px-3 py-2 text-sm text-white'
const labelCls = 'text-[10px] font-extrabold uppercase tracking-widest text-text-muted'

export function HeaderBuilder({
  value, onChange,
}: {
  value: HeaderDraft
  onChange: (v: HeaderDraft) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelCls}>Heading level</span>
      <select
        className={ctrl}
        value={String(value.level)}
        onChange={(e) => onChange({ ...value, level: Number(e.target.value) as 1 | 2 | 3 })}
      >
        <option value="1">H1 — largest</option>
        <option value="2">H2 — section</option>
        <option value="3">H3 — small</option>
      </select>
    </label>
  )
}
```

- [ ] **Step 10: Create `NarrativeBuilder`**

Create `components/dashboard/add-block/narrative-builder.tsx`:

```tsx
'use client'

import type { NarrativeDraft } from './build-config'

const ctrl = 'block w-full rounded-md border border-white/10 bg-bg-surface px-3 py-2 text-sm text-white'
const labelCls = 'text-[10px] font-extrabold uppercase tracking-widest text-text-muted'

export function NarrativeBuilder({
  value, onChange,
}: {
  value: NarrativeDraft
  onChange: (v: NarrativeDraft) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={labelCls}>Body (markdown supported)</span>
      <textarea
        className={`${ctrl} min-h-[120px] resize-y`}
        value={value.body}
        onChange={(e) => onChange({ ...value, body: e.target.value })}
        placeholder="## Highlights&#10;- Cost down 12%&#10;- Conversions up 8%"
      />
    </label>
  )
}
```

- [ ] **Step 11: Create `PillsBuilder`**

Create `components/dashboard/add-block/pills-builder.tsx`:

```tsx
'use client'

import { LeafBuilder } from './leaf-builder'
import type { PillsDraft, LeafDraft } from './build-config'

export function PillsBuilder({
  value, onChange, slug,
}: {
  value: PillsDraft
  onChange: (v: PillsDraft) => void
  slug: string
}) {
  const setLeaf = (leaf: LeafDraft) => onChange({ ...value, leaf })
  return <LeafBuilder source={value.leaf.source} value={value.leaf} onChange={setLeaf} slug={slug} />
}
```

- [ ] **Step 12: Create `TableBuilder`**

Create `components/dashboard/add-block/table-builder.tsx`:

```tsx
'use client'

import { LeafBuilder } from './leaf-builder'
import { DimensionPicker } from './dimension-picker'
import type { TableDraft, LeafDraft } from './build-config'

export function TableBuilder({
  value, onChange, slug,
}: {
  value: TableDraft
  onChange: (v: TableDraft) => void
  slug: string
}) {
  const setLeaf = (leaf: LeafDraft) => onChange({ ...value, leaf })
  const setDim = (dimension: string) => onChange({ ...value, dimension })
  return (
    <div className="flex flex-col gap-3">
      <LeafBuilder source={value.leaf.source} value={value.leaf} onChange={setLeaf} slug={slug} />
      <DimensionPicker leaf={value.leaf} slug={slug} value={value.dimension} onChange={setDim} />
    </div>
  )
}
```

- [ ] **Step 13: Wire the new builders into `ManualBlockForm`**

Edit `components/dashboard/add-block/manual-block-form.tsx`. After the existing `LineBuilder` import (line 7), add:

```tsx
import { HeaderBuilder } from './header-builder'
import { NarrativeBuilder } from './narrative-builder'
import { PillsBuilder } from './pills-builder'
import { TableBuilder } from './table-builder'
```

In the imports from `./build-config` (lines 8-12), extend to include the new draft types:

```tsx
import {
  buildBlockConfig, isDraftComplete,
  type LeafDraft, type ManualDraft, type CalculatedDraft, type OperandDraft,
  type BarDraft, type LineDraft, type HeaderDraft, type NarrativeDraft, type PillsDraft, type TableDraft,
} from './build-config'
```

After the existing `bar` / `line` state hooks (lines 54-55), add four new state hooks:

```tsx
  const [header, setHeader] = useState<HeaderDraft>(() => ({ source: 'header', level: 2 }))
  const [narrative, setNarrative] = useState<NarrativeDraft>(() => ({ source: 'narrative', body: '' }))
  const [pills, setPills] = useState<PillsDraft>(() => ({ source: 'pills', leaf: emptyLeaf(source === 'triplewhale' ? 'triplewhale' : 'supermetrics') }))
  const [table, setTable] = useState<TableDraft>(() => ({ source: 'table', leaf: emptyLeaf(source === 'triplewhale' ? 'triplewhale' : 'supermetrics'), dimension: '' }))
```

Replace the `draft` assignment (lines 57-66) with:

```tsx
  const draft: ManualDraft =
    kind === 'bar'
      ? { kind: 'bar', name, format, bar }
      : kind === 'line'
        ? { kind: 'line', name, format, line }
        : kind === 'pills'
          ? { kind: 'pills', name, format, pills }
          : kind === 'table'
            ? { kind: 'table', name, format, table }
            : kind === 'header'
              ? { kind: 'header', name, format, header }
              : kind === 'narrative'
                ? { kind: 'narrative', name, format, narrative }
                : source === 'aggregate'
                  ? { kind: 'aggregate', name, format, op, left, right }
                  : source === 'calculated'
                    ? { kind: 'calculated', name, format, calc }
                    : { kind: 'leaf', name, format, leaf }
```

After the existing `{kind === 'line' && <LineBuilder … />}` line (line 99), add four new branches:

```tsx
      {kind === 'pills' && <PillsBuilder value={pills} onChange={setPills} slug={slug} />}
      {kind === 'table' && <TableBuilder value={table} onChange={setTable} slug={slug} />}
      {kind === 'header' && <HeaderBuilder value={header} onChange={setHeader} />}
      {kind === 'narrative' && <NarrativeBuilder value={narrative} onChange={setNarrative} />}
```

- [ ] **Step 14: Hide the Format select for static kinds**

Static kinds (`header`, `narrative`) have no metric; the format select is meaningless. In `components/dashboard/add-block/manual-block-form.tsx`, wrap the existing Format label (line 101-106) so it renders only for data kinds:

```tsx
      {kind !== 'header' && kind !== 'narrative' && (
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Format</span>
          <select className={ctrl} value={format} onChange={(e) => setFormat(e.target.value as MetricFormat)}>
            {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </label>
      )}
```

- [ ] **Step 15: Typecheck**

```bash
./node_modules/.bin/tsc --noEmit
```

Expected: clean.

- [ ] **Step 16: Boot test the add-block flow**

```bash
npm run dev
```

Open `http://localhost:3000/dashboard/renaissance/configurable-dashboard`. Click **+ Add block**:

- Pick **Section header** → goes directly to build form. Heading level select visible; no Format. Type a name + level → save → header appears on the grid.
- Pick **Narrative panel** → direct to build form. Body textarea visible. Save → renders prose.
- Pick **Pills (compact KPI)** → source step → Supermetrics → build form with leaf builder. Save → small pill renders with streaming value.
- Pick **Table** → source step → Supermetrics → build form with leaf builder + dimension picker. Save → sortable table renders.

Stop the dev server.

- [ ] **Step 17: Commit**

```bash
git add components/dashboard/add-block/build-config.ts components/dashboard/add-block/build-config.test.ts components/dashboard/add-block/header-builder.tsx components/dashboard/add-block/narrative-builder.tsx components/dashboard/add-block/pills-builder.tsx components/dashboard/add-block/table-builder.tsx components/dashboard/add-block/manual-block-form.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): manual builders for header/narrative/pills/table

Adds the four per-kind builders and the matching draft types +
converters. ManualBlockForm dispatches on kind to the right builder.
Static kinds hide the Format select. Pills v1 = leaf-only (no
aggregate/calculated). Table v1 = single-dim, single-metric (reuses
DimensionPicker).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Final smoke test (no commit)

After Task 8 lands, the entire flow should work end-to-end. Run a manual smoke pass:

1. `npm run dev`
2. Visit `http://localhost:3000/dashboard/renaissance/configurable-dashboard`
3. Add one block of each kind (header, narrative, pills, table). Confirm:
   - Each renders correctly
   - Each can be dragged/resized
   - Kebab menu works (delete + range override)
   - Static kinds (header, narrative) ignore range overrides gracefully
   - Pills + Table stream via Suspense (skeleton flash)
4. Refresh the page — all blocks persist
5. `./node_modules/.bin/tsc --noEmit` → clean
6. `npx tsx lib/dashboard/types.test.ts && npx tsx lib/dashboard/table.test.ts && npx tsx components/dashboard/blocks/header-block-body.test.tsx && npx tsx components/dashboard/blocks/narrative-block-body.test.tsx && npx tsx components/dashboard/blocks/pills-block-body.test.tsx && npx tsx components/dashboard/add-block/build-config.test.ts` → all print `ok`

---

## Out of scope (deferred to sub-project #5)

- **Multi-metric tables.** v1 tables are single-dim, single-metric. Real paid-media tables ("Campaign | Spend | Clicks | CTR") need either a `metricFields: string[]` extension on `SupermetricsBinding` or a new `TableBinding` carrying multiple leaves. Pick one in sub-project #5.
- **Multi-dim cross-tab tables.** Adapters currently constrain `dimensions.length === 1`. Lifting that requires a `joinGroupedMulti` that composes dim keys + a TableBuilder UI that picks N dimensions.
- **Pills with aggregate/calculated bindings.** v1 = leaf-only. Builder UI doesn't expose these sources. Lift in sub-project #5 by allowing the same `SOURCES_BY_KIND.pills` shape as `kpi`.
- **Inline markdown editor for narrative blocks.** v1 uses a plain `<textarea>`. v2 could add toolbar / live preview.
- **NL builder for new kinds.** The "Describe with AI" path is KPI-only in v1. Tables/charts/headers/narrative would need their own NL classifiers (sub-project #5 for tables + line/bar; static kinds don't need NL).
- **Per-block range overrides for static kinds.** Header/narrative have no data; the range menu still appears but is meaningless. UX polish: hide the "Set range" entry for static kinds. Deferred — not breaking.

---

## Self-review checklist (run after writing the plan)

- [x] Every kind in scope (header, narrative, pills, table) has at least one task that creates its block component AND the builder
- [x] All type-layer changes (Task 1) come before any runtime consumer
- [x] Dispatcher (Task 6) is sequenced after all four blocks (Tasks 2-5) so the renderBlockNode imports resolve
- [x] Add-block dialog availability flip (Task 7) is sequenced after the dispatcher (Task 6) so analysts can't add unimplemented kinds prematurely. NOTE: if a reviewer prefers, Task 7 can be swapped with Task 6 — the dialog allows save, but the rendered block would fall through to `<UnsupportedBlockState>` until Task 6 lands. As written (Task 6 first), every commit is demo-safe.
- [x] Manual-block-form dispatch (Task 8) is last because it imports every builder
- [x] Every code step has actual code (no placeholders)
- [x] No `any` anywhere
- [x] Tests are pure tsx + node:assert IIFE
- [x] Names consistent: `HeaderBlock` / `HeaderBlockBody` / `HeaderBuilder` / `HeaderDraft` / `headerToBlockConfig` — same prefix everywhere, no drift
- [x] Static-kind binding placeholder pattern documented in `headerToBlockConfig` JSDoc so reviewers don't flag it
- [x] Test step for build-config tests appends to the existing file, doesn't replace it

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-24-table-header-pills-narrative-blocks.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — fresh implementer subagent per task, task reviewer subagent after each, fix subagent for any Critical/Important findings, final whole-branch review.

2. **Inline Execution** — execute tasks inline in this session using superpowers:executing-plans, batch checkpoints between tasks.

**Which approach?**
