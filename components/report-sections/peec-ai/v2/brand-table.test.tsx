import { expect, test } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { BrandRowV2 } from '@/lib/aeo/v2/types'
import { BrandTableV2 } from './brand-table'

const row = (rank: number, over: Partial<BrandRowV2> = {}): BrandRowV2 => ({
  name: `Brand ${rank}`, isYou: false, rank,
  visibility: 60 - rank, visibilityPrior: 58 - rank,
  sov: 30 - rank, sovPrior: 29 - rank,
  usedAsSource: 20 - rank, usedAsSourcePrior: 19 - rank,
  ...over,
})
const rows = (youRank: number | null, n = 14) =>
  Array.from({ length: n }, (_, i) => row(i + 1, youRank === i + 1 ? { isYou: true } : {}))

const ui = (r: BrandRowV2[], over: Partial<Parameters<typeof BrandTableV2>[0]> = {}) => (
  <TooltipProvider>
    <BrandTableV2 rows={r} colors={{}} showDeltas usedAsSourceBasis="answers" note={null} {...over} />
  </TooltipProvider>
)
const bodyRows = (c: HTMLElement) => [...c.querySelectorAll('tbody tr')]

test('a client outside the top 10 is pinned as the 11th row; See all removes the pin', () => {
  const { container } = render(ui(rows(14)))
  const trs = bodyRows(container)
  expect(trs).toHaveLength(11)
  const last = trs[10]
  expect(last.hasAttribute('data-pinned')).toBe(true)
  expect(last.textContent).toContain('#14')
  expect(last.className).toContain('border-dashed')
  fireEvent.click(screen.getByText('See all 14 rows'))
  expect(bodyRows(container)).toHaveLength(14)
  expect(container.querySelector('[data-pinned]')).toBeNull()
})

test('a client inside the top 10, or no client, pins nothing', () => {
  const a = render(ui(rows(3)))
  expect(bodyRows(a.container)).toHaveLength(10)
  expect(a.container.querySelector('[data-pinned]')).toBeNull()
  a.unmount()
  const b = render(ui(rows(null)))
  expect(bodyRows(b.container)).toHaveLength(10)
  expect(b.container.querySelector('[data-pinned]')).toBeNull()
})

test('showDeltas off removes every Δ column', () => {
  const { container } = render(ui(rows(3), { showDeltas: false }))
  expect([...container.querySelectorAll('th')].some((t) => t.textContent?.includes('Δ'))).toBe(false)
})

test('showDeltas on has a Δ after each of the three metrics', () => {
  const { container } = render(ui(rows(3)))
  expect([...container.querySelectorAll('th')].filter((t) => t.textContent?.includes('Δ'))).toHaveLength(3)
})

test('a null prior shows – in its Δ cell, not 0', () => {
  const r = rows(3)
  r[0] = { ...r[0], visibilityPrior: null }
  const { container } = render(ui(r))
  const cells = [...bodyRows(container)[0].querySelectorAll('td')].map((td) => td.textContent)
  // # | Brand | Visibility | Δ | SoV | Δ | Used | Δ
  expect(cells[3]).toBe('–')
  expect(cells[5]).not.toBe('–')
})

test('a null metric renders –', () => {
  const r = rows(3)
  r[0] = { ...r[0], usedAsSource: null, usedAsSourcePrior: null }
  const { container } = render(ui(r))
  const cells = [...bodyRows(container)[0].querySelectorAll('td')].map((td) => td.textContent)
  expect(cells[6]).toBe('–')
  expect(cells[7]).toBe('–')
})

test('the third metric is labelled by basis', () => {
  const a = render(ui(rows(3)))
  expect(a.container.textContent).toContain('Used as a source %')
  a.unmount()
  const b = render(ui(rows(3), { usedAsSourceBasis: 'citations' }))
  expect(b.container.textContent).toContain('Citation share %')
  expect(b.container.textContent).not.toContain('Used as a source %')
})

test('no Position column; title, client color and shading', () => {
  const { container, getByText } = render(ui(rows(3)))
  expect(container.textContent).not.toContain('Position')
  expect(getByText('Which brands appear most often in AI answers?')).toBeTruthy()
  expect(getByText('Brand 3').className).toContain('text-[#60FDFF]')
  expect(getByText('Brand 3').closest('tr')!.className).toContain('bg-white/[0.03]')
})

test('a note is shown when given', () => {
  render(ui(rows(3), { note: 'Model filter not applied here: all models.' }))
  expect(screen.getByText('Model filter not applied here: all models.')).toBeTruthy()
})
