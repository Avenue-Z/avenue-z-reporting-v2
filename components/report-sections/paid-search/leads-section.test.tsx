import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LeadsSection } from './leads-section'
import type { LeadBreakdown } from '@/lib/paid-search/types'

// The Recharts combo chart needs layout jsdom doesn't provide; not under test.
vi.mock('@/components/charts/combo-chart', () => ({ ComboChart: () => null }))

const data: LeadBreakdown = {
  byAction: [
    { name: 'Employer Form', category: 'employer', count: 100 },
    { name: 'Broker Form', category: 'broker', count: 20 },
    { name: 'Contact Form', category: 'contact', count: 8 },
  ],
  categoryTotals: { employer: 100, broker: 20, contact: 8 },
  trend: [],
  totalLeads: 128,
}

describe('LeadsSection Total Leads', () => {
  test('renders a Total Leads figure from data.totalLeads', () => {
    render(<LeadsSection data={data} />)
    expect(screen.getByText('Total Leads')).toBeInTheDocument()
    expect(screen.getByText('128')).toBeInTheDocument()
  })
})
