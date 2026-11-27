import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ModelGauge, gaugeArc } from './gauge'
import type { ModelMetricV2 } from '@/lib/aeo/v2/types'

describe('gaugeArc', () => {
  test('maps 0, 50 and 100 to -90, 0 and 90', () => {
    expect(gaugeArc(0).angle).toBe(-90)
    expect(gaugeArc(50).angle).toBe(0)
    expect(gaugeArc(100).angle).toBe(90)
  })
  test('clamps for drawing only', () => {
    expect(gaugeArc(130).angle).toBe(90)
    expect(gaugeArc(-5).angle).toBe(-90)
  })
  test('null is not filled', () => {
    expect(gaugeArc(null)).toEqual({ angle: -90, filled: false })
  })
})

const metric = (over: Partial<ModelMetricV2> = {}): ModelMetricV2 => ({
  you: 42.3,
  youPrior: 45.4,
  competitorAvg: 46.2,
  ...over,
})
const gauge = (m: ModelMetricV2, showDeltas = true) => (
  <ModelGauge model="ChatGPT" metric={m} metricLabel="Visibility" showDeltas={showDeltas} compareSuffix="vs previous period" />
)

describe('ModelGauge', () => {
  test('shows a falling change in the bad tone', () => {
    render(gauge(metric()))
    const el = screen.getByText('-3.1 pts vs previous period')
    expect(el.className).toContain('text-[#FF4444]')
  })
  test('no prior reads No comparison data with no tone class', () => {
    render(gauge(metric({ youPrior: null })))
    const el = screen.getByText('No comparison data')
    expect(el.className).not.toContain('text-[#FF4444]')
    expect(el.className).not.toContain('text-[#60FF80]')
  })
  test('showDeltas false hides the change line', () => {
    render(gauge(metric(), false))
    expect(screen.queryByText(/vs previous period/)).toBeNull()
    expect(screen.queryByText('No comparison data')).toBeNull()
  })
  test('null competitor average has no tick', () => {
    const { container } = render(gauge(metric({ competitorAvg: null })))
    expect(container.querySelector('[data-tick]')).toBeNull()
    expect(screen.getByText('Competitor avg –')).toBeTruthy()
  })
  test('competitor average draws one tick and prints', () => {
    const { container } = render(gauge(metric()))
    expect(container.querySelectorAll('[data-tick]')).toHaveLength(1)
    expect(screen.getByText('Competitor avg 46.2%')).toBeTruthy()
  })
  test('you 0 draws the track only, no fill path', () => {
    const { container } = render(gauge(metric({ you: 0 })))
    expect(container.querySelectorAll('path')).toHaveLength(1)
    expect(screen.getByText('0.0%')).toBeTruthy()
  })
  test('the tick for a 46.2% competitor average sits at -6.84 degrees, radius 41 to 59', () => {
    // The same formula as the gauge: angle = -90 + v / 100 * 180 on a 50-radius arc centred at (60, 60), tick 9 either side.
    const angle = -90 + (46.2 / 100) * 180
    expect(angle).toBeCloseTo(-6.84, 10)
    expect(gaugeArc(46.2).angle).toBeCloseTo(angle, 10)
    const rad = (angle * Math.PI) / 180
    const at = (r: number) => ({ x: 60 + r * Math.sin(rad), y: 60 - r * Math.cos(rad) })
    const tick = render(gauge(metric())).container.querySelector('[data-tick]')!
    const [inner, outer] = [at(41), at(59)]
    expect(Number(tick.getAttribute('x1'))).toBeCloseTo(inner.x, 10)
    expect(Number(tick.getAttribute('y1'))).toBeCloseTo(inner.y, 10)
    expect(Number(tick.getAttribute('x2'))).toBeCloseTo(outer.x, 10)
    expect(Number(tick.getAttribute('y2'))).toBeCloseTo(outer.y, 10)
    // Left of centre and just under the top of the arc.
    expect(inner.x).toBeLessThan(60)
    expect(outer.y).toBeCloseTo(1.42, 2)
  })
  test('null value prints a dash', () => {
    render(gauge(metric({ you: null })))
    expect(screen.getByText('–')).toBeTruthy()
  })
  test('out of range value prints the real number', () => {
    render(gauge(metric({ you: 130 })))
    expect(screen.getByText('130.0%')).toBeTruthy()
  })
  test('labelled image and export block', () => {
    const { container } = render(gauge(metric()))
    const svg = container.querySelector('svg[role="img"]')
    expect(svg?.getAttribute('aria-label')).toBe('ChatGPT: Visibility 42.3%')
    expect(container.querySelectorAll('[data-export-block]')).toHaveLength(1)
  })
})
