import { describe, expect, test } from 'vitest'
import { resolveSection } from './resolve'
import type { SectionTemplate } from './types'

const T: SectionTemplate = {
  order: [
    { id: 'a', version: 1 },
    { id: 'b', version: 1 },
    { id: 'c', version: 1 },
  ],
  labels: { a: 'A', b: 'B', c: 'C' },
  thresholds: { b: 10 },
}

describe('resolveSection — unlocked base', () => {
  test('no override inherits template order, versions, labels', () => {
    expect(resolveSection(T, undefined)).toEqual([
      { id: 'a', version: 1, label: 'A' },
      { id: 'b', version: 1, label: 'B', threshold: 10 },
      { id: 'c', version: 1, label: 'C' },
    ])
  })

  test('version pin swaps only the named part', () => {
    const r = resolveSection(T, { versions: { b: 2 } })
    expect(r.map((p) => [p.id, p.version])).toEqual([['a', 1], ['b', 2], ['c', 1]])
  })

  test('hidden removes the id', () => {
    expect(resolveSection(T, { hidden: ['b'] }).map((p) => p.id)).toEqual(['a', 'c'])
  })

  test('partial order: listed first, remainder template-relative', () => {
    expect(resolveSection(T, { order: ['c', 'a'] }).map((p) => p.id)).toEqual(['c', 'a', 'b'])
  })

  test('label + threshold overrides layer on template defaults', () => {
    const r = resolveSection(T, { labels: { a: 'A2' }, thresholds: { b: 99 } })
    expect(r[0].label).toBe('A2')
    expect(r[1].threshold).toBe(99)
  })

  test('extraParts appended after template ids in extraParts order', () => {
    const r = resolveSection(T, { extraParts: [{ id: 'x', version: 3 }] })
    expect(r.map((p) => [p.id, p.version])).toEqual([['a', 1], ['b', 1], ['c', 1], ['x', 3]])
    expect(r[3].label).toBe('x') // no template/override label → falls back to id (see impl note)
  })
})
