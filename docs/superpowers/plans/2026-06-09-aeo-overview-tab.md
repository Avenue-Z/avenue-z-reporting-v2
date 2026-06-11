# AEO Overview Tab Enhancements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a provider toggle, a granularity toggle, a "what changed this period?" ribbon, a tracking-start caption, and real-topic grouping to the AEO Overview tab.

**Architecture:** A thin slot-based client wrapper (`ProviderTabs`) lets the server render both provider subtrees while the client shows the selected one (persisted to `localStorage`). New pure logic (daily→interval bucketing, period-change movers) lives in framework-free modules under `lib/aeo/` with `node:assert` tests. Each provider client (`lib/peec`, `lib/profound`) is extended to emit a daily visibility series, prior-30-day comparison data, a `periodChange` block, and a `topicSource` flag.

**Tech Stack:** Next.js 16 App Router (RSC + client islands), TypeScript (strict), Tailwind v4, `tsx` for test scripts, `node:assert/strict` for assertions. No new dependencies.

---

## Parallelization Map (read first)

Tasks are grouped into **waves**. Within a wave, tasks touch disjoint files and can be implemented by separate agents concurrently. Each file has **exactly one owning task** to avoid write conflicts.

```
Wave A (foundation, blocks everything):
  T1  lib/aeo/types.ts                         [no deps]
  TP  scripts/probe-aeo-topics.ts (research)   [no deps, read-only/external] ── runs alongside A–C

Wave B (after T1):
  T2  lib/aeo/bucket.ts + test                  [T1]
  T3  lib/aeo/period-change.ts + test          [T1]
  T7  peec-ai/period-ribbon.tsx                 [T1]
  T9  peec-ai/provider-tabs.tsx                 [T1]
  T11 demo-data/peec.ts + profound.ts           [T1]

Wave C (after its listed deps):
  T4  lib/peec/client.ts                        [T1, T3, TP]
  T5  lib/profound/client.ts                    [T1, T3, TP]
  T6  peec-ai/visibility-chart.tsx              [T1, T2]

Wave D (after T4 + T5):
  T8  peec-ai + profound-ai tracked-prompts-chart.tsx   [T4, T5]

Wave E (after T6, T7, T9):
  (no standalone task — feeds T10)

Wave F (after T4, T5, T6, T7, T8, T9):
  T10 peec-ai/index.tsx (integration; deletes profound-ai/visibility-chart.tsx)

Wave G (after all):
  T12 Final verification + commit
```

**Dependency rationale (call-outs for the fleet):**
- **T1 is the contract.** Every other task imports types from `lib/aeo/types.ts`. Nothing else may start until T1 lands.
- **T4/T5 own their client files exclusively.** They each add the daily series, prior-30 fetches, `periodChange`, *and* topic wiring. Do **not** split topic work into a separate task — it would create a second writer on the same file.
- **T8 depends on T4+T5** only because it reads the new `topicSource` field on `TrackedPrompt` (defined inside the client files).
- **T10 is the only integration hub.** It rewrites `index.tsx`, consumes the components from T6/T7/T9 and the data shape from T4/T5, and deletes the now-dead `profound-ai/visibility-chart.tsx`.
- **TP (probe) gates the topic branch inside T4/T5.** If the probe shows a provider lacks topics, that provider keeps keyword inference (`topicSource: 'inferred'`); the rest of T4/T5 is unaffected, so T4/T5 are not blocked on TP for their other steps — only for the final topic step.

---

## File Structure

**New files:**
- `lib/aeo/types.ts` — shared types (`DailyPoint`, `BucketGranularity`, `ChartBucket`, `TopicSource`, `PeriodMover`, `PromptOpportunity`, `PeriodChange`).
- `lib/aeo/bucket.ts` (+ `lib/aeo/bucket.test.ts`) — pure daily→{day,week,month,quarter} bucketing.
- `lib/aeo/period-change.ts` (+ `lib/aeo/period-change.test.ts`) — pure "biggest mover" computations.
- `components/report-sections/peec-ai/period-ribbon.tsx` — presentational "what changed" ribbon.
- `components/report-sections/peec-ai/provider-tabs.tsx` — client slot wrapper + provider toggle.
- `scripts/probe-aeo-topics.ts` — one-off API probe for topic availability.

**Modified files:**
- `lib/peec/client.ts` (T4), `lib/profound/client.ts` (T5).
- `components/report-sections/peec-ai/visibility-chart.tsx` (T6).
- `components/report-sections/peec-ai/tracked-prompts-chart.tsx` + `components/report-sections/profound-ai/tracked-prompts-chart.tsx` (T8).
- `components/report-sections/peec-ai/index.tsx` (T10).
- `lib/demo-data/peec.ts` + `lib/demo-data/profound.ts` (T11).

**Deleted:**
- `components/report-sections/profound-ai/visibility-chart.tsx` (T10).

---

## Task TP: Probe Peec & Profound APIs for topic fields (research)

**Files:**
- Create: `scripts/probe-aeo-topics.ts`

This is read-only research. Its output decides the topic branch in T4/T5. Run it early; record findings in the commit message and paste them into T4/T5 when those run.

- [ ] **Step 1: Write the probe script**

```ts
// scripts/probe-aeo-topics.ts
// Run: npx tsx --env-file=.env.local scripts/probe-aeo-topics.ts
// Read-only. Prints which fields Peec/Profound expose so we can group
// tracked prompts by real topics instead of keyword inference.

async function probePeec() {
  const key = process.env.PEEC_AI_CUSTOMER_TOKEN
  const pid = process.env.PEEC_AI_PROJECT_ID
  if (!key) return console.log('[peec] no PEEC_AI_CUSTOMER_TOKEN — skipped')
  const today = new Date().toISOString().slice(0, 10)
  const res = await fetch('https://api.peec.ai/customer/v1/queries/search', {
    method: 'POST',
    headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(pid ? { project_id: pid } : {}), start_date: `${today.slice(0, 4)}-01-01`, end_date: today, limit: 5 }),
  })
  const body = await res.json()
  console.log('[peec] /queries/search row keys:', Object.keys(body.data?.[0] ?? {}))
  console.log('[peec] sample row:', JSON.stringify(body.data?.[0] ?? {}, null, 2))
  // Also probe a topics endpoint if it exists:
  const t = await fetch('https://api.peec.ai/customer/v1/topics' + (pid ? `?project_id=${pid}` : ''), { headers: { 'X-API-Key': key } })
  console.log('[peec] /topics status:', t.status, t.ok ? JSON.stringify(await t.json()).slice(0, 400) : '')
}

async function probeProfound() {
  const key = process.env.PROFOUND_AI_ACCESS_TOKEN
  const categoryId = process.env.PROFOUND_CATEGORY_ID
  if (!key) return console.log('[profound] no PROFOUND_AI_ACCESS_TOKEN — skipped')
  const today = new Date().toISOString().slice(0, 10)
  const base = { category_id: categoryId, start_date: `${today.slice(0, 4)}-01-01`, end_date: today, pagination: { limit: 5 } }
  // Try a 'topic' dimension on the visibility report:
  for (const dims of [['topic'], ['prompt', 'topic']]) {
    const res = await fetch('https://api.tryprofound.com/v1/reports/visibility', {
      method: 'POST',
      headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...base, metrics: ['visibility_score'], dimensions: dims }),
    })
    console.log(`[profound] dimensions=${JSON.stringify(dims)} status:`, res.status)
    if (res.ok) console.log('  sample:', JSON.stringify((await res.json()).data?.slice(0, 3) ?? []))
    else console.log('  err:', (await res.text()).slice(0, 200))
  }
}

await probePeec()
await probeProfound()
```

- [ ] **Step 2: Run the probe**

