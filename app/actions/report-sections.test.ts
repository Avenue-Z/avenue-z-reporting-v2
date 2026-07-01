import { describe, expect, test } from 'vitest'
// Pure cores live in lib/report-sections/mutations.ts, imported by the
// `'use server'` action file report-sections.ts. Testing them there keeps this
// unit test free of the DB client / Next.js runtime (a `'use server'` module may
// only export async functions, so the cores can't live in the action file).
import { applyPinVersion, applyUnfreeze, computeFreeze, computePromotion } from '@/lib/report-sections/mutations'
import type { SectionTemplate } from '@/lib/report-sections/types'
import type { ResolvedPart } from '@/lib/report-sections/types'

const T: SectionTemplate = {
  order: [{ id: 'a', version: 1 }, { id: 'b', version: 1 }],
  labels: { a: 'A', b: 'B' },
  thresholds: {},
}

describe('applyPinVersion', () => {
  test('sets a version pin for the section, preserving other sections', () => {
    const c = applyPinVersion({ other: {} }, 'peec-ai', 'b', 2)
    expect(c['peec-ai'].versions).toEqual({ b: 2 })
    expect(c.other).toBeDefined()
  })
})

describe('computeFreeze', () => {
  test('materializes the resolved composition into a snapshot', () => {
    const snap = computeFreeze(T, { versions: { b: 2 } })
    expect(snap.order).toEqual([{ id: 'a', version: 1 }, { id: 'b', version: 2 }])
    expect(snap.labels).toEqual({ a: 'A', b: 'B' })
  })
})

describe('applyUnfreeze', () => {
  test('removes frozen but retains other diffs', () => {
    const c = applyUnfreeze({ 'peec-ai': { frozen: { order: [], labels: {}, thresholds: {} }, hidden: ['a'] } }, 'peec-ai')
    expect(c['peec-ai'].frozen).toBeUndefined()
    expect(c['peec-ai'].hidden).toEqual(['a'])
  })
})

const sourceResolved: ResolvedPart[] = [
  { id: 'a', version: 1, label: 'A' },
  { id: 'b', version: 2, label: 'B-experimental' },
]

describe('computePromotion', () => {
  test('promotes version pin only by default (labels untouched)', () => {
    const next = computePromotion(T, sourceResolved, ['b'], {})
    expect(next.order.find((p) => p.id === 'b')!.version).toBe(2)
    expect(next.labels.b).toBe('B') // NOT 'B-experimental'
  })
  test('opts.labels lifts the source label too', () => {
    const next = computePromotion(T, sourceResolved, ['b'], { labels: true })
    expect(next.labels.b).toBe('B-experimental')
  })
  test('allows a backward move', () => {
    const src: ResolvedPart[] = [{ id: 'b', version: 1, label: 'B' }]
    const from: SectionTemplate = { order: [{ id: 'b', version: 3 }], labels: {}, thresholds: {} }
    expect(computePromotion(from, src, ['b'], {}).order[0].version).toBe(1)
  })
  test('ignores partIds not present in the source resolution', () => {
    const next = computePromotion(T, sourceResolved, ['zzz'], {})
    expect(next).toEqual(T)
  })
})

import { validateSectionOverride } from '@/lib/report-sections/mutations'
import type { PartRegistry } from '@/lib/report-sections/types'

const reg: PartRegistry<unknown> = {
  a: { 1: { id: 'a', version: 1, published: true, defaultLabel: 'A', render: () => null } },
}

describe('validateSectionOverride', () => {
  test('rejects an override that re-adds a template id via extraParts', () => {
    expect(() =>
      validateSectionOverride('peec-ai', { extraParts: [{ id: 'a', version: 1 }] }, { 'peec-ai': reg }, ['a']),
    ).toThrow(/extraParts/)
  })
  test('accepts a clean hide/order override', () => {
    expect(validateSectionOverride('peec-ai', { hidden: ['a'] }, { 'peec-ai': reg }, ['a'])['peec-ai'].hidden).toEqual(
      ['a'],
    )
  })
})
