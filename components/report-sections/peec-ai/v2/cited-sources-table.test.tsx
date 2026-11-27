import { expect, test }  from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { CitedUrls } from '@/lib/aeo/cited-urls'
import { ExportModeProvider } from '@/components/export/export-mode'
import { CitedSourcesTable } from './cited-sources-table'

const DATA: CitedUrls = {
  provider: 'peec',
  totalRows: 3,
  totalCitations: 1234,
  compared: true,
  hasPageType: true,
  complete: true,
  tooLong: false,
  rows: [
    { rank: 1, key: 'a', url: 'javascript:alert(1)', title: '<img src=x onerror=alert(1)>', sourceType: 'own', sourceLabel: 'Your site', pageType: 'Article', usedPct: 30, citationRate: 2, prior: { usedPct: 29, citationRate: 2 } },
    { rank: 2, key: 'b', url: 'https://rival.com/x', title: 'Rival page', sourceType: 'competitor', sourceLabel: 'Competitor', pageType: null, usedPct: 10, citationRate: 1.1, prior: { usedPct: 8, citationRate: 1 } },
    { rank: 3, key: 'c', url: 'https://news.com/y', title: null, sourceType: 'third_party', sourceLabel: 'News', pageType: 'Listicle', usedPct: 5, citationRate: null, prior: null },
  ],
}

const ui = (over: Partial<CitedUrls> = {}, props: { showDeltas?: boolean; modelActive?: boolean } = {}) => (
  <TooltipProvider>
    <CitedSourcesTable data={{ ...DATA, ...over }} showDeltas={props.showDeltas ?? true} modelActive={props.modelActive ?? false} />
  </TooltipProvider>
)
const headerText = (th: Element) => (th.textContent ?? '').trim().replace(/\?$/, '')
const headers = (c: HTMLElement) => [...c.querySelectorAll('thead th')].map(headerText)
const rows = (c: HTMLElement) => c.querySelectorAll('tbody tr')

test('renders columns and the total', () => {
  const { container } = render(ui())
  expect(headers(container)).toEqual(['#', 'Page', 'Source type', 'Page type', 'Used as a source %', 'Δ', 'Citation rate', 'Δ'])
  expect(screen.getByText('1,234 citations')).toBeTruthy()
  expect(screen.queryByText('Not filtered by AI model.')).toBeNull()
})

test('says when the AI model filter does not apply', () => {
  render(ui({}, { modelActive: true }))
  expect(screen.getByText('Not filtered by AI model.')).toBeTruthy()
})

test('chips filter rows', () => {
  const { container } = render(ui())
  expect(rows(container)).toHaveLength(3)
  fireEvent.click(screen.getByRole('radio', { name: 'Your URLs' }))
  expect(rows(container)).toHaveLength(1)
  fireEvent.click(screen.getByRole('radio', { name: 'Third-party' }))
  expect(rows(container)).toHaveLength(1)
  expect(container.querySelector('tbody')?.textContent).toContain('News')
  fireEvent.click(screen.getByRole('radio', { name: 'All' }))
  expect(rows(container)).toHaveLength(3)
  expect(screen.getByRole('radio', { name: 'All' }).getAttribute('aria-checked')).toBe('true')
})

test('a chip with no rows says so', () => {
  render(ui({ rows: DATA.rows.filter((r) => r.sourceType !== 'competitor') }))
  fireEvent.click(screen.getByRole('radio', { name: 'Competitor URLs' }))
  expect(screen.getByText('No URLs of this type in this period.')).toBeTruthy()
})

test('own row highlighted', () => {
  const { container } = render(ui())
  const own = [...rows(container)].find((tr) => tr.textContent?.includes('Your site'))
  expect(own?.className).toContain('bg-[#60FDFF]/[0.06]')
})

test('deltas and New', () => {
  const { container } = render(ui())
  const comp = [...rows(container)].find((tr) => tr.textContent?.includes('Rival page'))!
  expect(comp.textContent).toContain('+2.0 pts')
  expect(comp.textContent).toContain('+10.0%')
  const third = [...rows(container)].find((tr) => tr.textContent?.includes('Listicle'))!
  expect([...third.querySelectorAll('span')].filter((s) => s.textContent === 'New')).toHaveLength(2)
})

test('deltas off or no comparison hides the Δ columns', () => {
  const a = render(ui({}, { showDeltas: false }))
  expect(headers(a.container)).not.toContain('Δ')
  a.unmount()
  const b = render(ui({ compared: false }))
  expect(headers(b.container)).not.toContain('Δ')
})

test('Profound hides Page type', () => {
  const { container } = render(ui({ provider: 'profound', hasPageType: false }))
  expect(headers(container)).not.toContain('Page type')
})

test('renders vendor strings as text', () => {
  const { container } = render(ui())
  expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy()
  expect(container.querySelector('img')).toBeNull()
  expect(container.querySelector('a')).toBeNull()
})

test('too-long notice', () => {
  const { container } = render(ui({ tooLong: true, rows: [] }))
  expect(screen.getByText('Choose a date range of 92 days or less to see cited pages.')).toBeTruthy()
  expect(container.querySelectorAll('tbody td')).toHaveLength(1)
})

test('no rows notice', () => {
  render(ui({ rows: [] }))
  expect(screen.getByText('No cited pages for this period.')).toBeTruthy()
})

test('the Used as a source % tooltip names the provider copy', async () => {
  for (const [provider, text] of [
    ['peec', 'Share of AI answers that used this page as a source.'],
    ['profound', 'Share of AI answers (Visibility prompts) that cited this page.'],
  ] as const) {
    const { container, unmount } = render(ui({ provider }))
    const th = [...container.querySelectorAll('thead th')].find((h) => headerText(h) === 'Used as a source %')!
    const trigger = [...th.querySelectorAll('span')].find((s) => s.textContent === '?')!
    fireEvent.focus(trigger)
    expect((await screen.findAllByText(text)).length).toBeGreaterThan(0)
    unmount()
  }
})

test('export mode shows all rows and no chips', () => {
  const { container } = render(<ExportModeProvider>{ui()}</ExportModeProvider>)
  expect(screen.queryAllByRole('radio')).toHaveLength(0)
  expect(rows(container)).toHaveLength(3)
})

test('New sinks to the bottom in both directions', () => {
  const { container } = render(ui())
  const last = () => [...rows(container)].at(-1)?.textContent ?? ''
  const header = screen.getAllByRole('button', { name: 'Sort by Δ' })[0]
  fireEvent.click(header)
  expect(last()).toContain('Listicle')
  fireEvent.click(header)
  expect(last()).toContain('Listicle')
})

test('notes partial data only when the pull is incomplete', () => {
  const { unmount } = render(ui({ complete: false }))
  expect(screen.getByText('Partial data for this period.')).toBeTruthy()
  unmount()
  render(ui({ complete: true }))
  expect(screen.queryByText('Partial data for this period.')).toBeNull()
})

test('notes the top-N cut only when rows were dropped', () => {
  const { unmount } = render(ui({ totalRows: 20625 }))
  expect(screen.getByText('Top 3 of 20,625 URLs')).toBeTruthy()
  unmount()
  render(ui())
  expect(screen.queryByText(/^Top \d/)).toBeNull()
})
