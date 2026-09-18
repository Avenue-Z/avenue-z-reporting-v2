import { expect, test } from 'vitest'
import { CHANNELS, PLATFORM_KPIS, metricFor, type KpiSpec } from './metrics'
import {
  OUTLINE_DATA_ROWS, OUTLINE_BREAKDOWN_ROWS, OUTLINE_EXTRA_KPIS, OUTLINE_PENDING_Q6, outlineSpecsFor,
} from './outline-layout'

// Jasmine's three outlines, 2026-09-18. The labels are hers, word for word.
const labels = (rows?: { label: string }[]) => rows?.map((r) => r.label)
const DATA = ['Total Followers', 'Net New Followers', 'Views', 'Total Engagements', 'Engagement Rate']

test('the Data rows follow the outlines, in order, with their labels', () => {
  expect(labels(OUTLINE_DATA_ROWS.standard.INSTAGRAM)).toEqual([...DATA, 'Profile Views'])
  expect(labels(OUTLINE_DATA_ROWS.standard.FACEBOOK)).toEqual([...DATA, 'Video Views'])
  expect(labels(OUTLINE_DATA_ROWS.standard.LINKEDIN)).toEqual([...DATA, 'Profile Views', 'Video Views'])
  expect(labels(OUTLINE_DATA_ROWS.standard.TIKTOK)).toEqual([...DATA, 'Profile Views'])
})

test("Kenect's outline puts Profile Clicks where Video Views would be, on Instagram only", () => {
  expect(labels(OUTLINE_DATA_ROWS.profileClicks.INSTAGRAM)).toEqual([...DATA, 'Profile Views', 'Profile Clicks'])
  for (const ch of ['FACEBOOK', 'LINKEDIN', 'TIKTOK']) {
    expect(OUTLINE_DATA_ROWS.profileClicks[ch]).toEqual(OUTLINE_DATA_ROWS.standard[ch])
  }
})

test('the metrics directly under the engagement graph follow the outlines', () => {
  expect(labels(OUTLINE_BREAKDOWN_ROWS.INSTAGRAM)).toEqual(['Likes', 'Comments', 'Shares', 'Saves', 'Reposts'])
  expect(labels(OUTLINE_BREAKDOWN_ROWS.FACEBOOK)).toEqual(['Reactions', 'Comments', 'Shares', 'Post Clicks'])
  expect(labels(OUTLINE_BREAKDOWN_ROWS.LINKEDIN)).toEqual(['Reactions', 'Comments', 'Shares', 'Post Clicks'])
  expect(labels(OUTLINE_BREAKDOWN_ROWS.TIKTOK)).toEqual(['Likes', 'Comments', 'Shares', 'Completion Rate'])
})

test('no outline covers X, so it has no rows', () => {
  expect(OUTLINE_DATA_ROWS.standard.TWITTER).toBeUndefined()
  expect(OUTLINE_BREAKDOWN_ROWS.TWITTER).toBeUndefined()
})

test("the four rows in Jasmine's question 6 are listed and never render", () => {
  expect(OUTLINE_PENDING_Q6.map((p) => `${p.channel} ${p.label}`)).toEqual([
    'INSTAGRAM Video Views', 'FACEBOOK Profile Views', 'TIKTOK Video Views', 'TIKTOK Reposts',
  ])
  for (const p of OUTLINE_PENDING_Q6) {
    const rows = p.block === 'data'
      ? [...(OUTLINE_DATA_ROWS.standard[p.channel] ?? []), ...(OUTLINE_DATA_ROWS.profileClicks[p.channel] ?? [])]
      : OUTLINE_BREAKDOWN_ROWS[p.channel] ?? []
    expect(labels(rows)).not.toContain(p.label)
  }
})

test('every row resolves to a tile spec on every channel this build supports', () => {
  for (const ch of CHANNELS) {
    const keys = new Set(outlineSpecsFor(ch).map((s) => s.key))
    const rows = [
      ...(OUTLINE_DATA_ROWS.standard[ch] ?? []), ...(OUTLINE_DATA_ROWS.profileClicks[ch] ?? []),
      ...(OUTLINE_BREAKDOWN_ROWS[ch] ?? []),
    ]
    for (const r of rows) expect(keys.has(r.key), `${ch} ${r.key}`).toBe(true)
  }
})

test('the extra rows never reuse a shared tile key, so the shared tiles stay as they are', () => {
  for (const [ch, extras] of Object.entries(OUTLINE_EXTRA_KPIS)) {
    const shared = new Set(((PLATFORM_KPIS as Record<string, KpiSpec[]>)[ch] ?? []).map((k) => k.key))
    for (const e of extras ?? []) expect(shared.has(e.key), `${ch} ${e.key}`).toBe(false)
  }
})

test('the specs a tab requests are the shared tiles, then the probed extra names', () => {
  const names = (ch: 'INSTAGRAM' | 'FACEBOOK' | 'LINKEDIN') => outlineSpecsFor(ch).map(metricFor)
  expect(names('INSTAGRAM')).toEqual([...PLATFORM_KPIS.INSTAGRAM.map(metricFor), 'PROFILE_CLICKS'])
  expect(names('FACEBOOK')).toEqual([...PLATFORM_KPIS.FACEBOOK.map(metricFor), 'PAID_AND_ORGANIC_VIDEO_VIEWS'])
  expect(names('LINKEDIN')).toEqual([...PLATFORM_KPIS.LINKEDIN.map(metricFor), 'VIDEO_VIEWS_BY_POST'])
  expect(outlineSpecsFor('TWITTER')).toEqual(PLATFORM_KPIS.TWITTER)
})
