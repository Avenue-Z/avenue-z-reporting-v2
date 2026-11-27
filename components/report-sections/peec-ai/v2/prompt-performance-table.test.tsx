import { expect, test } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ExportModeProvider } from '@/components/export/export-mode'
import type { PromptPerfRow } from './topics'
import { PromptPerformanceTable } from './prompt-performance-table'

const row = (id: string, over: Partial<PromptPerfRow>): PromptPerfRow => ({
  id, text: `Prompt ${id}`, topic: 'Pricing', rank: 2, priorRank: 2, rankDelta: 0, isNew: false,
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

test('chips filter and show counts; All lists everything', () => {
  const { container } = render(ui())
  const chip = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) })
  expect(chip('All').textContent).toContain('5')
  expect(chip('Gained').textContent).toContain('1')
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
