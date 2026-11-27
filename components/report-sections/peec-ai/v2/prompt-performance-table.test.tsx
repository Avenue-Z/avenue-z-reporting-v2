import { expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'

// A hover tooltip's text lives in a portal opened on hover; render it as an attribute so the text can be read.
vi.mock('@/components/ui/info-tooltip', () => ({ InfoTooltip: ({ text }: { text: string }) => <span data-tooltip={text} /> }))
// Export mode can be switched on under a mounted table, so chip state chosen on screen survives into the export render.
const forced = vi.hoisted(() => ({ exporting: false }))
vi.mock('@/components/export/export-mode', async (orig) => {
  const real = await orig<typeof import('@/components/export/export-mode')>()
  // The context is always read, so switching the flag never changes the hook order.
  return { ...real, useExportMode: () => real.useExportMode() || forced.exporting }
})

import { ExportModeProvider } from '@/components/export/export-mode'
import type { PromptPerfRow } from './topics'
import { PromptPerformanceTable } from './prompt-performance-table'

const row = (id: string, over: Partial<PromptPerfRow>): PromptPerfRow => ({
  id, text: `Prompt ${id}`, topic: 'Pricing', rank: 2, priorRank: 2, rankDelta: 0, rankChange: null, isNew: false,
  visibility: 40, visibilityPrior: 38, visibilityDelta: 2, ...over,
})
const ROWS: PromptPerfRow[] = [
  row('lost', { rank: 3, priorRank: 2, rankDelta: -1 }),
  row('new', { rank: 1.5, priorRank: null, rankDelta: null, isNew: true, visibilityPrior: null, visibilityDelta: null }),
  row('none', { rank: null, priorRank: null, rankDelta: null }),
  row('same', { rank: 2.3, priorRank: 2.5, rankDelta: 0.2 }),
  row('gained', { rank: 1, priorRank: 3, rankDelta: 2 }),
]
const ui = (rows = ROWS, showDeltas = true) => (
  <TooltipProvider><PromptPerformanceTable rows={rows} showDeltas={showDeltas} /></TooltipProvider>
)
const order = (c: HTMLElement) => [...c.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('td')!.textContent)

test('default order is Rank Δ descending; New and not-ranked rows last, New shows New', () => {
  const { container } = render(ui())
  const o = order(container)
  expect(o.slice(0, 3)).toEqual(['Prompt gained', 'Prompt same', 'Prompt lost'])
  expect(new Set(o.slice(3))).toEqual(new Set(['Prompt new', 'Prompt none']))
  expect(container.textContent).toContain('New')
})

test('ascending Rank Δ keeps New last', () => {
  const { container } = render(ui())
  // From the default descending sort the first click clears the sort, the second sorts ascending.
  fireEvent.click(screen.getByText('Rank Δ'))
  fireEvent.click(screen.getByText('Rank Δ'))
  const o = order(container)
  expect(o.slice(0, 3)).toEqual(['Prompt lost', 'Prompt same', 'Prompt gained'])
  expect(o).toContain('Prompt new')
  expect(o.slice(3)).toContain('Prompt new')
})

const chip = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) })

test('chips filter and show counts; All lists everything', () => {
  const { container } = render(ui())
  expect(chip('All').textContent).toBe('All 5')
  expect(chip('Gained').textContent).toBe('Gained 1')
  expect(chip('Lost').textContent).toBe('Lost 1')
  expect(chip('No change').textContent).toBe('No change 1')
  fireEvent.click(chip('Gained'))
  expect(order(container)).toEqual(['Prompt gained'])
  fireEvent.click(chip('Lost'))
  expect(order(container)).toEqual(['Prompt lost'])
  fireEvent.click(chip('No change'))
  expect(order(container)).toEqual(['Prompt same'])
  fireEvent.click(chip('All'))
  expect(order(container)).toHaveLength(5)
})

test('an empty chip says so', () => {
  render(ui([row('a', { rankDelta: 1 })]))
  fireEvent.click(screen.getByRole('button', { name: /^Lost/ }))
  expect(screen.getByText('No prompts in this group.')).toBeTruthy()
})

test('showDeltas off: no chips, no Δ headers, Rank ascending with the not-ranked row last', () => {
  const { container } = render(ui(ROWS, false))
  expect(screen.queryByRole('button', { name: /^Gained/ })).toBeNull()
  expect([...container.querySelectorAll('th')].some((t) => t.textContent?.includes('Δ'))).toBe(false)
  expect(order(container)).toEqual(['Prompt gained', 'Prompt new', 'Prompt same', 'Prompt lost', 'Prompt none'])
})

