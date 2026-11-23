// The kit tile options (plan docs/superpowers/plans/2026-11-23-os-design-phase1.md, round 1, Task 2's options) and
// KpiTile, the kit tile that takes KpiCard's props. Every Organic Social tile today is a KpiCard
// (components/charts/kpi-card.tsx); round 2 swaps those for KpiTile, so these tests prove a viewer reads exactly the
// same thing on both, for every combination of KpiCard's props, and sees the same colour on the change line.
import { describe, expect, test } from 'vitest'
import { render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { KpiCard } from '@/components/charts/kpi-card'
import { visibleValues } from '../parts/version-parity'
import { Kpi, KpiTile } from './charts'
import s from './kit.module.css'

const DASH = '\u2014' // KpiCard's dash glyph
const values = (node: React.ReactElement) => visibleValues(render(node).container)

describe('Kpi options', () => {
  const base = { title: 'Total Followers', value: '1,500', label: 'vs prior period' }

  test('with no option set, a tile is unchanged: no hint, the change line drawn, "n/a" when there is no prior', () => {
    const { container } = render(<Kpi {...base} delta={null} />)
    expect(container.querySelector('[role=tooltip]')).toBeNull()
    expect(container.querySelector(`.${s.d}`)).not.toBeNull()
    expect(visibleValues(container)).toEqual(['Total Followers', '1,500', 'n/a vs prior period'])
    expect(values(<Kpi {...base} delta={0} />)).toEqual(['Total Followers', '1,500', '0% vs prior period'])
    expect(values(<Kpi {...base} delta={12.3} />)).toEqual(['Total Followers', '1,500', '↑ 12% vs prior period'])
  })
  test('tooltip draws the shared hover hint beside the title', () => {
    expect(values(<Kpi {...base} delta={1} tooltip="People following the account." />))
      .toEqual(['Total Followers', '?', 'People following the account.', '1,500', '↑ 1% vs prior period'])
  })
  test('noPrior replaces "n/a"', () => {
    expect(values(<Kpi {...base} delta={undefined} noPrior={DASH} />)).toEqual(['Total Followers', '1,500', `${DASH} vs prior period`])
  })
  test('zeroDash puts the dash glyph before a zero change, and only a zero one', () => {
    expect(values(<Kpi {...base} delta={0} zeroDash />)).toEqual(['Total Followers', '1,500', `${DASH} 0% vs prior period`])
    expect(values(<Kpi {...base} delta={0.001} zeroDash />)).toEqual(['Total Followers', '1,500', `${DASH} 0% vs prior period`])
    expect(values(<Kpi {...base} delta={2} zeroDash />)).toEqual(['Total Followers', '1,500', '↑ 2% vs prior period'])
  })
  test('noChange drops the change line', () => {
    const { container } = render(<Kpi {...base} delta={5} noChange />)
    expect(container.querySelector(`.${s.d}`)).toBeNull()
    expect(visibleValues(container)).toEqual(['Total Followers', '1,500'])
  })
  test('oneDecimal always shows one decimal, where the default rounds whole from 1%', () => {
    expect(values(<Kpi {...base} delta={12.34} oneDecimal />)).toContain('↑ 12.3% vs prior period')
    expect(values(<Kpi {...base} delta={12.34} />)).toContain('↑ 12% vs prior period')
    expect(values(<Kpi {...base} delta={0.04} oneDecimal />)).toContain('↑ 0.0% vs prior period')
    expect(values(<Kpi {...base} delta={0} oneDecimal />)).toContain('0.0% vs prior period')
    expect(values(<Kpi {...base} delta={-3.45} oneDecimal invert />)).toContain('↓ 3.5% vs prior period')
  })
  test('points are untouched by oneDecimal', () => {
    expect(values(<Kpi {...base} delta={0} unit="pts" oneDecimal />)).toContain('0 pts vs prior period')
    expect(values(<Kpi {...base} delta={1.26} unit="pts" oneDecimal />)).toContain('↑ 1.3 pts vs prior period')
  })
  test('the tile stays one export block', () => {
    const { container } = render(<Kpi {...base} delta={1} tooltip="x" />)
    expect(container.querySelectorAll('[data-export-block]')).toHaveLength(1)
  })
})

// The change line's colour, read the same way on both: KpiCard's Tailwind class, the kit's CSS module class.
function cardTone(el: HTMLElement): string | null {
  const line = [...el.querySelectorAll('p')].find((p) => p.className.includes('text-sm font-bold'))
  if (!line) return null
  return line.className.includes('text-brand-green') ? 'up' : line.className.includes('#FF4444') ? 'down' : 'flat'
}
function kitTone(el: HTMLElement): string | null {
  const line = el.querySelector(`.${s.d} span`)
  if (!line) return null
  return line.className === s.up ? 'up' : line.className === s.down ? 'down' : line.className === s.flat ? 'flat' : `unknown ${line.className}`
}

describe('KpiTile reads exactly as KpiCard', () => {
  type CardProps = ComponentProps<typeof KpiCard>
  // Rises and drops either side of every rounding edge roundDelta has (0.95 shows 1, 6.45 shows 6, float noise at
  // 1e-10), a true zero, a negative zero and no prior at all.
  const deltas = [undefined, 0, -0, 1e-10, -1e-10, 0.04, -0.04, 0.42, -0.42, 0.6, 0.95, 1, 6.45, 12.3, -12.3, -3.45, 99.95]
  const extras: Partial<CardProps>[] = [
    {},
    { tooltip: 'The total number of followers.' },
    { subValue: '2,483 in 2025' },
    { deltaLabel: 'vs prior 30 days', tooltip: 'Views.' },
    { prefix: '$', suffix: ' USD' },
  ]
  const cases: CardProps[] = []
  let i = 0
  for (const delta of deltas)
    for (const wholeDelta of [false, true])
      for (const comparisonExpected of [false, true])
        for (const invertDelta of [false, true]) {
          const value = i % 3 === 0 ? 1500 : i % 3 === 1 ? '4.2%' : '1,234,567'
          cases.push({ title: 'Total Followers', value, delta, wholeDelta, comparisonExpected, invertDelta, ...extras[i % extras.length] })
          i++
        }

  test.each(cases.map((c) => [JSON.stringify(c), c] as const))('%s', (_name, props) => {
    const card = render(<KpiCard {...props} />).container
    const tile = render(<KpiTile {...props} />).container
    expect(visibleValues(tile)).toEqual(visibleValues(card))
    expect(kitTone(tile)).toBe(cardTone(card))
  })

  test('the matrix covers every branch: a change line, the no-prior dash, no line, and all three tones', () => {
    const tones = new Set<string | null>()
    for (const c of cases) tones.add(cardTone(render(<KpiCard {...c} />).container))
    expect([...tones].sort()).toEqual(['down', 'flat', 'up', null].sort())
    expect(cases.some((c) => c.delta === undefined && c.comparisonExpected)).toBe(true)
    expect(cases.some((c) => c.delta === undefined && !c.comparisonExpected)).toBe(true)
  })

  test('the unavailable tile and the Influencer totals, as drawn today, read the same', () => {
    for (const props of [
      { title: 'Video Views', value: DASH, subValue: 'Not reported by Instagram', tooltip: 'Views of videos.' },
      { title: 'Posts', value: '12' },
      { title: 'Total Views', value: DASH, subValue: 'Not reported for these posts' },
    ] satisfies CardProps[]) {
      expect(visibleValues(render(<KpiTile {...props} />).container)).toEqual(visibleValues(render(<KpiCard {...props} />).container))
    }
  })
})
