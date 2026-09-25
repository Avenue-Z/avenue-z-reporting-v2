import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { LineChart, niceYDomain, MIN_SPAN_FRACTION } from './line-chart'
import { PIN_CARD_WIDTH, PIN_LINE_COLOR, PIN_STUB } from './pins'
import { CHART_COLORS } from '@/lib/constants'
import type { ReactElement } from 'react'

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  const { cloneElement } = await import('react')
  // Records the props the chart hands Recharts' Tooltip, then renders the real one.
  const Tooltip = (props: Record<string, unknown>) => { tooltipProps.push(props); return <actual.Tooltip {...props} /> }
  return {
    ...actual,
    Tooltip,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) =>
      cloneElement(children, { width: 800, height: 300 }),
  }
})
const { tooltipProps } = vi.hoisted(() => ({ tooltipProps: [] as Record<string, unknown>[] }))

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

import { act, fireEvent, render, screen } from '@testing-library/react'
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

describe('LineChart callouts (Phase 2b: dots only, a card on hover, focus or tap)', () => {
  // Invented values. Day i of 31 sits at 60 + i / 30 * 732 in an 800 wide chart (proof 4).
  const DAYS = Array.from({ length: 31 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`)
  const DATA = DAYS.map((date, i) => ({ date, v: 3 + ((i * 7) % 11) }))
  const SHOWN = [DAYS[0], DAYS[9], DAYS[30]]
  const MUTED = DAYS[20]
  const callouts = [
    ...SHOWN.map((x) => ({ x, label: `label ${x}`, content: <span>{`card ${x}`}</span> })),
    { x: MUTED, label: `label ${MUTED}`, muted: true, content: <span>{`card ${MUTED}`}</span> },
  ]
  const draw = () => render(<LineChart data={DATA} xKey="date" yKeys={[{ key: 'v' }]} marks={SHOWN.map((x) => ({ x }))} callouts={callouts} />)
  const hit = (c: HTMLElement, x: string) => c.querySelector(`[data-callout-hit="${x}"]`) as HTMLButtonElement
  // A hit area is a button in the HTML layer above the chart, centred on its dot by left and top.
  const hx = (el: HTMLElement) => parseFloat(el.style.left)
  const hy = (el: HTMLElement) => parseFloat(el.style.top)
  // A card above its dot is anchored by its bottom: calc(100% - Npx) from the chart's top (C6).
  const bottomOf = (el: HTMLElement) => Number(el.style.bottom.match(/^calc\(100% - ([\d.]+)px\)$/)?.[1])
  const card = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-callout-card]')
  const num = (el: Element, a: string) => Number(el.getAttribute(a))
  const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })
  // jsdom lays nothing out, so the card's measured height is set here, per test.
  let cardHeight = 60
  // Where the chart sits down the screen: room above a dot is measured from the top of the scrolling
  // area (here the window, since jsdom has no scrolling ancestor), so this is the wrapper's top.
  let wrapperTop = 0
  let rect: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    vi.useFakeTimers()
    cardHeight = 60
    wrapperTop = 0
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true, get(this: HTMLElement) { return this.dataset?.calloutCard ? cardHeight : 0 },
    })
    rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const top = typeof this.className === 'string' && this.className.split(' ').includes('relative') ? wrapperTop : 0
      return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON() { return {} } } as DOMRect
    })
  })
  afterEach(() => { vi.useRealTimers(); rect.mockRestore(); delete (HTMLElement.prototype as { offsetHeight?: number }).offsetHeight })

  test('each hit area sits exactly on Recharts\' own dot', () => {
    const { container } = draw()
    // The marks: Recharts' default dot class. A callout's own spot is a ReferenceDot too (D17), but it
    // never draws that class.
    const dots = [...container.querySelectorAll('.recharts-reference-dot-dot')]
    SHOWN.forEach((x, i) => {
      expect(hx(hit(container, x))).toBeCloseTo(num(dots[i], 'cx'), 1)
      expect(hy(hit(container, x))).toBeCloseTo(num(dots[i], 'cy'), 1)
    })
  })

  // Seen live (2026-09-24, Joy of Life Instagram): on a follower graph Recharts widens the axis to whole
  // ticks (asked for -1.5..3.5, drew -2..4), and the hit areas, placed from the domain we asked for,
  // sat 17px above their dots, so a click on the dot missed. Every position now comes from the dot.
  test('on an axis Recharts widens, every hit area, faint dot and red line sit on the dot it draws', () => {
    const WIDE = DAYS.map((date, i) => ({ date, v: [-1, 0, 3, 1, 2, 0, -1, 2][i % 8] }))
    const days = [DAYS[2], DAYS[4], DAYS[10], DAYS[14]]
    const muted = DAYS[4]
    const cs = days.map((x) => ({ x, label: `label ${x}`, muted: x === muted, content: <span>{`card ${x}`}</span> }))
    // A mark on every callout day, so each has Recharts' own dot to compare against.
    const { container } = render(<LineChart data={WIDE} xKey="date" yKeys={[{ key: 'v' }]} marks={days.map((x) => ({ x }))} callouts={cs} />)
    const ticks = [...container.querySelectorAll('.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value')].map((t) => t.textContent)
    // Recharts widened the axis past the domain asked for (niceYDomain gives -1.5..3.5), as it did live.
    expect(Math.max(...ticks.map(Number))).toBeGreaterThan(3.5)
    const marks = [...container.querySelectorAll('.recharts-reference-dot-dot')]
    const markAt = (x: number) => marks.find((m) => Math.abs(num(m, 'cx') - x) < 0.5)!
    for (const x of days) {
      const h = hit(container, x)
      expect(num(markAt(hx(h)), 'cy')).toBeCloseTo(hy(h), 1)
    }
    const faint = container.querySelector(`[data-callout-faint="${muted}"]`)!
    expect(num(faint, 'cy')).toBeCloseTo(num(markAt(num(faint, 'cx')), 'cy'), 1)
    fireEvent.click(hit(container, DAYS[10]))
    const stub = container.querySelector('line[data-callout-stub]')!
    expect(num(stub, 'y2')).toBeCloseTo(num(markAt(num(stub, 'x2')), 'cy'), 1)
  })

  test('a callout on a day with no value still gets a hit area, at the bottom of the plot', () => {
    const GAP = DATA.map((d, i) => (i === 20 ? { date: d.date } : d)) as Record<string, string | number>[]
    const cs = [DAYS[9], DAYS[20]].map((x) => ({ x, label: `label ${x}`, content: <span>{`card ${x}`}</span> }))
    const { container } = render(<LineChart data={GAP} xKey="date" yKeys={[{ key: 'v' }]} marks={[{ x: DAYS[9] }]} callouts={cs} />)
    const gap = hit(container, DAYS[20])
    expect(gap).toBeTruthy()
    expect(hy(gap)).toBeGreaterThan(hy(hit(container, DAYS[9])))
    fireEvent.click(gap)
    expect(card(container)!.dataset.calloutCard).toBe(DAYS[20])
  })

  // Paul's review of #273 (C1, blocking): a refresh that removes a callout (a deleted draft, a top day
  // that moved) left its spot in the layout for one render, and the hit area's lookup threw, taking the
  // whole report page to its error boundary.
  test('a callout removed on the next render drops its hit area instead of throwing', () => {
    const { container, rerender } = draw()
    expect(hit(container, DAYS[9])).toBeTruthy()
    const fewer = callouts.filter((c) => c.x !== DAYS[9])
    expect(() => rerender(<LineChart data={DATA} xKey="date" yKeys={[{ key: 'v' }]} marks={SHOWN.filter((x) => x !== DAYS[9]).map((x) => ({ x }))} callouts={fewer} />)).not.toThrow()
    expect(hit(container, DAYS[9])).toBeNull()
    expect(hit(container, DAYS[0])).toBeTruthy()
  })

  test('an open card whose callout is removed closes, and the hover box goes back to Recharts', () => {
    const { container, rerender } = draw()
    fireEvent.click(hit(container, DAYS[9]))
    expect(card(container)!.dataset.calloutCard).toBe(DAYS[9])
    tooltipProps.length = 0
    const fewer = callouts.filter((c) => c.x !== DAYS[9])
    rerender(<LineChart data={DATA} xKey="date" yKeys={[{ key: 'v' }]} marks={SHOWN.filter((x) => x !== DAYS[9]).map((x) => ({ x }))} callouts={fewer} />)
    expect(card(container)).toBeNull()
    expect(container.querySelector('line[data-callout-stub]')).toBeNull()
    expect(tooltipProps.at(-1)!.active).toBeUndefined()
    // The same day coming back later (a note added again) does not reopen its card on its own.
    rerender(<LineChart data={DATA} xKey="date" yKeys={[{ key: 'v' }]} marks={SHOWN.map((x) => ({ x }))} callouts={callouts} />)
    expect(card(container)).toBeNull()
  })

  test('every dot is a real button named by its callout, with a pointer cursor and a 28px hit area', () => {
    const { container } = draw()
    const h = hit(container, DAYS[9])
    expect(h.tagName).toBe('BUTTON')
    expect(h.getAttribute('type')).toBe('button')
    expect(h.getAttribute('aria-label')).toBe(`label ${DAYS[9]}`)
    expect(h.getAttribute('aria-expanded')).toBe('false')
    for (const c of ['h-7', 'w-7', 'cursor-pointer', 'no-print']) expect(h.className).toContain(c)
    expect(container.querySelectorAll('[data-callout-hit]')).toHaveLength(4)
  })

  // Found live on 2026-09-24: inside the SVG, Recharts paints its line and dots after any extra
  // children, so at a dot's centre they sat on top and a real mouse never reached the hit area.
  test("the hit areas sit above the chart, outside its SVG, so Recharts' own layers can never cover them", () => {
    const { container } = draw()
    const h = hit(container, DAYS[9])
    expect(h.closest('svg')).toBeNull()
    expect(h.parentElement!.className).toContain('relative')
    expect(h.parentElement!.querySelector('svg')).not.toBeNull()
  })

  test('a mouse resting on a dot opens its card after 100ms, not before, so a sweep never flashes cards', () => {
    const { container } = draw()
    fireEvent.pointerEnter(hit(container, DAYS[9]))
    wait(99)
    expect(card(container)).toBeNull()
    wait(1)
    expect(card(container)!.dataset.calloutCard).toBe(DAYS[9])
    expect(hit(container, DAYS[9]).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(`card ${DAYS[9]}`)).toBeTruthy()
  })

  test('a mouse passing over a dot without resting opens nothing', () => {
    const { container } = draw()
    fireEvent.pointerEnter(hit(container, DAYS[9]))
    wait(60)
    fireEvent.pointerLeave(hit(container, DAYS[9]))
    wait(500)
    expect(card(container)).toBeNull()
  })

  test('the card is centred on its dot and kept inside the plot at the edges', () => {
    const { container } = draw()
    const leftOf = (x: string) => { fireEvent.click(hit(container, x)); return parseFloat(card(container)!.style.left) }
    expect(leftOf(DAYS[9])).toBeCloseTo(hx(hit(container, DAYS[9])) - PIN_CARD_WIDTH / 2, 1)
    expect(leftOf(DAYS[0])).toBe(60)
    expect(leftOf(DAYS[30])).toBe(60 + 732 - PIN_CARD_WIDTH)
    expect(card(container)!.style.width).toBe(`${PIN_CARD_WIDTH}px`)
  })

  // Amended after my local look: callouts are the top days, near the top of the chart, so "above when
  // it fits in the chart" sent nearly every card below, over the graph. The mockup puts it above.
  test('the card sits above its dot, rising past the top of the chart, when the screen has room', () => {
    wrapperTop = 300
    cardHeight = 100
    const { container } = draw()
    const cy = hy(hit(container, DAYS[9]))
    fireEvent.click(hit(container, DAYS[9]))
    // Its bottom sits just above the red line, so it rises from there whatever its height.
    expect(bottomOf(card(container)!)).toBeCloseTo(cy - PIN_STUB, 1)
    expect(card(container)!.style.top).toBe('')
    expect(cy - PIN_STUB - 100).toBeLessThan(0)
  })

  // Paul's review of #273 (C6): the card was placed from the height measured when it opened, so a card
  // that then grew (Hide adds "Hidden from client", a failed Approve adds its message) reached down
  // over its dot and the red line. Anchored by its bottom, it grows upward.
  test('a card above its dot that grows after opening still ends above the red line', () => {
    wrapperTop = 300
    cardHeight = 100
    const { container, rerender } = draw()
    const cy = hy(hit(container, DAYS[9]))
    fireEvent.click(hit(container, DAYS[9]))
    cardHeight = 160
    rerender(<LineChart data={DATA} xKey="date" yKeys={[{ key: 'v' }]} marks={SHOWN.map((x) => ({ x }))} callouts={callouts} />)
    expect(bottomOf(card(container)!)).toBeCloseTo(cy - PIN_STUB, 1)
    expect(card(container)!.style.top).toBe('')
  })

  test('the card drops below its dot only when the screen has no room above it', () => {
    wrapperTop = 0
    cardHeight = 400
    const { container } = draw()
    const cy = hy(hit(container, DAYS[9]))
    fireEvent.click(hit(container, DAYS[9]))
    expect(parseFloat(card(container)!.style.top)).toBeCloseTo(cy + PIN_STUB, 1)
  })

  test('an open card sits above the sticky report header (z-40 over its z-30)', () => {
    const { container } = draw()
    fireEvent.click(hit(container, DAYS[9]))
    expect(card(container)!.className).toContain('z-40')
  })

  test('leaving closes the card after 150ms, and moving into the card keeps it open', () => {
    const { container } = draw()
    fireEvent.pointerEnter(hit(container, DAYS[9]))
    wait(100)
    fireEvent.pointerLeave(hit(container, DAYS[9]))
    wait(149)
    expect(card(container)).not.toBeNull()
    fireEvent.pointerEnter(card(container)!)
    wait(500)
    expect(card(container)).not.toBeNull()
    fireEvent.pointerLeave(card(container)!)
    wait(150)
    expect(card(container)).toBeNull()
  })

  test('Enter on a focused dot opens its card at once and moves focus into it', () => {
    const { container } = draw()
    hit(container, DAYS[9]).focus()
    fireEvent.keyDown(hit(container, DAYS[9]), { key: 'Enter' })
    const c = card(container)!
    expect(c.getAttribute('role')).toBe('group')
    expect(c.getAttribute('aria-label')).toBe(`label ${DAYS[9]}`)
    expect(document.activeElement).toBe(c)
  })

  test('Escape closes the card and returns focus to its dot', () => {
    const { container } = draw()
    fireEvent.keyDown(hit(container, DAYS[9]), { key: ' ' })
    fireEvent.keyDown(card(container)!, { key: 'Escape' })
    expect(card(container)).toBeNull()
    expect(document.activeElement).toBe(hit(container, DAYS[9]))
  })

  test('a tap opens a card, a second tap on the same dot keeps it open, and a tap outside closes it', () => {
    const { container } = draw()
    fireEvent.click(hit(container, DAYS[9]))
    expect(card(container)).not.toBeNull()
    fireEvent.click(hit(container, DAYS[9]))
    expect(card(container)).not.toBeNull()
    fireEvent.pointerDown(card(container)!)
    expect(card(container)).not.toBeNull()
    fireEvent.pointerDown(document.body)
    expect(card(container)).toBeNull()
  })

  // Paul's review of #273 (C8): the outside-tap check spared any dot on the page, so a tap on the other
  // graph's dot left this graph's card open too.
  test("a tap on another chart's dot closes this chart's card: one card at a time on the page", () => {
    const one = () => <LineChart data={DATA} xKey="date" yKeys={[{ key: 'v' }]} marks={SHOWN.map((x) => ({ x }))} callouts={callouts} />
    const { container } = render(<><div data-chart="a">{one()}</div><div data-chart="b">{one()}</div></>)
    const a = container.querySelector('[data-chart="a"]') as HTMLElement
    const b = container.querySelector('[data-chart="b"]') as HTMLElement
    fireEvent.click(hit(a, DAYS[9]))
    expect(card(a)).toBeTruthy()
    fireEvent.pointerDown(hit(b, DAYS[0]))
    expect(card(a)).toBeNull()
  })

  // Paul's review of #273 (C15): CLAUDE.md keeps every chart colour in CHART_COLORS.
  test('the red line and the faint dots take their colours from CHART_COLORS', () => {
    expect(PIN_LINE_COLOR).toBe(CHART_COLORS.callout)
    const { container } = draw()
    expect(container.querySelector(`[data-callout-faint="${MUTED}"]`)!.getAttribute('stroke')).toBe(CHART_COLORS.neutral)
  })

  test('one card at a time', () => {
    const { container } = draw()
    fireEvent.click(hit(container, DAYS[0]))
    fireEvent.click(hit(container, DAYS[30]))
    expect(container.querySelectorAll('[data-callout-card]')).toHaveLength(1)
    expect(card(container)!.dataset.calloutCard).toBe(DAYS[30])
  })

  test("a muted callout (the team's hidden or draft day) has a faint dot that never prints, and opens like any other", () => {
    const { container } = draw()
    const faint = container.querySelector(`[data-callout-faint="${MUTED}"]`)!
    expect(faint.getAttribute('class')).toContain('no-print')
    expect(faint.getAttribute('stroke-dasharray')).toBeTruthy()
    expect(num(faint, 'cx')).toBeCloseTo(hx(hit(container, MUTED)), 1)
    fireEvent.click(hit(container, MUTED))
    expect(card(container)!.dataset.calloutCard).toBe(MUTED)
  })

  test('the red line joins the dot to its card, and neither the line nor the card prints', () => {
    const { container } = draw()
    fireEvent.click(hit(container, DAYS[9]))
    const stub = container.querySelector('line[data-callout-stub]')!
    expect(stub.getAttribute('stroke')).toBe(PIN_LINE_COLOR)
    expect(num(stub, 'x1')).toBeCloseTo(hx(hit(container, DAYS[9])), 1)
    expect(num(stub, 'y2')).toBeCloseTo(hy(hit(container, DAYS[9])), 1)
    expect(stub.getAttribute('class')).toContain('no-print')
    // Seen live: at 12px the dot (r 5, stroke 2) covered half the line. 20px shows it past the dot.
    expect(Math.abs(num(stub, 'y1') - num(stub, 'y2'))).toBe(20)
    expect(card(container)!.className).toContain('no-print')
  })

  test('the hover box is hidden while a card is open, and left to Recharts otherwise', () => {
    const { container } = draw()
    const last = () => tooltipProps[tooltipProps.length - 1]
    expect(last().active).toBeUndefined()
    fireEvent.click(hit(container, DAYS[9]))
    expect(last().active).toBe(false)
    fireEvent.pointerDown(document.body)
    expect(last().active).toBeUndefined()
  })

  test('with no callouts the Tooltip is handed no active prop at all', () => {
    render(<LineChart data={DATA} xKey="date" yKeys={[{ key: 'v' }]} />)
    expect('active' in tooltipProps[tooltipProps.length - 1]).toBe(false)
  })

  test('with no callouts there is no hit area, no card and no extra wrapper', () => {
    const { container } = render(<LineChart data={DATA} xKey="date" yKeys={[{ key: 'v' }]} marks={[{ x: DAYS[9] }]} />)
    expect(container.querySelector('[data-callout-hit]')).toBeNull()
    expect(container.querySelector('[data-callout-card]')).toBeNull()
    expect(container.querySelector('.relative')).toBeNull()
  })
})
