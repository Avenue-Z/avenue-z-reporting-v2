import { describe, expect, test } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import type { PaidMediaTrend as Trend } from '@/lib/paid-media/trend'

// AreaChart renders Recharts (no layout under jsdom) — mock it and record the props it receives.
let lastProps: { valueFormat?: string; stacked?: boolean; data?: unknown[]; yKeys?: { key: string }[] } = {}
vi.mock('@/components/charts/area-chart', () => ({
  AreaChart: (p: typeof lastProps) => { lastProps = p; return <div data-testid="area" /> },
}))

import { PaidMediaTrendChart } from './trend'

const trend: Trend = {
  channels: ['paid-search', 'meta'],
  points: [
    { week: '2026-08-03', label: 'Aug 3', channels: { 'paid-search': { spend: 100, clicks: 10 }, meta: { spend: 50, clicks: 4 } } },
  ],
}

describe('PaidMediaTrendChart', () => {
  test('defaults to Spend (cents format) and toggles to Clicks', () => {
    render(<PaidMediaTrendChart trend={trend} />)
    expect(lastProps.valueFormat).toBe('currency-cents')
    expect(lastProps.stacked).toBe(true)
    // Spend value plotted for Paid Search.
    expect((lastProps.data as Record<string, number>[])[0]['Paid Search']).toBe(100)

    fireEvent.click(screen.getByRole('button', { name: /clicks/i }))
    expect(lastProps.valueFormat).toBeUndefined() // clicks → raw number
    expect((lastProps.data as Record<string, number>[])[0]['Paid Search']).toBe(10)
  })

  test('empty trend → placeholder, no chart', () => {
    render(<PaidMediaTrendChart trend={{ channels: [], points: [] }} />)
    expect(screen.queryByTestId('area')).not.toBeInTheDocument()
    expect(screen.getByText(/no trend data/i)).toBeInTheDocument()
  })
})
