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

describe('resolveSection — combinatorial + frozen', () => {
  test('order referencing an extraParts id places it at that position', () => {
    const r = resolveSection(T, { extraParts: [{ id: 'x', version: 2 }], order: ['x', 'a'] })
    expect(r.map((p) => p.id)).toEqual(['x', 'a', 'b', 'c'])
  })

  test('order referencing a hidden id is ignored', () => {
    const r = resolveSection(T, { hidden: ['b'], order: ['b', 'c'] })
    expect(r.map((p) => p.id)).toEqual(['c', 'a'])
  })

  test('order referencing an unknown id is ignored, no throw', () => {
    const r = resolveSection(T, { order: ['zzz', 'a'] })
    expect(r.map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  test('id in both extraParts and hidden ends up hidden', () => {
    const r = resolveSection(T, { extraParts: [{ id: 'x', version: 2 }], hidden: ['x'] })
    expect(r.map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  test('id in both base and extraParts at different version: base kept, extra dropped', () => {
    const r = resolveSection(T, { extraParts: [{ id: 'b', version: 5 }] })
    const b = r.find((p) => p.id === 'b')!
    expect(b.version).toBe(1) // base version wins; re-versioning is override.versions job
    expect(r.map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  test('id repeated in order is emitted once', () => {
    const r = resolveSection(T, { order: ['a', 'a', 'b'] })
    expect(r.map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  test('frozen base is used and override.versions does NOT change frozen versions', () => {
    const frozen = {
      order: [{ id: 'a', version: 1 }, { id: 'b', version: 1 }],
      labels: { a: 'A', b: 'B' },
      thresholds: {},
    }
    // Template has moved on to b@9, but the frozen client must stay b@1.
    const movedOn: SectionTemplate = {
      order: [{ id: 'a', version: 1 }, { id: 'b', version: 9 }, { id: 'c', version: 1 }],
      labels: { a: 'A', b: 'B', c: 'C' },
      thresholds: {},
    }
    const r = resolveSection(movedOn, { frozen, versions: { b: 2 } })
    expect(r.map((p) => [p.id, p.version])).toEqual([['a', 1], ['b', 1]]) // c absent, b stays 1
  })

  test('frozen still honors hidden/order/label overrides layered on the snapshot', () => {
    const frozen = {
      order: [{ id: 'a', version: 1 }, { id: 'b', version: 1 }],
      labels: { a: 'A', b: 'B' },
      thresholds: {},
    }
    const r = resolveSection(T, { frozen, hidden: ['a'], labels: { b: 'B-frozen' } })
    expect(r.map((p) => p.id)).toEqual(['b'])
    expect(r[0].label).toBe('B-frozen')
  })
})
