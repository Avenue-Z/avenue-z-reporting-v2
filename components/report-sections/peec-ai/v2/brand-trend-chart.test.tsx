import { beforeEach, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'

const replace = vi.fn()
let search = 'section=peec-ai&compareRange=previous_year'
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/dashboard/renaissance/reports',
  useSearchParams: () => new URLSearchParams(search),
}))

import { ExportModeProvider } from '@/components/export/export-mode'
import { BrandTrendChart } from './brand-trend-chart'

// Every day of the year to date, as the fetchers return it.
const DATES = Array.from({ length: 327 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10))
const line = (base: number) => DATES.map((date, i) => ({ date, visibility: base + (i % 7) }))

const SERIES: ComponentProps<typeof BrandTrendChart>['series'] = [
  { key: 'renaissance', name: 'Renaissance', color: '#60FDFF', isYou: true, points: line(30) },
  { key: 'guardian', name: 'Guardian', color: '#6034FF', isYou: false, points: line(50) },
  { key: 'amwins', name: 'Amwins', color: '#FFFC60', isYou: false, points: line(40) },
  { key: 'unum', name: 'Unum', color: '#FF8A3D', isYou: false, points: line(35) },
  { key: 'metlife', name: 'MetLife', color: '#39A0FF', isYou: false, points: line(20) },
  { key: 'aflac', name: 'Aflac', color: '#FF6B8A', isYou: false, points: line(10) },
]
const KEYS = ['guardian', 'amwins', 'unum', 'metlife', 'aflac']
const PROPS: ComponentProps<typeof BrandTrendChart> = {
  series: SERIES,
  competitorKeysByVisibility: KEYS,
  period: { start: '2026-10-25', end: '2026-11-23' },
  comparePeriod: { start: '2026-09-25', end: '2026-10-24' },
  showDeltas: true,
  note: null,
}

const polylines = (c: HTMLElement) => [...c.querySelectorAll('polyline')]
const lastUrl = () => new URL(replace.mock.calls.at(-1)![0] as string, 'http://x')

beforeEach(() => {
  replace.mockReset()
  search = 'section=peec-ai&compareRange=previous_year'
})

test('default: the client plus the top 4 competitors; the 5th is unchecked', () => {
  const { container } = render(<BrandTrendChart {...PROPS} />)
  expect(polylines(container).map((p) => p.dataset.brand).sort())
    .toEqual(['amwins', 'guardian', 'metlife', 'renaissance', 'unum'])
  expect(screen.getByRole('checkbox', { name: 'Aflac' })).not.toBeChecked()
  expect(screen.getByRole('checkbox', { name: 'Guardian' })).toBeChecked()
  const client = screen.getByRole('checkbox', { name: 'Renaissance' })
  expect(client).toBeChecked()
  expect(client).toBeDisabled()
  // The client line is heavier and drawn last, on top.
  const lines = polylines(container)
  expect(lines.at(-1)!.dataset.brand).toBe('renaissance')
  expect(lines.at(-1)!.getAttribute('stroke-width')).toBe('2.5')
  expect(lines[0].getAttribute('stroke-width')).toBe('1.5')
  expect(lines.at(-1)!.getAttribute('stroke')).toBe('#60FDFF')
  // Competitors on: no shading.
  expect(container.querySelector('[data-band]')).toBeNull()
})

test('the legend lists the client first, then competitors by visibility', () => {
  render(<BrandTrendChart {...PROPS} />)
  expect(screen.getAllByRole('checkbox').map((c) => c.getAttribute('aria-label')))
    .toEqual(['Renaissance', 'Guardian', 'Amwins', 'Unum', 'MetLife', 'Aflac'])
})