Run: `npx tsx --env-file=.env.local scripts/probe-aeo-topics.ts`
Expected: prints field keys and endpoint statuses. **Record the answer to:** "Does Peec expose a topic/tag per query? Does Profound accept a `topic` dimension?"

- [ ] **Step 3: Commit the script + findings**

```bash
git add scripts/probe-aeo-topics.ts
git commit -m "chore(aeo): add topic-availability probe script

Findings: <paste: peec topic field = yes/no; profound topic dim = yes/no>"
```

---

## Task T1: Shared AEO types (the contract)

**Files:**
- Create: `lib/aeo/types.ts`

- [ ] **Step 1: Write the types**

```ts
// lib/aeo/types.ts
// Shared, framework-free types for the AEO Overview tab. Both provider
// clients (peec, profound) and the shared chart/ribbon import from here.

/** One day of visibility, 0–100. date is 'YYYY-MM-DD' (UTC). */
export type DailyPoint = { date: string; visibility: number }

export type BucketGranularity = 'daily' | 'weekly' | 'monthly' | 'quarterly'

/** A bucketed point ready for the chart. key sorts chronologically. */
export type ChartBucket = { key: string; label: string; visibility: number }

/** Whether a tracked prompt's topic came from the provider or keyword inference. */
export type TopicSource = 'provider' | 'inferred'

/** A single "biggest mover" entry; label is a brand or domain name. */
export type PeriodMover = { label: string; delta: number } | null

export type PromptOpportunity = { text: string; visibility: number } | null

/** The four movers behind the "What changed this period?" ribbon. */
export type PeriodChange = {
  visibilityMover: PeriodMover
  domainMover: PeriodMover
  competitorShift: PeriodMover
  promptOpportunity: PromptOpportunity
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors introduced).

- [ ] **Step 3: Commit**

```bash
git add lib/aeo/types.ts
git commit -m "feat(aeo): add shared AEO overview types"
```

---

## Task T2: Daily→interval bucketing (pure)

**Files:**
- Create: `lib/aeo/bucket.ts`
- Test: `lib/aeo/bucket.test.ts`

**Depends on:** T1.

- [ ] **Step 1: Write the failing test**

```ts
// lib/aeo/bucket.test.ts
// Run: npx tsx lib/aeo/bucket.test.ts
import { strict as assert } from 'node:assert'
import { bucketDaily } from './bucket'
import type { DailyPoint } from './types'

const days: DailyPoint[] = [
  { date: '2026-02-09', visibility: 10 }, // Mon
  { date: '2026-02-10', visibility: 20 }, // Tue (same ISO week)
  { date: '2026-02-16', visibility: 30 }, // next Mon
  { date: '2026-03-02', visibility: 40 }, // March
  { date: '2026-04-06', visibility: 60 }, // Q2
]

// daily = passthrough, sorted
const daily = bucketDaily(days, 'daily')
assert.equal(daily.length, 5)
assert.equal(daily[0].key, '2026-02-09')
assert.equal(daily[0].visibility, 10)

// weekly = ISO Monday weeks, averaged within a week
const weekly = bucketDaily(days, 'weekly')
assert.equal(weekly[0].key, '2026-02-09')
assert.equal(weekly[0].visibility, 15) // (10+20)/2
assert.equal(weekly[1].key, '2026-02-16')

// monthly = calendar month, key 'YYYY-MM'
const monthly = bucketDaily(days, 'monthly')
assert.equal(monthly[0].key, '2026-02')
assert.equal(monthly[0].visibility, 20) // (10+20+30)/3
assert.equal(monthly.find((m) => m.key === '2026-03')?.visibility, 40)

// quarterly = 'YYYY-Qn'
const quarterly = bucketDaily(days, 'quarterly')
assert.equal(quarterly[0].key, '2026-Q1')
assert.equal(quarterly[1].key, '2026-Q2')
assert.equal(quarterly[1].visibility, 60)

// empty input
assert.deepEqual(bucketDaily([], 'weekly'), [])

console.log('bucket.test.ts: all assertions passed')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/aeo/bucket.test.ts`
Expected: FAIL — `Cannot find module './bucket'`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/aeo/bucket.ts
import type { DailyPoint, BucketGranularity, ChartBucket } from './types'

function isoMonday(d: Date): Date {
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  const m = new Date(d)
  m.setUTCDate(d.getUTCDate() + diff)
  return m
}

function bucketKey(date: Date, g: BucketGranularity): string {
  const y = date.getUTCFullYear()
  switch (g) {
    case 'daily':     return date.toISOString().slice(0, 10)
    case 'weekly':    return isoMonday(date).toISOString().slice(0, 10)
    case 'monthly':   return `${y}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    case 'quarterly': return `${y}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`
  }
}

function bucketLabel(key: string, g: BucketGranularity): string {
  switch (g) {
    case 'daily':
    case 'weekly': {
      const d = new Date(key)
      const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
      return `${month} ${d.getUTCDate()}`
    }
    case 'monthly': {
      const [y, m] = key.split('-')
      const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1))
      return d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
    }
    case 'quarterly':
      return key.split('-')[1] // 'Q2'
  }
}

