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
import { TopicMatrix } from './topic-matrix'
import { MATRIX_DEFAULT_COMPETITORS, MATRIX_PARAM, parseMatrixMode, serializeMatrixMode } from './matrix-mode'
import type { MatrixCell } from './topics'

const BRANDS = ['Renaissance', 'Guardian', 'Amwins', 'Unum', 'MetLife', 'Aflac', 'Cigna', 'Aetna', 'Humana', 'Delta']
const TOPICS = ['Differentiators', 'Ease of Doing Business', 'Member Experience']
const cell = (value: number | null, delta: number | null = 1.25): MatrixCell => ({ value, delta })

const byBrand = new Map<string, Map<string, MatrixCell>>(
  TOPICS.map((t, ti) => [t, new Map(BRANDS.map((b, bi) => [b, cell(80 - bi * 7 - ti, bi === 3 ? null : 1.25)]))]),
)
// One brand never seen on one topic: a null cell.
byBrand.get('Member Experience')!.set('Guardian', cell(null, null))

const PROPS: ComponentProps<typeof TopicMatrix> = {
  topics: TOPICS,
  brandCols: BRANDS.map((name, i) => ({ name, color: i === 0 ? '#60FDFF' : '#6034FF', isYou: i === 0 })),
  byBrand,
  modelCols: [
    { model: 'ChatGPT', label: 'ChatGPT' },
    { model: 'Google', label: 'Google AI Overview' },
  ],
  byModel: new Map(TOPICS.map((t) => [t, { ChatGPT: cell(42.5), Google: cell(12.25, null) }])),
  showDeltas: true,
  compareLabel: 'vs previous period',
}

const headers = (c: HTMLElement) => [...c.querySelectorAll('thead th')].slice(1)
const lastUrl = () => new URL(replace.mock.calls.at(-1)![0] as string, 'http://x')

beforeEach(() => {
  replace.mockReset()
  search = 'section=peec-ai&compareRange=previous_year'
})

test('parseMatrixMode recognises only all and platforms; serializeMatrixMode drops the default', () => {
  expect(MATRIX_PARAM).toBe('aeoMatrix')
  expect(MATRIX_DEFAULT_COMPETITORS).toBe(7)
  expect(parseMatrixMode('all')).toBe('all')
  expect(parseMatrixMode('platforms')).toBe('platforms')
  for (const raw of ['competitors', 'PLATFORMS', 'All', '', 'x', null, undefined]) expect(parseMatrixMode(raw)).toBe('competitors')
  expect(serializeMatrixMode('competitors')).toBeNull()
  expect(serializeMatrixMode('all')).toBe('all')
  expect(serializeMatrixMode('platforms')).toBe('platforms')
})

test('default: the client plus the first 7 competitors, the client header outlined', () => {
  const { container } = render(<TopicMatrix {...PROPS} />)
  const cols = headers(container)
  expect(cols.map((h) => h.textContent)).toEqual(BRANDS.slice(0, 8))
  expect(cols[0].className.split(' ')).toEqual(expect.arrayContaining(['outline', 'outline-1', 'outline-[#60FDFF]']))
  // The whole client column is outlined, not only its header.
  expect((container.querySelector('tbody td[data-brand="Renaissance"]') as HTMLElement).className.split(' ')).toContain('outline')
  expect(cols[1].className).not.toContain('outline-[#60FDFF]')
  // A color dot per brand header.
  expect(cols[1].querySelector('span[style]')?.getAttribute('style')).toContain('background-color: rgb(96, 52, 255)')
  expect(container.querySelectorAll('tbody tr')).toHaveLength(3)
  expect(screen.getByRole('button', { name: 'Competitors' })).toHaveAttribute('aria-pressed', 'true')
})

test('a cell prints one decimal on a cyan fill scaled by value; near-black text above 50%, white at or below', () => {
  const { container } = render(<TopicMatrix {...PROPS} />)
  const first = container.querySelector('tbody tr td[data-brand="Renaissance"]') as HTMLElement
  expect(first.textContent).toBe('80.0%')
  // 0.08 + 0.72 × 0.8 = 0.656
  expect(first.getAttribute('style')).toContain('rgba(96, 253, 255, 0.656)')
  expect(first.className).toContain('text-[#0A0A0A]')
  expect(first.className).not.toContain('text-white')
  const low = container.querySelector('tbody tr td[data-brand="Aetna"]') as HTMLElement
  expect(low.textContent).toBe('31.0%')
  expect(low.className).toContain('text-white')
})