test('checking Aflac writes aeoTrend and keeps every other param', () => {
  render(<BrandTrendChart {...PROPS} />)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Aflac' }))
  expect(replace).toHaveBeenCalledTimes(1)
  expect(replace.mock.calls[0][1]).toEqual({ scroll: false })
  const url = lastUrl()
  expect(url.pathname).toBe('/dashboard/renaissance/reports')
  expect(url.searchParams.get('aeoTrend')).toBe('guardian,amwins,unum,metlife,aflac')
  expect(url.searchParams.get('section')).toBe('peec-ai')
  expect(url.searchParams.get('compareRange')).toBe('previous_year')
})

test('unchecking back to the default deletes the param', () => {
  search += '&aeoTrend=guardian,amwins,unum,metlife,aflac'
  render(<BrandTrendChart {...PROPS} />)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Aflac' }))
  expect(lastUrl().searchParams.has('aeoTrend')).toBe(false)
  expect(lastUrl().searchParams.get('section')).toBe('peec-ai')
})

test('the Show competitors switch turns competitors off, and back on to the default', () => {
  const { unmount } = render(<BrandTrendChart {...PROPS} />)
  const sw = screen.getByRole('switch', { name: 'Show competitors' })
  expect(sw).toHaveAttribute('aria-checked', 'true')
  fireEvent.click(sw)
  expect(lastUrl().searchParams.get('aeoTrend')).toBe('off')
  unmount()

  search += '&aeoTrend=off'
  render(<BrandTrendChart {...PROPS} />)
  const off = screen.getByRole('switch', { name: 'Show competitors' })
  expect(off).toHaveAttribute('aria-checked', 'false')
  fireEvent.click(off)
  expect(lastUrl().searchParams.has('aeoTrend')).toBe(false)
})

test('aeoTrend=off: the client line alone, the period shaded and the comparison shaded lighter', () => {
  search += '&aeoTrend=off'
  const { container } = render(<BrandTrendChart {...PROPS} />)
  expect(polylines(container).map((p) => p.dataset.brand)).toEqual(['renaissance'])
  const period = container.querySelector('[data-band="period"]')
  const comparison = container.querySelector('[data-band="comparison"]')
  expect(period).not.toBeNull()
  expect(period!.className).toContain('bg-white/[0.08]')
  expect(comparison).not.toBeNull()
  expect(comparison!.className).toContain('bg-white/[0.04]')
  expect(screen.getByText('Selected period')).toBeTruthy()
  expect(screen.getByText('Comparison period')).toBeTruthy()
  expect(screen.queryByRole('checkbox', { name: 'Guardian' })).toBeNull()
})

test('aeoTrend=off with deltas off, or no comparison: no comparison band', () => {
  search += '&aeoTrend=off'
  const a = render(<BrandTrendChart {...PROPS} showDeltas={false} />)
  expect(a.container.querySelector('[data-band="period"]')).not.toBeNull()
  expect(a.container.querySelector('[data-band="comparison"]')).toBeNull()
  expect(screen.queryByText('Comparison period')).toBeNull()
  a.unmount()

  const b = render(<BrandTrendChart {...PROPS} comparePeriod={null} />)
  expect(b.container.querySelector('[data-band="period"]')).not.toBeNull()
  expect(b.container.querySelector('[data-band="comparison"]')).toBeNull()
})

test('seven competitors checked: the rest are disabled and the cap line shows', () => {
  const more = ['b6', 'b7', 'b8'].map((key, i) => ({ key, name: key.toUpperCase(), color: '#A3A3A3', isYou: false, points: line(5 - i) }))
  const keys = [...KEYS, 'b6', 'b7', 'b8']
  search += '&aeoTrend=guardian,amwins,unum,metlife,aflac,b6,b7'
  const { container } = render(<BrandTrendChart {...PROPS} series={[...SERIES, ...more]} competitorKeysByVisibility={keys} />)
  expect(polylines(container)).toHaveLength(8)
  expect(screen.getByRole('checkbox', { name: 'B8' })).toBeDisabled()
  expect(screen.getByRole('checkbox', { name: 'B7' })).not.toBeDisabled()
  expect(screen.getByText('Up to 8 lines at once. Uncheck a brand to add another.')).toBeTruthy()
})

