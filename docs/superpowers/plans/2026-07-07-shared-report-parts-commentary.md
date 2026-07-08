# Shared Report Parts — Commentary as a Per-Client Part — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make commentary a per-client-controllable **shared part** rendered at the top of the 7 in-scope report views via the existing `reportSectionConfig` system, replacing the page-level rendering — and establish shared parts as a reusable mechanism.

**Architecture:** Add a distinct `SectionOverride.sharedParts` field (keyed by `viewKey`). A `SharedPartsHeader` async RSC at the top of each in-scope section resolves that client's shared-part pins against a `SHARED_PARTS` registry and renders them; the `commentary` part's `render` returns the existing `CommentarySection`. The commentary data layer is reused unchanged; only its invocation point moves. Page-level route wiring is reverted.

**Tech Stack:** Next.js 16 (App Router, RSC) · React 19 · TypeScript (strict) · Drizzle ORM · Vitest 3 · the existing `lib/report-sections/` parts framework.

## Global Constraints

- **Shared parts opt-in is keyed by `viewKey`** (not section slug). The 7 view keys: `peec-ai`, `peec-ai:pr-influence`, `peec-ai:content-impact`, `paid-search`, `meta-ads`, `linkedin-ads`, `organic-social`.
- **Distinct field:** shared parts live in `SectionOverride.sharedParts` (`PartPin[]`), never in `extraParts` (which stays body-only). The two id-spaces are validated independently.
- **`reportSectionConfig` keyspace:** a key may be a section slug (body), a viewKey (shared), or both; a viewKey-only key legitimately has no `REGISTRIES` entry — validation must NOT reject it.
- **Opt-in only:** a client with no `sharedParts` under a viewKey renders nothing there. Default off everywhere.
- **Header placement:** in each section's **RSC parent**, at the top, above any `'use client'` children.
- **No new migration; no new `section_templates` rows.** `sharedParts` is an additive field on the existing `reportSectionConfig` jsonb.
- **Reuse `CommentarySection` unchanged** — signature `{ clientSlug: string; viewKey: CommentaryViewKey }`.
- **`ResolvedPart` is `{ id; version; label; threshold? }`** — shared parts build `{ id, version, label }` (threshold legitimately absent).
- Run tests with `npm test` (`vitest run`). Type-check `npx tsc --noEmit`. Lint `npm run lint`. Design tokens as elsewhere.

---

## File structure

**Created**
- `components/report-sections/shared/parts/resolve.ts` — `resolveSharedParts(sharedParts, reg)` (pure; no component imports)
- `components/report-sections/shared/parts/resolve.test.ts`
- `components/report-sections/shared/parts/registry.tsx` — `SharedCtx`, `commentaryPart`, `SHARED_PARTS`
- `components/report-sections/shared/shared-parts-header.tsx` — `SharedPartsHeader` (async RSC)
- `scripts/enable-commentary-renaissance.ts` — idempotent renaissance opt-in

**Modified**
- `lib/report-sections/types.ts` — add `sharedParts?: PartPin[]` to `SectionOverride`; doc-comment `ReportSectionConfig`
- `lib/report-sections/validate.ts` — parse/validate `sharedParts`; tolerate viewKey-only keys
- `lib/report-sections/mutations.ts` — `validateSectionOverride` gains `sharedReg` param
- `app/actions/report-sections.ts` — pass `SHARED_PARTS` to `validateSectionOverride`
- The 7 section components (add `<SharedPartsHeader>`): `peec-ai/index.tsx`, `peec-ai/pr-influence.tsx`, `peec-ai/content-impact.tsx`, `paid-search/index.tsx`, `meta-ads/index.tsx`, `linkedin-ads/index.tsx`, `organic-social/index.tsx`
- The 4 route files (revert page-level commentary): `app/{dashboard,portal}/[clientSlug]/reports/page.tsx` and `.../reports/[reportSlug]/page.tsx`
- `package.json` — add `db:enable-commentary-renaissance` script

