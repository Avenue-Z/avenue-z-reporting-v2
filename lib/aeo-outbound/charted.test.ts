import { expect, test } from 'vitest'
import { chartedBrands } from './charted'
import { visibilityBarFigure } from './charts'

// Spec 2026-10-22 (round 3 QA) F1: one rule decides the charted brands, for the bar chart and the gaps list.
const brands = (n: number, ownAt: number) => Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: `Brand${i}`, visibilityPct: 60 - i, isOwn: i === ownAt }))
const drawn = (b: { name: string; visibilityPct: number; isOwn?: boolean }[]) => [...(visibilityBarFigure(b).data[0] as { y: string[] }).y].reverse()

test('chartedBrands returns the same objects the bar chart draws, in the same order', () => {
  for (const b of [brands(12, 11), brands(12, 3), brands(4, 1), brands(25, 0)]) {
    const c = chartedBrands(b)
    expect(c.map((x) => x.name)).toEqual(drawn(b))
    for (const x of c) expect(b).toContain(x)
  }
})

test('the brand outside the top 10 takes the tenth place; an empty list gives an empty list', () => {
  expect(chartedBrands(brands(12, 11)).map((x) => x.id)).toEqual(['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b11'])
  expect(chartedBrands([])).toEqual([])
})