test('under the cap there is no cap line', () => {
  render(<BrandTrendChart {...PROPS} />)
  expect(screen.queryByText(/Up to 8 lines/)).toBeNull()
})

test('export mode: no switch, checkboxes or granularity; a line names what is drawn', () => {
  const { container } = render(<ExportModeProvider><BrandTrendChart {...PROPS} /></ExportModeProvider>)
  expect(screen.queryByRole('switch')).toBeNull()
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  expect(screen.queryByRole('button', { name: 'Daily' })).toBeNull()
  expect(screen.getByText('Renaissance and 4 competitors · weekly')).toBeTruthy()
  expect(polylines(container)).toHaveLength(5)
  // The PDF still says which line is which.
  for (const name of ['Renaissance', 'Guardian', 'Amwins', 'Unum', 'MetLife']) expect(screen.getByText(name)).toBeTruthy()
  expect(container.querySelector('[data-export-block]')).not.toBeNull()
})

test('export mode with competitors off names the client alone', () => {
  search += '&aeoTrend=off'
  render(<ExportModeProvider><BrandTrendChart {...PROPS} /></ExportModeProvider>)
  expect(screen.getByText('Renaissance · weekly')).toBeTruthy()
})

test('granularity buttons switch the buckets', () => {
  const { container } = render(<BrandTrendChart {...PROPS} />)
  const weeklyPoints = polylines(container).at(-1)!.getAttribute('points')
  fireEvent.click(screen.getByRole('button', { name: 'Monthly' }))
  expect(polylines(container).at(-1)!.getAttribute('points')).not.toBe(weeklyPoints)
  expect(screen.getByRole('button', { name: 'Weekly' }).closest('[data-export-hide]')).not.toBeNull()
})

test('the note shows when given', () => {
  render(<BrandTrendChart {...PROPS} note="Model filter not applied here: all models." />)
  expect(screen.getByText('Model filter not applied here: all models.')).toBeTruthy()
})

// Final review M2: with no client brand identified, competitors off would draw nothing, so the switch is hidden and a line says
// why; competitors on still draws.
test('no client brand: no Show competitors switch, a muted line above the chart, competitors still drawn', () => {
  const noClient = SERIES.map((s) => ({ ...s, isYou: false }))
  const { container } = render(<BrandTrendChart {...PROPS} series={noClient} competitorKeysByVisibility={['renaissance', ...KEYS]} />)
  expect(screen.queryByRole('switch', { name: 'Show competitors' })).toBeNull()
  const msg = screen.getByText('Client brand not identified for this project.')
  expect(msg.className).toContain('text-text-muted')
  // Above the chart: before the plot area in document order.
  const plot = container.querySelector('svg')!
  expect(msg.compareDocumentPosition(plot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(polylines(container).map((p) => p.dataset.brand).sort()).toEqual(['amwins', 'guardian', 'renaissance', 'unum'])
})

test('with a client brand there is no not-identified line', () => {
  render(<BrandTrendChart {...PROPS} />)
  expect(screen.queryByText('Client brand not identified for this project.')).toBeNull()
  expect(screen.getByRole('switch', { name: 'Show competitors' })).toBeTruthy()
})

// Coordinator ruling (concern 1): with no client line, aeoTrend=off would leave an empty chart and no switch, so it reads as the default.
test('no client brand and aeoTrend=off: the default competitors are drawn', () => {
  search = 'section=peec-ai&aeoTrend=off'
  const noClient = SERIES.map((s) => ({ ...s, isYou: false }))
  const { container } = render(<BrandTrendChart {...PROPS} series={noClient} competitorKeysByVisibility={['renaissance', ...KEYS]} />)
  expect(polylines(container).map((p) => p.dataset.brand).sort()).toEqual(['amwins', 'guardian', 'renaissance', 'unum'])
  expect(screen.getByRole('checkbox', { name: 'Guardian' })).toBeChecked()
  expect(container.querySelector('[data-band]')).toBeNull()
})
