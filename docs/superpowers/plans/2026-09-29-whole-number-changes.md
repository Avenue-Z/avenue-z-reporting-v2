# Outline tiles: whole-number percent changes, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On outline clients' tiles, every percent change shows as the nearest whole number, with the arrow and colour following the rounded value. Renaissance and every other section keep one decimal.

**Architecture:** One pure function turns a change into its nearest whole number. `KpiCard` takes an optional `wholeDelta` prop; absent means today's one decimal, byte for byte. Only `OutlineTiles` sets it, which covers the Data block (`outline-tiles.tsx:43`) and the engagement breakdown (`parts/engagement-breakdown.tsx:14`). (After a37cdd2 it also reaches `KpiCard` through `PlatformHeadlines`, on the outline Data part's fallback for Overview and X; corrected after Paul's review.)

> **Changed after Paul's review (2026-10-01), see the spec:** under 1% a change keeps one decimal (3.1, 3.2), and an outline client's fallback tabs measure the change against the size of the prior (3.4). Renaissance is unchanged; its arrow is a decision for Thomas and Paul.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest with Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-29-whole-number-changes-design.md` (reviewed twice; it wins where this plan differs; R1 to R6, K1 to K5, O1 to O4 below are its section 6). Source: Jasmine's staging feedback, round 1: "Can all percent changes be rounded up?" Settled 2026-09-29: rate values are not changed (her ask names percent changes; her guide already states the rate rule, `lib/organic-social/format.ts:13`). DECIDED (Jasmine, Slack 2026-09-29 5:12 PM): "6% but if it was 6.57 it should show as 7%", so the nearest whole number; an exact half rounds away from zero by size (my decision, spec section 1). Only that rule is built. Applies to outline clients only, never Renaissance.

## Global Constraints
- The only dash characters in this plan are inside code: they are the glyph the card draws today (`kpi-card.tsx:70,76`).
- `KpiCard` without the new prop renders exactly as today (`components/charts/kpi-card.tsx:61-77`). It is imported by 23 files, Renaissance's tiles included. Renaissance's guard is `render-invariant.test.tsx`, whose snapshot holds the shared tiles' change text with real values; it must not change.
- Round the SIZE of the change, then put the sign back. The rounded value drives the arrow, the colour and the text, so a +0.3% change can never show a green up arrow next to "0%" (today the arrow uses the unrounded sign, `kpi-card.tsx:66-70`).
- No other percent-change display is in scope: `capsule-column-chart.tsx:140`, `metric-delta.tsx:26` and `trend-area-chart.tsx:77` are not used by any Organic Social section (checked 2026-09-29).
- No request shape changes. Nothing here touches Dash requests or lock keys.
- Branch `feat/os-whole-number-changes`, cut from `dev`, standalone.
- Checks: `DATABASE_URL=postgresql://ci:ci@db.invalid/ci make check`.

## Review Focus
1. Round the real value, not the one-decimal display: 6.45 shows 6%, never 7% (rounding to 6.5 first would give 7). Only float noise is removed first (a true 6.5 computed as 6.4999999999 shows 7%).
2. A change that rounds to 0 shows the flat dash and "0%" in the muted colour with no arrow, like today's exact 0.
3. Negative changes round by size, then take the sign back: a 6.57% drop shows "↓ 7%", a 6.3% drop "↓ 6%".
4. A tile with no prior (`delta` undefined) still shows the greyed placeholder with no percent, unchanged.
5. An outline client's tab with no outline rows (Piper's X) rounds too, through the Data part's fallback (Task 3); the v1 part, which Renaissance renders, never passes the flag.

---

### Task 1: The rounding rule and the `KpiCard` prop

**Files:**
- Create: `lib/delta-rounding.ts` (shared, so the shared `KpiCard` does not import from Organic Social)
- Create: `lib/delta-rounding.test.ts`
- Modify: `vitest.config.ts` (add `'lib/delta-rounding.test.ts',` next to `'lib/concurrency.test.ts',`; the include list is explicit)
- Modify: `components/charts/kpi-card.tsx:3-34,61-72`
- Test: `components/charts/kpi-card.test.tsx` (already in the vitest include)