**Reused unchanged:** `report_commentary` table + migration 0017; all `lib/commentary/*`; `app/actions/commentary.ts`; `components/report-sections/commentary/*`.

---

## Dependency graph (for a parallelized fleet)

```
Wave 1 (parallel, no deps):
  T1  validation core (types + validate + mutations)
  T2  resolveSharedParts (pure)
  T3  SHARED_PARTS registry (+ commentary part)
  T5  revert page-level commentary from 4 routes
Wave 2:
  T4  SharedPartsHeader            (deps: T2, T3)
Wave 3:
  T6  wire header into 7 sections + action passes SHARED_PARTS   (deps: T1, T3, T4; run after T5)
Wave 4:
  T7  renaissance opt-in script    (deps: T1, T3)
Wave 5:
  T8  integration verification     (deps: all)
```

Note: T5 (revert) and T6 (add) both touch rendering; sequence T5 before T6 so the transient in-branch state is "no commentary" rather than double-rendered. tsc stays green after each.

---

### Task 1: `sharedParts` field + validation core

**Files:**
- Modify: `lib/report-sections/types.ts`
- Modify: `lib/report-sections/validate.ts`
- Modify: `lib/report-sections/mutations.ts`
- Test: `lib/report-sections/validate.test.ts` (create if absent; otherwise append)

**Interfaces:**
- Consumes: existing `PartPin`, `PartRegistry`, `SectionOverride`, `ReportSectionConfig`, `parsePin`, `parseOverride`, `parseReportSectionConfig`, `validateSectionOverride`.
- Produces:
  - `SectionOverride.sharedParts?: PartPin[]`
  - `parseReportSectionConfig(raw, registries, templateIds?, sharedReg?)` — new 4th param `sharedReg: PartRegistry<unknown> = {}`
  - `validateSectionOverride(section, raw, registries, templateIds, sharedReg?)` — new 5th param `sharedReg: PartRegistry<unknown> = {}`

- [ ] **Step 1: Write the failing test**

```ts
// lib/report-sections/validate.test.ts
import { describe, expect, test } from 'vitest'
import { parseReportSectionConfig } from './validate'
import type { PartRegistry } from './types'

// Fake registries (no component imports — pure validation test).
const impl = (id: string, version: number, published = true) => ({
  id, version, published, defaultLabel: id, render: () => null,
})
const BODY: Record<string, PartRegistry<unknown>> = {
  'meta-ads': {},                                   // meta-ads has no body parts (thin)
  'peec-ai': { x: { 2: impl('x', 2) } },            // peec-ai body has part x@2
}
const SHARED: PartRegistry<unknown> = { commentary: { 1: impl('commentary', 1) } }

describe('sharedParts validation', () => {
  test('accepts a sharedParts opt-in on a section-slug key', () => {
    const out = parseReportSectionConfig(
      { 'meta-ads': { sharedParts: [{ id: 'commentary', version: 1 }] } }, BODY, {}, SHARED)
    expect(out['meta-ads'].sharedParts).toEqual([{ id: 'commentary', version: 1 }])
  })
  test('accepts a viewKey-only key with no body registry (shared-parts only)', () => {
    const out = parseReportSectionConfig(
      { 'peec-ai:pr-influence': { sharedParts: [{ id: 'commentary', version: 1 }] } }, BODY, {}, SHARED)
    expect(out['peec-ai:pr-influence'].sharedParts).toEqual([{ id: 'commentary', version: 1 }])
  })
  test('rejects a sharedParts id not in the shared registry', () => {
    expect(() => parseReportSectionConfig(
      { 'meta-ads': { sharedParts: [{ id: 'nope', version: 1 }] } }, BODY, {}, SHARED))
      .toThrow(/unknown part nope@1/)
  })
  test('rejects body content on a key with no body registry', () => {
    expect(() => parseReportSectionConfig(
      { 'peec-ai:pr-influence': { versions: { x: 2 } } }, BODY, {}, SHARED))
      .toThrow(/unknown part x@2/)
  })
  test('preserves sharedParts alongside a body edit (does not drop the opt-in)', () => {
    const out = parseReportSectionConfig(
      { 'peec-ai': { versions: { x: 2 }, sharedParts: [{ id: 'commentary', version: 1 }] } }, BODY, {}, SHARED)
    expect(out['peec-ai'].versions).toEqual({ x: 2 })
    expect(out['peec-ai'].sharedParts).toEqual([{ id: 'commentary', version: 1 }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/report-sections/validate.test.ts`
