import { describe, expect, test, vi } from 'vitest'
import { LineChart, niceYDomain, MIN_SPAN_FRACTION } from './line-chart'
import { layoutPins, PIN_CARD_WIDTH } from './pins'
import type { ReactElement } from 'react'

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  const { cloneElement } = await import('react')
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
      cloneElement(children, { width: 800, height: 300 }),
  }
})

const mk = (vals: number[], key = 'v') => vals.map((v) => ({ [key]: v }))

describe('niceYDomain', () => {
  test('frames a high-value series well above 0 without over-zooming a trivial move (PR #181 review)', () => {
    // LinkedIn followers ~5900 moving only ~9 (0.15%). Must NOT span 0→6000 (the original
    // flat-line bug), but must ALSO not frame so tightly that the 9-unit move fills the chart
    // (the inverse "lie factor"). The span is floored at ~10% of the value.
    const [lo, hi] = niceYDomain(mk([5900, 5905, 5898, 5902, 5896]), [{ key: 'v' }])!
    const span = hi - lo
    expect(lo).toBeGreaterThan(5000)          // not the 0→max span
    expect(lo).toBeLessThanOrEqual(5896)
    expect(hi).toBeGreaterThanOrEqual(5905)
    expect(span).toBeGreaterThanOrEqual(5900 * MIN_SPAN_FRACTION * 0.9) // ~590 floor
    // The 0.15% move occupies a small slice of the band → reads flat, honestly.
    expect((5905 - 5896) / span).toBeLessThan(0.05)
  })

  test('a genuinely moving series (exceeds the floor) still frames tightly', () => {
    // Followers climbing 5000→5900 (+18%) — a real trend. Range (900) is well above the ~545
    // floor, so no expansion: the climb fills the chart as it should.
    const [lo, hi] = niceYDomain(mk([5000, 5300, 5600, 5900]), [{ key: 'v' }])!
    expect(lo).toBeLessThanOrEqual(5000)
    expect(hi).toBeGreaterThanOrEqual(5900)
    expect(hi - lo).toBeLessThan(5000 * MIN_SPAN_FRACTION * 3) // tight, not floor-inflated
  })

  test('small counts get headroom on both sides without touching 0', () => {
    // Instagram 29–32.
    const [lo, hi] = niceYDomain(mk([29, 30, 29, 31, 32]), [{ key: 'v' }])!
    expect(lo).toBeGreaterThanOrEqual(28)
    expect(lo).toBeLessThanOrEqual(29)
    expect(hi).toBeGreaterThanOrEqual(32)
  })

  test('clamps the floor at 0 for non-negative data that dips low', () => {
    const [lo] = niceYDomain(mk([2, 3, 5, 4]), [{ key: 'v' }])!
    expect(lo).toBeGreaterThanOrEqual(0)
  })

  test('a flat series is padded so it sits mid-chart, not on an edge', () => {
    const [lo, hi] = niceYDomain(mk([6000, 6000, 6000]), [{ key: 'v' }])!
    expect(lo).toBeLessThan(6000)
    expect(hi).toBeGreaterThan(6000)
  })

  test('spans every active series when more than one is shown', () => {
    const data = [
      { a: 100, b: 200 },
      { a: 110, b: 190 },
    ]
    const [lo, hi] = niceYDomain(data, [{ key: 'a' }, { key: 'b' }])!
    expect(lo).toBeLessThanOrEqual(100)
    expect(hi).toBeGreaterThanOrEqual(200)
  })

  test('returns undefined for empty / non-numeric data (Recharts default kicks in)', () => {
    expect(niceYDomain([], [{ key: 'v' }])).toBeUndefined()
    expect(niceYDomain([{ v: 'n/a' }], [{ key: 'v' }])).toBeUndefined()
  })
})

import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { DefaultTooltipContent } from 'recharts'
import { NotedTooltip } from './line-chart'

// Invented values. The box is rendered directly: Recharts only shows it on a real hover.
const P = {
  active: true, label: '2026-09-21', contentStyle: { background: '#272727' },
  payload: [{ name: 'Instagram', value: 9, dataKey: 'Instagram', color: '#ffffff' }],
} as unknown as ComponentProps<typeof NotedTooltip>

describe('NotedTooltip', () => {
  test('with no note, the hover box is exactly the default one', () => {
    const noted = render(<NotedTooltip {...P} />).container.innerHTML
    const plain = render(<DefaultTooltipContent {...(P as ComponentProps<typeof DefaultTooltipContent>)} />).container.innerHTML
    expect(noted).toBe(plain)
  })

  test('with a note, the box shows the date, the value, then the note under them', () => {
    const text = render(<NotedTooltip {...P} note="Influencer post went live" />).container.textContent ?? ''
    expect(text).toContain('2026-09-21')
    expect(text).toContain('Instagram')
    expect(text.indexOf('Influencer post went live')).toBeGreaterThan(text.indexOf('Instagram'))
  })

  test('a long note wraps inside the box instead of stretching it', () => {
    const c = render(<NotedTooltip {...P} note={'x'.repeat(80)} />).container
    const note = [...c.querySelectorAll('p')].find((el) => el.textContent === 'x'.repeat(80)) as HTMLElement
    expect(note.style.whiteSpace).toBe('normal')
  })
})