test('the text flips at 50: 50 is white, 50.1 near-black', () => {
  const two = new Map([['T', new Map([['Renaissance', cell(50)], ['Guardian', cell(50.1)]])]])
  const { container } = render(<TopicMatrix {...PROPS} topics={['T']} byBrand={two} brandCols={PROPS.brandCols.slice(0, 2)} />)
  const at = (b: string) => (container.querySelector(`tbody td[data-brand="${b}"]`) as HTMLElement).className
  expect(at('Renaissance')).toContain('text-white')
  expect(at('Renaissance')).not.toContain('text-[#0A0A0A]')
  expect(at('Guardian')).toContain('text-[#0A0A0A]')
  expect(at('Guardian')).not.toContain('text-white')
})

test('the table is labelled and scrolls sideways on screen in every mode', () => {
  for (const q of ['section=peec-ai', 'aeoMatrix=all', 'aeoMatrix=platforms']) {
    search = q
    const { container, unmount } = render(<TopicMatrix {...PROPS} />)
    const table = container.querySelector('table')!
    expect(table.getAttribute('aria-label')).toBe('Visibility by topic')
    expect(table.parentElement!.className).toContain('overflow-x-auto')
    unmount()
  }
})

test('a null cell renders – with no fill', () => {
  const { container } = render(<TopicMatrix {...PROPS} />)
  const rows = [...container.querySelectorAll('tbody tr')]
  const empty = rows[2].querySelector('td[data-brand="Guardian"]') as HTMLElement
  expect(empty.textContent).toBe('–')
  expect(empty.getAttribute('style') ?? '').not.toContain('background')
  expect(empty.hasAttribute('title')).toBe(false)
})

test('with deltas, a cell title is the pts delta and the comparison; no prior reads No comparison data', () => {
  const { container } = render(<TopicMatrix {...PROPS} />)
  expect((container.querySelector('tbody td[data-brand="Renaissance"]') as HTMLElement).title).toBe('+1.3 pts vs previous period')
  expect((container.querySelector('tbody td[data-brand="Unum"]') as HTMLElement).title).toBe('No comparison data')
})

test('showDeltas false: no cell has a title', () => {
  const { container } = render(<TopicMatrix {...PROPS} showDeltas={false} />)
  expect(container.querySelectorAll('tbody td[title]')).toHaveLength(0)
})

test('Show all brands writes aeoMatrix=all and keeps every other param', () => {
  render(<TopicMatrix {...PROPS} />)
  fireEvent.click(screen.getByRole('switch', { name: 'Show all brands' }))
  expect(replace).toHaveBeenCalledTimes(1)
  expect(replace.mock.calls[0][1]).toEqual({ scroll: false })
  const url = lastUrl()
  expect(url.pathname).toBe('/dashboard/renaissance/reports')
  expect(url.searchParams.get('aeoMatrix')).toBe('all')
  expect(url.searchParams.get('section')).toBe('peec-ai')
  expect(url.searchParams.get('compareRange')).toBe('previous_year')
})

test('aeoMatrix=all: every brand, the grid scrolls sideways; turning it off deletes the param', () => {
  search = 'section=peec-ai&aeoMatrix=all'
  const { container } = render(<TopicMatrix {...PROPS} />)
  expect(headers(container).map((h) => h.textContent)).toEqual(BRANDS)
  expect(container.querySelector('table')!.parentElement!.className).toContain('overflow-x-auto')
  const toggle = screen.getByRole('switch', { name: 'Show all brands' })
  expect(toggle).toHaveAttribute('aria-checked', 'true')
  fireEvent.click(toggle)
  expect(lastUrl().searchParams.has('aeoMatrix')).toBe(false)
  expect(lastUrl().searchParams.get('section')).toBe('peec-ai')
})

