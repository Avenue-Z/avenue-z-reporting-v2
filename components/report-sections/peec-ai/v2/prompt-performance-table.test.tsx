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
  row('none', { rank: null, priorRank: 2, rankDelta: null }),
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

test('in export mode a chip chosen on screen is ignored: every row of page 1 prints', () => {
  const { container, rerender } = render(ui(MOVES))
  fireEvent.click(chip('Lost'))
  expect(order(container)).toHaveLength(2)
  forced.exporting = true
  try {
    rerender(ui(MOVES))
    expect(screen.queryByRole('button', { name: /^Lost/ })).toBeNull()
    expect(order(container)).toHaveLength(7)
  } finally {
    forced.exporting = false
  }
})
