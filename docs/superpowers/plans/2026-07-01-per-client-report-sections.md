# Per-Client Report Sections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn coded report sections into a staged release pipeline — versioned immutable parts, a DB-backed promotable template, per-client version pins, and a true visual freeze — proven end-to-end on the AEO (peec-ai) section.

**Architecture:** A section renders from a registry of versioned parts (`id → version → impl`). A DB `section_templates` row holds the published composition; a per-client `reportSectionConfig` JSONB column holds diffs (version pins, hide/order/relabel, bespoke refs, and a freeze snapshot). A pure `resolveSection(template, override)` computes the ordered parts to render. Freeze materializes a snapshot; a golden snapshot test per published version enforces that published parts never change appearance.

**Tech Stack:** Next 16 (App Router, RSC) · React 19 · TypeScript · Drizzle ORM + Neon Postgres · **Vitest + @testing-library/react + jsdom** (new — repo currently has no test framework) · Tailwind v4.

## Global Constraints

- **Spec source of truth:** `docs/superpowers/specs/2026-06-30-per-client-report-sections-design.md`. Every task implements part of it.
- **Part `render` is a pure SYNCHRONOUS presentational function** of `(ctx, resolved)` — no `await`, no data fetching. All async fetching stays in the section wrapper that builds `ctx`. Async children (e.g. a Suspense'd synopsis) are separate components, stubbed in goldens.
- **Published versions are immutable.** A version referenced by any `section_templates` row or any client `frozen` snapshot must be `published: true` and its rendered output must never change. A legitimate visual change is a **new version**, never an edit to a published one. Never regenerate a published version's `.snap` with `-u`.
- **`promoteToTemplate` promotes the version pin only by default;** labels/thresholds require explicit `opts`.
- **`extraParts` is for new ids only** (not already in the base); re-versioning an existing part uses `override.versions`.
- **Template seed is idempotent** (`ON CONFLICT (section_slug) DO NOTHING`).
- **Path alias:** import app modules via `@/…` (maps to repo root).
- **Validation is hand-rolled** (mirror `lib/dashboard/persistence.ts`'s `parseDashboardConfig`); the repo does not use zod.
- **No `any`** in Supermetrics/report types.
- **Backward compatibility:** a null `reportSectionConfig` / absent section key = render the template as-is; seeded template = today's composition at `v1`, so no existing client's report changes on rollout.

---

## File Structure

**New — framework (`lib/report-sections/`):**
- `types.ts` — `PartPin`, `SectionTemplate`, `SectionSnapshot`, `SectionOverride`, `ReportSectionConfig`, `ResolvedPart`, `PartImpl`, `PartRegistry`.
- `resolve.ts` — `resolveSection(template, override)`.
- `resolve.test.ts` — resolver unit tests (Vitest).
- `registry.ts` — `mergeRegistries`, `resolvedVersionIsPublished`, and the existence-guard helper `collectReferencedPins`.
- `validate.ts` — `parseReportSectionConfig`, `parseSectionTemplate`.
- `validate.test.ts` — validation unit tests.
- `guard.test.ts` — existence guard: every referenced pin exists and is published (core + bespoke).

**New — DB:**
- `lib/db/schema.ts` (modify) — `sectionTemplates` table; `reportSectionConfig` column on `clients`.
- `lib/db/queries.ts` (modify) — `getSectionTemplate(section)`.
- `scripts/seed-section-templates.ts` — idempotent seed of the `peec-ai` template at `v1`.
- `drizzle/*` — generated migration (committed).

**New — server actions:**
- `app/actions/report-sections.ts` — `pinVersion`, `freezeSection`, `unfreezeSection`, `promoteToTemplate`, `saveReportSectionConfig`.
- `app/actions/report-sections.test.ts` — action tests.

**Modify — AEO section:**
- `components/report-sections/peec-ai/ctx.ts` (new) — `PeecCtx` type + `buildPeecCtx(...)`.
- `components/report-sections/peec-ai/parts/*.tsx` (new) — one presentational part per current sub-block, at `v1`.
- `components/report-sections/peec-ai/parts/registry.ts` (new) — `PEEC_PARTS`.
- `components/report-sections/peec-ai/parts/bespoke/registry.ts` (new) — empty `BESPOKE_PARTS` seed + convention.
- `components/report-sections/peec-ai/template.ts` (new) — the code-default composition (used only by the seed script).
- `components/report-sections/peec-ai/index.tsx` (modify) — render via `resolveSection`.
- `components/report-sections/peec-ai/parts/__fixtures__/peec-ctx.ts` (new) — fixture `ctx` for goldens.
- `components/report-sections/peec-ai/parts/*.golden.test.tsx` (new) — per-version goldens + section parity.

**New — tooling:**
- `vitest.config.ts`, `vitest.setup.ts` — Vitest + jsdom.
- `package.json` (modify) — `test` script + dev deps.
- `.github/workflows/checks.yml` (modify) — add a `test` job.

---

## Task 1: Vitest tooling + sanity test

**Files:**
- Create: `vitest.config.ts`, `vitest.setup.ts`, `lib/report-sections/sanity.test.ts`
- Modify: `package.json`, `.github/workflows/checks.yml`

**Interfaces:**
- Produces: a working `npm test` (Vitest) that discovers `*.test.ts(x)` and runs in CI.

- [ ] **Step 1: Install dev dependencies**

Run:
```bash
npm install -D vitest@^3 @vitejs/plugin-react@^4 jsdom@^25 @testing-library/react@^16 @testing-library/jest-dom@^6
```
Expected: packages added to `devDependencies`; no peer-dep errors against React 19.

- [ ] **Step 2: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'scripts/**'],
    globals: true,
  },
})
```
Note: `scripts/**` is excluded because the existing `scripts/*.test.ts` use `node:assert` and run separately; leave them alone.

- [ ] **Step 3: Write `vitest.setup.ts`**

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 4: Add the `test` script to `package.json`**

In `"scripts"`, add:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: Write a sanity test**

`lib/report-sections/sanity.test.ts`:
```ts
import { expect, test } from 'vitest'

test('vitest is wired up', () => {
  expect(1 + 1).toBe(2)
})
```

- [ ] **Step 6: Run and verify pass**

Run: `npm test`
Expected: PASS (1 test), Vitest reports `sanity.test.ts`.

- [ ] **Step 7: Add a CI `test` job**

In `.github/workflows/checks.yml`, add a job alongside `rsc-boundary`:
```yaml
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - name: Unit + snapshot tests
        run: npm test
```

- [ ] **Step 8: Commit**

```bash
git add vitest.config.ts vitest.setup.ts lib/report-sections/sanity.test.ts package.json package-lock.json .github/workflows/checks.yml
git commit -m "test: add Vitest + jsdom test runner and CI job"
```

---

## Task 2: RSC-snapshot spike (de-risk the freeze guarantee)

**Why:** The entire freeze guarantee rests on goldens capturing *real* rendered output of a presentational part under Vitest+jsdom on React 19/Next 16. Prove it on one real, already-synchronous presentational component from the AEO section before building the suite. If the render harness is painful here, stop and revisit before the AEO refactor.

**Files:**
- Create: `components/report-sections/peec-ai/spike.golden.test.tsx`

**Interfaces:**
- Consumes: an existing synchronous presentational component in `components/report-sections/peec-ai/`. Pick one that takes plain props and no data fetching — inspect `section-header.tsx` (a `SectionHeader` with an icon + title) as the simplest candidate. Confirm its exact export name and props by reading the file first.

- [ ] **Step 1: Read the chosen component**

Run: read `components/report-sections/peec-ai/section-header.tsx`. Confirm the export (`SectionHeader`) and its props (an `icon` component + `title` string). If props differ, adapt the test below to the real signature.

- [ ] **Step 2: Write the spike golden test**

`components/report-sections/peec-ai/spike.golden.test.tsx`:
```tsx
import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { Sparkles } from 'lucide-react'
import { SectionHeader } from './section-header'

test('spike: golden snapshot captures real rendered markup', () => {
  const { container } = render(<SectionHeader icon={Sparkles} title="Frozen title" />)
  // The assertion that matters: the snapshot contains the ACTUAL text/markup,
  // not an empty wrapper. Assert both, so a wrapper-only render fails loudly.
  expect(container.textContent).toContain('Frozen title')
  expect(container.firstChild).toMatchSnapshot()
})
```

- [ ] **Step 3: Run to create the snapshot**

Run: `npm test -- spike.golden`
Expected: PASS; a new file `components/report-sections/peec-ai/__snapshots__/spike.golden.test.tsx.snap` appears containing real markup (open it and confirm it includes `Frozen title` and the header element — NOT an empty `<div />`).

- [ ] **Step 4: Prove it catches drift**

Temporarily change the test's `title` to `"Changed"` and run `npm test -- spike.golden`.
Expected: FAIL with a snapshot mismatch (and the `textContent` assertion also fails). Revert the title back to `"Frozen title"` and re-run: PASS.

**Decision gate:** if Step 3 produced real markup and Step 4 failed on change, the harness works — proceed. If the snapshot was an empty wrapper (a known RSC/Suspense failure mode), STOP: the presentational-split Part contract already in the spec is the fix, but confirm the render path before Task 13.

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/peec-ai/spike.golden.test.tsx components/report-sections/peec-ai/__snapshots__/spike.golden.test.tsx.snap
git commit -m "test: RSC-snapshot spike proves golden harness captures real markup"
```

---

## Task 3: Types + resolver (base cases, TDD)

**Files:**
- Create: `lib/report-sections/types.ts`, `lib/report-sections/resolve.ts`, `lib/report-sections/resolve.test.ts`

**Interfaces:**
- Produces:
  - `type PartPin = { id: string; version: number }`
  - `type SectionTemplate = { order: PartPin[]; labels: Record<string,string>; thresholds: Record<string,number> }`
  - `type SectionSnapshot = { order: PartPin[]; labels: Record<string,string>; thresholds: Record<string,number> }`
  - `type SectionOverride = { frozen?: SectionSnapshot; versions?: Record<string,number>; order?: string[]; hidden?: string[]; extraParts?: PartPin[]; labels?: Record<string,string>; thresholds?: Record<string,number> }`
  - `type ReportSectionConfig = Record<string, SectionOverride>`
  - `type ResolvedPart = { id: string; version: number; label: string; threshold?: number }`
  - `resolveSection(template: SectionTemplate, override: SectionOverride | undefined): ResolvedPart[]`

- [ ] **Step 1: Write `types.ts`**

```ts
// lib/report-sections/types.ts
import type React from 'react'

export type PartPin = { id: string; version: number }

export type SectionTemplate = {
  order: PartPin[]
  labels: Record<string, string>
  thresholds: Record<string, number>
}

export type SectionSnapshot = {
  order: PartPin[]
  labels: Record<string, string>
  thresholds: Record<string, number>
}

export type SectionOverride = {
  frozen?: SectionSnapshot
  versions?: Record<string, number>
  order?: string[]
  hidden?: string[]
  extraParts?: PartPin[]
  labels?: Record<string, string>
  thresholds?: Record<string, number>
}

export type ReportSectionConfig = Record<string, SectionOverride>

export type ResolvedPart = { id: string; version: number; label: string; threshold?: number }

export type PartImpl<Ctx> = {
  id: string
  version: number
  published: boolean
  defaultLabel: string
  // Pure synchronous presentational function — no await, no fetching.
  render: (ctx: Ctx, resolved: ResolvedPart) => React.ReactNode
}

// registry: id -> version -> impl
export type PartRegistry<Ctx> = Record<string, Record<number, PartImpl<Ctx>>>
```

- [ ] **Step 2: Write failing resolver tests (base cases)**

`lib/report-sections/resolve.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { resolveSection } from './resolve'
import type { SectionTemplate } from './types'

const T: SectionTemplate = {
  order: [
    { id: 'a', version: 1 },
    { id: 'b', version: 1 },
    { id: 'c', version: 1 },
  ],
  labels: { a: 'A', b: 'B', c: 'C' },
  thresholds: { b: 10 },
}

describe('resolveSection — unlocked base', () => {
  test('no override inherits template order, versions, labels', () => {
    expect(resolveSection(T, undefined)).toEqual([
      { id: 'a', version: 1, label: 'A' },
      { id: 'b', version: 1, label: 'B', threshold: 10 },
      { id: 'c', version: 1, label: 'C' },
    ])
  })

  test('version pin swaps only the named part', () => {
    const r = resolveSection(T, { versions: { b: 2 } })
    expect(r.map((p) => [p.id, p.version])).toEqual([['a', 1], ['b', 2], ['c', 1]])
  })

  test('hidden removes the id', () => {
    expect(resolveSection(T, { hidden: ['b'] }).map((p) => p.id)).toEqual(['a', 'c'])
  })

  test('partial order: listed first, remainder template-relative', () => {
    expect(resolveSection(T, { order: ['c', 'a'] }).map((p) => p.id)).toEqual(['c', 'a', 'b'])
  })

  test('label + threshold overrides layer on template defaults', () => {
    const r = resolveSection(T, { labels: { a: 'A2' }, thresholds: { b: 99 } })
    expect(r[0].label).toBe('A2')
    expect(r[1].threshold).toBe(99)
  })

  test('extraParts appended after template ids in extraParts order', () => {
    const r = resolveSection(T, { extraParts: [{ id: 'x', version: 3 }] })
    expect(r.map((p) => [p.id, p.version])).toEqual([['a', 1], ['b', 1], ['c', 1], ['x', 3]])
    expect(r[3].label).toBe('x') // no template/override label → falls back to id (see impl note)
  })
})
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- resolve`
Expected: FAIL ("resolveSection is not a function" / import error).

- [ ] **Step 4: Implement `resolve.ts` (base + version-pin path)**

```ts
// lib/report-sections/resolve.ts
import type { PartPin, ResolvedPart, SectionOverride, SectionSnapshot, SectionTemplate } from './types'

// Base = template when unlocked, snapshot when frozen. Both carry pinned PartPins.
function selectBase(
  template: SectionTemplate,
  override: SectionOverride | undefined,
): { order: PartPin[]; labels: Record<string, string>; thresholds: Record<string, number>; frozen: boolean } {
  if (override?.frozen) {
    const s: SectionSnapshot = override.frozen
    return { order: s.order, labels: s.labels ?? {}, thresholds: s.thresholds ?? {}, frozen: true }
  }
  return { order: template.order, labels: template.labels ?? {}, thresholds: template.thresholds ?? {}, frozen: false }
}

export function resolveSection(
  template: SectionTemplate,
  override: SectionOverride | undefined,
): ResolvedPart[] {
  const base = selectBase(template, override)
  const o = override ?? {}
  const hidden = new Set(o.hidden ?? [])

  // 1. Working set: base ids + extraParts (new ids only), minus hidden. Dedupe by id, base wins.
  const baseVersion = new Map<string, number>()
  const orderIds: string[] = []
  for (const pin of base.order) {
    if (!baseVersion.has(pin.id)) {
      baseVersion.set(pin.id, pin.version)
      orderIds.push(pin.id)
    }
  }
  const extraVersion = new Map<string, number>()
  const extraIds: string[] = []
  for (const pin of o.extraParts ?? []) {
    if (baseVersion.has(pin.id) || extraVersion.has(pin.id)) continue // base wins; dedupe
    extraVersion.set(pin.id, pin.version)
    extraIds.push(pin.id)
  }
  const inWorkingSet = (id: string) => (baseVersion.has(id) || extraVersion.has(id)) && !hidden.has(id)

  // 2. Version resolution per id. Frozen base is NOT subject to override.versions.
  const resolveVersion = (id: string): number => {
    if (!base.frozen && o.versions && id in o.versions) return o.versions[id]
    return baseVersion.has(id) ? baseVersion.get(id)! : extraVersion.get(id)!
  }

  // 3. Priority pass over override.order (ids in working set only, first occurrence).
  const emitted: string[] = []
  const seen = new Set<string>()
  for (const id of o.order ?? []) {
    if (inWorkingSet(id) && !seen.has(id)) {
      seen.add(id)
      emitted.push(id)
    }
  }
  // 4. Remainder in base-relative order (template ids, then un-ordered extras).
  for (const id of [...orderIds, ...extraIds]) {
    if (inWorkingSet(id) && !seen.has(id)) {
      seen.add(id)
      emitted.push(id)
    }
  }

  // 5. Labels/thresholds layer override over base default; label falls back to id.
  return emitted.map((id) => {
    const label = o.labels?.[id] ?? base.labels[id] ?? id
    const threshold = o.thresholds?.[id] ?? base.thresholds[id]
    const out: ResolvedPart = { id, version: resolveVersion(id), label }
    if (threshold !== undefined) out.threshold = threshold
    return out
  })
}
```
Note on the `label` fallback to `id`: the *render* layer will prefer the part's `defaultLabel` when neither template nor override supplies one; the resolver has no registry, so it falls back to `id`. The render call passes `resolved` plus can read `defaultLabel` itself. (Task 15 wires this.)

- [ ] **Step 5: Run to verify pass**

Run: `npm test -- resolve`
Expected: PASS (all base cases).

- [ ] **Step 6: Commit**

```bash
git add lib/report-sections/types.ts lib/report-sections/resolve.ts lib/report-sections/resolve.test.ts
git commit -m "feat: report-section resolver — types + unlocked base resolution"
```

---

## Task 4: Resolver — frozen base + combinatorial edge cases (TDD)

**Files:**
- Modify: `lib/report-sections/resolve.test.ts`

**Interfaces:**
- Consumes: `resolveSection` (Task 3).

- [ ] **Step 1: Add failing edge-case tests**

Append to `lib/report-sections/resolve.test.ts`:
```ts
describe('resolveSection — combinatorial + frozen', () => {
  test('order referencing an extraParts id places it at that position', () => {
    const r = resolveSection(T, { extraParts: [{ id: 'x', version: 2 }], order: ['x', 'a'] })
    expect(r.map((p) => p.id)).toEqual(['x', 'a', 'b', 'c'])
  })

  test('order referencing a hidden id is ignored', () => {
    const r = resolveSection(T, { hidden: ['b'], order: ['b', 'c'] })
    expect(r.map((p) => p.id)).toEqual(['c', 'a'])
  })

  test('order referencing an unknown id is ignored, no throw', () => {
    const r = resolveSection(T, { order: ['zzz', 'a'] })
    expect(r.map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  test('id in both extraParts and hidden ends up hidden', () => {
    const r = resolveSection(T, { extraParts: [{ id: 'x', version: 2 }], hidden: ['x'] })
    expect(r.map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  test('id in both base and extraParts at different version: base kept, extra dropped', () => {
    const r = resolveSection(T, { extraParts: [{ id: 'b', version: 5 }] })
    const b = r.find((p) => p.id === 'b')!
    expect(b.version).toBe(1) // base version wins; re-versioning is override.versions job
    expect(r.map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  test('id repeated in order is emitted once', () => {
    const r = resolveSection(T, { order: ['a', 'a', 'b'] })
    expect(r.map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  test('frozen base is used and override.versions does NOT change frozen versions', () => {
    const frozen = {
      order: [{ id: 'a', version: 1 }, { id: 'b', version: 1 }],
      labels: { a: 'A', b: 'B' },
      thresholds: {},
    }
    // Template has moved on to b@9, but the frozen client must stay b@1.
    const movedOn: SectionTemplate = {
      order: [{ id: 'a', version: 1 }, { id: 'b', version: 9 }, { id: 'c', version: 1 }],
      labels: { a: 'A', b: 'B', c: 'C' },
      thresholds: {},
    }
    const r = resolveSection(movedOn, { frozen, versions: { b: 2 } })
    expect(r.map((p) => [p.id, p.version])).toEqual([['a', 1], ['b', 1]]) // c absent, b stays 1
  })

  test('frozen still honors hidden/order/label overrides layered on the snapshot', () => {
    const frozen = {
      order: [{ id: 'a', version: 1 }, { id: 'b', version: 1 }],
      labels: { a: 'A', b: 'B' },
      thresholds: {},
    }
    const r = resolveSection(T, { frozen, hidden: ['a'], labels: { b: 'B-frozen' } })
    expect(r.map((p) => p.id)).toEqual(['b'])
    expect(r[0].label).toBe('B-frozen')
  })
})
```

- [ ] **Step 2: Run**

Run: `npm test -- resolve`
Expected: PASS (Task 3's implementation already handles these; if any fail, fix `resolve.ts` minimally). If the "frozen + versions" test fails, verify `resolveVersion` guards on `!base.frozen`.

- [ ] **Step 3: Commit**

```bash
git add lib/report-sections/resolve.test.ts lib/report-sections/resolve.ts
git commit -m "test: resolver combinatorial + frozen-base cases"
```

---

## Task 5: `section_templates` table + query + idempotent seed

**Files:**
- Modify: `lib/db/schema.ts`, `lib/db/queries.ts`
- Create: `scripts/seed-section-templates.ts`, `components/report-sections/peec-ai/template.ts`
- Generate: `drizzle/<timestamp>_section_templates.sql` (via drizzle-kit)

**Interfaces:**
- Produces:
  - `sectionTemplates` table `{ sectionSlug PK, composition jsonb, updatedAt, updatedBy, promotedFrom }`
  - `getSectionTemplate(section: string): Promise<SectionTemplate | null>`
  - `PEEC_TEMPLATE: SectionTemplate` (code default used only by the seed).

- [ ] **Step 1: Add the table to `schema.ts`**

Near the other tables, add (matching the file's existing `pgTable` style):
```ts
import type { SectionTemplate, ReportSectionConfig } from '@/lib/report-sections/types'

export const sectionTemplates = pgTable('section_templates', {
  sectionSlug: text('section_slug').primaryKey(),
  composition: jsonb('composition').$type<SectionTemplate>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by'),
  promotedFrom: text('promoted_from'),
})
```

- [ ] **Step 2: Add the `reportSectionConfig` column to the `clients` table**

In the `clients` `pgTable`, add:
```ts
  reportSectionConfig: jsonb('report_section_config').$type<ReportSectionConfig>(),
```

- [ ] **Step 3: Generate the migration**

Run: `npm run db:generate`
Expected: a new file under `drizzle/` creating `section_templates` and adding `report_section_config` to `clients`. Open it and confirm it is additive only (no drops).

- [ ] **Step 4: Write the code-default template for AEO**

`components/report-sections/peec-ai/template.ts`:
```ts
import type { SectionTemplate } from '@/lib/report-sections/types'

// The AEO section's default composition, all parts at v1. Order MUST match the current
// hardcoded ProviderSection sequence so the seeded template reproduces today's report.
// (See components/report-sections/peec-ai/index.tsx ProviderSection.)
export const PEEC_TEMPLATE: SectionTemplate = {
  order: [
    { id: 'overview-synopsis', version: 1 },
    { id: 'kpi-cards', version: 1 },
    { id: 'visibility-chart', version: 1 },
    { id: 'llm-breakdown', version: 1 },
    { id: 'winners-losers', version: 1 },
    { id: 'brand-rankings', version: 1 },
    { id: 'domains-row', version: 1 },
    { id: 'footer', version: 1 },
  ],
  labels: {
    'kpi-cards': 'Snapshot KPIs',
  },
  thresholds: {},
}
```

- [ ] **Step 5: Add `getSectionTemplate` to `queries.ts`**

Follow the file's existing `React.cache`-wrapped pattern:
```ts
import { sectionTemplates } from './schema'
import type { SectionTemplate } from '@/lib/report-sections/types'

export const getSectionTemplate = cache(async (section: string): Promise<SectionTemplate | null> => {
  const rows = await db.select().from(sectionTemplates).where(eq(sectionTemplates.sectionSlug, section)).limit(1)
  return rows[0]?.composition ?? null
})
```
(Confirm `cache`, `db`, `eq` are already imported in the file; add the imports if missing, matching existing usage.)

- [ ] **Step 6: Write the idempotent seed script**

`scripts/seed-section-templates.ts`:
```ts
import { db } from '@/lib/db/client'
import { sectionTemplates } from '@/lib/db/schema'
import { PEEC_TEMPLATE } from '@/components/report-sections/peec-ai/template'

async function main() {
  await db
    .insert(sectionTemplates)
    .values({ sectionSlug: 'peec-ai', composition: PEEC_TEMPLATE })
    .onConflictDoNothing({ target: sectionTemplates.sectionSlug })
  console.log('Seeded section_templates (insert-if-absent).')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
```
Add a script entry to `package.json`:
```json
"db:seed-section-templates": "tsx --env-file=.env.local scripts/seed-section-templates.ts"
```

- [ ] **Step 7: Apply migration + seed against a dev DB**

Run:
```bash
npm run db:migrate
npm run db:seed-section-templates
npm run db:seed-section-templates   # run twice
```
Expected: the second run logs the same success and does NOT change the row (verify in Drizzle Studio that `updated_at` is unchanged on the second run → confirms `ON CONFLICT DO NOTHING`).

- [ ] **Step 8: Commit**

```bash
git add lib/db/schema.ts lib/db/queries.ts drizzle/ scripts/seed-section-templates.ts components/report-sections/peec-ai/template.ts package.json
git commit -m "feat: section_templates table, query, idempotent AEO seed; reportSectionConfig column"
```

---

## Task 6: Registry helper + existence guard (TDD)

**Files:**
- Create: `lib/report-sections/registry.ts`, `lib/report-sections/guard.test.ts`

**Interfaces:**
- Produces:
  - `mergeRegistries<Ctx>(...regs: PartRegistry<Ctx>[]): PartRegistry<Ctx>`
  - `lookup<Ctx>(reg: PartRegistry<Ctx>, id: string, version: number): PartImpl<Ctx> | undefined`
  - `collectReferencedPins(template: SectionTemplate, overrides: SectionOverride[]): PartPin[]` — all `{id,version}` referenced by a template + any client snapshots.
  - `assertReferencedPinsPublished(reg, pins): string[]` — returns human-readable violations (missing or unpublished).

- [ ] **Step 1: Write `registry.ts`**

```ts
// lib/report-sections/registry.ts
import type { PartImpl, PartPin, PartRegistry, SectionOverride, SectionTemplate } from './types'

export function mergeRegistries<Ctx>(...regs: PartRegistry<Ctx>[]): PartRegistry<Ctx> {
  const out: PartRegistry<Ctx> = {}
  for (const reg of regs) {
    for (const [id, versions] of Object.entries(reg)) {
      out[id] = { ...(out[id] ?? {}), ...versions }
    }
  }
  return out
}

export function lookup<Ctx>(reg: PartRegistry<Ctx>, id: string, version: number): PartImpl<Ctx> | undefined {
  return reg[id]?.[version]
}

// Every pin the template pins, plus every pin captured in a client freeze snapshot.
export function collectReferencedPins(template: SectionTemplate, overrides: SectionOverride[]): PartPin[] {
  const pins: PartPin[] = [...template.order]
  for (const o of overrides) if (o.frozen) pins.push(...o.frozen.order)
  return pins
}

export function assertReferencedPinsPublished<Ctx>(reg: PartRegistry<Ctx>, pins: PartPin[]): string[] {
  const violations: string[] = []
  for (const { id, version } of pins) {
    const impl = reg[id]?.[version]
    if (!impl) violations.push(`missing part ${id}@${version}`)
    else if (!impl.published) violations.push(`referenced part ${id}@${version} is not published`)
  }
  return violations
}
```

- [ ] **Step 2: Write the guard test (fails until AEO registry exists — see note)**

`lib/report-sections/guard.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { assertReferencedPinsPublished, collectReferencedPins, mergeRegistries } from './registry'
import type { PartRegistry, SectionTemplate } from './types'

// A local fake registry keeps this task self-contained; Task 17 adds a second guard test
// wired to the REAL PEEC_PARTS + BESPOKE_PARTS so the actual section is guarded in CI.
const reg: PartRegistry<unknown> = {
  a: { 1: { id: 'a', version: 1, published: true, defaultLabel: 'A', render: () => null } },
  b: { 1: { id: 'b', version: 1, published: false, defaultLabel: 'B', render: () => null } },
}
const T: SectionTemplate = { order: [{ id: 'a', version: 1 }], labels: {}, thresholds: {} }

describe('existence guard', () => {
  test('passes when every referenced pin exists and is published', () => {
    expect(assertReferencedPinsPublished(reg, collectReferencedPins(T, []))).toEqual([])
  })
  test('flags a missing pin', () => {
    expect(assertReferencedPinsPublished(reg, [{ id: 'z', version: 1 }])).toContain('missing part z@1')
  })
  test('flags an unpublished referenced pin', () => {
    expect(assertReferencedPinsPublished(reg, [{ id: 'b', version: 1 }])[0]).toContain('not published')
  })
  test('mergeRegistries overlays bespoke onto core', () => {
    const merged = mergeRegistries(reg, { a: { 2: { id: 'a', version: 2, published: true, defaultLabel: 'A2', render: () => null } } })
    expect(Object.keys(merged.a).sort()).toEqual(['1', '2'])
  })
})
```

- [ ] **Step 3: Run + verify pass**

Run: `npm test -- guard registry`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/report-sections/registry.ts lib/report-sections/guard.test.ts
git commit -m "feat: part registry merge + existence/published guard helpers"
```

---

## Task 7: Validation (`parseReportSectionConfig` / `parseSectionTemplate`, TDD)

**Files:**
- Create: `lib/report-sections/validate.ts`, `lib/report-sections/validate.test.ts`

**Interfaces:**
- Consumes: types (Task 3); `PartRegistry` (Task 6).
- Produces:
  - `parseSectionTemplate(raw: unknown, reg: PartRegistry<unknown>): SectionTemplate` (throws `Error` on invalid).
  - `parseReportSectionConfig(raw: unknown, registries: Record<string, PartRegistry<unknown>>): ReportSectionConfig` — validates each section's override against that section's registry.
  - Rules enforced (throw on violation): unknown section slug; non-string id; non-integer version; malformed snapshot; any `{id,version}` unknown to the section registry; `extraParts` id duplicating a base/template id; (template + frozen only) version not `published`.

- [ ] **Step 1: Write failing validation tests**

`lib/report-sections/validate.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { parseReportSectionConfig, parseSectionTemplate } from './validate'
import type { PartRegistry } from './types'

const reg: PartRegistry<unknown> = {
  a: { 1: { id: 'a', version: 1, published: true, defaultLabel: 'A', render: () => null } },
  x: { 2: { id: 'x', version: 2, published: true, defaultLabel: 'X', render: () => null } },
  draft: { 1: { id: 'draft', version: 1, published: false, defaultLabel: 'D', render: () => null } },
}
const registries = { 'peec-ai': reg }

describe('parseSectionTemplate', () => {
  test('accepts a valid template of published pins', () => {
    const t = parseSectionTemplate({ order: [{ id: 'a', version: 1 }], labels: { a: 'A' }, thresholds: {} }, reg)
    expect(t.order[0]).toEqual({ id: 'a', version: 1 })
  })
  test('rejects an unpublished version in a template', () => {
    expect(() => parseSectionTemplate({ order: [{ id: 'draft', version: 1 }], labels: {}, thresholds: {} }, reg)).toThrow(/not published/)
  })
  test('rejects an unknown pin', () => {
    expect(() => parseSectionTemplate({ order: [{ id: 'nope', version: 1 }], labels: {}, thresholds: {} }, reg)).toThrow(/unknown/)
  })
})

describe('parseReportSectionConfig', () => {
  test('accepts version pin + hide/order/relabel', () => {
    const c = parseReportSectionConfig({ 'peec-ai': { versions: { a: 1 }, hidden: ['a'], order: ['a'], labels: { a: 'A2' } } }, registries)
    expect(c['peec-ai'].versions).toEqual({ a: 1 })
  })
  test('rejects an unknown section slug', () => {
    expect(() => parseReportSectionConfig({ 'not-a-section': {} }, registries)).toThrow(/unknown section/)
  })
  test('rejects a non-integer version', () => {
    expect(() => parseReportSectionConfig({ 'peec-ai': { versions: { a: 1.5 } } }, registries)).toThrow(/version/)
  })
  test('rejects extraParts id duplicating a template id (use versions)', () => {
    // 'a' is a valid registry id; adding it via extraParts is the disallowed case.
    expect(() => parseReportSectionConfig({ 'peec-ai': { extraParts: [{ id: 'a', version: 1 }] } }, registries, ['a'])).toThrow(/extraParts/)
  })
  test('rejects an unknown extraParts pin', () => {
    expect(() => parseReportSectionConfig({ 'peec-ai': { extraParts: [{ id: 'ghost', version: 9 }] } }, registries)).toThrow(/unknown/)
  })
  test('rejects a frozen snapshot pinning an unpublished version', () => {
    expect(() =>
      parseReportSectionConfig(
        { 'peec-ai': { frozen: { order: [{ id: 'draft', version: 1 }], labels: {}, thresholds: {} } } },
        registries,
      ),
    ).toThrow(/not published/)
  })
})
```
Note: `parseReportSectionConfig(raw, registries, templateIds?)` takes an optional per-section set of template ids so it can enforce the extraParts-vs-base rule; in production the caller passes the section's current template ids.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- validate`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `validate.ts`**

```ts
// lib/report-sections/validate.ts
import type { PartPin, PartRegistry, ReportSectionConfig, SectionOverride, SectionSnapshot, SectionTemplate } from './types'

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)

function parsePin(raw: unknown, reg: PartRegistry<unknown>, requirePublished: boolean): PartPin {
  if (!isObj(raw) || typeof raw.id !== 'string' || !isInt(raw.version)) throw new Error(`invalid part pin: ${JSON.stringify(raw)}`)
  const impl = reg[raw.id]?.[raw.version]
  if (!impl) throw new Error(`unknown part ${raw.id}@${raw.version}`)
  if (requirePublished && !impl.published) throw new Error(`part ${raw.id}@${raw.version} is not published`)
  return { id: raw.id, version: raw.version }
}

function parseStrMap(raw: unknown, kind: string): Record<string, string> {
  if (raw === undefined) return {}
  if (!isObj(raw)) throw new Error(`invalid ${kind} map`)
  for (const v of Object.values(raw)) if (typeof v !== 'string') throw new Error(`invalid ${kind} value`)
  return raw as Record<string, string>
}
function parseNumMap(raw: unknown, kind: string): Record<string, number> {
  if (raw === undefined) return {}
  if (!isObj(raw)) throw new Error(`invalid ${kind} map`)
  for (const v of Object.values(raw)) if (typeof v !== 'number') throw new Error(`invalid ${kind} value`)
  return raw as Record<string, number>
}

export function parseSectionTemplate(raw: unknown, reg: PartRegistry<unknown>): SectionTemplate {
  if (!isObj(raw) || !Array.isArray(raw.order)) throw new Error('invalid template')
  return {
    order: raw.order.map((p) => parsePin(p, reg, true)),
    labels: parseStrMap(raw.labels, 'template.labels'),
    thresholds: parseNumMap(raw.thresholds, 'template.thresholds'),
  }
}

function parseSnapshot(raw: unknown, reg: PartRegistry<unknown>): SectionSnapshot {
  if (!isObj(raw) || !Array.isArray(raw.order)) throw new Error('invalid frozen snapshot')
  return {
    order: raw.order.map((p) => parsePin(p, reg, true)), // frozen pins must be published
    labels: parseStrMap(raw.labels, 'frozen.labels'),
    thresholds: parseNumMap(raw.thresholds, 'frozen.thresholds'),
  }
}

function parseVersions(raw: unknown, reg: PartRegistry<unknown>): Record<string, number> {
  if (raw === undefined) return {}
  if (!isObj(raw)) throw new Error('invalid versions map')
  const out: Record<string, number> = {}
  for (const [id, version] of Object.entries(raw)) {
    if (!isInt(version)) throw new Error(`invalid version for ${id}`)
    if (!reg[id]?.[version]) throw new Error(`unknown part ${id}@${version}`)
    out[id] = version // pins may reference unpublished (guinea-pig) versions
  }
  return out
}

function parseStrArray(raw: unknown, kind: string): string[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw) || raw.some((s) => typeof s !== 'string')) throw new Error(`invalid ${kind}`)
  return raw as string[]
}

function parseOverride(raw: unknown, reg: PartRegistry<unknown>, templateIds: string[]): SectionOverride {
  if (!isObj(raw)) throw new Error('invalid section override')
  const out: SectionOverride = {}
  if (raw.frozen !== undefined) out.frozen = parseSnapshot(raw.frozen, reg)
  out.versions = parseVersions(raw.versions, reg)
  out.hidden = parseStrArray(raw.hidden, 'hidden')
  out.order = parseStrArray(raw.order, 'order')
  out.labels = parseStrMap(raw.labels, 'labels')
  out.thresholds = parseNumMap(raw.thresholds, 'thresholds')
  if (raw.extraParts !== undefined) {
    if (!Array.isArray(raw.extraParts)) throw new Error('invalid extraParts')
    out.extraParts = raw.extraParts.map((p) => {
      const pin = parsePin(p, reg, false) // bespoke pins may be unpublished until they too are frozen/promoted
      if (templateIds.includes(pin.id)) throw new Error(`extraParts id "${pin.id}" already in template — use versions to re-version`)
      return pin
    })
  }
  return out
}

export function parseReportSectionConfig(
  raw: unknown,
  registries: Record<string, PartRegistry<unknown>>,
  templateIds: string[] = [],
): ReportSectionConfig {
  if (!isObj(raw)) throw new Error('invalid reportSectionConfig')
  const out: ReportSectionConfig = {}
  for (const [section, override] of Object.entries(raw)) {
    const reg = registries[section]
    if (!reg) throw new Error(`unknown section "${section}"`)
    out[section] = parseOverride(override, reg, templateIds)
  }
  return out
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- validate`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/report-sections/validate.ts lib/report-sections/validate.test.ts
git commit -m "feat: write-time validation for section config + template"
```

---

## Task 8: Server actions — `pinVersion`, `freezeSection`, `unfreezeSection` (TDD)

**Files:**
- Create: `app/actions/report-sections.ts`, `app/actions/report-sections.test.ts`

**Interfaces:**
- Consumes: `resolveSection` (Task 3), `getSectionTemplate` (Task 5), registries (built in Task 14 — for tests, inject a fake), `parseReportSectionConfig` (Task 7), permission check `canEditDashboard` (existing, `lib/dashboard/permissions.ts`).
- Produces (all return `{ ok: true } | { ok: false; error: string }`):
  - `pinVersion(slug, section, partId, version)`
  - `freezeSection(slug, section)`
  - `unfreezeSection(slug, section)`
- Also produces a pure, unit-testable core so the DB/permission wrapper stays thin:
  - `applyPinVersion(cfg, section, partId, version): ReportSectionConfig`
  - `computeFreeze(template, override): SectionSnapshot`
  - `applyFreeze/applyUnfreeze(cfg, section, snapshot?): ReportSectionConfig`

- [ ] **Step 1: Write failing tests for the pure cores**

`app/actions/report-sections.test.ts`:
```ts
import { describe, expect, test } from 'vitest'
import { applyPinVersion, applyUnfreeze, computeFreeze } from './report-sections'
import type { SectionTemplate } from '@/lib/report-sections/types'

const T: SectionTemplate = {
  order: [{ id: 'a', version: 1 }, { id: 'b', version: 1 }],
  labels: { a: 'A', b: 'B' },
  thresholds: {},
}

describe('applyPinVersion', () => {
  test('sets a version pin for the section, preserving other sections', () => {
    const c = applyPinVersion({ other: {} }, 'peec-ai', 'b', 2)
    expect(c['peec-ai'].versions).toEqual({ b: 2 })
    expect(c.other).toBeDefined()
  })
})

describe('computeFreeze', () => {
  test('materializes the resolved composition into a snapshot', () => {
    const snap = computeFreeze(T, { versions: { b: 2 } })
    expect(snap.order).toEqual([{ id: 'a', version: 1 }, { id: 'b', version: 2 }])
    expect(snap.labels).toEqual({ a: 'A', b: 'B' })
  })
})

describe('applyUnfreeze', () => {
  test('removes frozen but retains other diffs', () => {
    const c = applyUnfreeze({ 'peec-ai': { frozen: { order: [], labels: {}, thresholds: {} }, hidden: ['a'] } }, 'peec-ai')
    expect(c['peec-ai'].frozen).toBeUndefined()
    expect(c['peec-ai'].hidden).toEqual(['a'])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- report-sections`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the pure cores + thin action wrappers**

`app/actions/report-sections.ts`:
```ts
'use server'

import { revalidateTag } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { clients } from '@/lib/db/schema'
import { getClientBySlug, getSectionTemplate } from '@/lib/db/queries'
import { auth } from '@/auth'
import { canEditDashboard } from '@/lib/dashboard/permissions'
import { resolveSection } from '@/lib/report-sections/resolve'
import type { ReportSectionConfig, SectionOverride, SectionSnapshot, SectionTemplate } from '@/lib/report-sections/types'

type Result = { ok: true } | { ok: false; error: string }

// ---- pure cores (unit-tested) ----

export function applyPinVersion(cfg: ReportSectionConfig, section: string, partId: string, version: number): ReportSectionConfig {
  const prev = cfg[section] ?? {}
  return { ...cfg, [section]: { ...prev, versions: { ...(prev.versions ?? {}), [partId]: version } } }
}

export function computeFreeze(template: SectionTemplate, override: SectionOverride | undefined): SectionSnapshot {
  const resolved = resolveSection(template, override)
  return {
    order: resolved.map((r) => ({ id: r.id, version: r.version })),
    labels: Object.fromEntries(resolved.map((r) => [r.id, r.label])),
    thresholds: Object.fromEntries(resolved.filter((r) => r.threshold !== undefined).map((r) => [r.id, r.threshold as number])),
  }
}

export function applyFreeze(cfg: ReportSectionConfig, section: string, snapshot: SectionSnapshot): ReportSectionConfig {
  const prev = cfg[section] ?? {}
  return { ...cfg, [section]: { ...prev, frozen: snapshot } }
}

export function applyUnfreeze(cfg: ReportSectionConfig, section: string): ReportSectionConfig {
  const prev = cfg[section] ?? {}
  const { frozen: _drop, ...rest } = prev
  return { ...cfg, [section]: rest }
}

// ---- DB/permission wrappers ----

async function authorize(slug: string): Promise<Result & { cfg?: ReportSectionConfig }> {
  const session = await auth()
  const client = await getClientBySlug(slug)
  if (!client) return { ok: false, error: 'client not found' }
  if (!session || !canEditDashboard(session, client)) return { ok: false, error: 'unauthorized' }
  return { ok: true, cfg: client.reportSectionConfig ?? {} }
}

async function persist(slug: string, cfg: ReportSectionConfig): Promise<Result> {
  await db.update(clients).set({ reportSectionConfig: cfg, updatedAt: new Date() }).where(eq(clients.slug, slug))
  revalidateTag('db', 'max')
  return { ok: true }
}

export async function pinVersion(slug: string, section: string, partId: string, version: number): Promise<Result> {
  const a = await authorize(slug)
  if (!a.ok) return a
  return persist(slug, applyPinVersion(a.cfg!, section, partId, version))
}

export async function freezeSection(slug: string, section: string): Promise<Result> {
  const a = await authorize(slug)
  if (!a.ok) return a
  const template = await getSectionTemplate(section)
  if (!template) return { ok: false, error: `no template for ${section}` }
  const snapshot = computeFreeze(template, a.cfg![section])
  return persist(slug, applyFreeze(a.cfg!, section, snapshot))
}

export async function unfreezeSection(slug: string, section: string): Promise<Result> {
  const a = await authorize(slug)
  if (!a.ok) return a
  return persist(slug, applyUnfreeze(a.cfg!, section))
}
```
Note: confirm `canEditDashboard`'s exact signature by reading `lib/dashboard/permissions.ts`; adapt the `authorize` call to match (it may take `(session, client)` or `(role, clientSlug)`).

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- report-sections`
Expected: PASS (pure cores). The DB wrappers aren't unit-tested here (they need a DB); they're covered by the manual verification in Task 12.

- [ ] **Step 5: Commit**

```bash
git add app/actions/report-sections.ts app/actions/report-sections.test.ts
git commit -m "feat: pinVersion / freezeSection / unfreezeSection actions + pure cores"
```

---

## Task 9: Server action — `promoteToTemplate` (TDD)

**Files:**
- Modify: `app/actions/report-sections.ts`, `app/actions/report-sections.test.ts`
- Modify: `lib/db/schema.ts` import usage only (uses `sectionTemplates`)

**Interfaces:**
- Consumes: `resolveSection`, `getSectionTemplate`, `sectionTemplates` table.
- Produces:
  - pure core `computePromotion(template, sourceResolved, partIds, opts): SectionTemplate` — returns the new template composition (version pin moved; labels/thresholds moved only if `opts` set); does not mutate input.
  - `promoteToTemplate(section, fromSlug, partIds, opts?): Promise<Result>` — persists the new composition + `updatedBy`/`promotedFrom`, logs `old→new` per part.

- [ ] **Step 1: Write failing tests for `computePromotion`**

Append to `app/actions/report-sections.test.ts`:
```ts
import { computePromotion } from './report-sections'
import type { ResolvedPart } from '@/lib/report-sections/types'

const sourceResolved: ResolvedPart[] = [
  { id: 'a', version: 1, label: 'A' },
  { id: 'b', version: 2, label: 'B-experimental' },
]

describe('computePromotion', () => {
  test('promotes version pin only by default (labels untouched)', () => {
    const next = computePromotion(T, sourceResolved, ['b'], {})
    expect(next.order.find((p) => p.id === 'b')!.version).toBe(2)
    expect(next.labels.b).toBe('B') // NOT 'B-experimental'
  })
  test('opts.labels lifts the source label too', () => {
    const next = computePromotion(T, sourceResolved, ['b'], { labels: true })
    expect(next.labels.b).toBe('B-experimental')
  })
  test('allows a backward move', () => {
    const src: ResolvedPart[] = [{ id: 'b', version: 1, label: 'B' }]
    const from: SectionTemplate = { order: [{ id: 'b', version: 3 }], labels: {}, thresholds: {} }
    expect(computePromotion(from, src, ['b'], {}).order[0].version).toBe(1)
  })
  test('ignores partIds not present in the source resolution', () => {
    const next = computePromotion(T, sourceResolved, ['zzz'], {})
    expect(next).toEqual(T)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- report-sections`
Expected: FAIL (`computePromotion` not exported).

- [ ] **Step 3: Implement `computePromotion` + the action**

Append to `app/actions/report-sections.ts`:
```ts
import { sectionTemplates } from '@/lib/db/schema'
import type { ResolvedPart } from '@/lib/report-sections/types'

export function computePromotion(
  template: SectionTemplate,
  sourceResolved: ResolvedPart[],
  partIds: string[],
  opts: { labels?: boolean; thresholds?: boolean },
): SectionTemplate {
  const bySource = new Map(sourceResolved.map((r) => [r.id, r]))
  const order = template.order.map((pin) => {
    const src = partIds.includes(pin.id) ? bySource.get(pin.id) : undefined
    return src ? { id: pin.id, version: src.version } : pin
  })
  const labels = { ...template.labels }
  const thresholds = { ...template.thresholds }
  for (const id of partIds) {
    const src = bySource.get(id)
    if (!src) continue
    if (opts.labels) labels[id] = src.label
    if (opts.thresholds && src.threshold !== undefined) thresholds[id] = src.threshold
  }
  return { order, labels, thresholds }
}

export async function promoteToTemplate(
  section: string,
  fromSlug: string,
  partIds: string[],
  opts: { labels?: boolean; thresholds?: boolean } = {},
): Promise<Result> {
  const session = await auth()
  const source = await getClientBySlug(fromSlug)
  if (!session) return { ok: false, error: 'unauthorized' }
  if (!source) return { ok: false, error: 'source client not found' }
  // promote is an internal-admin-only action (mutates every non-frozen client's report)
  if (session.user.role !== 'INTERNAL_ADMIN') return { ok: false, error: 'unauthorized' }

  const template = await getSectionTemplate(section)
  if (!template) return { ok: false, error: `no template for ${section}` }
  const sourceResolved = resolveSection(template, source.reportSectionConfig?.[section])
  const next = computePromotion(template, sourceResolved, partIds, opts)

  for (const id of partIds) {
    const before = template.order.find((p) => p.id === id)?.version
    const after = next.order.find((p) => p.id === id)?.version
    console.log(`[promote] ${section}/${id}: v${before ?? '?'} -> v${after ?? '?'} (from ${fromSlug})`)
  }

  await db
    .insert(sectionTemplates)
    .values({ sectionSlug: section, composition: next, updatedBy: session.user.email ?? null, promotedFrom: fromSlug, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: sectionTemplates.sectionSlug,
      set: { composition: next, updatedBy: session.user.email ?? null, promotedFrom: fromSlug, updatedAt: new Date() },
    })
  revalidateTag('db', 'max')
  return { ok: true }
}
```
Note: verify `session.user.role` / `session.user.email` shapes against `auth.ts`'s session callback; adapt if the role lives elsewhere.

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- report-sections`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/actions/report-sections.ts app/actions/report-sections.test.ts
git commit -m "feat: promoteToTemplate action — version-only by default, opt-in copy, logged"
```

---

## Task 10: Server action — `saveReportSectionConfig` (TDD)

**Files:**
- Modify: `app/actions/report-sections.ts`, `app/actions/report-sections.test.ts`

**Interfaces:**
- Consumes: `parseReportSectionConfig` (Task 7), the registries map + template ids (from Task 14; for the action, import the real registry map).
- Produces: `saveReportSectionConfig(slug, section, raw): Promise<Result>` — validates the single section's override against its registry + current template ids, then persists.

- [ ] **Step 1: Write a failing test for the validation-integration seam**

Append to `app/actions/report-sections.test.ts`:
```ts
import { validateSectionOverride } from './report-sections'
import type { PartRegistry } from '@/lib/report-sections/types'

const reg: PartRegistry<unknown> = {
  a: { 1: { id: 'a', version: 1, published: true, defaultLabel: 'A', render: () => null } },
}

describe('validateSectionOverride', () => {
  test('rejects an override that re-adds a template id via extraParts', () => {
    expect(() => validateSectionOverride('peec-ai', { extraParts: [{ id: 'a', version: 1 }] }, { 'peec-ai': reg }, ['a'])).toThrow(/extraParts/)
  })
  test('accepts a clean hide/order override', () => {
    expect(validateSectionOverride('peec-ai', { hidden: ['a'] }, { 'peec-ai': reg }, ['a'])['peec-ai'].hidden).toEqual(['a'])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- report-sections`
Expected: FAIL (`validateSectionOverride` not exported).

- [ ] **Step 3: Implement**

Append to `app/actions/report-sections.ts`:
```ts
import { parseReportSectionConfig } from '@/lib/report-sections/validate'
import type { PartRegistry } from '@/lib/report-sections/types'

export function validateSectionOverride(
  section: string,
  raw: unknown,
  registries: Record<string, PartRegistry<unknown>>,
  templateIds: string[],
): ReportSectionConfig {
  return parseReportSectionConfig({ [section]: raw }, registries, templateIds)
}

export async function saveReportSectionConfig(slug: string, section: string, raw: unknown): Promise<Result> {
  const a = await authorize(slug)
  if (!a.ok) return a
  const template = await getSectionTemplate(section)
  const templateIds = (template?.order ?? []).map((p) => p.id)
  // REGISTRIES is the real registry map assembled in Task 14; imported here.
  let parsedSection: SectionOverride
  try {
    parsedSection = validateSectionOverride(section, raw, REGISTRIES, templateIds)[section]
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
  return persist(slug, { ...a.cfg!, [section]: parsedSection })
}
```
Note: add `import { REGISTRIES } from '@/lib/report-sections/registries'` — a small module (created in Task 14) mapping section slug → merged `PartRegistry`. Until Task 14 exists, this action won't be import-complete; that's expected — the pure `validateSectionOverride` is what this task tests. Wire the import in Task 14.

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- report-sections`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/actions/report-sections.ts app/actions/report-sections.test.ts
git commit -m "feat: saveReportSectionConfig action + validateSectionOverride seam"
```

---

## Task 11: AEO — extract `PeecCtx` + `buildPeecCtx` (no behavior change)

**Files:**
- Create: `components/report-sections/peec-ai/ctx.ts`
- Modify: `components/report-sections/peec-ai/index.tsx`

**Interfaces:**
- Produces: `type PeecCtx` (all values `ProviderSection` currently computes: `data`, `provider`, `isPeec`, `models`, `aiTraffic`, `clientSlug`, `dateRange`, `winners`, `losers`, `llmFiltered`, `visFiltered`, `citationShareValue`, `citationShareDeltaShown`, `aiTrafficDelta`, `brandName`, `Rankings`, `Domains`, `LLM`, `DEF`, `label`, `you`, and any other locals) and `buildPeecCtx(args): PeecCtx`.

- [ ] **Step 1: Read the current `ProviderSection`**

Read `components/report-sections/peec-ai/index.tsx` lines ~143–302. Enumerate every local computed before the `return (` — these become `PeecCtx` fields.

- [ ] **Step 2: Create `ctx.ts` with the type + builder**

Move the computation block (currently lines ~158–213) verbatim into `buildPeecCtx`, returning an object with every field. Example skeleton (fill with the real locals):
```ts
// components/report-sections/peec-ai/ctx.ts
import type React from 'react'
import type { AEOModel } from '@/lib/peec/models'
// ...import the same helpers ProviderSection uses (computeWinnersLosers, applyModelFilter, etc.)

export type PeecCtx = {
  data: Overview
  provider: AeoProvider
  isPeec: boolean
  models: AEOModel[] | null
  aiTraffic: AIReferralKPI
  clientSlug?: string
  dateRange?: string
  // ...every other computed local, typed
}

export function buildPeecCtx(args: {
  data: Overview; provider: AeoProvider; models: AEOModel[] | null; aiTraffic: AIReferralKPI; clientSlug?: string; dateRange?: string
}): PeecCtx {
  // exact computations moved from ProviderSection, unchanged
  // return { ...all fields }
}
```

- [ ] **Step 3: Rewire `ProviderSection` to call `buildPeecCtx`**

Replace the moved computation block with `const ctx = buildPeecCtx({ data, provider, models, aiTraffic, clientSlug, dateRange })` and reference `ctx.*` in the existing JSX. **Do not change the JSX yet** — only the source of the locals. This keeps output identical.

- [ ] **Step 4: Verify no visual change (smoke)**

Run: `npm run build` (or `npm run check:rsc && npx tsc --noEmit`) to confirm it compiles. Manual: load an AEO report locally and confirm it looks unchanged.

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/peec-ai/ctx.ts components/report-sections/peec-ai/index.tsx
git commit -m "refactor(peec): extract PeecCtx + buildPeecCtx, no behavior change"
```

---

## Task 12: AEO — split each sub-block into a versioned presentational part

**Files:**
- Create: `components/report-sections/peec-ai/parts/{overview-synopsis,kpi-cards,visibility-chart,llm-breakdown,winners-losers,brand-rankings,domains-row,footer}.tsx`
- Create: `components/report-sections/peec-ai/parts/registry.ts`

**Interfaces:**
- Consumes: `PeecCtx` (Task 11), `PartImpl`/`PartRegistry` (Task 3).
- Produces: `PEEC_PARTS: PartRegistry<PeecCtx>` with each id at `version: 1, published: true`.

- [ ] **Step 1: Create one part file per sub-block**

For each sub-block, move its exact JSX from `ProviderSection`'s `return (...)` into a part file. Each part's `render` is a **pure sync function of `(ctx, resolved)`**. Example for `visibility-chart` (adapt the JSX to the real code):
```tsx
// components/report-sections/peec-ai/parts/visibility-chart.tsx
import type { PartImpl } from '@/lib/report-sections/types'
import type { PeecCtx } from '../ctx'
import { VisibilityChart } from '../visibility-chart'

export const visibilityChartV1: PartImpl<PeecCtx> = {
  id: 'visibility-chart',
  version: 1,
  published: true,
  defaultLabel: 'Visibility',
  render: (ctx) =>
    ctx.data.dailyVisibility.length > 0 ? (
      <VisibilityChart data={ctx.data.dailyVisibility} competitorData={ctx.data.competitorDailyVisibility} brandName={ctx.brandName} />
    ) : null,
}
```
For `kpi-cards`, use `resolved.label` for the section heading (currently `'Snapshot KPIs'`). For `overview-synopsis`, keep the `<Suspense>` + async `OverviewSynopsis` child inside the part — the async child stays async; the part's own `render` remains sync (it just returns the `<Suspense>` element). For `domains-row`, move the **entire** `grid lg:grid-cols-[1fr_280px]` block (top-domains + domain-types + definitions) as one part.

- [ ] **Step 2: Create the registry**

```ts
// components/report-sections/peec-ai/parts/registry.ts
import type { PartRegistry } from '@/lib/report-sections/types'
import type { PeecCtx } from '../ctx'
import { overviewSynopsisV1 } from './overview-synopsis'
import { kpiCardsV1 } from './kpi-cards'
import { visibilityChartV1 } from './visibility-chart'
import { llmBreakdownV1 } from './llm-breakdown'
import { winnersLosersV1 } from './winners-losers'
import { brandRankingsV1 } from './brand-rankings'
import { domainsRowV1 } from './domains-row'
import { footerV1 } from './footer'

export const PEEC_PARTS: PartRegistry<PeecCtx> = {
  'overview-synopsis': { 1: overviewSynopsisV1 },
  'kpi-cards': { 1: kpiCardsV1 },
  'visibility-chart': { 1: visibilityChartV1 },
  'llm-breakdown': { 1: llmBreakdownV1 },
  'winners-losers': { 1: winnersLosersV1 },
  'brand-rankings': { 1: brandRankingsV1 },
  'domains-row': { 1: domainsRowV1 },
  'footer': { 1: footerV1 },
}
```

- [ ] **Step 3: Compile check**

Run: `npx tsc --noEmit`
Expected: no type errors. (Parts aren't wired into the render yet — that's Task 13.)

- [ ] **Step 4: Commit**

```bash
git add components/report-sections/peec-ai/parts/
git commit -m "refactor(peec): split sub-blocks into versioned presentational parts (v1)"
```

---

## Task 13: AEO — render via `resolveSection` + parity snapshot

**Files:**
- Modify: `components/report-sections/peec-ai/index.tsx`
- Create: `components/report-sections/peec-ai/parts/__fixtures__/peec-ctx.ts`
- Create: `components/report-sections/peec-ai/parity.golden.test.tsx`
- Create: `lib/report-sections/registries.ts`

**Interfaces:**
- Consumes: `PEEC_PARTS` (Task 12), `PEEC_TEMPLATE` (Task 5), `resolveSection`, `lookup`/`mergeRegistries` (Task 6), `getSectionTemplate` (Task 5).
- Produces: `REGISTRIES: Record<string, PartRegistry<unknown>>` in `lib/report-sections/registries.ts` (wires the `saveReportSectionConfig` import from Task 10).

- [ ] **Step 1: Build a fixture `ctx`**

`components/report-sections/peec-ai/parts/__fixtures__/peec-ctx.ts`: export `FIXTURE_PEEC_CTX: PeecCtx` with representative, branch-exercising fake data (non-empty `dailyVisibility`, a `you` brand, non-empty `llmBreakdown`, winners/losers present). This fixture is the frozen-appearance basis for goldens — make it exercise the meaningful branches per the Global Constraints.

- [ ] **Step 2: Rewire `ProviderSection` to resolve + render**

Replace the hardcoded `return (<div className="space-y-8">…</div>)` with:
```tsx
import { resolveSection } from '@/lib/report-sections/resolve'
import { lookup } from '@/lib/report-sections/registry'
import { PEEC_PARTS } from './parts/registry'
import { BESPOKE_PARTS } from './parts/bespoke/registry' // Task 14 (empty for now — create a stub first if needed)
import { mergeRegistries } from '@/lib/report-sections/registry'

// template + override are fetched by the async PeecAIReport wrapper and passed down.
const registry = mergeRegistries(PEEC_PARTS, BESPOKE_PARTS)
const resolved = resolveSection(template, override)
return (
  <div className="space-y-8">
    {resolved.map((r) => {
      const impl = lookup(registry, r.id, r.version)
      return impl ? <div key={`${r.id}@${r.version}`}>{impl.render(ctx, r)}</div> : null
    })}
  </div>
)
```
In the async `PeecAIReport` wrapper, fetch `const template = await getSectionTemplate('peec-ai')` and `const override = config?.reportSectionConfig?.['peec-ai']`, and thread them to `ProviderSection`. If `template` is null (unseeded), fall back to `PEEC_TEMPLATE` so the section still renders. Wrap each part in the same element the original JSX used if a wrapper was present; otherwise the bare `<div>` keeps `space-y-8` spacing. **Match the original DOM** — the parity test will catch drift.

- [ ] **Step 3: Create `lib/report-sections/registries.ts`**

```ts
import type { PartRegistry } from './types'
import { mergeRegistries } from './registry'
import { PEEC_PARTS } from '@/components/report-sections/peec-ai/parts/registry'
import { BESPOKE_PARTS } from '@/components/report-sections/peec-ai/parts/bespoke/registry'

export const REGISTRIES: Record<string, PartRegistry<unknown>> = {
  'peec-ai': mergeRegistries(PEEC_PARTS, BESPOKE_PARTS) as unknown as PartRegistry<unknown>,
}
```
(If `BESPOKE_PARTS` doesn't exist yet, create the stub from Task 14 Step 1 first.)

- [ ] **Step 4: Write the parity golden test**

`components/report-sections/peec-ai/parity.golden.test.tsx`:
```tsx
import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { resolveSection } from '@/lib/report-sections/resolve'
import { lookup, mergeRegistries } from '@/lib/report-sections/registry'
import { PEEC_PARTS } from './parts/registry'
import { BESPOKE_PARTS } from './parts/bespoke/registry'
import { PEEC_TEMPLATE } from './template'
import { FIXTURE_PEEC_CTX } from './parts/__fixtures__/peec-ctx'

test('AEO parity: no override renders the full v1 composition incl. domains-row grid', () => {
  const registry = mergeRegistries(PEEC_PARTS, BESPOKE_PARTS)
  const resolved = resolveSection(PEEC_TEMPLATE, undefined)
  const { container } = render(
    <div className="space-y-8">
      {resolved.map((r) => {
        const impl = lookup(registry, r.id, r.version)
        return impl ? <div key={`${r.id}@${r.version}`}>{impl.render(FIXTURE_PEEC_CTX, r)}</div> : null
      })}
    </div>,
  )
  // Regression-prone spot: assert the domains-row grid wrapper is present.
  expect(container.querySelector('.lg\\:grid-cols-\\[1fr_280px\\]')).not.toBeNull()
  expect(container.firstChild).toMatchSnapshot()
})
```

- [ ] **Step 5: Run + verify pass + eyeball the snapshot**

Run: `npm test -- parity.golden`
Expected: PASS. Open the generated `.snap` and confirm it contains real markup for all eight parts (synopsis stub, KPI cards, chart, tables, domains grid, footer) — not empty wrappers.

- [ ] **Step 6: Manual parity check**

Load an AEO report locally (dashboard + portal) with a seeded client and confirm it is visually identical to before the refactor.

- [ ] **Step 7: Commit**

```bash
git add components/report-sections/peec-ai/index.tsx components/report-sections/peec-ai/parity.golden.test.tsx components/report-sections/peec-ai/parts/__fixtures__/ lib/report-sections/registries.ts
git commit -m "feat(peec): render AEO via resolveSection; parity golden pins domains-row grid"
```

---

## Task 14: Bespoke registry scaffold + real existence guard

**Files:**
- Create: `components/report-sections/peec-ai/parts/bespoke/registry.ts`, `components/report-sections/peec-ai/parts/bespoke/README.md`
- Create: `components/report-sections/peec-ai/guard.test.ts`
- Create: `eslint` boundary note (see Step 3)

**Interfaces:**
- Produces: `BESPOKE_PARTS: PartRegistry<PeecCtx>` (empty to start), and a CI guard test importing the REAL merged registry + template.

- [ ] **Step 1: Create the empty bespoke registry + convention doc**

```ts
// components/report-sections/peec-ai/parts/bespoke/registry.ts
import type { PartRegistry } from '@/lib/report-sections/types'
import type { PeecCtx } from '../../ctx'

// Bespoke, client-specific parts live in THIS folder only and are merged at render time.
// The core section (parts/registry.ts) must never import from here.
export const BESPOKE_PARTS: PartRegistry<PeecCtx> = {}
```
`bespoke/README.md`: document the rule — a bespoke part is versioned, `published` when promoted/frozen, referenced only via a client's `extraParts`, receives only the shared `PeecCtx`, and the core registry never imports this folder.

- [ ] **Step 2: Write the real guard test**

`components/report-sections/peec-ai/guard.test.ts`:
```ts
import { expect, test } from 'vitest'
import { assertReferencedPinsPublished, collectReferencedPins, mergeRegistries } from '@/lib/report-sections/registry'
import { PEEC_PARTS } from './parts/registry'
import { BESPOKE_PARTS } from './parts/bespoke/registry'
import { PEEC_TEMPLATE } from './template'

test('every AEO template pin exists and is published (core + bespoke)', () => {
  const reg = mergeRegistries(PEEC_PARTS, BESPOKE_PARTS)
  const violations = assertReferencedPinsPublished(reg, collectReferencedPins(PEEC_TEMPLATE, []))
  expect(violations).toEqual([])
})
```
(When frozen client snapshots exist in a real DB, a separate script can extend this by loading them; v1's CI guard covers the template.)

- [ ] **Step 3: Add an ESLint boundary rule**

In the ESLint config, add a `no-restricted-imports` (or `import/no-restricted-paths`) rule forbidding `components/report-sections/*/parts/registry.ts` and `parts/*.tsx` (non-bespoke) from importing `**/parts/bespoke/**`. If a zoned rule is impractical, add a comment convention in `parts/registry.ts` and rely on review. Document whichever you choose in the bespoke README.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS (guard green, parity green, all unit tests green).

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/peec-ai/parts/bespoke/ components/report-sections/peec-ai/guard.test.ts eslint.config.*
git commit -m "feat(peec): bespoke registry scaffold, import boundary, real existence guard"
```

---

## Task 15: AEO — per-version golden tests for each v1 part

**Files:**
- Create: `components/report-sections/peec-ai/parts/{part}.golden.test.tsx` (one per part)

**Interfaces:**
- Consumes: `PEEC_PARTS`, `FIXTURE_PEEC_CTX`.

- [ ] **Step 1: Write one golden test per published part**

For each of the eight parts, add a test that renders `PEEC_PARTS[id][1].render(FIXTURE_PEEC_CTX, resolved)` and snapshots it. Example:
```tsx
// components/report-sections/peec-ai/parts/visibility-chart.golden.test.tsx
import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { PEEC_PARTS } from './registry'
import { FIXTURE_PEEC_CTX } from './__fixtures__/peec-ctx'

test('visibility-chart@1 golden', () => {
  const impl = PEEC_PARTS['visibility-chart'][1]
  const resolved = { id: 'visibility-chart', version: 1, label: impl.defaultLabel }
  const { container } = render(<>{impl.render(FIXTURE_PEEC_CTX, resolved)}</>)
  expect(container.textContent).not.toBe('') // guards against an empty/wrapper-only render
  expect(container.firstChild).toMatchSnapshot()
})
```
For `overview-synopsis` (has an async Suspense child): render with the async child mocked via `vi.mock('../overview-synopsis', ...)` to return fixed markup, so the golden captures the part's own structure deterministically.

- [ ] **Step 2: Run to create snapshots + confirm real output**

Run: `npm test -- golden`
Expected: PASS; eight new `.snap` files under `parts/__snapshots__/`. Open two or three and confirm they contain real chart/table markup.

- [ ] **Step 3: Prove the freeze guard bites (manual, then revert)**

Temporarily edit a shared leaf the part renders (e.g. change a class in `../visibility-chart.tsx`) and run `npm test -- visibility-chart.golden`.
Expected: FAIL (snapshot mismatch) — this is the "editing a published version's output fails CI" guarantee working. **Revert the edit** and re-run: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/report-sections/peec-ai/parts/*.golden.test.tsx components/report-sections/peec-ai/parts/__snapshots__/
git commit -m "test(peec): per-version golden snapshots enforce published-part immutability"
```

---

## Task 16: End-to-end pipeline smoke (manual, against dev DB)

**Files:** none (operational verification).

- [ ] **Step 1: Guinea-pig a version pin**

In a scratch part file, add `visibility-chart@2` (`published: false`) that renders a visibly different chart; register it under `PEEC_PARTS['visibility-chart'][2]`. From a script or Studio, call `pinVersion('<guinea-pig-slug>', 'peec-ai', 'visibility-chart', 2)`. Load that client's AEO report → shows `@2`; load a different client → still `@1`.

- [ ] **Step 2: Freeze another client**

Call `freezeSection('<other-slug>', 'peec-ai')`. Confirm its `reportSectionConfig['peec-ai'].frozen` captured `visibility-chart@1`.

- [ ] **Step 3: Publish + promote**

Flip `@2` to `published: true`, add its golden test + snapshot (Task 15 pattern). Call `promoteToTemplate('peec-ai', '<guinea-pig-slug>', ['visibility-chart'])`. Confirm: the template row now pins `@2` (Studio); a non-frozen client renders `@2`; the frozen client from Step 2 still renders `@1`. Check the server log line `[promote] peec-ai/visibility-chart: v1 -> v2`.

- [ ] **Step 4: Unfreeze**

Call `unfreezeSection('<other-slug>', 'peec-ai')` → that client now renders `@2` (inherits template).

- [ ] **Step 5: Clean up the scratch `@2`** if it was only for the smoke, or keep it if it's a real improvement (then its golden must stay). Remove the guinea-pig pin if scratch. Commit only real artifacts.

---

## Self-Review

**Spec coverage:**
- Versioned immutable parts → Tasks 3, 12; `published` flag → Task 3 type, enforced Tasks 7/15.
- DB-backed template + idempotent seed → Task 5; query → Task 5.
- `reportSectionConfig` column, backward-compat → Task 5.
- Resolver (base + frozen + combinatorial ordering) → Tasks 3, 4.
- Registry + existence guard (core + bespoke) → Tasks 6, 14.
- Validation (unknown id/version, extraParts-vs-base, unpublished) → Task 7.
- Actions pinVersion/freeze/unfreeze/promote(version-only, logged, backward-allowed)/save → Tasks 8, 9, 10.
- AEO refactor: ctx extraction, parts split, domains-row single part, resolve-render, parity → Tasks 11, 12, 13.
- Golden per published version + fixture-branch coverage → Task 15; RSC spike → Task 2; Vitest tooling + CI → Task 1.
- Bespoke separate registry + import boundary + ctx ceiling → Task 14.
- Pipeline guarantees (freeze holds, promote propagates, unfreeze) → Task 16 (manual e2e).

**Placeholder scan:** no "TBD/TODO"; every code step has concrete code. The AEO JSX-move steps (Tasks 11–12) intentionally reference the real source ranges rather than reproducing ~160 lines verbatim — the parity golden (Task 13) is the correctness gate for those mechanical moves. Noted, not a placeholder.

**Type consistency:** `resolveSection(template, override)` signature consistent across Tasks 3/4/8/9/13; `PartImpl.render(ctx, resolved)` consistent Tasks 3/12/15; `ReportSectionConfig`/`SectionOverride`/`SectionTemplate`/`SectionSnapshot`/`PartPin`/`ResolvedPart` used consistently; `REGISTRIES` produced in Task 13 and consumed by Task 10's action (import wired in Task 13 Step 3).

**Known follow-ups (not blockers):** verify exact signatures of `canEditDashboard` (Task 8) and the `session.user` shape (Task 9) against the codebase during implementation; adapt if different.
