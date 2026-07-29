import { expect, test } from 'vitest'
import { buildPlatformHeadline, overviewMetricNames } from './headline-build'
import { OVERVIEW_KPI_KEYS, metricForKey, type DashChannel } from './metrics'
import type { TotalMetric } from '@/lib/dash-social/types'

// Build a raw Dash metrics map keyed by the ACTIVE-basis metric names, from KPI-key
// values. Basis-agnostic: it derives the names via metricForKey, so these tests keep
// passing whichever basis REPORTING_BASIS holds.
function metricsFor(
  channel: DashChannel,
  vals: Partial<Record<(typeof OVERVIEW_KPI_KEYS)[number], { value: number | null; context?: number | null }>>,
): Record<string, TotalMetric> {
  const out: Record<string, TotalMetric> = {}
  for (const key of OVERVIEW_KPI_KEYS) {
    const v = vals[key]
    if (!v) continue
    out[metricForKey(channel, key)] = { value: v.value, context: v.context ?? null, context_change: null }
  }
  return out
}

const full = (channel: DashChannel) =>
  metricsFor(channel, {
    followers: { value: 1346 }, netNewFollowers: { value: 1 }, exposure: { value: 299 },
    engagements: { value: 48 }, engagementRate: { value: 0.21 },
  })

test('overviewMetricNames returns the five active-basis metric names', () => {
  const names = overviewMetricNames('TWITTER')
  expect(names).toHaveLength(5)
  expect(names).toContain(metricForKey('TWITTER', 'exposure')) // IMPRESSIONS_BY_POST under byPost
})

test('maps all five present metrics into the fixed headline shape', () => {
  const h = buildPlatformHeadline('TWITTER', full('TWITTER'))
  expect(h.channel).toBe('TWITTER')
  expect(h.label).toBe('X')
  expect(h.exposureLabel).toBe('Impressions')
  expect(h.followers).toBe(1346)
  expect(h.exposure).toBe(299)
  expect(h.engagements).toBe(48)
  expect(h.engagementRate).toBeCloseTo(21) // Dash 0.21 fraction → 21%
})

test('exposure label is Views for Instagram, Impressions for X', () => {
  expect(buildPlatformHeadline('INSTAGRAM', full('INSTAGRAM')).exposureLabel).toBe('Views')
  expect(buildPlatformHeadline('TWITTER', full('TWITTER')).exposureLabel).toBe('Impressions')
})

// The blocker #1 guard: a 200 that OMITS a requested metric is a partial/malformed
// payload and must NOT render a fabricated 0 — it must throw so the channel drops.
test('throws when the payload omits a requested metric (no silent zero)', () => {
  const m = full('LINKEDIN')
  delete m[metricForKey('LINKEDIN', 'exposure')]
  expect(() => buildPlatformHeadline('LINKEDIN', m)).toThrow(/omitted requested metric/)
})

test('names the omitted metric in the error', () => {
  const m = full('TWITTER')
  const engMetric = metricForKey('TWITTER', 'engagements')
  delete m[engMetric]
  expect(() => buildPlatformHeadline('TWITTER', m)).toThrow(engMetric)
})

// A PRESENT value:null is a genuine no-data zero — preserved via `?? 0`, not thrown.
test('a present value:null renders 0 rather than throwing', () => {
  const m = metricsFor('INSTAGRAM', {
    followers: { value: 10 }, netNewFollowers: { value: 0 }, exposure: { value: null },
    engagements: { value: 0 }, engagementRate: { value: 0 },
  })
  const h = buildPlatformHeadline('INSTAGRAM', m)
  expect(h.exposure).toBe(0)
})

test('deltas computed from context; pruned to undefined when no context present', () => {
  const withCtx = metricsFor('TWITTER', {
    followers: { value: 110, context: 100 }, netNewFollowers: { value: 1 },
    exposure: { value: 299 }, engagements: { value: 48 }, engagementRate: { value: 0.21 },
  })
  expect(buildPlatformHeadline('TWITTER', withCtx).deltas?.followers).toBeCloseTo(10)

  expect(buildPlatformHeadline('TWITTER', full('TWITTER')).deltas).toBeUndefined()
})
