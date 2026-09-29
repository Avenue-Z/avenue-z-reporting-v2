# Outline tiles: whole-number percent changes, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On outline clients' tiles, every percent change shows as a whole number, with the arrow and colour following the rounded value. Renaissance and every other section keep one decimal.

**Architecture:** One pure function turns a change into its shown value under a rule (`nearest` or `up`). `KpiCard` takes an optional `deltaRounding` prop; absent means today's one decimal, byte for byte. Only `OutlineTiles` sets it, which covers the Data block (`outline-tiles.tsx:43`) and the engagement breakdown (`parts/engagement-breakdown.tsx:14`).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest with Testing Library.

**Spec:** Jasmine's staging feedback, round 1: "Can all percent changes be rounded up?" Settled 2026-09-29: rate values are not changed (her ask names percent changes; her guide already states the rate rule, `lib/organic-social/format.ts:13`). Open: `nearest` (6.3% shows 6%) or `up` (6.3% shows 7%). Not discussed on the 2026-09-29 call; asked on Slack the same day. Applies to outline clients only, never Renaissance. The plan builds the function for both and sets the one she picks in Task 2, Step 3.

## Global Constraints
- The only dash characters in this plan are inside code: they are the glyph the card draws today (`kpi-card.tsx:70,76`).
- `KpiCard` without the new prop renders exactly as today (`components/charts/kpi-card.tsx:61-77`). It is used by about 30 sections, Renaissance's tiles included.
- Round the SIZE of the change, then put the sign back. The rounded value drives the arrow, the colour and the text, so a +0.3% change can never show a green up arrow next to "0%" (today the arrow uses the unrounded sign, `kpi-card.tsx:66-70`).
- No other percent-change display is in scope: `capsule-column-chart.tsx:140`, `metric-delta.tsx:26` and `trend-area-chart.tsx:77` are not used by any Organic Social section (checked 2026-09-29).
- No request shape changes. Nothing here touches Dash requests or lock keys.
- Branch `feat/os-whole-number-changes`, cut from `dev`, standalone.
- Checks: `DATABASE_URL=postgresql://ci:ci@db.invalid/ci make check`.

## Review Focus
1. Float noise under `up`: a change computed as 5.0000000001 must show 5%, not 6%. Round to one decimal first (what the card shows today), then apply the rule.
2. A change that rounds to 0 shows the flat dash and "0%" in the muted colour with no arrow, like today's exact 0.
3. Negative changes under `up` round away from zero (a 6.3% drop shows "↓ 7%"), never towards it.
4. A tile with no prior (`delta` undefined) still shows the greyed placeholder with no percent, unchanged.
5. An X tab (no outline rows) draws the v1 tiles and keeps one decimal. That is expected; say so in the PR.

---

### Task 1: The rounding rule and the `KpiCard` prop

**Files:**
- Create: `lib/delta-rounding.ts` (shared, so the shared `KpiCard` does not import from Organic Social)
- Create: `lib/delta-rounding.test.ts`
- Modify: `vitest.config.ts` (add `'lib/delta-rounding.test.ts',` next to `'lib/concurrency.test.ts',`; the include list is explicit)
- Modify: `components/charts/kpi-card.tsx:3-34,61-72`
- Test: `components/charts/kpi-card.test.tsx` (already in the vitest include)

**Interfaces:**
- Produces: `type DeltaRounding = 'nearest' | 'up'` and `roundDelta(delta: number, rule: DeltaRounding): number` (signed, whole) in `lib/delta-rounding.ts`.
- Produces: `KpiCard` prop `deltaRounding?: DeltaRounding`.

- [ ] **Step 1: Write the failing unit tests** (`lib/delta-rounding.test.ts`)

```ts
import { expect, test } from 'vitest'
import { roundDelta } from './delta-rounding'

test('nearest rounds the size half up and keeps the sign', () => {
  expect([6.3, 6.5, 0.4, 0.5, -6.3, -6.5, 0].map((d) => roundDelta(d, 'nearest'))).toEqual([6, 7, 0, 1, -6, -7, 0])
})

test('up rounds the size away from zero', () => {
  expect([6.3, 6.0, 0.3, 0.01, -6.3, -0.3, 0].map((d) => roundDelta(d, 'up'))).toEqual([7, 6, 1, 0, -7, -1, 0])
})

test('float noise never pushes a whole change up a step', () => {
  expect(roundDelta(5.0000000001, 'up')).toBe(5)
  expect(roundDelta(-5.0000000001, 'up')).toBe(-5)
  expect(roundDelta(0.04, 'up')).toBe(0)
})

test('a change that rounds to zero is plain 0, never -0', () => {
  expect(Object.is(roundDelta(-0.2, 'nearest'), 0)).toBe(true)
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run lib/delta-rounding.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the function** (`lib/delta-rounding.ts`)

```ts
export type DeltaRounding = 'nearest' | 'up'

