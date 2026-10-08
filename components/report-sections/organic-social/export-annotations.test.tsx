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
const thumb = { creative: { kind: 'image' as const, thumb: 'https://images.dashsocial.com/t?w=640', full: 'x' }, mediaType: 'IMAGE' as const, url: 'https://www.instagram.com/p/abc/' }
const ANNOTATIONS: ChartAnnotation[] = [
  { date: '2026-09-02', value: 9, label: '9/2 | 9 Engagements', thumb },
  { date: '2026-09-03', value: 4, label: '9/3 | 4 Engagements', thumb: null, hidden: true },
  { date: '2026-09-04', value: 7, label: '9/4', thumb: null, noteOnly: true },
  { date: '2026-09-01', value: 3, label: '9/1', thumb: null, noteOnly: true, note: 'Benefits campaign went live.' },
  { date: '2026-08-30', value: 0, label: '8/30', thumb: null, note: 'Teaser posted.' },
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
  // Only a day with a mark on the chart is numbered, so the chart's numbers never skip (Thomas, #332 trends.tsx:258).
  // Real labels (annotationLabel) start with the day, so the day prints once (it once printed "8/25 · 8/25 | …").
  expect(entries).toEqual(['Annotations8/30Teaser posted.', '19/1Benefits campaign went live.', '29/2 | 9 Engagements']) // 8/30 is off the chart: no number
})

test('the chart marks each printed day that has a point with its number, dates as month/day like the live chart', () => {
  exportChart()
  expect(chartProps.at(-1)!.marks).toEqual([{ x: '2026-09-01', label: '1' }, { x: '2026-09-02', label: '2' }])
  expect(chartProps.at(-1)!.xFormat).toBe('month-day')
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

test("an annotation's thumbnail is a print-sized JPEG", () => {
  exportChart()
  const entry = within(screen.getByRole('list', { name: 'Annotations' })).getAllByRole('listitem')[2]
  expect(within(entry).getByRole('img').getAttribute('src')).toBe('https://images.dashsocial.com/t?w=160&h=160&fit=cover&format=jpeg&quality=70')
})

// A staff export prints exactly what a client's does (spec 2026-10-06 §7; Thomas, #332 round 2, item 5): the export
// renders in screen media, so nothing may rely on the live page's no-print rules to keep staff controls out.
test("a staff export, with every editor control and a pending draft, prints the client's annotations and nothing else", () => {
  const editor = (approvedId: string | null, draft: string | null) => ({
    approvedId, approvedPostIds: [], draft: draft ? { id: `d-${draft}`, text: draft, postIds: [] } : null, draftThumbs: [],
  })
  const STAFF_VIEW: ChartAnnotation[] = ANNOTATIONS.map((a) =>
    a.date === '2026-09-01' ? { ...a, noteEditor: editor('n1', 'Draft rewrite of the launch note') }
    : a.date === '2026-09-04' ? { ...a, noteEditor: editor(null, 'A note not approved yet') }
    : a)
  const controls = { clientSlug: 'c', channel: 'INSTAGRAM' as const, chart: 'engagements' as const }
  const client = exportChart()
  const clientList = within(screen.getByRole('list', { name: 'Annotations' })).getAllByRole('listitem').map((li) => li.textContent)
  const clientMarks = chartProps.at(-1)!.marks
  client.unmount()
  chartProps.length = 0
  const { container } = render(
    <ExportModeProvider>
      <ChannelTrendChart title="Engagement Over Time" series={SERIES} annotations={STAFF_VIEW}
        annotationControls={controls} noteControls={{ ...controls, canApprove: true, days: [] }} />
    </ExportModeProvider>,
  )
  expect(within(screen.getByRole('list', { name: 'Annotations' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(clientList)
  expect(chartProps.at(-1)!.marks).toEqual(clientMarks)
  expect(screen.queryAllByRole('button')).toHaveLength(0)
  expect(container.querySelector('form, input, textarea')).toBeNull()
  expect(container.textContent).not.toMatch(/Draft|not approved yet|Add annotation|Approve|Revoke|Edit/)
})