/** Bucket a daily series into the chosen interval, averaging visibility per bucket. */
export function bucketDaily(points: DailyPoint[], g: BucketGranularity): ChartBucket[] {
  const map = new Map<string, { sum: number; count: number }>()
  for (const p of points) {
    const d = new Date(p.date)
    if (isNaN(d.getTime())) continue
    const key = bucketKey(d, g)
    const e = map.get(key)
    if (e) { e.sum += p.visibility; e.count += 1 }
    else map.set(key, { sum: p.visibility, count: 1 })
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { sum, count }]) => ({ key, label: bucketLabel(key, g), visibility: sum / count }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/aeo/bucket.test.ts`
Expected: PASS — prints `bucket.test.ts: all assertions passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/aeo/bucket.ts lib/aeo/bucket.test.ts
git commit -m "feat(aeo): add daily->interval bucketing helper"
```

---

## Task T3: Period-change movers (pure)

**Files:**
- Create: `lib/aeo/period-change.ts`
- Test: `lib/aeo/period-change.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/aeo/period-change.test.ts
// Run: npx tsx lib/aeo/period-change.test.ts
import { strict as assert } from 'node:assert'
import { buildPeriodChange } from './period-change'

const change = buildPeriodChange({
  brandsCurrent: [
    { name: 'You',  visibility: 40, isYou: true },
    { name: 'CompA', visibility: 30, isYou: false },
    { name: 'CompB', visibility: 22, isYou: false },
  ],
  brandsPrior: [
    { name: 'You',  visibility: 35, isYou: true },  // +5
    { name: 'CompA', visibility: 18, isYou: false }, // +12 (biggest abs mover + biggest competitor gain)
    { name: 'CompB', visibility: 25, isYou: false }, // -3
  ],
  domainsCurrent: [{ domain: 'a.com', share: 20 }, { domain: 'b.com', share: 5 }],
  domainsPrior:   [{ domain: 'a.com', share: 8 },  { domain: 'b.com', share: 9 }], // a +12, b -4
  prompts: [
    { text: 'high', visibility: 50 },
    { text: 'low',  visibility: 4 },   // lowest visibility = opportunity
  ],
})

assert.equal(change.visibilityMover?.label, 'CompA')
assert.equal(change.visibilityMover?.delta, 12)
assert.equal(change.competitorShift?.label, 'CompA')
assert.equal(change.competitorShift?.delta, 12)
assert.equal(change.domainMover?.label, 'a.com')
assert.equal(change.domainMover?.delta, 12)
assert.equal(change.promptOpportunity?.text, 'low')
assert.equal(change.promptOpportunity?.visibility, 4)

// graceful empties
const empty = buildPeriodChange({ brandsCurrent: [], brandsPrior: [], domainsCurrent: [], domainsPrior: [], prompts: [] })
assert.equal(empty.visibilityMover, null)
assert.equal(empty.promptOpportunity, null)

console.log('period-change.test.ts: all assertions passed')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx lib/aeo/period-change.test.ts`
Expected: FAIL — `Cannot find module './period-change'`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/aeo/period-change.ts
import type { PeriodMover, PromptOpportunity, PeriodChange } from './types'

export type BrandPoint = { name: string; visibility: number; isYou: boolean }
export type DomainPoint = { domain: string; share: number }
export type PromptPoint = { text: string; visibility: number }

function biggestAbsMover(current: { label: string; value: number }[], prior: Map<string, number>): PeriodMover {
  let best: PeriodMover = null
  for (const c of current) {
    const p = prior.get(c.label)
    if (p === undefined) continue
    const delta = c.value - p
    if (best === null || Math.abs(delta) > Math.abs(best.delta)) best = { label: c.label, delta }
  }
  return best
}

export function visibilityMover(curr: BrandPoint[], prior: BrandPoint[]): PeriodMover {
  const priorMap = new Map(prior.map((b) => [b.name, b.visibility]))
  return biggestAbsMover(curr.map((b) => ({ label: b.name, value: b.visibility })), priorMap)
}

export function competitorShift(curr: BrandPoint[], prior: BrandPoint[]): PeriodMover {
  const priorMap = new Map(prior.map((b) => [b.name, b.visibility]))
  let best: PeriodMover = null
  for (const c of curr.filter((b) => !b.isYou)) {
    const p = priorMap.get(c.name)
    if (p === undefined) continue
    const delta = c.visibility - p // largest GAIN (rising threat)
    if (best === null || delta > best.delta) best = { label: c.name, delta }
  }
  return best
}

export function domainMover(curr: DomainPoint[], prior: DomainPoint[]): PeriodMover {
  const priorMap = new Map(prior.map((d) => [d.domain, d.share]))
  return biggestAbsMover(curr.map((d) => ({ label: d.domain, value: d.share })), priorMap)
}

export function promptOpportunity(prompts: PromptPoint[]): PromptOpportunity {
  const eligible = prompts.filter((p) => p.text)
  if (eligible.length === 0) return null
  let worst = eligible[0] // lowest current visibility = most headroom
  for (const p of eligible) if (p.visibility < worst.visibility) worst = p
  return { text: worst.text, visibility: worst.visibility }
}

export function buildPeriodChange(args: {
  brandsCurrent: BrandPoint[]
  brandsPrior: BrandPoint[]
  domainsCurrent: DomainPoint[]
  domainsPrior: DomainPoint[]
  prompts: PromptPoint[]
}): PeriodChange {
  return {
    visibilityMover: visibilityMover(args.brandsCurrent, args.brandsPrior),
    competitorShift: competitorShift(args.brandsCurrent, args.brandsPrior),
    domainMover:     domainMover(args.domainsCurrent, args.domainsPrior),
    promptOpportunity: promptOpportunity(args.prompts),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx lib/aeo/period-change.test.ts`
Expected: PASS — prints `period-change.test.ts: all assertions passed`.

- [ ] **Step 5: Commit**

```bash
git add lib/aeo/period-change.ts lib/aeo/period-change.test.ts
git commit -m "feat(aeo): add period-change mover computations"
```

---

## Task T7: Period ribbon component

**Files:**
- Create: `components/report-sections/peec-ai/period-ribbon.tsx`

> Built in Wave B (only needs T1). Presentational — rendered by the RSC in T10.

- [ ] **Step 1: Write the component**

```tsx
// components/report-sections/peec-ai/period-ribbon.tsx
import type { PeriodChange } from '@/lib/aeo/types'

function Chip({ label, primary, deltaText, positive }: {
  label: string
  primary: string
  deltaText?: string
  positive?: boolean
}) {
  return (
    <div className="flex-1 min-w-[180px] rounded-lg border border-white/[0.06] bg-bg-surface px-4 py-3">
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-white" title={primary}>{primary}</p>
      {deltaText && (
        <p className={`mt-0.5 text-xs font-semibold tabular-nums ${positive ? 'text-[#60FF80]' : 'text-[#FF4444]'}`}>
          {deltaText}
        </p>
      )}
    </div>
  )
}

function fmtDelta(delta: number, suffix = 'pts'): string {
  return `${delta >= 0 ? '↑ +' : '↓ '}${Math.abs(delta).toFixed(1)} ${suffix}`
}

export function PeriodRibbon({ change }: { change: PeriodChange }) {
  const { visibilityMover, domainMover, competitorShift, promptOpportunity } = change

  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-text-muted">
        What changed this period? <span className="font-normal normal-case tracking-normal">· last 30 days vs prior 30</span>
      </p>
      <div className="flex flex-wrap gap-3">
        <Chip
          label="Biggest visibility mover"
          primary={visibilityMover?.label ?? '—'}
          deltaText={visibilityMover ? fmtDelta(visibilityMover.delta) : undefined}
          positive={(visibilityMover?.delta ?? 0) >= 0}
        />
        <Chip
          label="Biggest domain gain/loss"
          primary={domainMover?.label ?? '—'}
          deltaText={domainMover ? fmtDelta(domainMover.delta, '%') : undefined}
          positive={(domainMover?.delta ?? 0) >= 0}
        />
        <Chip
          label="Biggest prompt opportunity"
          primary={promptOpportunity?.text ?? '—'}
          deltaText={promptOpportunity ? `${promptOpportunity.visibility.toFixed(1)}% visibility` : undefined}
          positive={false}
        />
        <Chip
          label="Biggest competitor shift"
          primary={competitorShift?.label ?? '—'}
          deltaText={competitorShift ? fmtDelta(competitorShift.delta) : undefined}
          positive={false}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/report-sections/peec-ai/period-ribbon.tsx
git commit -m "feat(aeo): add 'what changed this period' ribbon component"
```

---

## Task T9: Provider tabs (client slot wrapper)

**Files:**
- Create: `components/report-sections/peec-ai/provider-tabs.tsx`

> The server renders both provider subtrees and passes them as `sections` slots. This client component owns the toggle + `localStorage` persistence and shows the selected one. Single-provider clients render their one section with no toggle.

- [ ] **Step 1: Write the component**

```tsx
// components/report-sections/peec-ai/provider-tabs.tsx
'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type AeoProvider = 'peec' | 'profound'

const LABELS: Record<AeoProvider, string> = { peec: 'Peec AI', profound: 'Profound' }

export function ProviderTabs({
  availableProviders,
  clientSlug,
  sections,
}: {
  availableProviders: AeoProvider[]
  clientSlug: string
  sections: Partial<Record<AeoProvider, ReactNode>>
}) {
  const storageKey = `aeo-provider:${clientSlug}`
  // First render is deterministic (first available) to avoid hydration mismatch;
  // the persisted choice is applied after mount.
  const [selected, setSelected] = useState<AeoProvider>(availableProviders[0])

  useEffect(() => {
    if (availableProviders.length < 2) return
    const saved = window.localStorage.getItem(storageKey) as AeoProvider | null
    if (saved && availableProviders.includes(saved)) setSelected(saved)
  }, [storageKey, availableProviders])

  function pick(p: AeoProvider) {
    setSelected(p)
    window.localStorage.setItem(storageKey, p)
  }

  if (availableProviders.length < 2) {
    return <>{sections[availableProviders[0]]}</>
  }

  return (
    <div className="space-y-8">
      <div className="flex w-fit gap-1 rounded-lg bg-white/[0.04] p-1">
        {availableProviders.map((p) => (
          <button
            key={p}
            onClick={() => pick(p)}
            className={cn(
              'rounded-md px-4 py-1.5 text-sm font-semibold transition-all',
              selected === p ? 'bg-white text-black shadow-sm' : 'text-text-muted hover:text-white',
            )}
          >
            {LABELS[p]}
          </button>
        ))}
      </div>
      {sections[selected]}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/report-sections/peec-ai/provider-tabs.tsx
git commit -m "feat(aeo): add provider tabs client wrapper with persisted selection"
```

---

## Task T11: Extend demo data

**Files:**
- Modify: `lib/demo-data/peec.ts`
- Modify: `lib/demo-data/profound.ts`

> Only depends on T1 (the new fields). Independent of the live clients — safe to run in Wave B.

- [ ] **Step 1: Add a daily generator + new fields to `lib/demo-data/peec.ts`**

Add this helper near the existing `weeklyTrend` function (after line 44):

```ts
function dailyTrend(start: number, range: number, days = 112, noise = 0.6): import('@/lib/aeo/types').DailyPoint[] {
  const result: import('@/lib/aeo/types').DailyPoint[] = []
  const base = new Date('2026-02-09')
  for (let i = 0; i < days; i++) {
    const d = new Date(base)
    d.setDate(d.getDate() + i)
    const t = i / Math.max(days - 1, 1)
    const wave = Math.sin(i * 0.3) * noise
    result.push({ date: d.toISOString().slice(0, 10), visibility: Math.max(0, start + range * t + wave) })
  }
  return result
}
```

Then, inside `samplePeecOverview()` (the returned object, after `competitorWeeklyVisibility:` on line 136), add the new fields:

```ts
    dailyVisibility:            dailyTrend(34, 9),
    competitorDailyVisibility:  dailyTrend(28, 1),
    periodChange: {
      visibilityMover: { label: 'Avenue Z', delta: 6.1 },
      domainMover:     { label: 'techcrunch.com', delta: 2.4 },
      competitorShift: { label: 'Ogilvy', delta: 2.0 },
      promptOpportunity: { text: 'tracking citations in LLMs', visibility: 19.4 },
    },
```

And change the `trackedPrompts:` line (line 152) to tag the topic source:

```ts
    trackedPrompts: TRACKED_PROMPTS.map((p) => ({ ...p, topicSource: 'inferred' as const })),
```

- [ ] **Step 2: Add the same new fields to `lib/demo-data/profound.ts`**

Add a daily generator after the `COMPETITOR_WEEKLY` definition (line 42):

```ts
function dailyFromWeekly(weekly: typeof WEEKLY_VISIBILITY): import('@/lib/aeo/types').DailyPoint[] {
  const out: import('@/lib/aeo/types').DailyPoint[] = []
  for (const w of weekly) {
    for (let i = 0; i < 7; i++) {
      const d = new Date(w.weekStart)
      d.setUTCDate(d.getUTCDate() + i)
      out.push({ date: d.toISOString().slice(0, 10), visibility: w.visibility })
    }
  }
  return out
}
```

Then inside `sampleProfoundOverview()` (after `competitorWeeklyVisibility:` on line 87) add:

```ts
    dailyVisibility:            dailyFromWeekly(WEEKLY_VISIBILITY),
    competitorDailyVisibility:  dailyFromWeekly(COMPETITOR_WEEKLY),
    periodChange: {
      visibilityMover: { label: 'Praytell', delta: 3.8 },
      domainMover:     { label: 'forbes.com', delta: 4.2 },
      competitorShift: { label: 'BCW', delta: 2.4 },
      promptOpportunity: { text: 'marketing agency vs in-house team comparison', visibility: 28.9 },
    },
```

And change the `trackedPrompts:` line (line 108):

```ts
    trackedPrompts: TRACKED_PROMPTS.map((p) => ({ ...p, topicSource: 'inferred' as const })),
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: Will report **errors** until T4/T5 add `dailyVisibility`, `competitorDailyVisibility`, `periodChange`, and `topicSource` to the overview/`TrackedPrompt` types. That is expected — this task's fields are validated against the types in the final verification (T12). To confirm just this file parses, run: `npx tsc --noEmit 2>&1 | grep -v 'demo-data' | grep -c error` and ensure no *new* unrelated errors. If T4/T5 already merged, expect a clean PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/demo-data/peec.ts lib/demo-data/profound.ts
git commit -m "feat(aeo): extend demo data with daily series, periodChange, topicSource"
```

---

## Task T4: Extend Peec client

**Files:**
- Modify: `lib/peec/client.ts`

> One agent owns this file. Implements: daily series, prior-30 fetches, `periodChange`, `topicSource`, and real-topic grouping (per TP findings). Paste the TP probe finding for Peec before the topic step.

- [ ] **Step 1: Import shared types and extend exported types**

At the top, after line 1 (`import { cached } ...`):

```ts
import type { DailyPoint, PeriodChange, TopicSource } from '@/lib/aeo/types'
import { buildPeriodChange } from '@/lib/aeo/period-change'
```

Add `topicSource` to `TrackedPrompt` (lines 161-168):

```ts
export type TrackedPrompt = {
  text: string
  sources: string[]
  visibility: number
  sov: number
  position: number
  group: string
  topicSource: TopicSource
}
```

Add three fields to `PeecOverview` (lines 177-188) — keep `weeklyVisibility` for back-compat:

```ts
export type PeecOverview = {
  weeklyVisibility: WeeklyVisibility[]
  competitorWeeklyVisibility: WeeklyVisibility[]
  dailyVisibility: DailyPoint[]
  competitorDailyVisibility: DailyPoint[]
  competitorAverages: CompetitorAverages
  brandRankings: BrandRanking[]
  brandRankingsByRange: Record<string, BrandRanking[]>
  domainsByRange: Record<string, TopDomain[]>
  totalCitationsByRange: Record<string, number>
  domainTypes: DomainType[]
  trackedPrompts: TrackedPrompt[]
  llmBreakdown: LLMBreakdown[]
  periodChange: PeriodChange
}
```

- [ ] **Step 2: Add a daily-grouping helper**

After `groupByWeek` (ends line 289), add:

```ts
function groupByDay(rows: ApiBrandRow[]): DailyPoint[] {
  const dayMap = new Map<string, { visCount: number; visTotal: number }>()
  for (const row of rows) {
    if (!row.date) continue
    const key = row.date.slice(0, 10)
    const e = dayMap.get(key)
    if (e) { e.visCount += row.visibility_count; e.visTotal += row.visibility_total }
    else dayMap.set(key, { visCount: row.visibility_count, visTotal: row.visibility_total })
  }
  return Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { visCount, visTotal }]) => ({ date, visibility: visTotal > 0 ? (visCount / visTotal) * 100 : 0 }))
}
```

- [ ] **Step 3: Add prior-30 fetches**

In `getPeecOverviewImpl`, after `const last30 = periodDates(0, 30)` (line 347) add:

```ts
  const prior30 = periodDates(30, 30)
```

Extend the `Promise.all` (lines 351-362) with two more calls — add these entries to the destructured array and the array body:

```ts
  const [currentBrandsRes, priorBrandsRes, brands30Res, domainsRes, domains30Res, domainsPriorRes, promptBrandsRes, queriesRes, llmBrandsRes, llmDomainsRes, brandsPrior30Res, domainsPrior30Res] = await Promise.all([
    peecPost<{ data: ApiBrandRow[] }>('/reports/brands', { ...current }, pid),
    peecPost<{ data: ApiBrandRow[] }>('/reports/brands', { ...prior }, pid),
    peecPost<{ data: ApiBrandRow[] }>('/reports/brands', { ...last30 }, pid),
    peecPost<{ data: ApiDomainRow[]; totalCount: number }>('/reports/domains', { ...current }, pid),
    peecPost<{ data: ApiDomainRow[]; totalCount: number }>('/reports/domains', { ...last30 }, pid),
    peecPost<{ data: ApiDomainRow[]; totalCount: number }>('/reports/domains', { ...prior }, pid),
    peecPost<{ data: ApiBrandRow[] }>('/reports/brands', { ...current, dimensions: ['prompt_id'], limit: 2000 }, pid),
    peecPost<{ data: ApiQueryRow[]; totalCount: number }>('/queries/search', { ...current, limit: 2000 }, pid),
    peecPost<{ data: ApiBrandRow[] }>('/reports/brands', { ...current, dimensions: ['model_channel_id'], limit: 2000 }, pid),
    peecPost<{ data: ApiDomainRow[]; totalCount: number }>('/reports/domains', { ...current, dimensions: ['model_channel_id'], limit: 2000 }, pid),
    peecPost<{ data: ApiBrandRow[] }>('/reports/brands', { ...prior30 }, pid),
    peecPost<{ data: ApiDomainRow[]; totalCount: number }>('/reports/domains', { ...prior30 }, pid),
  ])
```

- [ ] **Step 4: Build the daily series**

After `const weeklyVisibility = groupByWeek(filteredYtdRows)` (line 504) add:

```ts
  const dailyVisibility = groupByDay(filteredYtdRows)
  const competitorDailyVisibility = groupByDay(competitorYtdRows)
```

- [ ] **Step 5: Build `periodChange`**

After the LLM breakdown block (after line 567) and before the competitor-averages block, add. This reuses the existing `aggregateBrandRows`/`aggToMetrics` helpers and `buildTopDomains`:

```ts
  // --- Period change (last 30 vs prior 30) ---
  const brandsCurrentPts = Array.from(aggregateBrandRows(brands30Res.data ?? []).entries()).map(([, a]) => ({
    name: a.name, visibility: aggToMetrics(a).visibility,
    isYou: yourBrand ? a.name.toLowerCase().includes(yourBrand.toLowerCase()) : false,
  }))
  const brandsPriorPts = Array.from(aggregateBrandRows(brandsPrior30Res.data ?? []).entries()).map(([, a]) => ({
    name: a.name, visibility: aggToMetrics(a).visibility,
    isYou: yourBrand ? a.name.toLowerCase().includes(yourBrand.toLowerCase()) : false,
  }))
  const periodChange = buildPeriodChange({
    brandsCurrent: brandsCurrentPts,
    brandsPrior: brandsPriorPts,
    domainsCurrent: (domains30Res.data ?? []).map((d) => ({ domain: d.domain, share: d.retrieved_percentage * 100 })),
    domainsPrior:   (domainsPrior30Res.data ?? []).map((d) => ({ domain: d.domain, share: d.retrieved_percentage * 100 })),
    prompts: trackedPrompts.map((p) => ({ text: p.text, visibility: p.visibility })),
  })
```

- [ ] **Step 6: Real topics (per TP finding)**

Paste the Peec TP finding here: `<peec topic field = yes/no>`.

**If the probe found a topic field** (e.g. each query row has `topic.name` or `tags`): in the tracked-prompts builder (lines 485-495), replace the `group:` assignment so it uses the real topic and sets `topicSource`. Example shape — adjust the field path to whatever TP revealed:

```ts
  const trackedPrompts: TrackedPrompt[] = Array.from(promptMap.entries()).map(([text, { sources, uuid, topic }]) => {
    const m = uuid ? promptMetricsById.get(uuid) : undefined
    return {
      text,
      sources: Array.from(sources),
      visibility: m?.visibility ?? 0,
      sov: m?.sov ?? 0,
      position: m?.position ?? 0,
      group: topic ?? categorizePrompt(text),
      topicSource: topic ? 'provider' : 'inferred',
    }
  })
```

(and capture `topic` in the `promptMap` builder at lines 475-483 from the query row's real field).

**If the probe found no topic field:** keep `categorizePrompt(text)` and add `topicSource: 'inferred'` to the returned object. Do not remove the disclaimer for Peec.

- [ ] **Step 7: Return the new fields**

In the final `return {` (lines 581-592) add the four new fields:

```ts
  return {
    weeklyVisibility,
    competitorWeeklyVisibility,
    dailyVisibility,
    competitorDailyVisibility,
    competitorAverages,
    brandRankings,
    brandRankingsByRange,
    domainsByRange,
    totalCitationsByRange,
    domainTypes,
    trackedPrompts,
    llmBreakdown,
    periodChange,
  }
```

- [ ] **Step 8: Bump the cache version**

In the `cached('peec', ...)` options (line 608), change `version: 'v3'` to `version: 'v4'` (response shape changed).

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep peec/client`
Expected: no errors from `lib/peec/client.ts`.

- [ ] **Step 10: Commit**

```bash
git add lib/peec/client.ts
git commit -m "feat(aeo): add daily series, period change, and topic source to Peec client"
```

---

## Task T5: Extend Profound client

**Files:**
- Modify: `lib/profound/client.ts`

> One agent owns this file. Mirrors T4 for Profound. Profound already fetches a daily `date`-dimensioned series (`weeklyRes`), so the daily series is built from that.

- [ ] **Step 1: Import shared types and extend exported types**

After line 1:

```ts
import type { DailyPoint, PeriodChange, TopicSource } from '@/lib/aeo/types'
import { buildPeriodChange } from '@/lib/aeo/period-change'
```

Add `topicSource` to `TrackedPrompt` (lines 94-101):

```ts
export type TrackedPrompt = {
  text: string
  sources: string[]
  visibility: number
  sov: number
  position: number
  group: string
  topicSource: TopicSource
}
```

Add fields to `ProfoundOverview` (lines 118-129):

```ts
export type ProfoundOverview = {
  weeklyVisibility: WeeklyVisibility[]
  competitorWeeklyVisibility: WeeklyVisibility[]
  dailyVisibility: DailyPoint[]
  competitorDailyVisibility: DailyPoint[]
  competitorAverages: CompetitorAverages
  brandRankings: BrandRanking[]
  brandRankingsByRange: Record<string, BrandRanking[]>
  domainsByRange: Record<string, TopDomain[]>
  totalCitationsByRange: Record<string, number>
  domainTypes: DomainType[]
  trackedPrompts: TrackedPrompt[]
  llmBreakdown: LLMBreakdown[]
  periodChange: PeriodChange
}
```

- [ ] **Step 2: Update `emptyOverview()`**

Add the new fields to the object (lines 288-299):

```ts
function emptyOverview(): ProfoundOverview {
  return {
    weeklyVisibility:           [],
    competitorWeeklyVisibility: [],
    dailyVisibility:            [],
    competitorDailyVisibility:  [],
    competitorAverages:         { visibility: 0, sov: 0, sentiment: 0, position: 0 },
    brandRankings:              [],
    brandRankingsByRange:       { 'YTD': [], 'Last 30 days': [] },
    domainsByRange:             { 'YTD': [], 'Last 30 days': [] },
    totalCitationsByRange:      { 'YTD': 0, 'Last 30 days': 0 },
    domainTypes:                [],
    trackedPrompts:             [],
    llmBreakdown:               [],
    periodChange:               { visibilityMover: null, domainMover: null, competitorShift: null, promptOpportunity: null },
  }
}
```

- [ ] **Step 3: Add a daily-grouping helper**

After `groupByWeekFromRows` (ends line 203) add:

```ts
function groupByDayFromRows(rows: ProfoundRow[], filterFn: (asset: string) => boolean): DailyPoint[] {
  const dayMap = new Map<string, { sum: number; count: number }>()
  for (const row of rows) {
    const dateStr = row.dimensions[0]
    const asset = row.dimensions[1] ?? ''
    if (!dateStr || !filterFn(asset)) continue
    const key = dateStr.slice(0, 10)
    const vis = (row.metrics[0] ?? 0) * 100
    const e = dayMap.get(key)
    if (e) { e.sum += vis; e.count += 1 }
    else dayMap.set(key, { sum: vis, count: 1 })
  }
  return Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { sum, count }]) => ({ date, visibility: sum / count }))
}
```

- [ ] **Step 4: Add prior-30 date range + fetches**

After the `last30` definition (lines 327-329) add:

```ts
  const prior30Start = new Date()
  prior30Start.setDate(prior30Start.getDate() - 60)
  const prior30End = new Date()
  prior30End.setDate(prior30End.getDate() - 31)
  const prior30 = { start_date: isoDate(prior30Start), end_date: isoDate(prior30End) }
