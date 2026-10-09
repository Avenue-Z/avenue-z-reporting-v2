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
import { ExportModeProvider } from '@/components/export/export-mode'

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
    // Paid Media keeps its raw dates: only Organic Social's daily graphs pass xFormat (spec 2026-10-06-os-graph-day-labels-design.md).
    expect(lastProps).not.toHaveProperty('xFormat')
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

// PDF export (spec 2026-10-08 §7): the default metric and every channel, as labels, in one block.
test('in the export the trend prints Spend and every channel as labels, no buttons, as one block', () => {
  const { container } = render(<ExportModeProvider><PaidMediaTrendChart trend={trend} /></ExportModeProvider>)
  expect(screen.queryAllByRole('button')).toHaveLength(0)
  expect(screen.getByText('Spend')).toBeTruthy()
  expect(lastProps.yKeys?.map((k) => k.key)).toEqual(['Paid Search', 'Meta'])
  expect(lastProps.valueFormat).toBe('currency-cents')
  expect(container.firstElementChild?.hasAttribute('data-export-block')).toBe(true)
  expect(container.querySelector('[data-export-keep-with-next]')?.textContent).toContain('Trend')
})

test('with no points the trend prints its empty message, no controls', () => {
  render(<ExportModeProvider><PaidMediaTrendChart trend={{ channels: ['meta'], points: [] }} /></ExportModeProvider>)
  expect(screen.getByText('No trend data for this period.')).toBeTruthy()
  expect(screen.queryAllByRole('button')).toHaveLength(0)
})
