# Organic Social — Independent Suspense Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream each Organic Social section behind its own Suspense boundary + layout-matching skeleton so the slow Glean synopsis no longer blocks the display sections.

**Architecture:** `OrganicSocialReport` becomes a non-async layout rendering four independent `<Suspense>` boundaries. Each boundary wraps an async server component that fetches its own data (timeout/error isolated per section). The three Dash fetchers are wrapped in `React.cache()` so the synopsis and the display sections share one request each per render.

**Tech Stack:** Next.js 15 (App Router, RSC streaming, `react` `cache()` + `Suspense`), TypeScript, Tailwind.

## Global Constraints

- **No behavior change to the data itself** — only loading/streaming structure changes. Each section renders the same content it does today once loaded.
- **Cache-dedup depends on identical arguments:** the synopsis and `HeadlinesSection` must both call `getPlatformHeadlines(clientSlug, dateRange, effectiveCompare)` where `effectiveCompare = compareRange ?? 'previous_period'`. The exact same expression must appear in both call sites or the `cache()` dedup misses.
- **Synopsis renders `null` if any input fetch fails** (mirrors today's `headlines.data && engagement.data && top.data` guard). Its Glean call keeps its own try/catch → "Synopsis is temporarily unavailable…".
- **Verification is the TypeScript compiler** (`npx tsc --noEmit` clean) + `npm run build`. There is no unit-test suite for these RSC components; the compiler + a build are the gate. Do not invent tests for streaming behavior.
- Match existing style (the `safe()`/`Fallback` helpers, Tailwind tokens like `bg-bg-surface`, `text-text-muted`, `border-white/[0.06]`).

---

## File responsibilities

| File | Responsibility | Task |
|---|---|---|
| `lib/organic-social/headlines.ts` | `getPlatformHeadlines` wrapped in `cache()` | 1 |
| `lib/organic-social/trends.ts` | `getEngagementTrend` wrapped in `cache()` | 1 |
| `lib/organic-social/top-content.ts` | `getTopContent` wrapped in `cache()` | 1 |
| `components/report-sections/organic-social/skeletons.tsx` | 4 layout-matching skeletons (NEW) | 2 |
| `components/report-sections/organic-social/synopsis.tsx` | self-fetch inputs; new props | 3 |
| `components/report-sections/organic-social/index.tsx` | Suspense layout + 3 section wrappers | 4 |

## Dependency graph (for parallel execution)

```
Wave 1 (parallel, disjoint files):
   Task 1  lib cache() wraps (3 files)        ┐
   Task 2  skeletons.tsx (new)                ┘
            │
Wave 2 (parallel, disjoint files; both consume Wave 1):
   Task 3  synopsis.tsx  (consumes Task 1)               ┐
   Task 4  index.tsx     (consumes Tasks 1, 2, 3)        ┘
```

**Why Tasks 3 and 4 can run in parallel despite Task 4 importing Task 3's component:** they edit disjoint files, and this plan pins the exact interfaces Task 4 needs (the `OrganicSocialSynopsis` prop shape from Task 3, the skeleton names from Task 2). Task 4 codes against those pinned signatures. The build is validated centrally after both land. **Critical interconnection:** the `effectiveCompare = compareRange ?? 'previous_period'` expression in Task 3's synopsis and Task 4's `HeadlinesSection` must be byte-identical for the `cache()` dedup to work — both are specified verbatim below.

**File ownership (no two parallel tasks share a file):** Task 1 → the 3 lib files; Task 2 → skeletons.tsx; Task 3 → synopsis.tsx; Task 4 → index.tsx.

---

### Task 1: Wrap the three Dash fetchers in `React.cache()`

**Files:**
- Modify: `lib/organic-social/headlines.ts`
- Modify: `lib/organic-social/trends.ts`
- Modify: `lib/organic-social/top-content.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: same three exports with unchanged signatures, now memoized per render:
  - `getPlatformHeadlines(slug: string, dateRange: string, compareRange: string | null): Promise<PlatformHeadline[]>`
  - `getEngagementTrend(slug: string, dateRange: string): Promise<TrendSeries>`
  - `getTopContent(slug: string, dateRange: string): Promise<PlatformTopContent[]>`

- [ ] **Step 1: Wrap `getPlatformHeadlines`**

In `lib/organic-social/headlines.ts`, add `import { cache } from 'react'` at the top of the import block. Change the declaration from:

```typescript
export async function getPlatformHeadlines(
  slug: string,
  dateRange: string,
  compareRange: string | null,
): Promise<PlatformHeadline[]> {
```

to:

```typescript
export const getPlatformHeadlines = cache(async (
  slug: string,
  dateRange: string,
  compareRange: string | null,
): Promise<PlatformHeadline[]> => {
```

Then change the function's closing brace `}` to `})`. The body is unchanged.

- [ ] **Step 2: Wrap `getEngagementTrend`**

In `lib/organic-social/trends.ts`, add `import { cache } from 'react'`. Change:

```typescript
export async function getEngagementTrend(slug: string, dateRange: string): Promise<TrendSeries> {
```

to:

```typescript
export const getEngagementTrend = cache(async (slug: string, dateRange: string): Promise<TrendSeries> => {
```

Change the function's closing `}` to `})`. Body unchanged.

- [ ] **Step 3: Wrap `getTopContent`**

In `lib/organic-social/top-content.ts`, add `import { cache } from 'react'`. Change:

```typescript
export async function getTopContent(slug: string, dateRange: string): Promise<PlatformTopContent[]> {
```

to:

```typescript
export const getTopContent = cache(async (slug: string, dateRange: string): Promise<PlatformTopContent[]> => {
```

Change the function's closing `}` to `})`. Body unchanged. (`transformTopContent` and `groupByPlatform` in the same file stay as plain exported functions — do not wrap them.)

- [ ] **Step 4: Typecheck (will be run centrally if parallel)**

Run: `npx tsc --noEmit`
Expected: clean. (If run during a parallel wave, the controller runs this centrally after all wave tasks land — see execution notes.)

- [ ] **Step 5: Commit**

```bash
git add lib/organic-social/headlines.ts lib/organic-social/trends.ts lib/organic-social/top-content.ts
git commit -m "perf(organic-social): memoize Dash fetchers with React cache()

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Layout-matching skeletons

**Files:**
- Create: `components/report-sections/organic-social/skeletons.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: four named exports — `SynopsisSkeleton`, `HeadlinesSkeleton`, `TrendSkeleton`, `TopContentSkeleton` — each a synchronous function component taking no props and returning JSX.

- [ ] **Step 1: Create the skeletons file**

Create `components/report-sections/organic-social/skeletons.tsx` with this exact content:

```tsx
import { Sparkles } from 'lucide-react'

const Pulse = ({ className }: { className: string }) => (
  <div className={`animate-pulse rounded bg-white/[0.06] ${className}`} />
)

/** Mirrors synopsis.tsx — green Sparkles header + pulsing text lines. */
export function SynopsisSkeleton() {
  return (
    <section className="rounded-xl border border-white/[0.08] bg-bg-surface p-6">
      <header className="mb-4 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#60FF80]/10">
          <Sparkles className="h-4 w-4 text-[#60FF80]" />
        </span>
        <h3 className="text-sm font-bold uppercase tracking-widest text-text-muted">Executive Synopsis</h3>
      </header>
      <div className="space-y-3">
        <Pulse className="h-4 w-full" />
        <Pulse className="h-4 w-[94%]" />
        <Pulse className="h-4 w-[88%]" />
        <Pulse className="h-4 w-2/3" />
      </div>
    </section>
  )
}

/** Mirrors platform-headlines.tsx — label + a 5-up KpiCard grid, shown twice. */
export function HeadlinesSkeleton() {
  return (
    <div className="space-y-6">
      {[0, 1].map((s) => (
        <section key={s} className="space-y-3">
          <Pulse className="h-4 w-32" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[0, 1, 2, 3, 4].map((c) => (
              <div key={c} className="rounded-lg border border-white/[0.06] bg-bg-surface p-4">
                <Pulse className="mb-3 h-3 w-2/3" />
                <Pulse className="h-6 w-1/2" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

/** Mirrors trends.tsx — title + toggle pills + chart area. */
export function TrendSkeleton() {
  return (
    <section className="space-y-3">
      <Pulse className="h-4 w-40" />
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3].map((p) => (
          <Pulse key={p} className="h-7 w-24 !rounded-full" />
        ))}
      </div>
      <Pulse className="h-64 w-full !rounded-lg" />
    </section>
  )
}

/** Mirrors top-content.tsx — view toggles + table rows. */
export function TopContentSkeleton() {
  return (
    <section className="space-y-6">
      <div className="flex gap-2">
        {[0, 1].map((p) => (
          <Pulse key={p} className="h-7 w-44 !rounded-full" />
        ))}
      </div>
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((r) => (
          <Pulse key={r} className="h-10 w-full" />
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (Controller runs centrally if parallel.)

- [ ] **Step 3: Commit**

```bash
git add components/report-sections/organic-social/skeletons.tsx
git commit -m "feat(organic-social): layout-matching section skeletons

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Synopsis self-fetches its inputs

**Files:**
- Modify: `components/report-sections/organic-social/synopsis.tsx`

**Interfaces:**
- Consumes: the cached fetchers from Task 1 (`getPlatformHeadlines`, `getEngagementTrend`, `getTopContent`).
- Produces: `OrganicSocialSynopsis({ clientSlug, dateRange?, compareRange? })` — an async server component. Props change from `{ clientSlug?, dateRange?, headlines, trend, top }` to `{ clientSlug: string; dateRange?: string; compareRange?: string | null }`. Returns `null` if input fetches fail.

- [ ] **Step 1: Replace the file**

Replace the entire contents of `components/report-sections/organic-social/synopsis.tsx` with:

```tsx
import { Sparkles } from 'lucide-react'
import { getOrganicSocialSynopsis } from '@/lib/organic-social/synopsis'
import { getPlatformHeadlines } from '@/lib/organic-social/headlines'
import { getEngagementTrend } from '@/lib/organic-social/trends'
import { getTopContent } from '@/lib/organic-social/top-content'
import type { PlatformHeadline, TrendSeries, PlatformTopContent } from '@/lib/organic-social/types'

// Executive AI-generated synopsis + recommended actions at the top of the
// Organic Social section. RSC: fetches its three inputs (shared via React
// cache() with the display sections) then the Glean synopsis. Streams behind
// its own Suspense boundary so it never blocks the display sections.

type Props = {
  clientSlug: string
  dateRange?: string
  compareRange?: string | null
}

export async function OrganicSocialSynopsis({ clientSlug, dateRange = 'last_30_days', compareRange = null }: Props) {
  const effectiveCompare = compareRange ?? 'previous_period'

  let headlines: PlatformHeadline[]
  let trend: TrendSeries
  let top: PlatformTopContent[]
  try {
    ;[headlines, trend, top] = await Promise.all([
      getPlatformHeadlines(clientSlug, dateRange, effectiveCompare),
      getEngagementTrend(clientSlug, dateRange),
      getTopContent(clientSlug, dateRange),
    ])
  } catch {
    // Input fetch failed — hide the synopsis (mirrors the old data-present guard).
    // The individual display sections render their own error fallbacks.
    return null
  }

  let result: Awaited<ReturnType<typeof getOrganicSocialSynopsis>> | null = null
  let errored = false
  try {
    result = await getOrganicSocialSynopsis(clientSlug, dateRange, headlines, trend, top)
  } catch (err) {
    console.error('[organic-social-synopsis] generation failed:', err)
    errored = true
  }

  return (
    <section className="rounded-xl border border-white/[0.08] bg-bg-surface p-6">
      <header className="mb-4 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#60FF80]/10">
          <Sparkles className="h-4 w-4 text-[#60FF80]" />
        </span>
        <h3 className="text-sm font-bold uppercase tracking-widest text-text-muted">Executive Synopsis</h3>
      </header>

      {errored && (
        <p className="text-sm text-text-muted">Synopsis is temporarily unavailable. Other metrics on this page are unaffected.</p>
      )}

      {!errored && result && (
        <div className="space-y-4">
          <div className="space-y-3 text-sm leading-relaxed text-white/90">
            {result.synopsis.split('\n\n').map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </div>

          {result.actions.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-text-muted">Recommended actions</p>
              <ul className="space-y-1.5 text-sm text-white/90">
                {result.actions.map((action, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-[#60FF80]">›</span>
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (Controller runs centrally if parallel — note `index.tsx` will not compile until Task 4 lands its matching call site.)

- [ ] **Step 3: Commit**

```bash
git add components/report-sections/organic-social/synopsis.tsx
git commit -m "refactor(organic-social): synopsis self-fetches its inputs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `OrganicSocialReport` becomes a streaming layout

**Files:**
- Modify: `components/report-sections/organic-social/index.tsx`

**Interfaces:**
- Consumes:
  - Task 1 cached fetchers (`getPlatformHeadlines(slug, dateRange, compareRange)`, `getEngagementTrend(slug, dateRange)`, `getTopContent(slug, dateRange)`).
  - Task 2 skeletons (`SynopsisSkeleton`, `HeadlinesSkeleton`, `TrendSkeleton`, `TopContentSkeleton` from `'./skeletons'`).
  - Task 3 synopsis (`OrganicSocialSynopsis` with props `{ clientSlug, dateRange, compareRange }`).
- Produces: `OrganicSocialReport({ clientSlug, dateRange?, compareRange? })` — a **non-async** function component (signature unchanged from the routers' perspective).

- [ ] **Step 1: Replace the file**

Replace the entire contents of `components/report-sections/organic-social/index.tsx` with:

```tsx
import { Suspense } from 'react'
import { getPlatformHeadlines } from '@/lib/organic-social/headlines'
import { getEngagementTrend } from '@/lib/organic-social/trends'
import { getTopContent } from '@/lib/organic-social/top-content'
import { PlatformHeadlines } from './platform-headlines'
import { EngagementTrend } from './trends'
import { TopContent } from './top-content'
import { OrganicSocialSynopsis } from './synopsis'
import { SynopsisSkeleton, HeadlinesSkeleton, TrendSkeleton, TopContentSkeleton } from './skeletons'
import { DashTimeoutError } from '@/lib/dash-social/client'

async function safe<T>(p: Promise<T>): Promise<{ data?: T; error?: 'timeout' | 'error' }> {
  try { return { data: await p } }
  catch (e) { return { error: e instanceof DashTimeoutError ? 'timeout' : 'error' } }
}

function Fallback({ kind }: { kind: 'timeout' | 'error' }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6 text-sm text-text-muted">
      {kind === 'timeout' ? 'Taking longer than usual — try a shorter date range.' : "Couldn't load this section."}
    </div>
  )
}

async function HeadlinesSection({ clientSlug, dateRange, compareRange }: { clientSlug: string; dateRange: string; compareRange: string | null }) {
  const effectiveCompare = compareRange ?? 'previous_period'
  const r = await safe(getPlatformHeadlines(clientSlug, dateRange, effectiveCompare))
  return r.data ? <PlatformHeadlines headlines={r.data} /> : <Fallback kind={r.error!} />
}

async function TrendSection({ clientSlug, dateRange }: { clientSlug: string; dateRange: string }) {
  const r = await safe(getEngagementTrend(clientSlug, dateRange))
  return r.data ? <EngagementTrend series={r.data} /> : <Fallback kind={r.error!} />
}

async function TopContentSection({ clientSlug, dateRange }: { clientSlug: string; dateRange: string }) {
  const r = await safe(getTopContent(clientSlug, dateRange))
  return r.data ? <TopContent groups={r.data} /> : <Fallback kind={r.error!} />
}

export function OrganicSocialReport({
  clientSlug, dateRange = 'last_30_days', compareRange = null,
}: { clientSlug: string; dateRange?: string; compareRange?: string | null }) {
  return (
    <div className="space-y-8">
      <Suspense fallback={<SynopsisSkeleton />}>
        <OrganicSocialSynopsis clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
      </Suspense>
      <Suspense fallback={<HeadlinesSkeleton />}>
        <HeadlinesSection clientSlug={clientSlug} dateRange={dateRange} compareRange={compareRange} />
      </Suspense>
      <Suspense fallback={<TrendSkeleton />}>
        <TrendSection clientSlug={clientSlug} dateRange={dateRange} />
      </Suspense>
      <Suspense fallback={<TopContentSkeleton />}>
        <TopContentSection clientSlug={clientSlug} dateRange={dateRange} />
      </Suspense>
    </div>
  )
}
```

Note: `compareRange` is passed to `HeadlinesSection` and `OrganicSocialSynopsis` only; `TrendSection`/`TopContentSection` don't take it (their fetchers don't use a compare range), matching the original `safe()` call signatures.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (with Tasks 1–3 present).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add components/report-sections/organic-social/index.tsx
git commit -m "perf(organic-social): stream each section behind its own Suspense boundary

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes

- **Spec coverage:** section wrappers (Task 4), `cache()` dedup (Task 1), synopsis self-fetch + null-on-failure (Task 3), four layout-matching skeletons (Task 2), non-async streaming layout (Task 4), `safe()`/`Fallback` moved into wrappers (Task 4). All spec sections mapped.
- **Interconnection guardrails:** `effectiveCompare = compareRange ?? 'previous_period'` is written verbatim in both Task 3 and Task 4 so the `cache()` dedup hits. The `OrganicSocialSynopsis` prop shape and the four skeleton names are pinned in the Interfaces blocks so Task 4 can be authored in parallel with Tasks 2–3.
- **Type consistency:** synopsis Promise.all destructuring is typed via the imported `PlatformHeadline`/`TrendSeries`/`PlatformTopContent`; the `let` + try/catch-return pattern keeps TS definite-assignment happy because the catch returns.
- **Verification:** TS compiler + `npm run build`; no unit tests fabricated for streaming behavior (none exist for these RSCs).
