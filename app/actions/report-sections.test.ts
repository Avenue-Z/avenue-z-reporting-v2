import { describe, expect, test } from 'vitest'
// Pure cores live in lib/report-sections/mutations.ts, imported by the
// `'use server'` action file report-sections.ts. Testing them there keeps this
// unit test free of the DB client / Next.js runtime (a `'use server'` module may
// only export async functions, so the cores can't live in the action file).
import { applyPinVersion, applyUnfreeze, computeFreeze } from '@/lib/report-sections/mutations'
import type { SectionTemplate } from '@/lib/report-sections/types'

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
