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
