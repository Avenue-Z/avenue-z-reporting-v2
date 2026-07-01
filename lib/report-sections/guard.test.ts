import { describe, expect, test } from 'vitest'
import { assertReferencedPinsPublished, collectReferencedPins, mergeRegistries } from './registry'
import type { PartRegistry, SectionTemplate } from './types'

// A local fake registry keeps this task self-contained; Task 17 adds a second guard test
// wired to the REAL PEEC_PARTS + BESPOKE_PARTS so the actual section is guarded in CI.
const reg: PartRegistry<unknown> = {
  a: { 1: { id: 'a', version: 1, published: true, defaultLabel: 'A', render: () => null } },
  b: { 1: { id: 'b', version: 1, published: false, defaultLabel: 'B', render: () => null } },
}
const T: SectionTemplate = { order: [{ id: 'a', version: 1 }], labels: {}, thresholds: {} }

describe('existence guard', () => {
  test('passes when every referenced pin exists and is published', () => {
    expect(assertReferencedPinsPublished(reg, collectReferencedPins(T, []))).toEqual([])
  })
  test('flags a missing pin', () => {
    expect(assertReferencedPinsPublished(reg, [{ id: 'z', version: 1 }])).toContain('missing part z@1')
  })
  test('flags an unpublished referenced pin', () => {
    expect(assertReferencedPinsPublished(reg, [{ id: 'b', version: 1 }])[0]).toContain('not published')
  })
  test('mergeRegistries overlays bespoke onto core', () => {
    const merged = mergeRegistries(reg, { a: { 2: { id: 'a', version: 2, published: true, defaultLabel: 'A2', render: () => null } } })
    expect(Object.keys(merged.a).sort()).toEqual(['1', '2'])
  })
})