```

Add two calls to the `Promise.all` (lines 343-365) — append to both the destructure and the body:

```ts
    brandsPrior30Res,
    domainsPrior30Res,
  ] = await Promise.all([
    // ... existing 10 calls unchanged ...
    profoundPost('/v1/reports/visibility', { ...base(prior30), metrics: BRAND_METRICS, dimensions: ['asset_name'] }),
    profoundPost('/v1/reports/citations', { ...base(prior30), metrics: DOMAIN_METRICS, dimensions: ['hostname', 'citation_category'] }),
  ])
```

- [ ] **Step 5: Build the daily series**

After the weekly visibility block (lines 374-378) add:

```ts
  const dailyVisibility = groupByDayFromRows(weeklyRes.data, isYou)
  const competitorDailyVisibility = groupByDayFromRows(weeklyRes.data, (a) => !isYou(a))
```

- [ ] **Step 6: Build `periodChange`**

After the tracked-prompts block (ends line 433) add. Reuse `buildBrandRankings` for current/prior-30 brand points and the raw domain rows for shares:

```ts
  // --- Period change (last 30 vs prior 30) ---
  const brands30 = buildBrandRankings(brands30Res.data, [], yourBrand)
  const brandsPrior30 = buildBrandRankings(brandsPrior30Res.data, [], yourBrand)
  const domainShare = (rows: ProfoundRow[]) => {
    const m = new Map<string, number>()
    for (const r of rows ?? []) {
      const domain = r.dimensions[0]
      if (!domain) continue
      m.set(domain, (m.get(domain) ?? 0) + (r.metrics[0] ?? 0) * 100)
    }
    return Array.from(m.entries()).map(([domain, share]) => ({ domain, share }))
  }
  const periodChange = buildPeriodChange({
    brandsCurrent: brands30.map((b) => ({ name: b.name, visibility: b.visibility, isYou: !!b.isYou })),
    brandsPrior:   brandsPrior30.map((b) => ({ name: b.name, visibility: b.visibility, isYou: !!b.isYou })),
    domainsCurrent: domainShare(domains30Res.data),
    domainsPrior:   domainShare(domainsPrior30Res.data),
    prompts: trackedPrompts.map((p) => ({ text: p.text, visibility: p.visibility })),
  })