/** A percent change as a whole number, for the outline tiles (Jasmine's round 1 feedback). The size
 *  is first taken to one decimal, what the tiles showed before, so float noise (5.0000000001) never
 *  moves a whole change up a step; then `nearest` rounds half up and `up` rounds away from zero; then
 *  the sign goes back. Zero is always plain 0, so the card shows no arrow. */
export function roundDelta(delta: number, rule: DeltaRounding): number {
  const size = Math.round(Math.abs(delta) * 10) / 10
  const whole = rule === 'up' ? Math.ceil(size) : Math.round(size)
  if (whole === 0) return 0
  return delta < 0 ? -whole : whole
}
```

- [ ] **Step 4: Run the unit tests**

Run: `npx vitest run lib/delta-rounding.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing card tests** (append to `components/charts/kpi-card.test.tsx`)

```tsx
describe('KpiCard change line', () => {
  const line = (c: HTMLElement) => [...c.querySelectorAll('p')].map((p) => p.textContent).find((t) => t?.includes('vs prior period'))

  test('without deltaRounding the change keeps one decimal', () => {
    const { container } = render(<KpiCard title="Views" value="10" delta={6.34} />)
    expect(line(container)).toBe('↑ 6.3% vs prior period')
  })

  test('with deltaRounding the change is whole and the arrow follows the rounded value', () => {
    const r = (delta: number, rule: 'nearest' | 'up') => line(render(<KpiCard title="Views" value="10" delta={delta} deltaRounding={rule} />).container)
    expect(r(6.34, 'nearest')).toBe('↑ 6% vs prior period')
    expect(r(6.34, 'up')).toBe('↑ 7% vs prior period')
    expect(r(-6.34, 'up')).toBe('↓ 7% vs prior period')
    expect(r(0.3, 'nearest')).toBe('— 0% vs prior period')
  })

  test('a change that rounds to zero is muted, not green', () => {
    const { container } = render(<KpiCard title="Views" value="10" delta={0.3} deltaRounding="nearest" />)
    const p = [...container.querySelectorAll('p')].find((x) => x.textContent?.includes('vs prior period'))!
    expect(p.className).toContain('text-text-muted')
    expect(p.className).not.toContain('text-brand-green')
  })

  test('no prior still shows the greyed placeholder', () => {
    const { container } = render(<KpiCard title="Views" value="10" comparisonExpected deltaRounding="nearest" />)
    expect(line(container)).toBe('— vs prior period')
  })
})
```

Run: `npx vitest run components/charts/kpi-card.test.tsx`
Expected: the `deltaRounding` tests FAIL (TypeScript accepts the unknown prop at runtime; the text still shows one decimal). The first and last new tests pass.

- [ ] **Step 6: Add the prop** (`components/charts/kpi-card.tsx`)

Import at the top: `import { roundDelta, type DeltaRounding } from '@/lib/delta-rounding'`

In `KpiCardProps`, after `subValue`:

```ts
  /** Show the change as a whole number under this rule (outline tiles only). Absent: one decimal. */
  deltaRounding?: DeltaRounding
```

Destructure `deltaRounding`, and replace the delta block (`kpi-card.tsx:61-72`) with:

```tsx
      {delta !== undefined ? (() => {
        // The value shown drives the arrow, the colour and the text, so they always agree.
        const shown = deltaRounding ? roundDelta(delta, deltaRounding) : delta
        return (
          <p
            className={cn(
              'mt-1 text-sm font-bold',
              invertDelta
                ? shown < 0 ? 'text-brand-green' : shown > 0 ? 'text-[#FF4444]' : 'text-text-muted'
                : shown > 0 ? 'text-brand-green' : shown < 0 ? 'text-[#FF4444]' : 'text-text-muted'
            )}
          >
            {shown > 0 ? '↑' : shown < 0 ? '↓' : '—'}{' '}
            {Math.abs(shown).toFixed(deltaRounding ? 0 : 1)}% {deltaLabel}
          </p>
        )
      })() : comparisonExpected ? (
```

Without the prop, `shown` is `delta` and the digits are 1, so every existing card renders the same markup.

- [ ] **Step 7: Run the card tests and every test that renders `KpiCard`**

Run: `npx vitest run components/charts/kpi-card.test.tsx components/report-sections/`
Expected: PASS. No existing snapshot or text assertion changes.