Expected: FAIL — `sharedParts` is dropped (undefined) / `unknown section` thrown for the viewKey-only key.

- [ ] **Step 3: Add the type field + doc comment**

In `lib/report-sections/types.ts`, add `sharedParts` to `SectionOverride` and a doc comment on `ReportSectionConfig`:

```ts
export type SectionOverride = {
  frozen?: SectionSnapshot
  versions?: Record<string, number>
  order?: string[]
  hidden?: string[]
  extraParts?: PartPin[]
  sharedParts?: PartPin[]   // cross-section shared parts (commentary, …); validated against SHARED_PARTS
  labels?: Record<string, string>
  thresholds?: Record<string, number>
}

/** Per-client report config. A key is EITHER a section slug (body composition,
 *  looked up in REGISTRIES) OR a viewKey (shared-parts opt-in, e.g.
 *  'peec-ai:pr-influence') OR both (single-view sections where viewKey == slug).
 *  A viewKey-only key has no REGISTRIES entry — that is expected, not an orphan. */
export type ReportSectionConfig = Record<string, SectionOverride>
```

- [ ] **Step 4: Parse/validate `sharedParts` + tolerate viewKey-only keys**

In `lib/report-sections/validate.ts`, change `parseOverride` to take a `sharedReg` param and parse `sharedParts`; change `parseReportSectionConfig` to thread `sharedReg` and use an empty body registry when a key has none:

```ts
function parseOverride(
  raw: unknown, reg: PartRegistry<unknown>, sharedReg: PartRegistry<unknown>, templateIds: string[],
): SectionOverride {
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
      const pin = parsePin(p, reg, false)
      if (templateIds.includes(pin.id)) throw new Error(`extraParts id "${pin.id}" already in template — use versions to re-version`)
      return pin
    })
  }
  if (raw.sharedParts !== undefined) {
    if (!Array.isArray(raw.sharedParts)) throw new Error('invalid sharedParts')
    out.sharedParts = raw.sharedParts.map((p) => parsePin(p, sharedReg, true)) // shared parts must be published
  }
  return out
}

export function parseReportSectionConfig(
  raw: unknown,
  registries: Record<string, PartRegistry<unknown>>,
  templateIds: Record<string, string[]> = {},
  sharedReg: PartRegistry<unknown> = {},
): ReportSectionConfig {
  if (!isObj(raw)) throw new Error('invalid reportSectionConfig')
  const out: ReportSectionConfig = {}
  for (const [key, override] of Object.entries(raw)) {
    // A viewKey-only key (shared-parts opt-in) has no body registry: use an empty
    // one so any body field errors, while sharedParts still validates against sharedReg.
    const reg = registries[key] ?? {}
    out[key] = parseOverride(override, reg, sharedReg, templateIds[key] ?? [])
  }
  return out
}
```

- [ ] **Step 5: Thread `sharedReg` through `validateSectionOverride`**

In `lib/report-sections/mutations.ts`:

```ts
export function validateSectionOverride(
  section: string,
  raw: unknown,
  registries: Record<string, PartRegistry<unknown>>,
  templateIds: string[],
  sharedReg: PartRegistry<unknown> = {},
): ReportSectionConfig {
  return parseReportSectionConfig({ [section]: raw }, registries, { [section]: templateIds }, sharedReg)
}
```

- [ ] **Step 6: Run tests + type-check**

Run: `npm test -- lib/report-sections/validate.test.ts && npx tsc --noEmit`
Expected: PASS (5/5); tsc clean. The `app/actions/report-sections.ts` call site still compiles (the new `sharedReg` param defaults to `{}`).