```

- [ ] **Step 7: Real topics (per TP finding)**

Paste the Profound TP finding here: `<profound topic dimension = yes/no>`.

**If `dimensions: ['prompt', 'topic']` worked:** add a topic fetch to the `Promise.all` and build a prompt→topic map, then set `group` from it in the tracked-prompts builder (lines 423-433):

```ts
  // add to Promise.all:
  // profoundPost('/v1/reports/visibility', { ...base(ytd), metrics: ['visibility_score'], dimensions: ['prompt', 'topic'], ...brandFilter }),
  const promptTopic = new Map<string, string>()
  for (const r of promptTopicsRes.data ?? []) {
    const prompt = r.dimensions[0]; const topic = r.dimensions[1]
    if (prompt && topic) promptTopic.set(prompt, topic)
  }
  // in the .map:
  //   group:       promptTopic.get(r.dimensions[0]!) ?? categorizePrompt(r.dimensions[0]!),
  //   topicSource: promptTopic.has(r.dimensions[0]!) ? 'provider' : 'inferred',
```

**If it did not work:** keep `categorizePrompt(...)` and add `topicSource: 'inferred'` to each tracked prompt. Keep the disclaimer for Profound.

In all cases, ensure each tracked prompt object includes a `topicSource` field.

- [ ] **Step 8: Return the new fields**

Add `dailyVisibility`, `competitorDailyVisibility`, and `periodChange` to the final `return {` (lines 435-446).

- [ ] **Step 9: Bump the cache version**

In `cached('profound', ...)` options (line 457), change `version: 'v2'` to `version: 'v3'`.

- [ ] **Step 10: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep profound/client`
Expected: no errors from `lib/profound/client.ts`.

- [ ] **Step 11: Commit**

```bash
git add lib/profound/client.ts
git commit -m "feat(aeo): add daily series, period change, and topic source to Profound client"
```

---

## Task T6: Shared visibility chart with granularity toggle + caption

**Files:**
- Modify: `components/report-sections/peec-ai/visibility-chart.tsx`

> Rewrites the chart to consume a daily series, bucket client-side at the selected granularity, and show a "Tracking began …" caption. This single chart is used for both providers (Profound's copy is deleted in T10).

- [ ] **Step 1: Replace the file contents**

```tsx
// components/report-sections/peec-ai/visibility-chart.tsx
'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { bucketDaily } from '@/lib/aeo/bucket'
import type { DailyPoint, BucketGranularity } from '@/lib/aeo/types'

const GRANULARITIES: { id: BucketGranularity; label: string }[] = [
  { id: 'daily',     label: 'Daily'     },
  { id: 'weekly',    label: 'Weekly'    },
  { id: 'monthly',   label: 'Monthly'   },
  { id: 'quarterly', label: 'Quarterly' },
]

export function VisibilityChart({
  data,
  competitorData,
  brandName,
}: {
  data: DailyPoint[]
  competitorData: DailyPoint[]
  brandName?: string
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [granularity, setGranularity] = useState<BucketGranularity>('weekly')

  const buckets = useMemo(() => bucketDaily(data, granularity), [data, granularity])
  const compBuckets = useMemo(() => bucketDaily(competitorData, granularity), [competitorData, granularity])

  if (buckets.length === 0) return null

  const CHART_MAX = Math.max(...buckets.map((d) => d.visibility), ...compBuckets.map((d) => d.visibility), 1)
  const n = buckets.length
  const compMap = new Map(compBuckets.map((d) => [d.key, d.visibility]))
  const trackingStart = data.length > 0 ? bucketDaily(data, 'weekly')[0]?.label : undefined

  const competitorPoints = buckets
    .map((b, i) => ({ x: (i + 0.5) / n, vis: compMap.get(b.key) ?? null }))
    .filter((p): p is { x: number; vis: number } => p.vis !== null)
  const svgPoints = competitorPoints
    .map((p) => `${(p.x * 100).toFixed(2)},${(100 - (p.vis / CHART_MAX) * 100).toFixed(2)}`)
    .join(' ')

  // Label every Nth bucket so the axis never crowds.
  const labelEvery = Math.max(1, Math.ceil(n / 16))

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-text-muted">AI Visibility — Year to Date</p>
          {brandName && <p className="mt-0.5 text-xs text-text-muted">{brandName} · {granularity}</p>}
          {trackingStart && <p className="mt-0.5 text-[11px] text-text-muted">Tracking began {trackingStart}</p>}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-1 rounded-lg bg-white/[0.04] p-0.5">
            {GRANULARITIES.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setGranularity(id)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all',
                  granularity === id ? 'bg-white text-black shadow-sm' : 'text-text-muted hover:text-white',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-4 text-[10px] text-text-muted">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm bg-[#60FDFF]" />
              {brandName ?? 'You'}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 border-t border-dashed border-[#8A8A8A]" />
              Competitor avg
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative h-40 flex-1">
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="w-full border-t border-white/[0.04]" />
            ))}
          </div>

          <div className="relative flex h-full gap-1">
            {buckets.map((b, i) => {
              const heightPct = (b.visibility / CHART_MAX) * 100
              const isHovered = hovered === i
              const compVis = compMap.get(b.key)
              return (
                <div
                  key={b.key}
                  className="group relative h-full flex-1 cursor-default"
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {isHovered && (
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/[0.08] bg-bg-surface px-2.5 py-1.5 text-xs shadow-xl">
                      <p className="font-bold text-white">{b.visibility.toFixed(1)}%</p>
                      {compVis !== undefined && <p className="text-text-muted">Competitors: {compVis.toFixed(1)}%</p>}
                      <p className="text-text-muted">{b.label}</p>
                    </div>
                  )}
                  <div
                    className="absolute bottom-0 left-0 right-0 rounded-sm transition-colors duration-150"
                    style={{
                      height: `${Math.max(heightPct, 1)}%`,
                      backgroundColor: isHovered ? '#9BFEFF' : '#60FDFF',
                      opacity: hovered !== null && !isHovered ? 0.35 : 1,
                    }}
                  />
                </div>
              )
            })}
          </div>

          {competitorPoints.length > 1 && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
              <polyline points={svgPoints} fill="none" stroke="#8A8A8A" strokeWidth="1.5" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            </svg>
          )}
        </div>
      </div>

      <div className="mt-2 flex gap-1">
        {buckets.map((b, i) => (
          <div key={b.key} className="flex-1 overflow-hidden text-center">
            {i % labelEvery === 0 && <span className="text-[9px] tabular-nums text-text-muted">{b.label}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep 'peec-ai/visibility-chart'`
Expected: no errors from this file (callers are updated in T10; a temporary mismatch at the call sites is fine until then).

- [ ] **Step 3: Commit**

```bash
git add components/report-sections/peec-ai/visibility-chart.tsx
git commit -m "feat(aeo): shared visibility chart with granularity toggle and tracking caption"
```

---

## Task T8: Conditional topic disclaimer in tracked-prompts charts

**Files:**
- Modify: `components/report-sections/peec-ai/tracked-prompts-chart.tsx`
- Modify: `components/report-sections/profound-ai/tracked-prompts-chart.tsx`

> Depends on T4+T5 (the `topicSource` field). Shows the "AI-inferred" disclaimer only when every prompt's topic is inferred; hides it when topics come from the provider.

- [ ] **Step 1: Compute the flag and gate the disclaimer in `peec-ai/tracked-prompts-chart.tsx`**

Inside `TrackedPromptsChart` (line 111), after `const brand = brandName ?? 'your brand'` add:

```ts
  const topicsFromProvider = prompts.length > 0 && prompts.every((p) => p.topicSource === 'provider')
```

Replace the warning tooltip block (lines 120-126) with a conditional that swaps the disclaimer text and the warning icon colour:

```tsx
          <span className="group relative flex-shrink-0">
            <span className={cn(
              'flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border text-[9px] font-bold leading-none',
              topicsFromProvider ? 'border-white/20 text-text-muted' : 'border-[#FF4444]/60 text-[#FF4444]',
            )}>?</span>
            <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-64 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
              {topicsFromProvider
                ? 'Prompt metrics and topic groupings are live data from Peec.AI.'
                : 'Prompt metrics are live data from Peec.AI. Topic groupings are AI-inferred based on keyword patterns and may not be accurate — verify before sharing externally.'}
              <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
            </span>
          </span>
```

- [ ] **Step 2: Repeat for `profound-ai/tracked-prompts-chart.tsx`**

Apply the same two edits. Use "Profound" instead of "Peec.AI" in the disclaimer strings. Confirm `cn` is imported (add `import { cn } from '@/lib/utils'` if missing).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep tracked-prompts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/report-sections/peec-ai/tracked-prompts-chart.tsx components/report-sections/profound-ai/tracked-prompts-chart.tsx
git commit -m "feat(aeo): show topic disclaimer only when topics are keyword-inferred"
```

---

## Task T10: Integrate — rewrite `index.tsx`, wire the toggle, delete dead chart

**Files:**
- Modify: `components/report-sections/peec-ai/index.tsx`
- Delete: `components/report-sections/profound-ai/visibility-chart.tsx`

> The integration hub. Resolves available providers, renders each provider's section (ribbon + shared chart + existing content) as a slot, wraps them in `ProviderTabs`, and removes the old stacked-Profound layout.

- [ ] **Step 1: Replace the whole file**

Replace `components/report-sections/peec-ai/index.tsx` with the following. The presentational helpers (`Delta`, `KpiCard`, `BrandSOVChart`, `BrandDefinitions`, `DomainTypesChart`, `DomainTypeDefinitions`) are unchanged from the current file — **keep them as-is** and only replace the imports block, remove `SectionDivider`, and rewrite `PeecAIReport` plus add a `renderProviderSection` helper. Full file:

```tsx
import { getPeecOverview } from '@/lib/peec/client'
import type { PeecOverview } from '@/lib/peec/client'
import { getProfoundOverview } from '@/lib/profound/client'
import type { ProfoundOverview } from '@/lib/profound/client'
import { BRAND_TYPE_MAP, BRAND_TYPE_COLORS, BRAND_TYPE_DEFINITIONS } from '@/lib/peec/brand-types'
import { BrandRankingsTable } from './brand-rankings-table'
import { TopDomainsTable } from './top-domains-table'
import { VisibilityChart } from './visibility-chart'
import { TrackedPromptsChart } from './tracked-prompts-chart'
import { LLMBreakdownTable } from './llm-breakdown-table'
import { PeriodRibbon } from './period-ribbon'
import { ProviderTabs, type AeoProvider } from './provider-tabs'
import { BrandRankingsTable as ProfoundBrandRankingsTable } from '../profound-ai/brand-rankings-table'
import { TopDomainsTable as ProfoundTopDomainsTable } from '../profound-ai/top-domains-table'
import { TrackedPromptsChart as ProfoundTrackedPromptsChart } from '../profound-ai/tracked-prompts-chart'
import { LLMBreakdownTable as ProfoundLLMBreakdownTable } from '../profound-ai/llm-breakdown-table'
import { sampleProfoundOverview } from '@/lib/demo-data/profound'
import { samplePeecOverview } from '@/lib/demo-data/peec'
import { SampleDataBadge } from '@/lib/demo-data/badge'
import { getClientBySlug } from '@/lib/db/queries'
import { cn } from '@/lib/utils'

// ── Keep the existing presentational helpers below UNCHANGED ──
// Delta, KpiCard, BrandSOVChart, BrandDefinitions, DomainTypesChart,
// DomainTypeDefinitions  (copy them verbatim from the current file)

// <PASTE: Delta, KpiCard, BrandSOVChart, BrandDefinitions,
//         DomainTypesChart, DomainTypeDefinitions  — unchanged>

// --- Per-provider section (shared markup, provider-specific table components) ---

type Overview = PeecOverview | ProfoundOverview

function ProviderSection({
  data,
  provider,
  isDemo,
  brandEnvFallback,
}: {
  data: Overview
  provider: AeoProvider
  isDemo: boolean
  brandEnvFallback?: string
}) {
  const you = data.brandRankings.find((b) => b.isYou)
  const brandName = you?.name ?? brandEnvFallback
  const Rankings = provider === 'peec' ? BrandRankingsTable : ProfoundBrandRankingsTable
  const Domains  = provider === 'peec' ? TopDomainsTable : ProfoundTopDomainsTable
  const LLM      = provider === 'peec' ? LLMBreakdownTable : ProfoundLLMBreakdownTable
  const Prompts  = provider === 'peec' ? TrackedPromptsChart : ProfoundTrackedPromptsChart

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-text-muted">Answer Engine Optimization</p>
        <div className="flex items-center gap-2">
          <h2 className="text-3xl font-extrabold uppercase text-white">Overview</h2>
          {isDemo && <SampleDataBadge />}
        </div>
      </div>

      <PeriodRibbon change={data.periodChange} />

      {data.dailyVisibility.length > 0 && (
        <VisibilityChart
          data={data.dailyVisibility}
          competitorData={data.competitorDailyVisibility}
          brandName={brandName}
        />
      )}

      {you && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {[
            { title: 'Visibility', value: `${you.visibility.toFixed(1)}%`, delta: you.visibilityDelta,
              subtitle: `Competitor avg · ${data.competitorAverages.visibility.toFixed(1)}%`,
              tooltip: '% of AI responses mentioning your brand, Jan 1 – today vs. same period last year. Competitor avg is the YTD mean across all tracked brands.' },
            { title: 'Share of Voice', value: `${you.sov.toFixed(1)}%`, delta: you.sovDelta,
              subtitle: `Competitor avg · ${data.competitorAverages.sov.toFixed(1)}%`,
              tooltip: 'Your share of all AI brand mentions, Jan 1 – today vs. same period last year. Competitor avg is the YTD mean across all tracked brands.' },
            { title: 'Position', value: `#${you.position.toFixed(1)}`, delta: you.positionDelta,
              subtitle: `Competitor avg · #${data.competitorAverages.position.toFixed(1)}`,
              tooltip: 'Avg rank when your brand appears in AI responses (lower is better), Jan 1 – today vs. same period last year.', invertDelta: true },
          ].map(({ title, value, delta, tooltip, subtitle, invertDelta }) => (
            <KpiCard key={title} title={title} value={value} delta={delta} tooltip={tooltip} subtitle={subtitle} invertDelta={invertDelta} />
          ))}
        </div>
      )}

      {data.llmBreakdown.length > 0 && <LLM breakdown={data.llmBreakdown} />}

      <div className="grid items-stretch gap-5 lg:grid-cols-[1fr_280px]">
        <Rankings rankingsByRange={data.brandRankingsByRange} />
        <div className="flex h-full flex-col gap-5">
          <BrandSOVChart brands={data.brandRankings} />
          <BrandDefinitions />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <Domains domainsByRange={data.domainsByRange} totalCitationsByRange={data.totalCitationsByRange} />
        <div className="flex flex-col gap-5">
          <DomainTypesChart types={data.domainTypes} source={provider} />
          <DomainTypeDefinitions source={provider} />
        </div>
      </div>

      {data.trackedPrompts.length > 0 && <Prompts prompts={data.trackedPrompts} brandName={brandName} />}

      <p className="text-xs text-text-muted">
        {isDemo ? 'Sample data — demo mode' : `Live data from ${provider === 'peec' ? 'Peec AI' : 'Profound'}`}
      </p>
    </div>
  )
}