test('export mode prints no chips', () => {
  render(<ExportModeProvider>{ui()}</ExportModeProvider>)
  expect(screen.queryByRole('button', { name: /^Gained/ })).toBeNull()
})

test('rank prints one decimal, or a dash', () => {
  const { container } = render(ui())
  const tr = [...container.querySelectorAll('tbody tr')].find((t) => t.textContent?.includes('Prompt same'))!
  expect(tr.textContent).toContain('2.3')
  const none = [...container.querySelectorAll('tbody tr')].find((t) => t.textContent?.includes('Prompt none'))!
  expect(none.querySelectorAll('td')[2].textContent).toBe('–')
})

test('a 300-character prompt renders in full', () => {
  const text = 'long prompt '.repeat(25).slice(0, 300)
  const { container } = render(ui([row('x', { text })]))
  const td = container.querySelector('tbody td')!
  expect(td.textContent).toBe(text)
  expect(td.className).toContain('whitespace-normal')
  expect(td.querySelector('.truncate')).toBeNull()
})

const ENTERED = row('entered', { rank: 4, priorRank: null, rankDelta: null, rankChange: 'entered' })
const DROPPED = row('dropped', { rank: null, priorRank: 1, rankDelta: null, rankChange: 'dropped' })
const MOVES = [...ROWS, ENTERED, DROPPED]
const deltaCell = (c: HTMLElement, id: string) =>
  [...c.querySelectorAll('tbody tr')].find((t) => t.querySelector('td')!.textContent === `Prompt ${id}`)!.querySelectorAll('td')[3]

test('entering or leaving the answers reads Newly ranked (good) or No longer ranked (bad)', () => {
  const { container } = render(ui(MOVES))
  const entered = deltaCell(container, 'entered')
  expect(entered.textContent).toBe('Newly ranked')
  expect(entered.querySelector('span')!.className).toContain('text-[#60FF80]')
  const dropped = deltaCell(container, 'dropped')
  expect(dropped.textContent).toBe('No longer ranked')
  expect(dropped.querySelector('span')!.className).toContain('text-[#FF4444]')
  expect(deltaCell(container, 'new').textContent).toBe('New')
  expect(deltaCell(container, 'gained').textContent).toBe('↑ 2 places')
})

test('entered and dropped land under Gained and Lost', () => {
  const { container } = render(ui(MOVES))
  expect(chip('All').textContent).toBe('All 7')
  expect(chip('Gained').textContent).toBe('Gained 2')
  expect(chip('Lost').textContent).toBe('Lost 2')
  fireEvent.click(chip('Gained'))
  expect(order(container)).toEqual(['Prompt entered', 'Prompt gained'])
  fireEvent.click(chip('Lost'))
  expect(order(container)).toEqual(['Prompt lost', 'Prompt dropped'])
})

test('Rank Δ desc: entered above every gain, dropped below every loss, New and no data last; asc reverses the ranked part', () => {
  const { container } = render(ui(MOVES))
  const o = order(container)
  expect(o.slice(0, 5)).toEqual(['Prompt entered', 'Prompt gained', 'Prompt same', 'Prompt lost', 'Prompt dropped'])
  expect(new Set(o.slice(5))).toEqual(new Set(['Prompt new', 'Prompt none']))
  fireEvent.click(screen.getByText('Rank Δ'))
  fireEvent.click(screen.getByText('Rank Δ'))
  const asc = order(container)
  expect(asc.slice(0, 5)).toEqual(['Prompt dropped', 'Prompt lost', 'Prompt same', 'Prompt gained', 'Prompt entered'])
  expect(new Set(asc.slice(5))).toEqual(new Set(['Prompt new', 'Prompt none']))
})

test('the Rank header explains the figure', () => {
  const { container } = render(ui())
  const th = [...container.querySelectorAll('th')].find((t) => t.textContent?.startsWith('Rank') && !t.textContent.includes('Δ'))!
  expect(th.querySelector('[data-tooltip]')!.getAttribute('data-tooltip')).toBe(
    'Average position of the brand in AI answers that mention it, across the selected models. Lower is better.',
  )
})

test('in export mode a chip chosen on screen is ignored: the gains and losses print', () => {
  const { container, rerender } = render(ui(MOVES))
  fireEvent.click(chip('Lost'))
  expect(order(container)).toHaveLength(2)
  forced.exporting = true
  try {
    rerender(ui(MOVES))
    expect(screen.queryByRole('button', { name: /^Lost/ })).toBeNull()
    expect(order(container)).toHaveLength(4)
  } finally {
    forced.exporting = false
  }
})