- [ ] **Step 8: Commit**

```bash
git add lib/delta-rounding.ts lib/delta-rounding.test.ts vitest.config.ts components/charts/kpi-card.tsx components/charts/kpi-card.test.tsx
git commit -m "feat(charts): KpiCard can show a change as a whole number under a named rule"
```

### Task 2: Turn it on for the outline tiles

**Files:**
- Modify: `components/report-sections/organic-social/outline-tiles.tsx:22-29`
- Modify: `lib/organic-social/format.ts:3` (doc fix)
- Test: `components/report-sections/organic-social/parts/outline-parts.test.tsx`

**Interfaces:**
- Consumes: `DeltaRounding`, `KpiCard`'s `deltaRounding` (Task 1).
- Produces: `OUTLINE_DELTA_ROUNDING: DeltaRounding` exported from `outline-tiles.tsx`.

- [ ] **Step 1: Write the failing test** (append to `parts/outline-parts.test.tsx`; `OutlineTiles` and `card` are already imported and defined there)

```tsx
test('outline tiles show percent changes as whole numbers, the arrow following the rounded value', () => {
  const c = render(<OutlineTiles kpis={[
    { key: 'views', label: 'Views', format: 'number', value: 100, delta: 6.34 },
    { key: 'likes', label: 'Likes', format: 'number', value: 100, delta: 0.04 },
  ]} />).container
  expect(card(c, 'Views')!.textContent).toMatch(/↑ [67]% vs prior period/)
  expect(card(c, 'Views')!.textContent).not.toContain('6.3%')
  expect(card(c, 'Likes')!.textContent).not.toContain('↑')
})
```

Run: `npx vitest run components/report-sections/organic-social/parts/outline-parts.test.tsx`
Expected: FAIL (the card shows "6.3%").

- [ ] **Step 2: Confirm the markup-parity tests stay valid.** `outline-parts.test.tsx:131-141` compares the Data block's markup with the shared `PlatformHeadlines`. Its fixture has no prior (`context: null`, line 35), so no change line is drawn and the comparison is unaffected. Do not edit that test.

- [ ] **Step 3: Set the rule** (`outline-tiles.tsx`). Use `'nearest'` or `'up'`, whichever Jasmine picks. Asked on Slack 2026-09-29 (6.3% as 6% or 7%) after the sync, where it didn't come up.

```tsx
import type { DeltaRounding } from '@/lib/delta-rounding'

/** Jasmine's round 1 feedback: whole-number percent changes on outline tiles. */
export const OUTLINE_DELTA_ROUNDING: DeltaRounding = 'nearest'
```

and on the real tile:

```tsx
          delta={k.delta}
          deltaRounding={OUTLINE_DELTA_ROUNDING}
```

Then tighten the Step 1 regex to the exact value for the chosen rule (`6%` for `nearest`, `7%` for `up`).

- [ ] **Step 4: Fix the `pctCompact` doc** (`lib/organic-social/format.ts:3`): `(3.5% -> "3%")` becomes `(3.5% -> "4%")`. `Math.round(3.5)` is 4 (`format.ts:13`), and `post-card.pct.test.tsx` already pins 12.5% as "13%".

- [ ] **Step 5: Run and commit**

Run: `npx vitest run components/report-sections/organic-social/ lib/organic-social/`
Expected: PASS, including `v1-render.golden.test.tsx` and `platform-headlines.golden.test.tsx` (Renaissance's tiles never set the prop).

```bash
git add components/report-sections/organic-social/outline-tiles.tsx components/report-sections/organic-social/parts/outline-parts.test.tsx lib/organic-social/format.ts
git commit -m "feat(organic-social): Outline tiles show whole-number percent changes"
```

### Task 3: Prove it and hand it over

- [ ] Run `DATABASE_URL=postgresql://ci:ci@db.invalid/ci make check`. Expected: typecheck, every test, the RSC check and `next build` pass.
- [ ] Run `npx eslint` on every changed file. Expected: clean.
- [ ] Merge proof against every open PR branch (#281, #282, #283, #284, #286, #287). Expected: clean.
- [ ] Renaissance: `v1-render.golden.test.tsx` and `platform-headlines.golden.test.tsx` pass unchanged. The private drift check hashes `kpi-card.tsx` and `format.ts`, so it reports those two files as changed; that is expected and is not a render change.
- [ ] Look at it on the local app: an outline client's Data block shows whole-number changes; Renaissance's Organic Social tiles still show one decimal.
- [ ] Push, mark the PR ready, request Paul.
