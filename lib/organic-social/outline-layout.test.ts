import { expect, test } from 'vitest'
import { CHANNELS, PLATFORM_KPIS, metricFor, type KpiSpec } from './metrics'
import {
  OUTLINE_DATA_ROWS, OUTLINE_BREAKDOWN_ROWS, OUTLINE_EXTRA_KPIS, OUTLINE_KPI_OVERRIDES, OUTLINE_MEDIA_KPIS,
  NOT_IN_DASH, mediaRowsFor, outlineSpecsFor, type OutlineRow,
} from './outline-layout'

// Jasmine's three outlines, 2026-09-18. The labels are hers, word for word.
const labels = (rows?: { label: string }[]) => rows?.map((r) => r.label)
const DATA = ['Total Followers', 'Net New Followers', 'Views', 'Total Engagements', 'Engagement Rate']

test('the Data rows follow the outlines, in order, with their labels', () => {
  expect(labels(OUTLINE_DATA_ROWS.standard.INSTAGRAM)).toEqual([...DATA, 'Profile Views', 'Video Views'])
  expect(labels(OUTLINE_DATA_ROWS.standard.FACEBOOK)).toEqual([...DATA, 'Profile Views', 'Video Views'])
  expect(labels(OUTLINE_DATA_ROWS.standard.LINKEDIN)).toEqual([...DATA, 'Profile Views', 'Video Views'])
  expect(labels(OUTLINE_DATA_ROWS.standard.TIKTOK)).toEqual([...DATA, 'Profile Views', 'Video Views'])
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
  expect(labels(OUTLINE_BREAKDOWN_ROWS.TIKTOK)).toEqual(['Likes', 'Comments', 'Shares', 'Reposts', 'Completion Rate'])
})

test('no outline covers X, so it has no rows', () => {
  expect(OUTLINE_DATA_ROWS.standard.TWITTER).toBeUndefined()
  expect(OUTLINE_BREAKDOWN_ROWS.TWITTER).toBeUndefined()
})

test("question 6 is closed: Instagram Video Views is Views on Reels, TikTok's is its Views tile", () => {
  expect(labels(OUTLINE_DATA_ROWS.standard.INSTAGRAM)).toEqual([...DATA, 'Profile Views', 'Video Views'])
  expect(labels(OUTLINE_DATA_ROWS.standard.TIKTOK)).toEqual([...DATA, 'Profile Views', 'Video Views'])
  expect(OUTLINE_MEDIA_KPIS.INSTAGRAM).toEqual([{ key: 'videoViews', label: 'Video Views', mediaType: 'reel', metric: 'VIEWS' }])
  expect(OUTLINE_DATA_ROWS.standard.TIKTOK!.find((r) => r.key === 'videoViews')).toEqual({ key: 'videoViews', label: 'Video Views', from: 'exposure' })
  expect(mediaRowsFor('INSTAGRAM', OUTLINE_DATA_ROWS.standard.INSTAGRAM!).map((m) => m.key)).toEqual(['videoViews'])
  expect(mediaRowsFor('INSTAGRAM', OUTLINE_DATA_ROWS.profileClicks.INSTAGRAM!)).toEqual([])
})

// Jasmine's rule for missing data: "flag it for review and leave it blank". Dash's own dashboard
// builder offers neither metric (checked 2026-09-21), so these two show blank with the flag.
const allRows = (): [string, string, OutlineRow][] => [
  ...Object.entries(OUTLINE_DATA_ROWS).flatMap(([v, byCh]) =>
    Object.entries(byCh).flatMap(([ch, rows]) => (rows ?? []).map((r): [string, string, OutlineRow] => [`${v} ${ch}`, 'data', r]))),
  ...Object.entries(OUTLINE_BREAKDOWN_ROWS).flatMap(([ch, rows]) => (rows ?? []).map((r): [string, string, OutlineRow] => [ch, 'breakdown', r])),
]

test('the two rows Dash does not offer are shown blank and flagged, and only those', () => {
  const flagged = allRows().filter(([, , r]) => r.unavailable).map(([where, block, r]) => `${where} ${block} ${r.label}`)
  expect(flagged).toEqual(['standard FACEBOOK data Profile Views', 'profileClicks FACEBOOK data Profile Views', 'TIKTOK breakdown Reposts'])
  for (const [, , r] of allRows()) if (r.unavailable) expect(r.unavailable).toBe(NOT_IN_DASH)
  expect(NOT_IN_DASH).toBe('Not available from Dash')
})

test('a flagged row is never requested from Dash, on every channel the outlines name', () => {
  const names = new Set([
    ...Object.values(OUTLINE_DATA_ROWS).flatMap((byCh) => Object.keys(byCh)), ...Object.keys(OUTLINE_BREAKDOWN_ROWS),
  ])
  expect([...names]).toEqual(expect.arrayContaining(['FACEBOOK', 'TIKTOK']))
  for (const ch of names) {
    // TikTok joins PLATFORM_KPIS with PR 247; until then its shared tiles are none.
    const shared = (PLATFORM_KPIS as Record<string, KpiSpec[]>)[ch] ?? []
    const keys = new Set([...shared, ...(OUTLINE_EXTRA_KPIS[ch] ?? [])].map((s) => s.key))
    const flagged = [
      ...(OUTLINE_DATA_ROWS.standard[ch] ?? []), ...(OUTLINE_DATA_ROWS.profileClicks[ch] ?? []), ...(OUTLINE_BREAKDOWN_ROWS[ch] ?? []),
    ].filter((r) => r.unavailable)
    for (const r of flagged) expect(keys.has(r.key), `${ch} ${r.key}`).toBe(false)
  }
})