// --- Main report ---

export async function PeecAIReport({ clientSlug, demoMode = false }: { clientSlug?: string; demoMode?: boolean } = {}) {
  const config = clientSlug ? await getClientBySlug(clientSlug) : null
  const peecConfigured = demoMode || !!config?.peecCustomerProjectId
  const profoundConfigured = demoMode || !!config?.profoundCategoryId

  const [peecRes, profoundRes] = await Promise.allSettled([
    peecConfigured ? getPeecOverview(clientSlug) : Promise.resolve(null),
    profoundConfigured ? getProfoundOverview(clientSlug) : Promise.resolve(null),
  ])

  let peecData     = peecRes.status     === 'fulfilled' ? peecRes.value     : null
  let profoundData = profoundRes.status === 'fulfilled' ? profoundRes.value : null

  if (demoMode) {
    peecData     = samplePeecOverview()
    profoundData = sampleProfoundOverview()
  }

  const availableProviders: AeoProvider[] = []
  if (peecData)     availableProviders.push('peec')
  if (profoundData) availableProviders.push('profound')

  if (availableProviders.length === 0) {
    return <p className="text-sm text-text-muted">No AEO provider is configured for this client.</p>
  }

  const sections: Partial<Record<AeoProvider, React.ReactNode>> = {}
  if (peecData) {
    sections.peec = <ProviderSection data={peecData} provider="peec" isDemo={demoMode} brandEnvFallback={process.env.PEEC_AI_YOUR_BRAND} />
  }
  if (profoundData) {
    sections.profound = <ProviderSection data={profoundData} provider="profound" isDemo={demoMode} brandEnvFallback={process.env.PROFOUND_AI_YOUR_BRAND} />
  }

  return (
    <ProviderTabs availableProviders={availableProviders} clientSlug={clientSlug ?? 'default'} sections={sections} />
  )
}
```

> **Note for the implementer:** copy the six presentational helper functions (`Delta`, `KpiCard`, `BrandSOVChart`, `BrandDefinitions`, `DomainTypesChart`, `DomainTypeDefinitions`) verbatim from the pre-edit version of this file into the marked `<PASTE …>` location. They are unchanged. The `cn` import is retained because `KpiCard`/`Delta` use it. The old `SectionDivider` is intentionally dropped.

- [ ] **Step 2: Delete the dead Profound visibility chart**

```bash
git rm components/report-sections/profound-ai/visibility-chart.tsx
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (whole project compiles now that data, components, and demo data all align).

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add components/report-sections/peec-ai/index.tsx
git commit -m "feat(aeo): provider toggle, ribbon, and shared chart on overview tab"
```

---

## Task T12: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, zero errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Pure-logic tests**

Run: `npx tsx lib/aeo/bucket.test.ts && npx tsx lib/aeo/period-change.test.ts`
Expected: both print `all assertions passed`.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Manual demo-mode check**

Run the dev server and open the AEO Overview tab for a demo-mode user. Confirm:
- The provider toggle appears (Peec AI | Profound) and switching persists across reload.
- The "What changed this period?" ribbon shows four populated chips.
- The visibility chart granularity toggle switches Daily/Weekly/Monthly/Quarterly and the caption reads "Tracking began …".
- The Tracked Prompts disclaimer reflects `topicSource` (red ? + inferred warning when inferred; neutral when provider).

Run: `npm run dev` then visit `/dashboard/<slug>/reports?section=peec-ai`.

- [ ] **Step 6: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "chore(aeo): final verification fixes"
```

