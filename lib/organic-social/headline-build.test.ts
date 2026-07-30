import { expect, test } from 'vitest'
import { buildPlatformHeadline, metricNamesFor } from './headline-build'
import { OVERVIEW_KPI_KEYS, platformKpiKeys, metricForKey, type DashChannel } from './metrics'
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

// Every key in `keys` present with the same value — for the full platform set.
function metricsForKeys(channel: DashChannel, keys: readonly string[], v: number): Record<string, TotalMetric> {
  return Object.fromEntries(
    keys.map((k) => [metricForKey(channel, k), { value: v, context: null, context_change: null }]),
  )
}

const full = (channel: DashChannel) =>
  metricsFor(channel, {
    followers: { value: 1346 }, netNewFollowers: { value: 1 }, exposure: { value: 299 },
    engagements: { value: 48 }, engagementRate: { value: 0.21 },
  })

test('metricNamesFor returns the active-basis metric names for the given keys', () => {
  const names = metricNamesFor('TWITTER', OVERVIEW_KPI_KEYS)
  expect(names).toHaveLength(5)
  expect(names).toContain(metricForKey('TWITTER', 'exposure')) // IMPRESSIONS_BY_POST under byPost
})

test('Overview builds exactly the five OVERVIEW_KPI_KEYS, in order', () => {
  const h = buildPlatformHeadline('TWITTER', full('TWITTER'), OVERVIEW_KPI_KEYS, false)
  expect(h.channel).toBe('TWITTER')
  expect(h.label).toBe('X')
  expect(h.kpis.map((k) => k.key)).toEqual([...OVERVIEW_KPI_KEYS])
})

test('platform build includes the full per-channel KPI set, in order', () => {
  const keys = platformKpiKeys('LINKEDIN')
  expect(keys.length).toBe(10)
  const m = metricsForKeys('LINKEDIN', keys, 1)
  const h = buildPlatformHeadline('LINKEDIN', m, keys, true)
  expect(h.kpis.map((k) => k.key)).toEqual(keys)
  expect(h.kpis.find((k) => k.key === 'profileViews')?.label).toBe('Profile Views')
})

test('exposure label is Views for Instagram, Impressions for X', () => {
  const ig = buildPlatformHeadline('INSTAGRAM', full('INSTAGRAM'), OVERVIEW_KPI_KEYS, false)
  const x = buildPlatformHeadline('TWITTER', full('TWITTER'), OVERVIEW_KPI_KEYS, false)
  expect(ig.kpis.find((k) => k.key === 'exposure')?.label).toBe('Views')
  expect(x.kpis.find((k) => k.key === 'exposure')?.label).toBe('Impressions')
})

test('percent KPIs carry format percent; number KPIs number', () => {
  const h = buildPlatformHeadline('INSTAGRAM', full('INSTAGRAM'), OVERVIEW_KPI_KEYS, false)
  expect(h.kpis.find((k) => k.key === 'engagementRate')?.format).toBe('percent')
  expect(h.kpis.find((k) => k.key === 'followers')?.format).toBe('number')
})

test('X uses Profile Clicks (not Views); Facebook omits Profile Views', () => {
  const x = platformKpiKeys('TWITTER')
  expect(x).toContain('profileClicks')
  expect(x).not.toContain('profileViews')
  const xh = buildPlatformHeadline('TWITTER', metricsForKeys('TWITTER', x, 1), x, true)
  expect(xh.kpis.find((k) => k.key === 'profileClicks')?.label).toBe('Profile Clicks')
  expect(platformKpiKeys('FACEBOOK')).not.toContain('profileViews')
})

test('Facebook engagements carries the decision-6 footnote on the scoped platform build', () => {
  const keys = platformKpiKeys('FACEBOOK')
  const h = buildPlatformHeadline('FACEBOOK', metricsForKeys('FACEBOOK', keys, 1), keys, true)
  expect(h.kpis.find((k) => k.key === 'engagements')?.footnote).toMatch(/Influencer/)
})

// PR #174 review #2: footnote is a platform-subpage-only caveat — Overview must render
// byte-identically, so it must NOT pick up Facebook's influencer-inclusion footnote even
// though 'engagements' is one of the five OVERVIEW_KPI_KEYS.
test('Facebook engagements carries no footnote on the unscoped Overview build', () => {
  const h = buildPlatformHeadline('FACEBOOK', full('FACEBOOK'), OVERVIEW_KPI_KEYS, false)
  expect(h.kpis.find((k) => k.key === 'engagements')?.footnote).toBeUndefined()
})

// The blocker #1 guard: a 200 that OMITS a requested metric is a partial/malformed
// payload and must NOT render a fabricated 0 — it must throw so the channel drops.
test('omitted requested metric still throws (guard preserved)', () => {
  const keys = platformKpiKeys('LINKEDIN')
  const m = metricsForKeys('LINKEDIN', keys, 1)
  delete m[metricForKey('LINKEDIN', 'shares')]
  expect(() => buildPlatformHeadline('LINKEDIN', m, keys, true)).toThrow(/omitted requested metric/)
})

test('names the omitted metric in the error', () => {
  const m = full('TWITTER')
  const engMetric = metricForKey('TWITTER', 'engagements')
  delete m[engMetric]
  expect(() => buildPlatformHeadline('TWITTER', m, OVERVIEW_KPI_KEYS, false)).toThrow(engMetric)
})

// A PRESENT value:null is a genuine no-data zero — preserved via `?? 0`, not thrown.
test('a present value:null renders 0 rather than throwing', () => {
  const m = metricsFor('INSTAGRAM', {
    followers: { value: 10 }, netNewFollowers: { value: 0 }, exposure: { value: null },
    engagements: { value: 0 }, engagementRate: { value: 0 },
  })
  const h = buildPlatformHeadline('INSTAGRAM', m, OVERVIEW_KPI_KEYS, false)
  expect(h.kpis.find((k) => k.key === 'exposure')?.value).toBe(0)
})

test('engagementRate value is x100; number values pass through', () => {
  const h = buildPlatformHeadline('TWITTER', full('TWITTER'), OVERVIEW_KPI_KEYS, false)
  expect(h.kpis.find((k) => k.key === 'engagementRate')?.value).toBeCloseTo(21) // Dash 0.21 → 21%
  expect(h.kpis.find((k) => k.key === 'exposure')?.value).toBe(299)
})

test('per-KPI delta computed from context; undefined when no context present', () => {
  const withCtx = metricsFor('TWITTER', {
    followers: { value: 110, context: 100 }, netNewFollowers: { value: 1 },
    exposure: { value: 299 }, engagements: { value: 48 }, engagementRate: { value: 0.21 },
  })
  const h = buildPlatformHeadline('TWITTER', withCtx, OVERVIEW_KPI_KEYS, false)
  expect(h.kpis.find((k) => k.key === 'followers')?.delta).toBeCloseTo(10)
  expect(h.kpis.find((k) => k.key === 'exposure')?.delta).toBeUndefined()
})
