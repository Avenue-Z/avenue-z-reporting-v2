import { describe, expect, test } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import type { PaidMediaTrend as Trend } from '@/lib/paid-media/trend'

// LineChart renders Recharts (no layout under jsdom) — mock it and record the props it receives.
let lastProps: { xKey?: string; valueFormat?: string; data?: unknown[]; yKeys?: { key: string }[] } = {}
vi.mock('@/components/charts/line-chart', () => ({
  LineChart: (p: typeof lastProps) => { lastProps = p; return <div data-testid="line" /> },
}))

import { PaidMediaTrendChart } from './trend'

const trend: Trend = {
  channels: ['paid-search', 'meta'],
  points: [
    { date: '2026-08-06', channels: { 'paid-search': { spend: 100, clicks: 10 }, meta: { spend: 50, clicks: 4 } } },
  ],
}

describe('PaidMediaTrendChart', () => {
  test('renders one line per channel; defaults to Spend (currency) and toggles to Clicks', () => {
    render(<PaidMediaTrendChart trend={trend} />)
    // A line per channel (not a stacked area), plotted daily by date — the x-axis label
    // density then tracks the range, matching Organic Social.
    expect(lastProps.xKey).toBe('date')
    expect(lastProps.valueFormat).toBe('currency-cents')
    expect(lastProps.yKeys?.map((k) => k.key)).toEqual(['Paid Search', 'Meta'])
    // Spend value plotted for Paid Search.
    expect((lastProps.data as Record<string, number>[])[0]['Paid Search']).toBe(100)

    fireEvent.click(screen.getByRole('button', { name: /^clicks$/i }))
    expect(lastProps.valueFormat).toBeUndefined() // clicks → raw number
    expect((lastProps.data as Record<string, number>[])[0]['Paid Search']).toBe(10)
  })

  test('channel pills hide a channel by dropping its line', () => {
    render(<PaidMediaTrendChart trend={trend} />)
    expect(lastProps.yKeys?.map((k) => k.key)).toEqual(['Paid Search', 'Meta'])
    // Turn Meta off via its pill → only Paid Search line remains.
    fireEvent.click(screen.getByRole('button', { name: /^meta$/i }))
    expect(lastProps.yKeys?.map((k) => k.key)).toEqual(['Paid Search'])
    // Toggle it back on.
    fireEvent.click(screen.getByRole('button', { name: /^meta$/i }))
    expect(lastProps.yKeys?.map((k) => k.key)).toEqual(['Paid Search', 'Meta'])
  })

  test('empty trend → placeholder, no chart', () => {
    render(<PaidMediaTrendChart trend={{ channels: [], points: [] }} />)
    expect(screen.queryByTestId('line')).not.toBeInTheDocument()
    expect(screen.getByText(/no trend data/i)).toBeInTheDocument()
  })
})
