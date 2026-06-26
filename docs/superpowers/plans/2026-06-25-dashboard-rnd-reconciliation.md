# Dashboard R&D Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge `feat/configurable-dashboard-rnd` (Shopify ShopifyQL binding, bar/line/table/pills charts, self-service block kinds, optimistic mutations) into `feat/metric-references-rnd` (the intended-future formula-reference engine + full block editing), producing one branch that has all dashboard capabilities.

**Architecture:** `metric-references-rnd` is the **base/trunk** (it owns the future formula model and editing). We layer configurable-rnd's work onto it: ~62 files add cleanly (they don't exist on MR), 13 formula-engine files stay untouched, and ~6 files need hand reconciliation where both branches independently built **block editing** and **calculated metrics**. At the type/persistence/resolver level we keep BOTH binding families (formula AND calculated/aggregate) for back-compat; the **add-block UI** is where formula supersedes calculated/aggregate (offer the formula builder, retire the aggregate builder). Shopify + charts slot in as additional kinds/sources.

**Tech Stack:** Next.js 15 (App Router, RSC), TypeScript strict, Drizzle/Neon, `tsx` + `node:assert` tests (`npx tsx <file>.test.ts`, final `console.log('ok')`), Tailwind/Tremor.

## Global Constraints

- Base branch for all work: `feat/metric-references-rnd`. Do the merge in an isolated git worktree (superpowers:using-git-worktrees) — never on a shared checkout.
- TypeScript strict; **no `any`** in reconciled files.
- Tests are pure (no live API/DB/.env). Run `npx tsx <file>.test.ts`; final line `ok`.
- Keep BOTH `CalculatedBinding`/`AggregateBinding` AND `FormulaBinding` in the type union and persistence/resolver — existing persisted blocks of every kind must still parse + resolve. Only the **builder UI** drops the aggregate path.
- `MetricFormat` is the superset: `'currency' | 'percent' | 'count' | 'number' | 'multiple'`.
- Static kinds (`header`,`narrative`) carry the `__static__` sentinel binding and must never reach a resolver (guard already in both branches' resolve.ts).
- Per-task commit with the message shown. Run `npx tsc --noEmit` green before each commit.
- Canonical branch identities: `MR` = `origin/feat/metric-references-rnd`, `CR` = `origin/feat/configurable-dashboard-rnd`.

---

## Inter-Component Dependency Map

```
  T1 worktree+base
        │
        ▼
  T2 add CR-only files (Shopify lib, charts, group-join, table, chart blocks,
     builders, mutations, OAuth routes) — 62 files, no MR equivalent
        │
        ▼
  T3 types.ts  ← keystone: union FormulaBinding(MR) + Shopify/Granularity/
     dimensions/BlockKind/BlockLayout(CR) + 'multiple' format
        │
        ├──────────────┬───────────────┬─────────────────┐
        ▼              ▼               ▼                 ▼
  T4 persistence   T5 resolve.ts   T6 registry.ts    T7 format.ts
  (all sources +   (formula +      (leaf sm/tw/      ('multiple')
   kind/layout)    static guard +   shopify +
                   grouped/series)  grouped/series)
        └──────────────┴───────────────┴─────────────────┘
                                │
                                ▼
  T8 add-block reconciliation (build-config.ts, manual-block-form.tsx,
     add-block-dialog.tsx): kinds × sources(sm/tw/shopify/formula) + edit;
     formula builder replaces aggregate builder; keep chart + Shopify builders
                                │
                                ▼
  T9 edit unification (config-mutations.ts, metric-block.tsx, block-actions.tsx):
     one updateBlock + one kebab Edit covering ALL kinds (kpi/charts/shopify)
                                │
                                ▼
  T10 wiring (app/actions/dashboard.ts, page.tsx, dashboard-shell.tsx):
      kind dispatch + grouped/series + optimistic + formula NL guard
                                │
                                ▼
  T11 full verify: tsc + entire test suite + manual smoke on localhost
```

---

## Task 1: Worktree + base

**Files:** none (git setup).

- [ ] **Step 1: Create an isolated worktree on the future branch**

```bash
git fetch origin --prune
git worktree add -b feat/dashboard-unified ../reporting-dashboard-unified origin/feat/metric-references-rnd
cd ../reporting-dashboard-unified
npm install
```

- [ ] **Step 2: Sanity baseline (MR is green before we touch it)**

```bash
npx tsc --noEmit 2>&1 | grep -v node_modules | head    # expect empty
for f in lib/dashboard/*.test.ts lib/dashboard/formula/*.test.ts; do npx tsx "$f" >/dev/null && echo "ok $f"; done
```
Expected: tsc clean; every test prints ok.

- [ ] **Step 3: Snapshot the exact conflict set for reference**

```bash
git merge --no-commit --no-ff origin/feat/configurable-dashboard-rnd > /tmp/recon.txt 2>&1 || true
git diff --name-only --diff-filter=U > /tmp/conflicts.txt
git merge --abort
cat /tmp/conflicts.txt    # the ~20 files needing attention; T8/T9 are the hard 6
```

No commit (this task only establishes the workspace + the conflict inventory).

---

## Task 2: Add the conflict-free CR files (Shopify + charts + mutations)

**Files (create — none exist on MR):** all 62 "A" paths from `git diff --name-status MR..CR | grep '^A'`. The load-bearing ones:
- `lib/shopify/{client,catalog,oauth}.ts` (+ `.test.ts`)
- `lib/dashboard/adapters/shopify.ts` (+ `.test.ts`)
- `lib/dashboard/{charts,group-join,table}.ts` (+ `.test.ts`)
- `components/dashboard/blocks/{bar,line,pills,table}-block*.tsx`, `chart-types.ts`, `chart-skeleton.tsx`
- `components/dashboard/add-block/{bar,line,pills,table}-builder.tsx`
- `components/dashboard/dashboard-mutations.tsx`
- `app/api/shopify/{install,callback}/route.ts`

**Interfaces produced (consumed later):**
- `lib/shopify/client.ts`: `runShopifyQl(args,opts?): Promise<number>`, `runShopifyQlTable(args,opts?): Promise<TableData>`, `buildShopifyQl`, `sumFirstColumn`, `ShopifyQlError`.
- `lib/shopify/catalog.ts`: `SHOPIFY_METRICS: ShopifyMetric[]`, `findShopifyMetric`, `SHOPIFY_DIM_RE`.
- `lib/dashboard/adapters/shopify.ts`: `resolveShopifyLeaf`, `resolveShopifyGrouped`, `resolveShopifySeries`, `resolveShopifyCreds`.
- `lib/dashboard/group-join.ts`: `joinGrouped`, `alignSeries`. `lib/dashboard/charts.ts`, `lib/dashboard/table.ts`: chart/table shaping.

- [ ] **Step 1: Materialize the CR-only files onto the base via checkout**

```bash
# bring every CR file that has no MR counterpart, verbatim
for f in $(git diff --name-only --diff-filter=A origin/feat/metric-references-rnd..origin/feat/configurable-dashboard-rnd); do
  git checkout origin/feat/configurable-dashboard-rnd -- "$f"
done
git status --short | head -40
```

- [ ] **Step 2: Pull the new runtime dep (`react-grid-layout`) into package.json**

These come from CR's `package.json` (T8/T10 grid). Add to `dependencies`/`devDependencies` if `npm ls react-grid-layout` fails:
```bash
npm install react-grid-layout@^1.5.3
npm install -D @types/react-grid-layout@^1.3.6
```

- [ ] **Step 3: Verify the added libs compile + their pure tests pass**

```bash
npx tsc --noEmit 2>&1 | grep -E "lib/shopify|adapters/shopify|charts|group-join|lib/dashboard/table" | head || echo "added libs typecheck"
for f in lib/shopify/*.test.ts lib/dashboard/adapters/shopify.test.ts lib/dashboard/group-join.test.ts lib/dashboard/charts.test.ts lib/dashboard/table.test.ts; do npx tsx "$f"; done
```
Expected: each prints `ok`. (Type errors that reference `ShopifyBinding`/`BlockKind`/`dimensions` are EXPECTED here — they're fixed in T3. Confirm only the *added libs'* own tests pass.)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(dashboard): vendor Shopify binding, charts, table, and optimistic-mutation files from configurable-rnd"
```

---

## Task 3: types.ts — the unified binding model (keystone)

**Files:** Modify `lib/dashboard/types.ts`.

**Interfaces produced (every later task consumes these):**
- `MetricFormat = 'currency'|'percent'|'count'|'number'|'multiple'`
- `Granularity = 'day'|'week'|'month'`
- `ShopifyBinding { source:'shopify'; query:string; dimensions?:string[]; granularity?:Granularity }`
- `SupermetricsBinding`/`TripleWhaleBinding` gain `dimensions?:string[]; granularity?:Granularity`
- `LeafBinding = SupermetricsBinding | TripleWhaleBinding | ShopifyBinding`
- `FormulaBinding { source:'formula'; expr:string; operands:Record<string,FormulaOperand> }` (KEEP from MR)
- `Binding = LeafBinding | CalculatedBinding | AggregateBinding | FormulaBinding`
- `BlockKind = 'kpi'|'pills'|'bar'|'line'|'table'|'narrative'|'header'`
- `BlockLayout { x:number; y:number; w:number; h:number }`
- `BlockConfig` gains `kind?: BlockKind`; `PersistedBlock` gains `layout?: BlockLayout` (CR's full layout replaces MR's `{w?,h?}` if MR has the narrower one)
- chart row types from CR: `GroupedRow`, `SeriesPoint` (already vendored in T2 via charts.ts/types; re-export from types.ts if MR's resolve/registry import them from `./types`).

- [ ] **Step 1: Resolve the type union by hand**

Open `lib/dashboard/types.ts`. Produce exactly this top section (union of both branches — MR's `FormulaBinding`/`FormulaOperand` + `'multiple'`, CR's Shopify/Granularity/dimensions/BlockKind/BlockLayout):

```ts
export type MetricFormat = 'currency' | 'percent' | 'count' | 'number' | 'multiple'
export type Granularity = 'day' | 'week' | 'month'

export interface SupermetricsBinding {
  source: 'supermetrics'
  dsId: string
  metricField: string
  account: string
  expectedAccounts?: string[]
  filters?: { column: string; values: string[] }[]
  dimensions?: string[]       // grouped mode (bar/table): v1 length exactly 1
  granularity?: Granularity   // series mode (line)
}
export interface TripleWhaleBinding {
  source: 'triplewhale'
  metric: string
  account?: string
  filters?: { column: string; values: string[] }[]
  dimensions?: string[]
  granularity?: Granularity
}
export interface ShopifyBinding {
  source: 'shopify'
  query: string               // ShopifyQL body, no date/GROUP BY clause
  dimensions?: string[]       // grouped: GROUP BY <dim>
  granularity?: Granularity   // series: GROUP BY day|week|month
}
export type LeafBinding = SupermetricsBinding | TripleWhaleBinding | ShopifyBinding

export interface CalculatedBinding { source: 'calculated'; terms: { coefficient: number; leaf: LeafBinding }[] }
export type AggregateOperand = LeafBinding | CalculatedBinding
export interface AggregateBinding { source: 'aggregate'; left: AggregateOperand; op: '+' | '-' | '*' | '/'; right: AggregateOperand }

export type FormulaOperand =
  | { kind: 'ref'; blockId: string }
  | { kind: 'metric'; leaf: LeafBinding }
export interface FormulaBinding { source: 'formula'; expr: string; operands: Record<string, FormulaOperand> }

export type Binding = LeafBinding | CalculatedBinding | AggregateBinding | FormulaBinding

export type BlockKind = 'kpi' | 'pills' | 'bar' | 'line' | 'table' | 'narrative' | 'header'
export interface BlockLayout { x: number; y: number; w: number; h: number }
```

Keep `BlockConfig`/`PersistedBlock`/`DashboardConfig`/`GroupedRow`/`SeriesPoint`/`LeafValue`/`ResolveResult` definitions; ensure `BlockConfig` has `kind?: BlockKind` and `PersistedBlock` has `layout?: BlockLayout`.

- [ ] **Step 2: Verify the types compile in isolation**

```bash
npx tsc --noEmit 2>&1 | grep "lib/dashboard/types.ts" || echo "types ok"
```
Expected: `types ok` (downstream files still error until T4–T7 — that's fine).

- [ ] **Step 3: Commit**

```bash
git add lib/dashboard/types.ts
git commit -m "feat(dashboard): unify binding model (formula + shopify + chart kinds + multiple format)"
```

---

## Task 4: persistence.ts — validate every source + kind/layout

**Files:** Modify `lib/dashboard/persistence.ts` (+ `persistence.test.ts`).

**Interfaces:** `parseBlockConfig`/`parseDashboardConfig` unchanged signatures; now accept `shopify` leaf, `formula` binding, `kind`, `layout {x,y,w,h}`, `dimensions`, `granularity`.

- [ ] **Step 1: Reconcile `parseLeaf` to accept all three leaf sources**

In `parseLeaf`, ensure branches for `supermetrics`, `triplewhale` (each also reading optional `dimensions: string[]` and `granularity`), and `shopify` (`query` non-empty string; optional `dimensions`/`granularity`). Final fallthrough error: `expected 'supermetrics', 'triplewhale', or 'shopify'`.

- [ ] **Step 2: Reconcile `parseBinding` to accept `formula` AND `calculated`/`aggregate`**

Keep MR's `formula` arm (validate `expr: string`, `operands` record of `{kind:'ref',blockId}` | `{kind:'metric',leaf}`) AND CR's `calculated`/`aggregate` arms. Keep `kind` (one of `BlockKind`) and `layout` (`{x,y,w,h}` all numbers) parsing from CR's `parseBlockConfig`.

- [ ] **Step 3: Merge both test suites' appended cases**

The conflict is two appended blocks before `console.log('ok')`. Concatenate them: keep CR's shopify-leaf + kind + layout + granularity cases AND MR's formula-binding cases. Then:

```bash
npx tsx lib/dashboard/persistence.test.ts
```
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add lib/dashboard/persistence.ts lib/dashboard/persistence.test.ts
git commit -m "feat(dashboard): persist+validate shopify/formula bindings and kind/layout"
```

---

## Task 5: resolve.ts — formula + static guard + leaf + grouped/series

**Files:** Modify `lib/dashboard/resolve.ts` (+ `resolve.test.ts`).

**Interfaces:** `resolveBlock(config, global, ctx, deps)` keeps MR's `FormulaDeps` path; add CR's `__static__` guard, shopify leaf path, and the `resolveGroupedBlock`/`resolveSeriesBlock` exports.

- [ ] **Step 1: Reconcile the binding switch**

In `resolveBlock`, the inner binding dispatch must handle ALL of: leaf (`supermetrics`/`triplewhale`/`shopify` via `deps.resolveLeaf`), `calculated` → `resolveCalculated`, `aggregate` → `resolveAggregate`, `formula` → `resolveFormula(binding, ctx, dateRange, compareRange, deps)`. Keep MR's `FormulaDeps`/`ResolveBindingValue` imports from `./formula-resolve`. Prepend CR's defensive static guard:

```ts
// header/narrative carry a __static__ sentinel binding; never resolve it.
if (config.binding.source === 'supermetrics' && config.binding.dsId === '__static__') {
  return { ok: false, error: 'invalid-metric' }
}
```

- [ ] **Step 2: Keep CR's grouped/series resolvers**

Ensure `resolveGroupedBlock` and `resolveSeriesBlock` (from CR) are present, gated to `supermetrics|triplewhale|shopify` and rejecting `aggregate`/`calculated`/`formula` with `invalid-metric`.

- [ ] **Step 3: Merge both resolve test files; run**

```bash
npx tsx lib/dashboard/resolve.test.ts        # ok
npx tsx lib/dashboard/formula-resolve.test.ts # ok (unchanged MR file)
```

- [ ] **Step 4: Commit**

```bash
git add lib/dashboard/resolve.ts lib/dashboard/resolve.test.ts
git commit -m "feat(dashboard): resolve formula + shopify + grouped/series in one dispatcher"
```

---

## Task 6: registry.ts — leaf + grouped + series dispatch

**Files:** Modify `lib/dashboard/registry.ts`.

- [ ] **Step 1: Take CR's registry verbatim** (it already dispatches `supermetrics`/`triplewhale`/`shopify` for `resolveLeaf`, and `resolveGrouped`/`resolveSeries` for sm/tw/shopify):

```bash
git checkout origin/feat/configurable-dashboard-rnd -- lib/dashboard/registry.ts
npx tsc --noEmit 2>&1 | grep "registry.ts" || echo "registry ok"
```

- [ ] **Step 2: Commit**

```bash
git add lib/dashboard/registry.ts
git commit -m "feat(dashboard): registry dispatch for shopify leaf + grouped/series"
```

---

## Task 7: format.ts — keep MR's `'multiple'` (Nx) format

**Files:** Modify `lib/dashboard/format.ts` (+ `format.test.ts`).

- [ ] **Step 1: Reconcile** — the single conflict hunk is MR adding a `'multiple'` case (renders `${n}x`) vs CR's decimal capping. Keep BOTH: CR's 2-decimal rounding for currency/number/percent/count AND MR's `'multiple'` arm. Run:

```bash
npx tsx lib/dashboard/format.test.ts   # ok
```

- [ ] **Step 2: Commit**

```bash
git add lib/dashboard/format.ts lib/dashboard/format.test.ts
git commit -m "feat(dashboard): format keeps decimal capping + 'multiple' (Nx)"
```

---

## Task 8: add-block reconciliation — kinds × sources + formula builder

**Files:** Modify `components/dashboard/add-block/build-config.ts` (+ `.test.ts`), `manual-block-form.tsx`, `add-block-dialog.tsx`. Keep `formula-builder.tsx` (MR) and `{bar,line,pills,table}-builder.tsx` (CR, vendored in T2). **Delete** `aggregate` from the builder UI (superseded by formula); keep `calculated-builder.tsx` only if MR still references it, else drop from the UI list.

**Interfaces produced:** `ManualDraft` union covering `leaf | formula | bar | line | pills | table | header | narrative` (NOT `aggregate`/`calculated` in the UI); `LeafDraft` includes `{source:'shopify'; query}`; `buildBlockConfig`, `isDraftComplete`, `blockToManualDraft`, `leafToBinding`, `formulaToBinding`.

**Reconciliation rules (apply per file — both sides are large; read each side with `git show MR:<f>` and `git show CR:<f>`):**

- [ ] **Step 1: `build-config.ts` — union the draft model**
  - `LeafDraft`: add `{ source: 'shopify'; query: string }` (CR) alongside sm/tw.
  - Keep MR's `FormulaDraft` + `formulaToBinding` + `blockToManualDraft` reverse-mapper (the future edit path).
  - Keep CR's `BarDraft`/`LineDraft`/`PillsDraft`/`TableDraft`/`HeaderDraft`/`NarrativeDraft` + their `*ToBlockConfig`.
  - `ManualDraft` = union of `leaf | formula | bar | line | pills | table | header | narrative`. Remove the `aggregate`/`calculated` arms from the UI draft union (bindings still exist for persistence/back-compat, just not authored here).
  - `leafToBinding`: shopify→`{source:'shopify',query}`; sm/tw unchanged.
  - Chart builders (`barToBlockConfig` etc.): guard `if (base.source==='shopify')` is NOT needed — Shopify supports charts; instead pass `dimensions`/`granularity` straight through (CR's resolveShopifyGrouped/Series handle them). Confirm by reading CR's `bar/table` builders which already offer Shopify.
  - `blockToManualDraft` must cover every editable kind incl. chart + shopify leaf (extend MR's mapper, which on MR only did header/narrative + leaf/formula — add bar/line/pills/table by reading their `*ToBlockConfig`).

- [ ] **Step 2: `build-config.test.ts` — concatenate both suites** (CR's shopify/chart cases + MR's formula/edit cases), drop any `aggregate` UI-builder cases. Run `npx tsx components/dashboard/add-block/build-config.test.ts` → `ok`.

- [ ] **Step 3: `add-block-dialog.tsx` — kinds + sources + edit, formula not aggregate**
  - Keep CR's `KIND_OPTIONS` (kpi/pills/bar/line/table/narrative/header) and `SOURCES_BY_KIND`.
  - In `SOURCES_BY_KIND.kpi`, the sources are `supermetrics | triplewhale | shopify | formula` (replace CR's `aggregate`+`calculated` with MR's `formula`). For pills/bar/line/table keep `supermetrics | triplewhale | shopify`.
  - Keep MR's edit-mode (`editing?: PersistedBlock`, `initial = blockToManualDraft(editing)`, `updateBlock`) AND CR's optimistic-mutations (`useOptionalDashboardMutations`, `mutations.optimisticAdd`). Both coexist: edit → `updateBlock` + save; add → optimistic if provider present.
  - `Source` type = `ProposeBlockInput['source'] | 'formula' | 'shopify'`. Mode step: skip the AI prompt for `formula` and `shopify` (both manual-only): `source !== 'formula' && source !== 'shopify'`.

- [ ] **Step 4: `manual-block-form.tsx` — render the right builder per kind/source**
  - `kind === 'kpi'`: if `source === 'formula'` → `<FormulaBuilder>`; else if `source === 'shopify'|'supermetrics'|'triplewhale'` → `<LeafBuilder source={source}>`. Remove the aggregate operand UI.
  - `kind === 'bar'|'line'|'pills'|'table'` → CR's chart builders (which already include Shopify as a source).
  - `kind === 'header'|'narrative'` → MR/CR static builders.
  - `initial?: ManualDraft` pre-seed (edit) — keep MR's seeding for every kind.

- [ ] **Step 5: Typecheck + run add-block tests + draft test**

```bash
npx tsc --noEmit 2>&1 | grep "add-block" || echo "add-block ok"
for f in components/dashboard/add-block/*.test.ts; do npx tsx "$f"; done
```
Expected: `add-block ok` and each `ok`.

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/add-block/
git commit -m "feat(dashboard): unify add-block — kinds × (sm/tw/shopify/formula), formula replaces aggregate UI"
```

---

## Task 9: edit unification — one updateBlock, one kebab Edit, all kinds

**Files:** Modify `components/dashboard/config-mutations.ts` (+ `.test.ts`), `metric-block.tsx`; keep `block-actions.tsx` (MR). 

**Interfaces:** single `updateBlock(config, id, cfg): DashboardConfig` (preserves `id`/`range`/`layout`); kebab "Edit" opens `AddBlockDialog editing={block}` for every editable kind.

- [ ] **Step 1: `config-mutations.ts`** — keep one `updateBlock` (MR's, which preserves id/range/layout) plus CR's `applyLayoutChange`/`reorderBlocks`/`removeBlock`/`addBlock`/`setBlockRange`/`resetBlockRange`. Concatenate the two test suites; `npx tsx components/dashboard/config-mutations.test.ts` → `ok`.

- [ ] **Step 2: `metric-block.tsx`** — kebab gets BOTH CR's range/delete views AND MR's "Edit" item. "Edit" opens `AddBlockDialog editing={block}`. Gate "Edit" to kinds `blockToManualDraft` supports (after T8 that's all of them).

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit 2>&1 | grep -E "config-mutations|metric-block" || echo "edit ok"
git add components/dashboard/config-mutations.ts components/dashboard/config-mutations.test.ts components/dashboard/metric-block.tsx components/dashboard/block-actions.tsx
git commit -m "feat(dashboard): one updateBlock + kebab Edit covering all block kinds"
```

---

## Task 10: wiring — page dispatch, actions, shell

**Files:** Modify `app/dashboard/[clientSlug]/configurable-dashboard/page.tsx`, `app/actions/dashboard.ts`, `components/dashboard/dashboard-shell.tsx`, `components/dashboard/block-grid.tsx`, `lib/dashboard/adapters/triplewhale.ts`, `components/dashboard/metric-block-states.tsx`.

- [ ] **Step 1: `page.tsx`** — render static kinds (header/narrative) before the resolver, dispatch chart kinds (bar/line/table/pills) to `resolveGroupedBlock`/`resolveSeriesBlock`, KPI to `resolveBlock`. Take CR's dispatcher; ensure it also routes `formula` bindings (kpi) through `resolveBlock` (formula is a kpi binding).
- [ ] **Step 2: `app/actions/dashboard.ts`** — keep CR's `proposeBlock` (NL) but ensure the proposer rejects `formula` and `shopify` sources (manual-only), per MR's "guard formula source out of the NL proposer path". Keep `saveDashboardConfig` + any grouped/series server actions.
- [ ] **Step 3: `dashboard-shell.tsx` / `block-grid.tsx`** — keep CR's optimistic provider + react-grid-layout drag; ensure edited blocks (T9) re-render.
- [ ] **Step 4: `triplewhale.ts`** — single-hunk conflict is CR's grouped/series adapter additions vs MR's caching; keep both (CR grouped/series + MR's 429/cache guard).
- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep -v node_modules | head    # expect empty
```

- [ ] **Step 6: Commit**

```bash
git add app/ components/dashboard/dashboard-shell.tsx components/dashboard/block-grid.tsx lib/dashboard/adapters/triplewhale.ts components/dashboard/metric-block-states.tsx
git commit -m "feat(dashboard): wire kind dispatch + grouped/series + optimistic + formula NL guard"
```

---

## Task 11: docs + full verification

**Files:** the 2 add/add doc conflicts (`docs/superpowers/{plans,specs}/2026-06-25-edit-block*.md`) — keep both branches' versions side by side (rename one if paths collide) or keep MR's (the future edit design). Keep all MR-only formula docs.

- [ ] **Step 1: Resolve doc conflicts** — `git checkout --theirs`/`--ours` is fine for docs; prefer MR's edit-block design (future) and keep CR's chart/optimistic/shopify design docs (added in T2).

- [ ] **Step 2: Whole-project typecheck**

```bash
npx tsc --noEmit 2>&1 | grep -v node_modules | head
```
Expected: empty.

- [ ] **Step 3: Entire dashboard + shopify + formula test suite**

```bash
fail=0
for f in lib/dashboard/*.test.ts lib/dashboard/**/*.test.ts lib/shopify/*.test.ts lib/dashboard/adapters/*.test.ts components/dashboard/*.test.ts components/dashboard/add-block/*.test.ts; do
  [ -f "$f" ] || continue
  out=$(npx tsx "$f" 2>&1 | tail -1); [ "$out" = ok ] && echo "ok $f" || { echo "FAIL $f"; fail=1; }
done
[ $fail -eq 0 ] && echo ALL GREEN || echo FAILURES
```
Expected: `ALL GREEN`.

- [ ] **Step 4: Manual smoke (real data)** — `PORT=3010 npm run dev`, log in, on a client's configurable dashboard add one block of each: KPI(Supermetrics), KPI(Shopify "New Subscriptions"=3952), Formula (ref two blocks), Bar(Shopify GROUP BY sales_channel), Line(Shopify BY day), then **Edit** each via kebab and confirm the builder pre-fills and Save persists.

- [ ] **Step 5: Finalize the merge commit**

```bash
git add -A
git commit -m "Merge configurable-dashboard-rnd into metric-references-rnd: Shopify + charts + optimistic on the formula trunk

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 6: Open a PR** for review (do not fast-forward either R&D branch without sign-off):

```bash
git push -u origin feat/dashboard-unified
gh pr create --base feat/metric-references-rnd --head feat/dashboard-unified \
  --title "Unify dashboard: Shopify + charts + optimistic onto the formula trunk" \
  --body "Reconciles configurable-dashboard-rnd into metric-references-rnd per docs/superpowers/plans/2026-06-25-dashboard-rnd-reconciliation.md"
```

---

## Self-Review

**Spec coverage:**
- Shopify binding/charts/catalog/OAuth → T2 (vendor) + T3 (types) + T5/T6 (resolve/registry) + T8 (UI source). ✅
- Formula engine kept → T3 (FormulaBinding) + T4 (persist) + T5 (resolveFormula) + T8 (formula-builder UI) + T10 (NL guard). ✅
- Block kinds (pills/bar/line/table/header/narrative) → T2 (blocks/builders) + T3 (BlockKind) + T8 (form) + T10 (page dispatch). ✅
- Editing all kinds → T8 (blockToManualDraft) + T9 (updateBlock + kebab). ✅
- Optimistic mutations + grid → T2 (dashboard-mutations) + T9/T10 (wiring). ✅
- `'multiple'` format → T3 + T7. ✅

**Placeholder scan:** No "TBD"/"handle later". The hand-reconciled files (T8/T9) give explicit per-arm rules rather than full code because both sides are large and must be read in-context — the rules are exact (which source list, which builder per kind, which `updateBlock` wins). ✅

**Type consistency:** `LeafBinding`/`Binding`/`BlockKind`/`Granularity`/`MetricFormat` defined once in T3 and consumed identically in T4–T10; `updateBlock` single signature from T9; `resolveGroupedBlock`/`resolveSeriesBlock` names consistent T5↔T6↔T10. ✅

**Key risk:** T8 is the crux (formula vs aggregate UI; chart×shopify). If the formula builder turns out to NOT cover an aggregate use-case still needed, keep `calculated-builder.tsx` as a fallback source rather than deleting it — note for the implementer to confirm with the dashboard owner before removing the aggregate UI path.