test('every row resolves to a tile spec on every channel this build supports', () => {
  for (const ch of CHANNELS) {
    const keys = new Set(outlineSpecsFor(ch).map((s) => s.key))
    const rows = [
      ...(OUTLINE_DATA_ROWS.standard[ch] ?? []), ...(OUTLINE_DATA_ROWS.profileClicks[ch] ?? []),
      ...(OUTLINE_BREAKDOWN_ROWS[ch] ?? []),
    ]
    // A row resolves when it is a tile of the tab, an alias (`from`) of one, or a media row with its own request.
    const media = new Set((OUTLINE_MEDIA_KPIS[ch] ?? []).map((m) => m.key))
    for (const r of rows.filter((x) => !x.unavailable)) expect(keys.has(r.from ?? r.key) || media.has(r.key), `${ch} ${r.key}`).toBe(true)
  }
})

test('the extra rows never reuse a shared tile key, so the shared tiles stay as they are', () => {
  for (const [ch, extras] of Object.entries(OUTLINE_EXTRA_KPIS)) {
    const shared = new Set(((PLATFORM_KPIS as Record<string, KpiSpec[]>)[ch] ?? []).map((k) => k.key))
    for (const e of extras ?? []) expect(shared.has(e.key), `${ch} ${e.key}`).toBe(false)
  }
})

test('the specs a tab requests are the shared tiles (Engagement Rate per the decks), then the probed extra names', () => {
  const names = (ch: 'INSTAGRAM' | 'FACEBOOK' | 'LINKEDIN') => outlineSpecsFor(ch).map(metricFor)
  const swapRate = (ch: 'INSTAGRAM' | 'LINKEDIN', to: string) =>
    PLATFORM_KPIS[ch].map((k) => (k.key === 'engagementRate' ? to : metricFor(k)))
  expect(names('INSTAGRAM')).toEqual([...swapRate('INSTAGRAM', 'AVG_ENGAGEMENT_RATE_VIEWS'), 'PROFILE_CLICKS'])
  expect(names('FACEBOOK')).toEqual([...PLATFORM_KPIS.FACEBOOK.map(metricFor), 'PAID_AND_ORGANIC_VIDEO_VIEWS'])
  expect(names('LINKEDIN')).toEqual([...swapRate('LINKEDIN', 'AVG_ENGAGEMENT_RATE_BY_POST'), 'VIDEO_VIEWS_BY_POST'])
  expect(outlineSpecsFor('TWITTER')).toEqual(PLATFORM_KPIS.TWITTER)
})

// Jasmine, 2026-09-21: "engagement rate should divide by views not followers so just follow the deck".
test('Engagement Rate in the outline block follows the decks; the shared tiles keep theirs', () => {
  const rate = (specs: KpiSpec[]) => specs.find((k) => k.key === 'engagementRate')?.metric
  expect(rate(outlineSpecsFor('INSTAGRAM'))).toEqual({ allPosts: 'AVG_ENGAGEMENT_RATE_VIEWS', byPost: 'AVG_ENGAGEMENT_RATE_VIEWS' })
  expect(rate(outlineSpecsFor('LINKEDIN'))).toEqual({ allPosts: 'AVG_ENGAGEMENT_RATE_ALL_POSTS', byPost: 'AVG_ENGAGEMENT_RATE_BY_POST' })
  // Facebook keeps its shared rate (it matches one of the two Facebook decks; the other does not
  // reconcile on any tile yet), so the outline block keeps it.
  expect(rate(outlineSpecsFor('FACEBOOK'))).toEqual(rate(PLATFORM_KPIS.FACEBOOK))
  // The shared tiles, which Renaissance reads, are untouched.
  expect(rate(PLATFORM_KPIS.INSTAGRAM)).toEqual({ allPosts: 'AVG_ENGAGEMENT_RATE', byPost: 'AVG_ENGAGEMENT_RATE' })
  expect(rate(PLATFORM_KPIS.LINKEDIN)).toEqual({ allPosts: 'AVG_ENGAGEMENT_RATE', byPost: 'AVG_ENGAGEMENT_RATE' })
})

test('an override swaps only the metric of a shared tile with the same key, in place', () => {
  const overridden = Object.entries(OUTLINE_KPI_OVERRIDES)
  expect(overridden.map(([ch]) => ch)).toEqual(['INSTAGRAM', 'LINKEDIN'])
  for (const [ch, overrides] of overridden) {
    const shared = (PLATFORM_KPIS as Record<string, KpiSpec[]>)[ch]
    for (const key of Object.keys(overrides ?? {})) {
      expect(shared.some((k) => k.key === key), `${ch} ${key} overrides nothing`).toBe(true)
    }
    const specs = outlineSpecsFor(ch as 'INSTAGRAM').slice(0, shared.length)
    // Every field but the metric (label, format, footnote, anything added later) is the shared one.
    expect(specs).toEqual(shared.map((k) => (overrides?.[k.key] ? { ...k, metric: overrides[k.key] } : k)))
  }
})

test('a channel with no override requests exactly its shared tiles, whichever PRs have merged', () => {
  for (const ch of CHANNELS) {
    if (OUTLINE_KPI_OVERRIDES[ch]) continue
    expect(outlineSpecsFor(ch).slice(0, PLATFORM_KPIS[ch].length)).toEqual(PLATFORM_KPIS[ch])
  }
})