test('aeoMatrix=platforms: one column per model, labelled; Show all brands hidden', () => {
  search = 'section=peec-ai&aeoMatrix=platforms'
  const { container } = render(<TopicMatrix {...PROPS} />)
  expect(headers(container).map((h) => h.textContent)).toEqual(['ChatGPT', 'Google AI Overview'])
  expect(screen.getByRole('button', { name: 'Platforms' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.queryByRole('switch', { name: 'Show all brands' })).toBeNull()
  expect((container.querySelector('tbody td[data-model="ChatGPT"]') as HTMLElement).textContent).toBe('42.5%')
  fireEvent.click(screen.getByRole('button', { name: 'Competitors' }))
  expect(lastUrl().searchParams.has('aeoMatrix')).toBe(false)
})

test('clicking Platforms writes aeoMatrix=platforms', () => {
  render(<TopicMatrix {...PROPS} />)
  fireEvent.click(screen.getByRole('button', { name: 'Platforms' }))
  expect(lastUrl().searchParams.get('aeoMatrix')).toBe('platforms')
  expect(lastUrl().searchParams.get('compareRange')).toBe('previous_year')
})

test('aeoMatrix=PLATFORMS reads as the default', () => {
  search = 'aeoMatrix=PLATFORMS'
  const { container } = render(<TopicMatrix {...PROPS} />)
  expect(headers(container).map((h) => h.textContent)).toEqual(BRANDS.slice(0, 8))
})

test('export mode: no buttons, and a line under the grid names the mode', () => {
  const { container, rerender } = render(<ExportModeProvider><TopicMatrix {...PROPS} /></ExportModeProvider>)
  expect(container.querySelectorAll('button')).toHaveLength(0)
  expect(screen.getByText('Competitors · top 8 brands')).toBeTruthy()
  search = 'aeoMatrix=all'
  rerender(<ExportModeProvider><TopicMatrix {...PROPS} /></ExportModeProvider>)
  expect(screen.getByText('All brands')).toBeTruthy()
  search = 'aeoMatrix=platforms'
  rerender(<ExportModeProvider><TopicMatrix {...PROPS} /></ExportModeProvider>)
  expect(screen.getByText('Platforms')).toBeTruthy()
  expect(container.querySelectorAll('button')).toHaveLength(0)
})

test('the export line counts the brands drawn when there are fewer than 8', () => {
  render(<ExportModeProvider><TopicMatrix {...PROPS} brandCols={PROPS.brandCols.slice(0, 3)} /></ExportModeProvider>)
  expect(screen.getByText('Competitors · top 3 brands')).toBeTruthy()
})

const MANY = Array.from({ length: 23 }, (_, i) => `Brand ${String(i).padStart(2, '0')}`)
const manyProps = (): ComponentProps<typeof TopicMatrix> => ({
  ...PROPS,
  brandCols: MANY.map((name, i) => ({ name, color: '#6034FF', isYou: i === 0 })),
  byBrand: new Map(TOPICS.map((t) => [t, new Map(MANY.map((b) => [b, cell(20)]))])),
})

test('export with all brands: the columns print in blocks of 10, the topic column repeated, no scroller', () => {
  search = 'aeoMatrix=all'
  const { container } = render(<ExportModeProvider><TopicMatrix {...manyProps()} /></ExportModeProvider>)
  const tables = [...container.querySelectorAll('table')]
  expect(tables).toHaveLength(3)
  expect(tables.map((t) => headers(t).length)).toEqual([10, 10, 3])
  expect(headers(tables[1])[0].textContent).toBe('Brand 10')
  for (const t of tables) {
    expect(t.querySelector('thead th')!.textContent).toBe('Topic')
    expect(t.closest('[data-export-block]')).toBeTruthy()
    expect(t.parentElement!.className).not.toContain('overflow-x-auto')
  }
  expect(new Set(tables.map((t) => t.closest('[data-export-block]'))).size).toBe(3)
  expect(screen.getByText('All brands')).toBeTruthy()
})

test('export in Competitors mode: one table whose header names wrap', () => {
  const { container } = render(<ExportModeProvider><TopicMatrix {...manyProps()} /></ExportModeProvider>)
  const tables = container.querySelectorAll('table')
  expect(tables).toHaveLength(1)
  expect(headers(tables[0])).toHaveLength(8)
  for (const th of headers(tables[0])) expect(th.className).not.toContain('whitespace-nowrap')
  expect(tables[0].closest('[data-export-block]')).toBeTruthy()
  expect(tables[0].parentElement!.className).not.toContain('overflow-x-auto')
})

test('on screen the header names stay on one line', () => {
  const { container } = render(<TopicMatrix {...PROPS} />)
  for (const th of headers(container)) expect(th.className).toContain('whitespace-nowrap')
})