describe('layoutPins', () => {
  const PLOT = { x: 60, width: 732 }

  test('cards far apart share the top row, each centred on its dot', () => {
    expect(layoutPins([{ x: 'a', px: 300 }, { x: 'b', px: 700 }], PLOT)).toEqual([
      { x: 'a', left: 160, tier: 0 }, { x: 'b', left: 512, tier: 0 },
    ])
  })

  test('neighbouring days stack into rows instead of overlapping', () => {
    const r = layoutPins([{ x: 'a', px: 400 }, { x: 'b', px: 424 }, { x: 'c', px: 448 }], PLOT)
    expect(r.map((p) => p.tier)).toEqual([0, 1, 2])
  })

  test('the first and last days stay inside the plot', () => {
    const r = layoutPins([{ x: 'first', px: 60 }, { x: 'last', px: 792 }], PLOT)
    expect(r).toEqual([{ x: 'first', left: 60, tier: 0 }, { x: 'last', left: 792 - PIN_CARD_WIDTH, tier: 0 }])
  })

  test('the order they arrive in does not matter', () => {
    const a = layoutPins([{ x: 'b', px: 700 }, { x: 'a', px: 300 }], PLOT)
    expect(a.map((p) => p.x)).toEqual(['a', 'b'])
  })

  test('a plot narrower than a card puts each card at its left edge, one per row', () => {
    const r = layoutPins([{ x: 'a', px: 100 }, { x: 'b', px: 150 }], { x: 60, width: 200 })
    expect(r).toEqual([{ x: 'a', left: 60, tier: 0 }, { x: 'b', left: 60, tier: 1 }])
  })
})

describe('LineChart pins', () => {
  // Invented values. Day i of 31 sits at 60 + i / 30 * 732 in an 800 wide chart.
  const DAYS = Array.from({ length: 31 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`)
  const DATA = DAYS.map((date, i) => ({ date, v: 3 + ((i * 7) % 11) }))
  const AT = [DAYS[0], DAYS[9], DAYS[30]]
  const draw = () => render(
    <LineChart data={DATA} xKey="date" yKeys={[{ key: 'v' }]} marks={AT.map((x) => ({ x }))}
      pins={AT.map((x) => ({ x, content: <span>{`card ${x}`}</span> }))} />,
  )
  const num = (el: Element, a: string) => Number(el.getAttribute(a))

  test('each connector ends exactly on its dot', () => {
    const { container } = draw()
    const dots = [...container.querySelectorAll('.recharts-reference-dot circle, .recharts-reference-dot-dot')]
    const lines = [...container.querySelectorAll('line[data-pin-line]')]
    expect(lines).toHaveLength(3)
    lines.forEach((l, i) => {
      expect(num(l, 'x2')).toBeCloseTo(num(dots[i], 'cx'), 1)
      expect(num(l, 'y2')).toBeCloseTo(num(dots[i], 'cy'), 1)
    })
  })

  test('cards sit above the plot, inside it, stacked only where they would overlap', () => {
    const { container } = draw()
    const cards = [...container.querySelectorAll<HTMLElement>('[data-pin-card]')]
    expect(cards.map((c) => c.dataset.pinCard)).toEqual(AT)
    expect(cards.map((c) => parseFloat(c.style.left))).toEqual([60, expect.closeTo(139.6, 1), 512])
    expect(cards.map((c) => c.style.top)).toEqual(['0px', '88px', '0px'])
  })

  test('a card shows what it was given', () => {
    draw()
    expect(screen.getByText(`card ${DAYS[9]}`)).toBeTruthy()
  })

  test("a muted pin (the team's hidden or draft card) has a faded line, and neither line nor card prints", () => {
    const { container } = render(
      <LineChart data={DATA} xKey="date" yKeys={[{ key: 'v' }]} pins={[{ x: DAYS[9], muted: true, content: <span>m</span> }]} />,
    )
    const line = container.querySelector('line[data-pin-line]')!
    expect(line.getAttribute('class')).toContain('no-print')
    expect(line.getAttribute('stroke-opacity')).toBe('0.4')
    expect(container.querySelector('[data-pin-card]')!.className).toContain('no-print')
  })

  test('the line is the red of the approved sketch', () => {
    const { container } = draw()
    expect(container.querySelector('line[data-pin-line]')!.getAttribute('stroke')).toBe('#E24B4A')
  })

  test("the team's taller cards stack by their own height", () => {
    const { container } = render(
      <LineChart data={DATA} xKey="date" yKeys={[{ key: 'v' }]} pinHeight={112}
        pins={AT.map((x) => ({ x, content: <span>{x}</span> }))} />,
    )
    expect([...container.querySelectorAll<HTMLElement>('[data-pin-card]')].map((c) => c.style.top)).toEqual(['0px', '120px', '0px'])
  })

  test('with no pins there is no card, no connector and no extra wrapper', () => {
    const { container } = render(<LineChart data={DATA} xKey="date" yKeys={[{ key: 'v' }]} marks={[{ x: DAYS[9] }]} />)
    expect(container.querySelector('[data-pin-card]')).toBeNull()
    expect(container.querySelector('line[data-pin-line]')).toBeNull()
    expect(container.querySelector('.relative')).toBeNull()
  })
})
