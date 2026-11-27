import { describe, expect, test } from 'vitest'
import type { ResolvedPart } from '@/lib/report-sections/types'
import { groupParts, isV2Layout, sectionsPresent, V2_PART_SECTIONS } from './sections'

const p = (id: string, version: number): ResolvedPart => ({ id, version, label: id })
const map = { 'a@2': '01', 'b@2': '02', 'c@2': '02' } as const
const parts = [p('syn', 1), p('a', 2), p('b', 2), p('bespoke', 1), p('c', 2), p('footer', 1)]

describe('isV2Layout', () => {
  test('false for a v1 part, true for a mapped v2 part', () => {
    expect(isV2Layout([p('a', 1)], map)).toBe(false)
    expect(isV2Layout([p('a', 2)], map)).toBe(true)
  })
  test('default map holds only registered v2 parts; an unmapped part is not v2', () => {
    expect(V2_PART_SECTIONS).toEqual({ 'cited-sources@1': '05' })
    expect(isV2Layout([p('a', 2)])).toBe(false)
  })
  test('cited-sources@1 makes a layout v2 with the real map', () => {
    expect(isV2Layout([p('cited-sources', 1)])).toBe(true)
  })
})

describe('groupParts', () => {
  test('consecutive runs, header only on the first group of a section', () => {
    const g = groupParts(parts, map)
    expect(g.map((x) => x.section)).toEqual([null, '01', '02', null, '02', null])
    expect(g.map((x) => x.showHeader)).toEqual([false, true, true, false, false, false])
  })
  test('sectionsPresent is unique and in page order', () => {
    expect(sectionsPresent(groupParts(parts, map))).toEqual(['01', '02'])
  })
})