- [ ] **Step 7: Commit**

```bash
git add lib/report-sections/types.ts lib/report-sections/validate.ts lib/report-sections/mutations.ts lib/report-sections/validate.test.ts
git commit -m "feat(shared-parts): SectionOverride.sharedParts field + validation"
```

---

### Task 2: `resolveSharedParts` (pure)

**Files:**
- Create: `components/report-sections/shared/parts/resolve.ts`
- Test: `components/report-sections/shared/parts/resolve.test.ts`

**Interfaces:**
- Consumes: `lookup` (`@/lib/report-sections/registry`), `PartPin`/`PartRegistry`/`ResolvedPart` types.
- Produces: `resolveSharedParts(sharedParts: PartPin[] | undefined, reg: PartRegistry<unknown>): ResolvedPart[]`
  (kept out of the registry file so tests don't transitively import server-only `CommentarySection`.)

- [ ] **Step 1: Write the failing test**

```ts
// components/report-sections/shared/parts/resolve.test.ts
import { describe, expect, test } from 'vitest'
import { resolveSharedParts } from './resolve'
import type { PartRegistry } from '@/lib/report-sections/types'

const REG: PartRegistry<unknown> = {
  commentary: { 1: { id: 'commentary', version: 1, published: true, defaultLabel: 'Commentary', render: () => null } },
}

describe('resolveSharedParts', () => {
  test('resolves an opted-in shared part with its label', () => {
    expect(resolveSharedParts([{ id: 'commentary', version: 1 }], REG))
      .toEqual([{ id: 'commentary', version: 1, label: 'Commentary' }])
  })
  test('undefined / empty → []', () => {
    expect(resolveSharedParts(undefined, REG)).toEqual([])
    expect(resolveSharedParts([], REG)).toEqual([])
  })
  test('drops a pin whose id/version is not in the registry', () => {
    expect(resolveSharedParts([{ id: 'commentary', version: 9 }, { id: 'nope', version: 1 }], REG)).toEqual([])
  })
  test('preserves array order as render order', () => {
    const reg: PartRegistry<unknown> = {
      a: { 1: { id: 'a', version: 1, published: true, defaultLabel: 'A', render: () => null } },
      commentary: REG.commentary,
    }
    expect(resolveSharedParts([{ id: 'commentary', version: 1 }, { id: 'a', version: 1 }], reg).map((r) => r.id))
      .toEqual(['commentary', 'a'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- components/report-sections/shared/parts/resolve.test.ts`
Expected: FAIL — cannot find module `./resolve`.

- [ ] **Step 3: Implement**

```ts
// components/report-sections/shared/parts/resolve.ts
import { lookup } from '@/lib/report-sections/registry'
import type { PartPin, PartRegistry, ResolvedPart } from '@/lib/report-sections/types'

/** Which shared parts render for a client's view. Pure — no I/O, no component imports.
 *  Array order is render order; a pin not in `reg` is dropped. */
export function resolveSharedParts(
  sharedParts: PartPin[] | undefined,
  reg: PartRegistry<unknown>,
): ResolvedPart[] {
  return (sharedParts ?? [])
    .map((pin) => {
      const impl = lookup(reg, pin.id, pin.version)
      return impl ? { id: pin.id, version: pin.version, label: impl.defaultLabel } : null
    })
    .filter((r): r is ResolvedPart => r !== null)
}
```

- [ ] **Step 4: Run test + type-check**

Run: `npm test -- components/report-sections/shared/parts/resolve.test.ts && npx tsc --noEmit`
Expected: PASS (4/4); tsc clean.

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/shared/parts/resolve.ts components/report-sections/shared/parts/resolve.test.ts
git commit -m "feat(shared-parts): pure resolveSharedParts"
```

---

### Task 3: `SHARED_PARTS` registry + commentary part

**Files:**
- Create: `components/report-sections/shared/parts/registry.tsx`

**Interfaces:**
- Consumes: `CommentarySection` (`@/components/report-sections/commentary`), `CommentaryViewKey` (`@/lib/commentary/views`), `PartImpl`/`PartRegistry` types.
- Produces:
  - `type SharedCtx = { slug: string; viewKey: CommentaryViewKey }`
  - `commentaryPart: PartImpl<SharedCtx>`
  - `SHARED_PARTS: PartRegistry<SharedCtx>`

- [ ] **Step 1: Implement**

No unit test: this file imports the server-only `CommentarySection`; verification is `npx tsc --noEmit`. (`resolveSharedParts` is tested separately in Task 2 with a fake registry.)

```tsx
// components/report-sections/shared/parts/registry.tsx
import { CommentarySection } from '@/components/report-sections/commentary'
import type { CommentaryViewKey } from '@/lib/commentary/views'
import type { PartImpl, PartRegistry } from '@/lib/report-sections/types'

/** Minimal context every shared part receives. */
export type SharedCtx = { slug: string; viewKey: CommentaryViewKey }

/** Commentary as a shared part — render returns the existing async CommentarySection RSC. */
export const commentaryPart: PartImpl<SharedCtx> = {
  id: 'commentary',
  version: 1,
  published: true,
  defaultLabel: 'Commentary',
  render: (ctx) => <CommentarySection clientSlug={ctx.slug} viewKey={ctx.viewKey} />,
}

export const SHARED_PARTS: PartRegistry<SharedCtx> = {
  commentary: { 1: commentaryPart },
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/report-sections/shared/parts/registry.tsx
git commit -m "feat(shared-parts): SHARED_PARTS registry + commentary part"
```

---

### Task 4: `SharedPartsHeader` runner

**Files:**
- Create: `components/report-sections/shared/shared-parts-header.tsx`

**Interfaces:**
- Consumes: `getClientBySlug` (`@/lib/db/queries`), `resolveSharedParts` (Task 2), `SHARED_PARTS`/`SharedCtx` (Task 3), `lookup` (`@/lib/report-sections/registry`), `ReportErrorBoundary` (`@/components/report-sections/error-boundary`), `CommentaryViewKey`.
- Produces: `SharedPartsHeader({ viewKey: CommentaryViewKey; clientSlug: string })` (async RSC).

- [ ] **Step 1: Implement**

No unit test (async RSC + component imports); verification is `npx tsc --noEmit` and the Task 8 smoke.

```tsx
// components/report-sections/shared/shared-parts-header.tsx
import { Suspense } from 'react'
import { getClientBySlug } from '@/lib/db/queries'
import { lookup } from '@/lib/report-sections/registry'
import { ReportErrorBoundary } from '@/components/report-sections/error-boundary'
import type { CommentaryViewKey } from '@/lib/commentary/views'
import { resolveSharedParts } from './parts/resolve'
import { SHARED_PARTS, type SharedCtx } from './parts/registry'

/** Renders a client's opted-in shared parts (e.g. commentary) at the top of a report
 *  view. Opt-in lives in reportSectionConfig[viewKey].sharedParts. Renders nothing when
 *  the client hasn't opted in. Place in the section's RSC parent, above client children. */
export async function SharedPartsHeader({
  viewKey, clientSlug,
}: { viewKey: CommentaryViewKey; clientSlug: string }) {
  const client = await getClientBySlug(clientSlug) // React.cache-memoized: N headers → 1 fetch/render
  const resolved = resolveSharedParts(client?.reportSectionConfig?.[viewKey]?.sharedParts, SHARED_PARTS)
  if (resolved.length === 0) return null
  const ctx: SharedCtx = { slug: clientSlug, viewKey }
  return (
    <>
      {resolved.map((r) => {
        const impl = lookup(SHARED_PARTS, r.id, r.version)
        if (!impl) return null // defensive; resolveSharedParts already guarantees presence
        return (
          <ReportErrorBoundary key={`${r.id}@${r.version}`} sectionName={`Commentary (${r.id})`}>
            <Suspense fallback={null}>{impl.render(ctx, r)}</Suspense>
          </ReportErrorBoundary>
        )
      })}
    </>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add components/report-sections/shared/shared-parts-header.tsx
git commit -m "feat(shared-parts): SharedPartsHeader runner"
```

---

### Task 5: Revert page-level commentary from the 4 route files

**Files:**
- Modify: `app/dashboard/[clientSlug]/reports/page.tsx`
- Modify: `app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx`
- Modify: `app/portal/[clientSlug]/reports/page.tsx`
- Modify: `app/portal/[clientSlug]/reports/[reportSlug]/page.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: the 4 routes no longer render commentary (it will render via the part).

- [ ] **Step 1: Remove the page-level commentary block from each of the 4 files**

In **each** file, delete the three additions made when commentary was page-level:
1. the two imports:
   ```ts
   import { resolveCommentaryView } from '@/lib/commentary/views'
   import { CommentarySection } from '@/components/report-sections/commentary'
   ```
2. the `const commentaryView = resolveCommentaryView(...)` line;
3. the JSX block:
   ```tsx
   {commentaryView && (
     <ReportErrorBoundary sectionName="Commentary">
       <Suspense fallback={null}>
         <CommentarySection clientSlug={clientSlug} viewKey={commentaryView} />
       </Suspense>
     </ReportErrorBoundary>
   )}
   ```
Leave the pre-existing `Suspense`/`ReportErrorBoundary` imports (used elsewhere in each file).

- [ ] **Step 2: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint 2>&1 | grep -E "commentary|reports/" || echo "clean for these files"`
Expected: no errors referencing the 4 route files. (Note: `resolveCommentaryView` is now unused by app code but still exported and unit-tested — leave it; it documents the canonical view-key mapping and is used by the data layer's types.)

- [ ] **Step 3: Commit**

```bash
git add "app/dashboard/[clientSlug]/reports/page.tsx" "app/dashboard/[clientSlug]/reports/[reportSlug]/page.tsx" "app/portal/[clientSlug]/reports/page.tsx" "app/portal/[clientSlug]/reports/[reportSlug]/page.tsx"
git commit -m "refactor(commentary): remove page-level rendering (moving to shared part)"
```

---

### Task 6: Wire `SharedPartsHeader` into the 7 sections + action passes `SHARED_PARTS`

**Files:**
- Modify (7): `components/report-sections/peec-ai/index.tsx`, `peec-ai/pr-influence.tsx`, `peec-ai/content-impact.tsx`, `paid-search/index.tsx`, `meta-ads/index.tsx`, `linkedin-ads/index.tsx`, `organic-social/index.tsx`
- Modify: `app/actions/report-sections.ts`

**Interfaces:**
- Consumes: `SharedPartsHeader` (Task 4), `SHARED_PARTS` (Task 3), `validateSectionOverride` (Task 1).
- Produces: commentary rendered as a shared part at the top of each in-scope view; the write-path validates commentary opt-ins.

- [ ] **Step 1: Add the header to each of the 7 section components**

In each file, add the import and render `<SharedPartsHeader>` as the **first** element of the component's returned JSX (in the RSC parent, above any `'use client'` children). The `viewKey` per component:

| File | `viewKey` |
|---|---|
| `peec-ai/index.tsx` (`PeecAIReport`) | `'peec-ai'` |
| `peec-ai/pr-influence.tsx` (`PRInfluenceReport`) | `'peec-ai:pr-influence'` |
| `peec-ai/content-impact.tsx` (`ContentImpactReport`) | `'peec-ai:content-impact'` |
| `paid-search/index.tsx` (`PaidSearchReport`) | `'paid-search'` |
| `meta-ads/index.tsx` (`MetaAdsReport`) | `'meta-ads'` |
| `linkedin-ads/index.tsx` (`LinkedInAdsReport`) | `'linkedin-ads'` |
| `organic-social/index.tsx` (`OrganicSocialReport`) | `'organic-social'` |

Import:
```ts
import { SharedPartsHeader } from '@/components/report-sections/shared/shared-parts-header'
```
Then wrap the existing return so the header is first, e.g.:
```tsx
return (
  <>
    <SharedPartsHeader viewKey="meta-ads" clientSlug={clientSlug} />
    {/* …existing returned JSX… */}
  </>
)
```
(If a component already returns a single root element, wrap it and the header in a `<>…</>` fragment. `clientSlug` is a prop of all 7 components — confirm it's in scope; it is.)

- [ ] **Step 2: Wire the action to pass `SHARED_PARTS`**

In `app/actions/report-sections.ts`, import `SHARED_PARTS` and pass it as the 5th arg to `validateSectionOverride` (so a section override carrying a `sharedParts:[commentary]` opt-in validates instead of throwing "unknown part").

Add the import:
```ts
import { SHARED_PARTS } from '@/components/report-sections/shared/parts/registry'
import type { PartRegistry } from '@/lib/report-sections/types'
```
Change the existing call site (currently `validateSectionOverride(section, raw, REGISTRIES, templateIds)[section]`) to:
```ts
parsedSection = validateSectionOverride(section, raw, REGISTRIES, templateIds, SHARED_PARTS as unknown as PartRegistry<unknown>)[section]
```
The `as unknown as PartRegistry<unknown>` cast mirrors the existing `REGISTRIES … as unknown as PartRegistry<unknown>` cast in `registries.ts` (the param is `PartRegistry<unknown>`; `SHARED_PARTS` is `PartRegistry<SharedCtx>`). If tsc accepts it without the cast, drop the cast and the `PartRegistry` import.

- [ ] **Step 3: Type-check + lint + full tests**

Run: `npx tsc --noEmit && npm run lint 2>&1 | grep -E "shared|report-sections/(peec-ai|paid-search|meta-ads|linkedin-ads|organic-social)|actions/report-sections" || echo "clean for touched files" && npm test`
Expected: tsc clean; no lint errors in touched files; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add components/report-sections/peec-ai/index.tsx components/report-sections/peec-ai/pr-influence.tsx components/report-sections/peec-ai/content-impact.tsx components/report-sections/paid-search/index.tsx components/report-sections/meta-ads/index.tsx components/report-sections/linkedin-ads/index.tsx components/report-sections/organic-social/index.tsx app/actions/report-sections.ts
git commit -m "feat(shared-parts): render commentary part atop the 7 in-scope views"
```

---

### Task 7: Renaissance opt-in script (tracked, idempotent)

**Files:**
- Create: `scripts/enable-commentary-renaissance.ts`
- Modify: `package.json` (add `db:enable-commentary-renaissance`)

**Interfaces:**
- Consumes: `db` (`@/lib/db/client`), `clients` (`@/lib/db/schema`), `eq` (`drizzle-orm`).
- Produces: a re-runnable script that sets `sharedParts:[{commentary,1}]` under all 7 view keys on the renaissance client row.

- [ ] **Step 1: Implement the script**

```ts
// scripts/enable-commentary-renaissance.ts
//
// Enables commentary (a shared part) on all 7 in-scope views for the `renaissance`
// client, by merging sharedParts opt-ins into clients.report_section_config.
// Idempotent read-modify-write; safe to re-run. Equivalent raw SQL:
//
//   UPDATE clients SET report_section_config = (
//     COALESCE(report_section_config, '{}'::jsonb)
//     || '{"peec-ai":{"sharedParts":[{"id":"commentary","version":1}]},
//          "peec-ai:pr-influence":{"sharedParts":[{"id":"commentary","version":1}]},
//          ... all 7 ...}'::jsonb )
//   WHERE slug = 'renaissance';
//
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { clients } from '@/lib/db/schema'
import type { ReportSectionConfig } from '@/lib/report-sections/types'

const SLUG = 'renaissance'
const VIEW_KEYS = [
  'peec-ai', 'peec-ai:pr-influence', 'peec-ai:content-impact',
  'paid-search', 'meta-ads', 'linkedin-ads', 'organic-social',
] as const
const PIN = { id: 'commentary', version: 1 }

async function main() {
  const row = await db.query.clients.findFirst({ where: eq(clients.slug, SLUG) })
  if (!row) throw new Error(`client "${SLUG}" not found`)

  const cfg: ReportSectionConfig = { ...(row.reportSectionConfig ?? {}) }
  const touched: string[] = []
  for (const vk of VIEW_KEYS) {
    const existing = cfg[vk] ?? {}
    const already = (existing.sharedParts ?? []).some((p) => p.id === PIN.id && p.version === PIN.version)
    if (!already) {
      cfg[vk] = { ...existing, sharedParts: [...(existing.sharedParts ?? []), PIN] }
      touched.push(vk)
    }
  }

  if (touched.length === 0) {
    console.log(`No change — commentary already enabled on all ${VIEW_KEYS.length} views for ${SLUG}.`)
  } else {
    await db.update(clients).set({ reportSectionConfig: cfg, updatedAt: new Date() }).where(eq(clients.slug, SLUG))
    console.log(`Enabled commentary on: ${touched.join(', ')}`)
  }
  console.log(`Final commentary-enabled views: ${VIEW_KEYS.filter((vk) => (cfg[vk]?.sharedParts ?? []).some((p) => p.id === PIN.id)).join(', ')}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Add the package.json script**

In `package.json` `scripts`, after `db:seed-section-templates`:
```json
"db:enable-commentary-renaissance": "tsx --env-file=.env.local scripts/enable-commentary-renaissance.ts",
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean. (Running the script needs DB access — deferred to Task 8 / deployment.)

- [ ] **Step 4: Commit**

```bash
git add scripts/enable-commentary-renaissance.ts package.json
git commit -m "feat(shared-parts): tracked idempotent renaissance commentary opt-in script"
```

---

### Task 8: Integration verification

**Files:** none (verification only).

- [ ] **Step 1: Full suite + type-check + lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all tests pass (existing commentary + report-sections suites + the 2 new pure suites); tsc clean; no NEW lint errors in touched files (the repo has pre-existing lint debt in unrelated files/worktrees — compare against baseline).

- [ ] **Step 2: Apply the renaissance opt-in (DB-reachable env only)**

Run: `npm run db:enable-commentary-renaissance`
Expected: logs the 7 enabled view keys. (Env-blocked locally per the known dev-DB limitation; run where the DB is reachable, or as a deploy step.)

- [ ] **Step 3: Manual smoke (DB-reachable env)**

As an `@avenuez.com` user on the **renaissance** client: commentary renders at the **top** of all 7 in-scope views via the part; add/approve still work; a client viewer sees approved-only. On a **different** client (no opt-in): no commentary on any view. Confirm commentary renders **once** (part-level only; page-level gone). Confirm a non-in-scope view (e.g. GA4) shows no commentary.

- [ ] **Step 4: Final commit (if any doc tweak)**

```bash
git add -A && git commit -m "chore(shared-parts): integration verification notes" || true
```

---

## Self-review notes (author)

- **Spec coverage:** shared parts concept (T3) · `SharedPartsHeader` keyed by viewKey (T4) · distinct `sharedParts` field + validation + viewKey-only tolerance + preserve-on-body-edit (T1) · pure `resolveSharedParts` (T2) · wire 7 sections in RSC parent (T6) · revert page-level (T5) · action passes SHARED_PARTS (T6) · per-sub-tab granularity via 7 viewKey entries (T7) · tracked idempotent opt-in with logging (T7) · async-child + coverage already verified in the spec. Reused commentary layer untouched.
- **Type consistency:** `resolveSharedParts(sharedParts, reg)` signature matches between T2 (def), T4 (call). `validateSectionOverride(…, sharedReg?)` matches between T1 (def) and T6 (call). `SharedPartsHeader({viewKey, clientSlug})` matches T4/T6. `SHARED_PARTS: PartRegistry<SharedCtx>`, `commentaryPart.id='commentary'`/`version:1` consistent across T3/T4/T7.
- **Known env caveat:** DB-dependent steps (opt-in script, live smoke) deferred to a DB-reachable env, as with migration 0017.
