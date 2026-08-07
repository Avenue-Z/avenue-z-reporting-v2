import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KpiGrid } from './kpi-grid'
import type { Kpi } from '@/lib/paid-search/types'

describe('KpiGrid money formatting (Paid Media cents, item 11d)', () => {
  test('a money KPI renders with cents; a sub-dollar cost does not collapse', () => {
    const kpis: Kpi[] = [
      { key: 'cost', label: 'Cost', value: 1234.5, format: 'money' },
      { key: 'cpc', label: 'Avg. CPC', value: 0.42, format: 'money', invertDelta: true },
      { key: 'clicks', label: 'Clicks', value: 1234 },
    ]
    render(<KpiGrid kpis={kpis} />)

    // Money KPIs show two decimals with thousands separators.
    expect(screen.getByText('$1,234.50')).toBeInTheDocument()
    // Sub-dollar cost keeps its cents rather than rounding to $0.
    expect(screen.getByText('$0.42')).toBeInTheDocument()
    // Non-money numeric KPI is unaffected (no dollar sign, integer formatting).
    expect(screen.getByText('1,234')).toBeInTheDocument()
  })

  test('a money KPI with a null value renders the dash, not $0.00 or $NaN', () => {
    const kpis: Kpi[] = [
      { key: 'cpl', label: 'Cost / Lead', value: null, format: 'money', invertDelta: true },
      { key: 'cost', label: 'Cost', value: 0, format: 'money' }, // a real zero stays $0.00
    ]
    render(<KpiGrid kpis={kpis} />)
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('$0.00')).toBeInTheDocument()
  })
})