test('in the export the card is not one block: the title keeps with the table and a long table splits between rows', () => {
  const many = Array.from({ length: 20 }, (_, i) => row(`p${i}`, { rankDelta: i }))
  const { container } = render(<ExportModeProvider>{ui(many, false)}</ExportModeProvider>)
  expect((container.firstChild as HTMLElement).hasAttribute('data-export-block')).toBe(false)
  // Over SortableTable's 15-row limit nothing holds the table whole: it breaks between its rows.
  expect(container.querySelector('[data-export-block]')).toBeNull()
  expect(container.querySelectorAll('tbody tr[data-export-row]')).toHaveLength(20)
  const title = screen.getByText('How is the brand ranking on each tracked prompt?').parentElement!
  expect(title.hasAttribute('data-export-keep-with-next')).toBe(true)
})

const bulk = (n: number, prefix: string, delta: (i: number) => number) =>
  Array.from({ length: n }, (_, i) => row(`${prefix}${i}`, { rankDelta: delta(i), rank: 2, priorRank: 2 + delta(i) }))
const GAINS = bulk(15, 'g', (i) => i + 1) // g14 is the biggest gain
const LOSSES = bulk(14, 'l', (i) => -(i + 1)) // l13 is the biggest loss
const SAMES = bulk(3, 's', () => 0)
const exportUi = (rows: PromptPerfRow[], showDeltas = true) => render(<ExportModeProvider>{ui(rows, showDeltas)}</ExportModeProvider>)
const tables = (c: HTMLElement) => [...c.querySelectorAll('[data-export-table]')] as HTMLElement[]
const rowsOf = (t: HTMLElement) => [...t.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('td')!.textContent)

test('export prints the 12 biggest gains and the 12 biggest losses, worst and best first', () => {
  const all = [...SAMES, ...GAINS, ...LOSSES, ENTERED, DROPPED]
  const { container } = exportUi(all)
  const [gains, losses] = tables(container)
  expect(tables(container)).toHaveLength(2)
  expect(rowsOf(gains)).toEqual(['Prompt entered', ...Array.from({ length: 11 }, (_, i) => `Prompt g${14 - i}`)])
  expect(rowsOf(losses)).toEqual(['Prompt dropped', ...Array.from({ length: 11 }, (_, i) => `Prompt l${13 - i}`)])
  expect(container.textContent).not.toContain('Prompt s0')
  expect(screen.getByText('Biggest gains')).toBeTruthy()
  expect(screen.getByText('Biggest losses')).toBeTruthy()
  expect(screen.getByText('Biggest gains').closest('[data-export-keep-with-next]')).toBeTruthy()
  expect(screen.getByText('Biggest losses').closest('[data-export-keep-with-next]')).toBeTruthy()
  expect(screen.queryByText(/^Showing/)).toBeNull()
  expect(screen.queryByRole('button')).toBeNull()
  // Same columns as on screen; the rows split between pages, so no table is one block.
  expect([...gains.querySelectorAll('th')].map((t) => t.textContent)).toEqual(['Prompt', 'Topic', 'Rank', 'Rank Δ', 'Visibility', 'Δ'])
  expect(container.querySelector('[data-export-block]')).toBeNull()
  expect(gains.querySelectorAll('tbody tr[data-export-row]')).toHaveLength(12)
})

test('export with no losses prints the empty line under Biggest losses', () => {
  const { container } = exportUi([...GAINS.slice(0, 3), ...SAMES])
  expect(rowsOf(tables(container)[0])).toHaveLength(3)
  expect(container.textContent).toContain('No prompts lost rank this period.')
  expect(container.textContent).not.toContain('No prompts gained rank this period.')
  expect(tables(container)).toHaveLength(1)
})

test('export with no gains prints the empty line under Biggest gains', () => {
  const { container } = exportUi(LOSSES.slice(0, 2))
  expect(container.textContent).toContain('No prompts gained rank this period.')
  expect(rowsOf(tables(container)[0])).toEqual(['Prompt l1', 'Prompt l0'])
})

test('export without deltas keeps one table: 25 rows, Rank ascending', () => {
  const rows = Array.from({ length: 32 }, (_, i) => row(`r${i}`, { rank: 32 - i }))
  const { container } = exportUi(rows, false)
  expect(tables(container)).toHaveLength(1)
  expect(screen.queryByText('Biggest gains')).toBeNull()
  const o = rowsOf(tables(container)[0])
  expect(o).toHaveLength(25)
  expect(o[0]).toBe('Prompt r31')
})

test('on screen the same 32 rows are unchanged: chips and a 25-row page', () => {
  const { container } = render(ui([...SAMES, ...GAINS, ...LOSSES]))
  expect(chip('Gained').textContent).toBe('Gained 15')
  expect(order(container)).toHaveLength(25)
  expect(screen.queryByText('Biggest gains')).toBeNull()
})