**Interfaces:**
- Produces: `roundDelta(delta: number): number` (signed, whole, nearest, half up by size) in `lib/delta-rounding.ts`.
- Produces: `KpiCard` prop `wholeDelta?: boolean`.

- [ ] **Step 1: Write the failing unit tests** (`lib/delta-rounding.test.ts`)

```ts
import { expect, test } from 'vitest'
import { roundDelta } from './delta-rounding'

// Jasmine, 2026-09-29: "6% but if it was 6.57 it should show as 7%".
test('her two examples', () => {
  expect(roundDelta(6.3)).toBe(6)
  expect(roundDelta(6.57)).toBe(7)
})

test('nearest by size, half up, sign kept', () => {
  expect([6.5, 0.4, 0.5, -6.3, -6.57, -6.5, 0].map(roundDelta)).toEqual([7, 0, 1, -6, -7, -7, 0])
})

test('the real value is rounded, not the one-decimal display', () => {
  expect(roundDelta(6.45)).toBe(6)
  expect(roundDelta(-6.45)).toBe(-6)
})

test('float noise never moves a half across the line', () => {
  expect(roundDelta(6.4999999999)).toBe(7)
  expect(roundDelta(5.0000000001)).toBe(5)
})

test('a change that rounds to zero is plain 0, never -0', () => {
  expect(Object.is(roundDelta(-0.2), 0)).toBe(true)
})

test('large changes round the same way', () => {
  expect(roundDelta(123.5)).toBe(124)
  expect(roundDelta(-1000.4)).toBe(-1000)
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run lib/delta-rounding.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Write the function** (`lib/delta-rounding.ts`)

```ts
/** A percent change as the nearest whole number, for the outline tiles (Jasmine, 2026-09-29: 6.3%
 *  shows 6%, 6.57% shows 7%). The size is rounded half up, then the sign goes back, so a drop rounds
 *  like a rise. Only float noise is removed first (six decimals; nine after Paul's review), never the one-decimal display: 6.45
 *  is 6, not 7. Zero is always plain 0, so the card shows no arrow. */
export function roundDelta(delta: number): number {
  const size = Math.round(Math.abs(delta) * 1e6) / 1e6
  const whole = Math.round(size)
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

  test('without wholeDelta the change keeps one decimal', () => {
    const { container } = render(<KpiCard title="Views" value="10" delta={6.34} />)
    expect(line(container)).toBe('↑ 6.3% vs prior period')
  })

  test('with wholeDelta the change is whole and the arrow follows the rounded value', () => {
    const r = (delta: number) => line(render(<KpiCard title="Views" value="10" delta={delta} wholeDelta />).container)
    expect(r(6.34)).toBe('↑ 6% vs prior period')
    expect(r(6.57)).toBe('↑ 7% vs prior period')
    expect(r(-6.57)).toBe('↓ 7% vs prior period')
    expect(r(0.3)).toBe('— 0% vs prior period')
  })

  test('a change that rounds to zero is muted, not green', () => {
    const { container } = render(<KpiCard title="Views" value="10" delta={0.3} wholeDelta />)
    const p = [...container.querySelectorAll('p')].find((x) => x.textContent?.includes('vs prior period'))!
    expect(p.className).toContain('text-text-muted')
    expect(p.className).not.toContain('text-brand-green')
  })

  test('no prior still shows the greyed placeholder', () => {
    const { container } = render(<KpiCard title="Views" value="10" comparisonExpected wholeDelta />)
    expect(line(container)).toBe('— vs prior period')
  })

  test('with invertDelta the colours follow the rounded value, swapped', () => {
    const { container } = render(<KpiCard title="Bounce Rate" value="10" delta={-6.57} invertDelta wholeDelta />)
    const p = [...container.querySelectorAll('p')].find((x) => x.textContent?.includes('vs prior period'))!
    expect(p.textContent).toBe('↓ 7% vs prior period')
    expect(p.className).toContain('text-brand-green')
  })
})
```

Run: `npx vitest run components/charts/kpi-card.test.tsx`
Expected: the `wholeDelta` tests FAIL (TypeScript accepts the unknown prop at runtime; the text still shows one decimal). The first and last new tests pass.

- [ ] **Step 6: Add the prop** (`components/charts/kpi-card.tsx`)

Import at the top: `import { roundDelta } from '@/lib/delta-rounding'`

In `KpiCardProps`, after `subValue`:

```ts
  /** Show the change as the nearest whole number (outline tiles only). Absent: one decimal. */
  wholeDelta?: boolean
