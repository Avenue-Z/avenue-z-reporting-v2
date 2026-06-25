# Edit a Block (header + narrative) — Design

**Status:** Approved (Option A scope) · 2026-06-25
**Branch:** `feat/dashboard-block-edit` (off `feat/tc-dashboard-self-service-dash-system`)

## Goal

Let an editor change an existing **header** or **narrative** block in place — its
title (and heading level, or markdown body) — via the same builder used to create
it. Today the block kebab only offers "Set range" / "Reset to inherit" / "Delete",
and "Set range" is meaningless for these data-less blocks.

Two user-visible changes for header & narrative blocks:
1. Add an **"Edit…"** kebab item that reopens the add-block dialog, pre-filled.
2. **Remove "Set range" and "Reset to inherit"** from their kebab (no data → no range).

Metric/chart kinds (kpi, pills, bar, line, table) are **unchanged**.

## Background

`feat/metric-references-rnd` already implements block editing for its lineage
(reverse `binding→draft` mappers + an `updateBlock` mutation + an `editing` mode on
the dialog, opened from an "Edit metric…" kebab entry). That branch uses a *formula*
binding engine and a self-contained `metric-block.tsx`. Our branch uses
`aggregate`/`calculated` bindings, the extracted `block-chrome.tsx`, and more block
kinds. We port the **pattern**, not the code, and scope the reverse-mapping to the
two static kinds we're editing now.

## Non-Goals

- Editing metric/chart kinds (kpi/pills/bar/line/table) — infrastructure supports it
  later; only `blockToManualDraft` needs the extra cases.
- Changing a block's `kind` during edit (a header stays a header).
- Touching the range-override flow (still lives in "Set range").
- Any new npm dependency.

## Architecture

Five units, each independently testable. Data flows:

```
kebab "Edit…"  →  AddBlockDialog(editing=block)
                     │  step='build', kind=block.kind
                     │  initial = blockToManualDraft(block).draft   ← reverse map
                     ▼
                  ManualBlockForm(initial)  →  buildBlockConfig(draft)  (Omit<BlockConfig,'id'>)
                     ▼
                  updateBlock(config, block.id, patch)   ← preserves id/range/layout
                     ▼
                  saveDashboardConfig(slug, next) → router.refresh()
```

### 1. `updateBlock` mutation — `components/dashboard/config-mutations.ts`

```ts
/** Replace a block's editable fields by id, preserving id, range, and layout.
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

Spreading `...patch` first replaces name/format/binding/kind/headerLevel/narrativeBody
and drops any stale fields; `id`/`range`/`layout` are then re-applied from the
existing block. Needs `BlockConfig` added to the `./types` import.

**Test (`config-mutations.test.ts`, append):** editing a header changes name +
headerLevel; id, range, layout preserved; other blocks untouched.

### 2. `blockToManualDraft` reverse-mapper — `components/dashboard/add-block/build-config.ts`

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

(The dialog only calls this for header/narrative blocks, so the throw is a guard, not
a reachable path in Option A.) Needs `PersistedBlock` + `ManualDraft` in scope.

**Test (`build-config.test.ts`, append):** header round-trips
(`buildBlockConfig(blockToManualDraft(headerBlock))` reproduces name/kind/headerLevel);
narrative round-trips (name/kind/narrativeBody); a missing headerLevel defaults to 2.

### 3. `ManualBlockForm` accepts `initial?: ManualDraft` — `manual-block-form.tsx`

Add `initial?: ManualDraft` to props; seed the relevant `useState` initializers from
it. Only the fields used by header/narrative must seed for Option A:

```tsx
const [name, setName] = useState(initial?.name ?? '')
const [format, setFormat] = useState<MetricFormat>(initial?.format ?? 'number')
const [header, setHeader] = useState<HeaderDraft>(() =>
  initial?.kind === 'header' ? initial.header : { source: 'header', level: 2 })
const [narrative, setNarrative] = useState<NarrativeDraft>(() =>
  initial?.kind === 'narrative' ? initial.narrative : { source: 'narrative', body: '' })
```

Other kinds' seeds keep their current blank defaults (harmless; not edited in Option A).

### 4. `AddBlockDialog` accepts `editing?: PersistedBlock` — `add-block-dialog.tsx`

```tsx
export function AddBlockDialog({ slug, config, onClose, editing }: {
  slug: string; config: DashboardConfig | null; onClose: () => void; editing?: PersistedBlock
}) {
  const initial = editing ? blockToManualDraft(editing) : undefined
  const [step, setStep] = useState<...>(editing ? 'build' : 'kind')
  const [kind, setKind] = useState<BlockKind>(editing?.kind ?? 'kpi')
  // source is unused for header/narrative; keep default
  ...
  function confirmManual(cfg: Omit<BlockConfig, 'id'>) {
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

- Title: `{editing ? 'Edit block' : 'Add block'}`.
- `build` step passes `initial={initial}` to `ManualBlockForm`; `onBack` →
  `editing ? onClose : <existing back logic>`.
- Imports add `updateBlock` and `blockToManualDraft`, plus `PersistedBlock` type.

### 5. `BlockChrome` kebab — `components/dashboard/block-chrome.tsx`

`block.kind` is available. Define `isStatic = block.kind === 'header' || block.kind === 'narrative'`.

- Add `editOpen` state + render `{editOpen && <AddBlockDialog slug={slug} config={config} editing={block} onClose={() => setEditOpen(false)} />}`.
- In the `menu` view: for `isStatic`, render **"Edit…"** (`onClick={() => { setMenuOpen(false); setEditOpen(true) }}`) and **omit** the "Set range…" and "Reset to inherit" buttons. Keep "Delete block".
- Non-static kinds: menu unchanged (Set range / Reset / Delete; no Edit yet).

`AddBlockDialog` renders a fixed-position modal, so mounting it from chrome is layout-safe.
No import cycle: `add-block-dialog` does not import `block-chrome`.

## Testing

- **Unit (tsx + node:assert):** `updateBlock` (preserve id/range/layout); `blockToManualDraft`
  round-trip for header + narrative via `buildBlockConfig`.
- **Typecheck/lint:** `npx tsc --noEmit`, `npx eslint` on changed files.
- **Manual smoke:** on `/dashboard/<slug>/configurable-dashboard`, kebab a header →
  "Edit…" → builder opens pre-filled with current title + level → change level → Save →
  re-renders at new level, position unchanged. Repeat for a narrative (title + body).
  Confirm "Set range" no longer appears on header/narrative, and metric blocks still show it.

## Risks / Edge Cases

- **Range preservation:** builder emits `range: null`; `updateBlock` must keep `b.range`
  (covered by test). Header/narrative carry `range: null` anyway, but the mutation is
  written correctly for when edit extends to metric kinds.
- **Existing legacy blocks** (created before the headerLevel/narrativeBody persistence
  fixes) have those fields absent → defaults apply (level 2 / empty body) on first edit,
  then persist correctly. Acceptable.
- **Self-reference:** N/A for header/narrative (no binding references). Revisit when edit
  extends to formula/aggregate kinds.
```
