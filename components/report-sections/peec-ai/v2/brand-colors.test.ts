import { test, expect } from 'vitest'
import { CHART_COLORS } from '@/lib/constants'
import { BRAND_PALETTE, FALLBACK_COLOR, brandColors, brandKey } from './brand-colors'

test('BRAND_PALETTE has the twelve approved hexes in order', () => {
  expect(BRAND_PALETTE).toEqual([
    '#6034FF', '#FFFC60', '#FF8A3D', '#39A0FF', '#FF6B8A', '#96BF48',
    '#C084FC', '#F59E0B', '#2DD4BF', '#F472B6', '#A3A3A3', '#84CC16',
  ])
})

test('brandColors gives "you" the primary cyan and the rest palette slots by sorted name', () => {
  const colors = brandColors(['Unum', 'Renaissance', 'Aflac'], 'Renaissance')
  expect(colors.Renaissance).toBe(CHART_COLORS.primary)
  expect(colors.Renaissance).toBe('#60FDFF')
  expect(colors.Aflac).toBe('#6034FF')
  expect(colors.Unum).toBe('#FFFC60')
})

test('brandColors does not depend on roster order', () => {
  const a = brandColors(['Unum', 'Renaissance', 'Aflac'], 'Renaissance')
  const b = brandColors(['Aflac', 'Renaissance', 'Unum'], 'Renaissance')
  expect(b).toEqual(a)
})

test('brandColors with no "you" gives every brand a palette slot', () => {
  const colors = brandColors(['Unum', 'Aflac'], null)
  expect(colors).toEqual({ Aflac: '#6034FF', Unum: '#FFFC60' })
})

test('brandColors wraps the palette after twelve other brands', () => {
  const roster = Array.from({ length: 13 }, (_, i) => `Brand ${String(i).padStart(2, '0')}`)
  const colors = brandColors(roster, null)
  expect(colors['Brand 00']).toBe(BRAND_PALETTE[0])
  expect(colors['Brand 12']).toBe(BRAND_PALETTE[0])
})

test('brandKey lowercases and hyphenates', () => {
  expect(brandKey('Mutual of Omaha')).toBe('mutual-of-omaha')
})

test('brandKey strips diacritics', () => {
  expect(brandKey('Nestlé')).toBe('nestle')
})

test('brandKey collapses punctuation runs and trims hyphens', () => {
  expect(brandKey('  Dearborn Group, Inc. ')).toBe('dearborn-group-inc')
})

// Final review M7: one fallback grey for a brand the roster lacks, distinct from every palette slot.
test('FALLBACK_COLOR is a grey outside the palette', () => {
  expect(FALLBACK_COLOR).toBe('#6B7280')
  expect((BRAND_PALETTE as readonly string[]).includes(FALLBACK_COLOR)).toBe(false)
})