```

Destructure `wholeDelta`, and replace the delta block (`kpi-card.tsx:61-72`) with:

```tsx
      {delta !== undefined ? (() => {
        // The value shown drives the arrow, the colour and the text, so they always agree.
        const shown = wholeDelta ? roundDelta(delta) : delta
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
            {Math.abs(shown).toFixed(wholeDelta ? 0 : 1)}% {deltaLabel}
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
git commit -m "feat(charts): KpiCard can show a change as the nearest whole number"
```

### Task 2: Turn it on for the outline tiles

**Files:**
- Modify: `components/report-sections/organic-social/outline-tiles.tsx:12-13`, `:22-29`, `:35-37`
- Modify: `lib/organic-social/format.ts:3` (doc fix)
- Test: `components/report-sections/organic-social/parts/outline-parts.test.tsx`

**Interfaces:**
- Consumes: `KpiCard`'s `wholeDelta` (Task 1).
- Produces: nothing new; `OutlineTiles` passes `wholeDelta` on every tile.

- [ ] **Step 1: Write the failing test** (append to `parts/outline-parts.test.tsx`; `OutlineTiles` and `card` are already imported and defined there)

```tsx
test('outline tiles show percent changes as whole numbers, the arrow following the rounded value', () => {
  const c = render(<OutlineTiles kpis={[
    { key: 'views', label: 'Views', format: 'number', value: 100, delta: 6.34 },
    { key: 'likes', label: 'Likes', format: 'number', value: 100, delta: 0.04 },
  ]} />).container
  expect(card(c, 'Views')!.textContent).toContain('↑ 6% vs prior period')
  expect(card(c, 'Views')!.textContent).not.toContain('6.3%')
  expect(card(c, 'Likes')!.textContent).not.toContain('↑')
})
```

Run: `npx vitest run components/report-sections/organic-social/parts/outline-parts.test.tsx`
Expected: FAIL (the card shows "6.3%").

- [ ] **Step 2: Confirm the markup-parity tests stay valid.** `outline-parts.test.tsx:131-141` compares the Data block's markup with the shared `PlatformHeadlines`. Its fixture has no prior (`context: null`, line 35), so no change line is drawn and the comparison is unaffected. Do not edit that test.

- [ ] **Step 3: Turn it on** (`outline-tiles.tsx`, on the real tile). Jasmine's rule (Slack 2026-09-29): nearest whole number.

```tsx
          delta={k.delta}
          wholeDelta
```

Then the two comments that become false (spec 3.3). `outline-tiles.tsx:12-14` becomes:

```tsx
/** Tiles in a grid with no heading, for the metrics directly under the engagement graph. The
 *  cards are drawn as the shared tiles draw them, except that a change shows as a whole number
 *  (Jasmine, 2026-09-29). A flagged row (a metric Dash does not offer) is a blank card with its
 *  flag and no change arrow. */
```

and in `:35-37`, "the same markup as the shared PlatformHeadlines for one platform (a test holds the two together)" becomes "the same markup as the shared PlatformHeadlines for one platform when no tile has a prior (a test holds the two together; with a prior, the change here is a whole number)".

- [ ] **Step 4: Fix the `pctCompact` doc** (`lib/organic-social/format.ts:3`): `(3.5% -> "3%")` becomes `(3.5% -> "4%")`. `Math.round(3.5)` is 4 (`format.ts:13`), and `post-card.pct.test.tsx` already pins 12.5% as "13%".

- [ ] **Step 5: Run and commit**

Run: `npx vitest run components/report-sections/organic-social/ lib/organic-social/`
Expected: PASS, including `render-invariant.test.tsx` with its snapshot unchanged (Renaissance's tiles never set the prop).

```bash
git add components/report-sections/organic-social/outline-tiles.tsx components/report-sections/organic-social/parts/outline-parts.test.tsx lib/organic-social/format.ts
git commit -m "feat(organic-social): Outline tiles show whole-number percent changes"
```

### Task 3: An outline client's tab with no outline rows rounds too (Piper's X)

**Files:**
- Modify: `components/report-sections/organic-social/platform-headlines.tsx:36-69`
- Modify: `components/report-sections/organic-social/parts/platform-headlines.tsx:9-12`
- Modify: `components/report-sections/organic-social/parts/outline-data.tsx:10`, `:40-43`
- Test: `components/report-sections/organic-social/parts/outline-parts.test.tsx` (replaces `:105-113` on purpose)

**Interfaces:**
- Consumes: `KpiCard`'s `wholeDelta` (Task 1).
- Produces: `PlatformHeadlines` prop `wholeDelta?: boolean`; exported `HeadlinesSection(props: OrganicSocialCtx & { wholeDelta?: boolean })`.

- [ ] **Step 1: Write the failing tests.** In `parts/outline-parts.test.tsx`, change the imports `import type { ReactNode } from 'react'` to `import { Suspense, type ReactElement, type ReactNode } from 'react'`, `import { platformHeadlinesV1 } from './platform-headlines'` to `import { HeadlinesSection, platformHeadlinesV1 } from './platform-headlines'`, and add `import { HeadlinesSkeleton } from '../skeletons'`. Replace the test `'on Overview or an uncovered channel the Data part is v1, and the breakdown is nothing'` (`:105-113`) with:

```tsx
test('on Overview or an uncovered channel the Data part is the v1 tiles with whole-number changes, and the breakdown is nothing (O4)', () => {
  const v2 = ORGANIC_SOCIAL_PARTS['platform-headlines'][2]
  const brk = ORGANIC_SOCIAL_PARTS['engagement-breakdown'][1]
  const r = { id: 'platform-headlines', version: 2, label: 'x' }
  for (const ctx of [FIXTURE_ORGANIC_SOCIAL_CTX, { ...FIXTURE_ORGANIC_SOCIAL_CTX, channel: 'TWITTER' as const }]) {
    expect(v2.render(ctx, r)).toEqual(<Suspense fallback={<HeadlinesSkeleton />}><HeadlinesSection {...ctx} wholeDelta /></Suspense>)
    // The v1 part, which Renaissance renders, never passes the flag.
    const v1 = platformHeadlinesV1.render(ctx, { ...r, version: 1 }) as ReactElement<{ children: ReactElement<Record<string, unknown>> }>
    expect(v1.props.children.props).not.toHaveProperty('wholeDelta')
    expect(brk.render(ctx, { id: 'engagement-breakdown', version: 1, label: 'x' })).toBeNull()
  }
})

test('the shared tiles round only when told to (O4)', () => {
  const h: PlatformHeadline[] = [{ channel: 'TWITTER', label: 'X', noData: false,
    kpis: [{ key: 'followers', label: 'Total Followers', value: 100, format: 'number', delta: 5.2 }] }]
  expect(render(<PlatformHeadlines headlines={h} wholeDelta />).container.textContent).toContain('↑ 5% vs prior period')
  expect(render(<PlatformHeadlines headlines={h} />).container.textContent).toContain('↑ 5.2% vs prior period')
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run components/report-sections/organic-social/parts/outline-parts.test.tsx`
Expected: FAIL on both (the fallback is still `platformHeadlinesV1.render`, `HeadlinesSection` is not exported, and `PlatformHeadlines` ignores the flag).

- [ ] **Step 3: Implement.** In `platform-headlines.tsx`, `PlatformSection` and `PlatformHeadlines` (`:36-69`) take the flag and pass it on (the card with `wholeDelta={undefined}` renders exactly as without it):

```tsx
function PlatformSection({ h, wholeDelta }: { h: PlatformHeadline; wholeDelta?: boolean }) {
```

with `wholeDelta={wholeDelta}` added to its `KpiCard` after `subValue={k.footnote}`, and

```tsx
/** `wholeDelta`: whole-number changes, set only by the outline Data part's fallback, never by the v1 part. */
export function PlatformHeadlines({ headlines, wholeDelta }: { headlines: PlatformHeadline[]; wholeDelta?: boolean }) {
  return (
    <div className="space-y-6">
      {headlines.map((h) => (
        <PlatformSection key={h.channel} h={h} wholeDelta={wholeDelta} />
      ))}
    </div>
  )
}
```

In `parts/platform-headlines.tsx`, `HeadlinesSection` (`:9-12`) becomes:

```tsx
/** The v1 tiles for one view. `wholeDelta` is set only by the outline Data part's fallback (outline-data.tsx);
 *  the v1 part below never passes it. */
export async function HeadlinesSection({ clientSlug, dateRange, compareRange, channel, wholeDelta }: OrganicSocialCtx & { wholeDelta?: boolean }) {
  const r = await safe(getPlatformHeadlines(clientSlug, dateRange, compareRange, channel))
  return r.data ? <PlatformHeadlines headlines={r.data} wholeDelta={wholeDelta} /> : <Fallback kind={r.error!} />
}
```

`platformHeadlinesV1` (`:14-24`) is not touched and stays the same object. In `parts/outline-data.tsx`, the import at `:10` becomes `import { HeadlinesSection } from './platform-headlines'`, and the fallback (`:40-43`) becomes:

```tsx
    render: (ctx) => {
      const rows = ctx.channel ? OUTLINE_DATA_ROWS[variant][ctx.channel] : undefined
      // An outline client's tab no outline covers (Piper's X, or Overview) keeps the v1 tiles, with whole-number changes.
      if (!ctx.channel || !rows) return <Suspense fallback={<HeadlinesSkeleton />}><HeadlinesSection {...ctx} wholeDelta /></Suspense>
```

(`resolved` was used only by the old fallback, so it is dropped from the signature.)

- [ ] **Step 4: Run and commit**

Run: `npx vitest run components/report-sections/organic-social/ lib/organic-social/`
Expected: PASS, with `render-invariant.test.tsx`'s snapshot unchanged and `ytd-parity.test.ts` still holding `platformHeadlinesV1` by identity.

```bash
git add components/report-sections/organic-social/platform-headlines.tsx components/report-sections/organic-social/parts/platform-headlines.tsx components/report-sections/organic-social/parts/outline-data.tsx components/report-sections/organic-social/parts/outline-parts.test.tsx
git commit -m "feat(organic-social): An outline tab with no outline rows shows whole-number changes too"
```

### Task 4: Prove it and hand it over

- [ ] Run `DATABASE_URL=postgresql://ci:ci@db.invalid/ci make check`. Expected: typecheck, every test, the RSC check and `next build` pass.
- [ ] Run `npx eslint` on every changed file. Expected: clean.
- [ ] Merge proof against every open PR branch (#281, #282, #283, #284, #286, #287, #291, #292). Expected: clean.
- [ ] Renaissance: `render-invariant.test.tsx` passes with its snapshot unchanged (the real guard: it renders the shared tiles with real deltas and no flag); the goldens pass too. The private drift check hashes the changed files, so it reports them as changed; that is expected and is not a render change.
- [ ] Look at it on the local app: an outline client's Data block and breakdown show whole-number changes, and so does Piper's X tab if it is set up locally; Renaissance's Organic Social tiles still show one decimal.
- [ ] Push, mark the PR ready, request Paul.
