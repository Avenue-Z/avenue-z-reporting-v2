import { expect, test, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { ChartAnnotation } from '@/lib/organic-social/annotations'
import type { TrendSeries } from '@/lib/organic-social/types'

// The chart itself is covered in components/charts/line-chart.test.tsx; here, record what it is handed.
const { chartProps } = vi.hoisted(() => ({ chartProps: [] as Record<string, unknown>[] }))
vi.mock('@/components/charts/line-chart', () => ({
  LineChart: (props: Record<string, unknown>) => { chartProps.push(props); return <div data-testid="chart" /> },
}))
vi.mock('@/app/actions/organic-social', () => ({ setDesignationAction: vi.fn(), setAnnotationHiddenAction: vi.fn() }))

import { ChannelTrendChart } from './trends'
import { ExportModeProvider } from '@/components/export/export-mode'

const SERIES: TrendSeries = {
  channels: ['Instagram'],
  points: ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'].map((date, i) => ({ date, Instagram: [3, 9, 4, 7][i] })),
}
const thumb = { creative: null, mediaType: 'IMAGE' as const, url: 'https://www.instagram.com/p/abc/' }
const ANNOTATIONS: ChartAnnotation[] = [
  { date: '2026-09-02', value: 9, label: 'Peak engagement', thumb },
  { date: '2026-09-03', value: 4, label: 'Hidden by the team', thumb: null, hidden: true },
  { date: '2026-09-04', value: 7, label: 'Draft only', thumb: null, noteOnly: true },
  { date: '2026-09-01', value: 3, label: 'Launch', thumb: null, noteOnly: true, note: 'Benefits campaign went live.' },
  { date: '2026-08-30', value: 0, label: 'Before the month', thumb: null, note: 'Teaser posted.' },
]
const exportChart = () => {
  chartProps.length = 0
  return render(<ExportModeProvider><ChannelTrendChart title="Engagement Over Time" series={SERIES} annotations={ANNOTATIONS} /></ExportModeProvider>)
}

test('only what a client sees prints, numbered in date order', () => {
  exportChart()
  const list = screen.getByRole('list', { name: 'Annotations' })
  const entries = within(list).getAllByRole('listitem').map((li) => li.textContent)
  expect(entries).toHaveLength(3)
  expect(entries[0]).toMatch(/^Annotations1Aug 30 · Before the month.*Teaser posted\./) // the list title rides in the first entry
  expect(entries[1]).toMatch(/^2Sep 1 · Launch.*Benefits campaign went live\./)
  expect(entries[2]).toMatch(/^3Sep 2 · Peak engagement/)
})

test('the chart marks each printed day that has a point with its number', () => {
  exportChart()
  expect(chartProps.at(-1)!.marks).toEqual([{ x: '2026-09-01', label: '2' }, { x: '2026-09-02', label: '3' }])
  expect(chartProps.at(-1)!.callouts).toBeUndefined()
})

test("an annotation's post thumbnail links to the post", () => {
  exportChart()
  const entry = within(screen.getByRole('list', { name: 'Annotations' })).getAllByRole('listitem')[2]
  expect(within(entry).getByRole('link').getAttribute('href')).toBe('https://www.instagram.com/p/abc/')
})

test('no hover cards, editors or toggles in the export', () => {
  const { container } = exportChart()
  expect(screen.queryByRole('button', { name: /annotation/i })).toBeNull()
  expect(container.querySelector('[data-callout-hit]')).toBeNull()
  expect(container.querySelector('form')).toBeNull()
})

test('title, legend and chart are one block; the list title is glued to its first entry', () => {
  const { container } = exportChart()
  const chartBlock = screen.getByTestId('chart').closest('[data-export-block]')!
  expect(within(chartBlock as HTMLElement).getByRole('heading', { name: 'Engagement Over Time' })).toBeTruthy()
  const firstEntry = within(screen.getByRole('list', { name: 'Annotations' })).getAllByRole('listitem')[0]
  const firstBlock = firstEntry.closest('[data-export-block]')!
  expect(within(firstBlock as HTMLElement).getByText('Annotations')).toBeTruthy()
  expect(container.querySelectorAll('[data-export-block]').length).toBe(1 + 3)
})

test('outside the export the chart is unchanged: hover cards, unnumbered dots, no export blocks', () => {
  chartProps.length = 0
  const { container } = render(<ChannelTrendChart title="Engagement Over Time" series={SERIES} annotations={ANNOTATIONS} />)
  const props = chartProps.at(-1)!
  expect(props.marks).toEqual([{ x: '2026-09-02' }, { x: '2026-09-01' }, { x: '2026-08-30' }]) // every client-visible day, as today
  expect((props.callouts as unknown[]).length).toBeGreaterThan(0)
  expect(container.querySelector('[data-export-block]')).toBeNull()
})
