import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GeoSection } from './geo-section'
import type { GeoRegion } from '@/lib/paid-search/types'

// The Recharts bar chart needs layout that jsdom doesn't provide; it is not
// under test here.
vi.mock('@/components/charts/bar-chart', () => ({ BarChart: () => null }))

// 12 regions so the table shows the top 10 while the total must cover all 12.
const rows: GeoRegion[] = Array.from({ length: 12 }, (_, i) => {
  const n = i + 1
  return { region: `R${String(n).padStart(2, '0')}`, clicks: n, cost: n * 10, leads: n, dmas: [] }
})

describe('GeoSection Region → DMA total', () => {
  test('displays the top 10 regions but totals all regions', () => {
    const { container } = render(<GeoSection rows={rows} />)

    // Only the top 10 regions render as clickable body rows.
    const regionRows = container.querySelectorAll('tbody tr.cursor-pointer')
    expect(regionRows.length).toBe(10)

    // Total row covers ALL 12 regions: clicks/leads = sum(1..12) = 78,
    // cost = 10 * 78 = $780. Top-10-only would be 55 / $550. Cost renders in
    // cents (Paid Media money formatter, item 11d).
    expect(screen.getByText('All Regions')).toBeInTheDocument()
    expect(screen.getByText('(12)')).toBeInTheDocument()
    expect(screen.getByText('$780.00')).toBeInTheDocument()
    expect(screen.getAllByText('78').length).toBe(2) // clicks + leads in the total row
  })
})
