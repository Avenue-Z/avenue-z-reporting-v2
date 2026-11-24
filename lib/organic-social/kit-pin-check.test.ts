import { describe, expect, test } from 'vitest'
import { kitPinProblems, sharedKitPinProblems } from './kit-pin-check'
import type { PartRegistry, SectionTemplate } from '@/lib/report-sections/types'
import { SHARED_PARTS } from '@/components/report-sections/shared/parts/registry'

// Spec test 10 (docs/superpowers/specs/2026-11-24-os-design-past-months.md, section 3): a kit version may only replace the
// exact version it wraps, as the client resolves it today (template row or code template, plus its override).
const PLATFORM: SectionTemplate = {
  order: [{ id: 'platform-headlines', version: 1 }, { id: 'follower-graph', version: 1 }, { id: 'engagement-trend', version: 1 }, { id: 'top-content', version: 2 }],
  labels: {}, thresholds: {},
}

describe('kitPinProblems', () => {
  test('ytd-review@4 to @5 is refused, naming @5, the @2 it wraps and the @4 the client draws', () => {
    const problems = kitPinProblems(PLATFORM, { extraParts: [{ id: 'ytd-review', version: 4 }] }, { extraParts: [{ id: 'ytd-review', version: 5 }] })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/ytd-review@5/)
    expect(problems[0]).toMatch(/@2/)
    expect(problems[0]).toMatch(/@4/)
  })
  test('ytd-review@2 to @5 is fine', () => {
    expect(kitPinProblems(PLATFORM, { extraParts: [{ id: 'ytd-review', version: 2 }] }, { extraParts: [{ id: 'ytd-review', version: 5 }] })).toEqual([])
  })
  test('the version the client draws can come from the template row, not the override', () => {
    const problems = kitPinProblems(PLATFORM, undefined, { versions: { 'follower-graph': 3 } })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/follower-graph@3/)
    expect(problems[0]).toMatch(/@1/)
  })
  test('the same pin against a template that already draws the wrapped version is fine', () => {
    const t: SectionTemplate = { ...PLATFORM, order: PLATFORM.order.map((p) => p.id === 'follower-graph' ? { ...p, version: 2 } : p) }
    expect(kitPinProblems(t, undefined, { versions: { 'follower-graph': 3 } })).toEqual([])
  })
  test('a kit version the client did not draw before (a new extraPart) is refused', () => {
    const problems = kitPinProblems(PLATFORM, undefined, { extraParts: [{ id: 'engagement-breakdown', version: 2 }] })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/engagement-breakdown@2/)
  })
  test('a kit version already pinned before and after is fine', () => {
    const o = { versions: { 'top-content': 4 } }
    expect(kitPinProblems(PLATFORM, o, o)).toEqual([])
  })
  test('a change that is not a kit version is fine', () => {
    expect(kitPinProblems(PLATFORM, undefined, { versions: { 'top-content': 3 } })).toEqual([])
    expect(kitPinProblems(PLATFORM, undefined, { hidden: ['follower-graph'] })).toEqual([])
  })
  test('every kit pin of round 2 over the versions each wraps is fine, all at once', () => {
    const before = { versions: { 'platform-headlines': 2, 'follower-graph': 2, 'engagement-trend': 2, 'top-content': 3 }, extraParts: [{ id: 'engagement-breakdown', version: 1 }, { id: 'ytd-review', version: 2 }] }
    const after = { versions: { 'platform-headlines': 4, 'follower-graph': 3, 'engagement-trend': 3, 'top-content': 4 }, extraParts: [{ id: 'engagement-breakdown', version: 2 }, { id: 'ytd-review', version: 5 }] }
    expect(kitPinProblems(PLATFORM, before, after)).toEqual([])
  })
})

// The shared boxes, read the way the app resolves them (resolveSharedParts, components/report-sections/shared/parts/
// resolve.ts): a pin the registry does not know is dropped, and a duplicate is drawn as many times as it appears
// (Paul, #512). SHARED is the real registry, cast as the app casts it (shared-parts-header.tsx:23); WITH_V3 adds a
// registered @3 that is neither kit nor wrapped.
const SHARED = SHARED_PARTS as unknown as PartRegistry<unknown>
const WITH_V3 = { ...SHARED, commentary: { ...SHARED.commentary, 3: { ...SHARED.commentary[1], version: 3 } } } as PartRegistry<unknown>
const c = (...versions: number[]) => versions.map((version) => ({ id: 'commentary', version }))

describe('sharedKitPinProblems', () => {
  test('commentary@1 to @2 is fine', () => {
    expect(sharedKitPinProblems(c(1), c(2), SHARED)).toEqual([])
  })
  test('absent to @2 is refused', () => {
    const problems = sharedKitPinProblems(undefined, c(2), SHARED)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/commentary@2/)
  })
  test('already @2 before and after is fine; a non-kit change is fine', () => {
    expect(sharedKitPinProblems([{ id: 'recommendations', version: 2 }], [{ id: 'recommendations', version: 2 }], SHARED)).toEqual([])
    expect(sharedKitPinProblems(undefined, c(1), SHARED)).toEqual([])
  })
  test('a pin the registry does not know is dropped before, as the app does: [@1, @9] to @2 is fine', () => {
    expect(sharedKitPinProblems(c(1, 9), c(2), SHARED)).toEqual([])
  })
  test('only an unknown pin before draws nothing, so @2 is refused and says so', () => {
    const problems = sharedKitPinProblems(c(9), c(2), SHARED)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/draws nothing/)
  })
  test('a duplicate before is drawn every time: [@1, @1] to @2 is fine', () => {
    expect(sharedKitPinProblems(c(1, 1), c(2), SHARED)).toEqual([])
  })
  test('a duplicate drawing another registered version is refused, naming every version drawn', () => {
    const problems = sharedKitPinProblems(c(1, 3), c(2), WITH_V3)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/@1 and @3/)
  })
})
