import { expect, test } from 'vitest'
import { outlineDelta } from './outline-delta'
import { delta } from './headline-build'
import { buildOutlineKpis } from './outline-headlines'
import { buildMediaKpis } from './outline-media'
import type { KpiSpec } from './metrics'

// Plan 2026-09-24-qa-fixes §5 (F2): the outline tiles' change follows the direction of change, not
// the sign of last period. Every number here is invented.
const m = (value: number | null, context: number | null) => ({ value, context, context_change: null })
const NET_NEW: KpiSpec = { key: 'netNewFollowers', label: 'Net New Followers', format: 'number', metric: { allPosts: 'NET_NEW_FOLLOWERS', byPost: 'NET_NEW_FOLLOWERS' } }

// Fail before the call sites switch: the outline tiles and the media row use it.
test('an outline tile going from a negative prior to a larger value shows a rise', () => {
  const built = buildOutlineKpis('INSTAGRAM', { NET_NEW_FOLLOWERS: m(4, -2) }, [NET_NEW])
  expect(built.kpis.netNewFollowers.delta).toBe(300)
})
test('the outline media row follows the same rule', () => {
  const data = { 1: {}, reel: { metrics: { VIEWS: { ALL_CHANNELS: m(4, -2) } } } }
  const kpis = buildMediaKpis('INSTAGRAM', data as never, 1, [{ key: 'videoViews', label: 'Video Views', mediaType: 'reel', metric: 'VIEWS' }])
  expect(kpis.videoViews.delta).toBe(300)
})

// Guard: breaks if Math.abs(prev) became prev.
test('the change is measured against the size of the prior value', () => {
  expect(outlineDelta(m(4, -2))).toBe(300)
  expect(outlineDelta(m(-10, 5))).toBe(-300)
  expect(outlineDelta(m(-10, -5))).toBe(-100)
  expect(outlineDelta(m(-2, -5))).toBe(60)
})
// Guard: breaks if the no-comparison check were dropped.
test('no prior, a prior of 0, or no metric is no comparison', () => {
  expect(outlineDelta(m(4, 0))).toBeUndefined()
  expect(outlineDelta(m(4, null))).toBeUndefined()
  expect(outlineDelta(undefined)).toBeUndefined()
})
// Guard: breaks on any change to the numerator. Where the bug cannot occur, nothing changes.
test('for a positive prior it equals the shared delta()', () => {
  for (const [cur, prev] of [[0, 3], [3, 3], [9, 3], [1, 7], [250, 40], [-4, 6]]) {
    expect(outlineDelta(m(cur, prev))).toBeCloseTo(delta(m(cur, prev))!, 10)
  }
})
// Guard: pins Renaissance. The shared delta() keeps dividing by the signed prior, on purpose.
test('the shared delta() Renaissance reads is left signed', () => {
  expect(delta(m(4, -2))).toBe(-300)
})
