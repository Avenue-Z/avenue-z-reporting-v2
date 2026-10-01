import { describe, expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { KpiCard } from './kpi-card'

describe('KpiCard tooltip stacking', () => {
  test('tooltip floats above the sticky header (z-40, not z-10)', () => {
    const { container } = render(<KpiCard title="Clicks" value="1,234" tooltip="Blended across channels" />)
    // The sticky report header is z-30; the tooltip must sit above it.
    const tip = container.querySelector('.z-40')
    expect(tip).not.toBeNull()
    expect(tip?.textContent).toContain('Blended across channels')
    expect(container.querySelector('.z-10')).toBeNull()
  })
})

describe('KpiCard change line', () => {
  const line = (c: HTMLElement) => [...c.querySelectorAll('p')].map((p) => p.textContent).find((t) => t?.includes('vs prior period'))

  test('without wholeDelta the change keeps one decimal', () => {
    const { container } = render(<KpiCard title="Views" value="10" delta={6.34} />)
    expect(line(container)).toBe('↑ 6.3% vs prior period')
  })

  test('with wholeDelta the change is whole from 1%, one decimal under it, and the arrow follows the shown value', () => {
    const r = (delta: number) => line(render(<KpiCard title="Views" value="10" delta={delta} wholeDelta />).container)
    expect(r(6.34)).toBe('↑ 6% vs prior period')
    expect(r(6.57)).toBe('↑ 7% vs prior period')
    expect(r(-6.57)).toBe('↓ 7% vs prior period')
    expect(r(0.3)).toBe('↑ 0.3% vs prior period')
    expect(r(-0.42)).toBe('↓ 0.4% vs prior period')
    expect(r(0.96)).toBe('↑ 1% vs prior period')
    expect(r(0.04)).toBe('— 0% vs prior period')
  })

  test('a change that rounds to zero is muted, not green', () => {
    const { container } = render(<KpiCard title="Views" value="10" delta={0.04} wholeDelta />)
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