---

## Self-Review (against the spec)

**Spec coverage:**
- §1 YTD caption → T6 (chart `Tracking began …`). ✓
- §2 Granularity toggle → T2 (bucket) + T6 (toggle UI). ✓
- §3 Ribbon → T1 (`PeriodChange`) + T3 (movers) + T4/T5 (data) + T7 (UI). ✓
- §4 Provider toggle → T9 (`ProviderTabs`) + T10 (availability + slots). ✓
- §5 Real topics → TP (probe) + T4/T5 (wiring + `topicSource`) + T8 (conditional disclaimer). ✓
- Shared chart consolidation + delete Profound chart → T6 + T10. ✓
- Demo data parity → T11. ✓

**Type consistency:** `DailyPoint`, `BucketGranularity`, `ChartBucket`, `TopicSource`, `PeriodChange`, `PeriodMover`, `PromptOpportunity` defined once in T1 and imported everywhere. `buildPeriodChange` signature in T3 matches the call sites in T4/T5. `VisibilityChart` prop type (`DailyPoint[]`) in T6 matches the `dailyVisibility` field added in T4/T5 and passed in T10. `topicSource` added to `TrackedPrompt` in T4/T5 and read in T8/T11.

**Known conditional:** the §5 topic branch depends on the TP probe outcome; both branches are specified so the task is executable either way. If neither API exposes topics, T8's disclaimer stays in its current ("inferred") state for both providers — a graceful no-op, flagged in the spec.
