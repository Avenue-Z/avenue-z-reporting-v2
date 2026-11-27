import { describe, expect, test } from 'vitest'
import { buildTopicView, servedMonths, topicPills, type SlViewInput } from './view-model'
import type { SlExport, SlHistory, SlMonthData, SlPost, SlTopic, SlUpload } from './types'
import type { SlBoxId } from './boxes'

// Made-up numbers, names and themes only.
function exp(topic: SlTopic, month: string, s: { pos: number; neu: number; neg: number }, extra: Partial<SlExport> = {}): SlExport {
  return {
    version: 1, topic, month, results: s.pos + s.neu + s.neg, daily: [{ day: `${month}-01`, results: s.pos + s.neu + s.neg }],
    sentiment: s, sentimentByMedia: [{ media: 'X', ...s }], themes: [{ theme: 'made up', share: 0.5, color: '#1FCE6E' }], ...extra,
  }
}
let n = 0
const up = (data: SlExport, beforeOpen = true, at = '2026-11-02T12:00:00Z'): SlUpload =>
  ({ id: `u${n++}`, month: data.month, topic: data.topic, data, beforeOpen, uploadedAt: new Date(at) })
const hist = (month: string, topic: SlTopic, p: { pos: number; neu: number; neg: number }, results = 100): SlHistory => ({
  month, topic, results, uniqueAuthors: 50, engagement: 200, potentialReach: 9000, ...p,
  redditPos: null, redditNeu: null, redditNeg: null, source: 'report', media: null, authors: null,
})
const post = (over: Partial<SlPost>): SlPost => ({
  id: `p${n++}`, month: '2026-10', group: 'social', platform: 'X', author: 'someone', url: null, engagements: 1,
  sentiment: 'Positive', note: 'made up', position: 0, status: 'approved', replacesId: null, imageIds: [], ...over,
})
const data = (over: Partial<SlMonthData> = {}): SlMonthData => ({ uploads: [], history: [], posts: [], trends: null, ...over })
const SETTING = { brandTopic: 'Made Up Brand', industryTopic: 'Made Up Industry', industrySample: 10 }

function input(over: Partial<SlViewInput> = {}): SlViewInput {
  return {
    topic: 'brand', month: '2026-10', live: false, clientView: false, setting: SETTING,
    data: data({ uploads: [up(exp('brand', '2026-10', { pos: 60, neu: 30, neg: 10 }))] }), approvedBoxes: new Set<SlBoxId>(), ...over,
  }
}

describe('servedMonths', () => {
  test('January to the served month, plus the month before (December of last year in January)', () => {
    expect(servedMonths('2026-03')).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(servedMonths('2026-01')).toEqual(['2025-12', '2026-01'])
  })
})

describe('topicPills (spec section 5)', () => {
  const both = data({ uploads: [up(exp('brand', '2026-10', { pos: 1, neu: 0, neg: 0 })), up(exp('industry', '2026-10', { pos: 1, neu: 0, neg: 0 }))] })
  test('staff see both pills whenever the client has an industry topic', () => {
    expect(topicPills({ month: '2026-10', data: data(), setting: SETTING, clientView: false })).toEqual({ brand: true, industry: true })
    expect(topicPills({ month: '2026-10', data: data(), setting: { ...SETTING, industryTopic: null }, clientView: false })).toEqual({ brand: true, industry: false })
  })
  test('a client sees no Industry pill without an industry upload, and nothing at all without a brand upload', () => {
    expect(topicPills({ month: '2026-10', data: both, setting: SETTING, clientView: true })).toEqual({ brand: true, industry: true })
    const brandOnly = data({ uploads: [up(exp('brand', '2026-10', { pos: 1, neu: 0, neg: 0 }))] })
    expect(topicPills({ month: '2026-10', data: brandOnly, setting: SETTING, clientView: true })).toEqual({ brand: true, industry: false })
    const industryOnly = data({ uploads: [up(exp('industry', '2026-10', { pos: 1, neu: 0, neg: 0 }))] })
    expect(topicPills({ month: '2026-10', data: industryOnly, setting: SETTING, clientView: true })).toEqual({ brand: false, industry: false })
  })
})

describe('the state of a topic', () => {
  test('no upload: staff get the upload state, a client the not-ready state', () => {
    expect(buildTopicView(input({ data: data() })).state).toBe('missing')
    expect(buildTopicView(input({ data: data(), clientView: true })).state).toBe('not-ready')
  })
  test('the live month (staff only): upload opens when it ends (R2-13)', () => {
    const v = buildTopicView(input({ month: '2026-11', live: true, data: data() }))
    expect(v).toMatchObject({ state: 'live', liveText: 'Upload opens when November 2026 ends.' })
  })
  test('a ready topic shows the newest upload of the month', () => {
    const older = up(exp('brand', '2026-10', { pos: 1, neu: 0, neg: 0 }), true, '2026-11-02T00:00:00Z')
    const newer = up(exp('brand', '2026-10', { pos: 0, neu: 2, neg: 0 }), true, '2026-11-03T00:00:00Z')
    const v = buildTopicView(input({ data: data({ uploads: [older, newer] }) }))
    expect(v.state).toBe('ready')
    expect(v.ready!.results).toBe(2)
  })
})

describe('tiles and sentiment changes against the previous month as presented (D5)', () => {
  test('brand tiles compare with the history row of the previous month, labelled with that month', () => {
    const v = buildTopicView(input({
      data: data({
        uploads: [up(exp('brand', '2026-10', { pos: 60, neu: 30, neg: 10 }, { uniqueAuthors: 40, engagement: 0, potentialReach: 900 }))],
        history: [hist('2026-09', 'brand', { pos: 70, neu: 20, neg: 10 }, 80)],
      }),
    }))
    const r = v.ready!
    expect(r.changeLabel).toBe('vs September 2026 report')
    expect(r.tiles.map((t) => t.title)).toEqual(['Results', 'Unique authors', 'Engagement', 'Potential reach'])
    expect(r.tiles[0]).toMatchObject({ value: 100, change: 25 })
    expect(r.tiles[1].change).toBeCloseTo(-20, 9)
    // R2-14: against a whole percent, the share is rounded to whole first.
    expect(r.sentiment.change).toEqual({ pos: -10, neu: 10, neg: 0 })
    expect(r.sentiment.pct).toEqual({ pos: 60, neu: 30, neg: 10 })
  })
  test('no previous month: no changes (the placeholder), never zeros', () => {
    const r = buildTopicView(input()).ready!
    expect(r.tiles.every((t) => t.change === undefined)).toBe(true)
    expect(r.sentiment.change).toEqual({ pos: null, neu: null, neg: null })
    expect(r.hasPrevious).toBe(false)
  })
  test('industry tiles are results, then the three shares with points changes, and the sample line', () => {
    const v = buildTopicView(input({
      topic: 'industry',
      data: data({ uploads: [up(exp('industry', '2026-10', { pos: 20, neu: 70, neg: 10 })), up(exp('industry', '2026-09', { pos: 25, neu: 65, neg: 10 }), true, '2026-10-02T00:00:00Z')] }),
    }))
    const r = v.ready!
    expect(r.tiles.map((t) => [t.title, t.value, t.points ?? null])).toEqual([
      ['Results', 100, null], ['Positive', 20, -5], ['Neutral', 70, 5], ['Negative', 10, 0],
    ])
    expect(v.sampleLine).toBe('The industry topic is a 10% sample of the conversation, by design.')
  })
})

describe('staff notes (spec sections 7 and 11)', () => {
  test('a month with a history row and an upload says later months compare with the report', () => {
    const v = buildTopicView(input({ data: data({ uploads: [up(exp('brand', '2026-10', { pos: 1, neu: 0, neg: 0 }))], history: [hist('2026-10', 'brand', { pos: 100, neu: 0, neg: 0 })] }) }))
    expect(v.staffNotes).toEqual(['This month also has a delivered report on record. Later months compare with the report\'s numbers.'])
  })
  test('a re-upload after the month opened says later months still compare with the earlier numbers', () => {
    const v = buildTopicView(input({
      data: data({ uploads: [up(exp('brand', '2026-10', { pos: 1, neu: 0, neg: 0 }), true, '2026-11-02T00:00:00Z'), up(exp('brand', '2026-10', { pos: 2, neu: 0, neg: 0 }), false, '2026-11-20T00:00:00Z')] }),
    }))
    expect(v.staffNotes).toEqual(['This export was uploaded after the month opened to the client. Later months still compare with the earlier numbers.'])
  })
  test('a client never gets staff notes', () => {
    const v = buildTopicView(input({ clientView: true, data: data({ uploads: [up(exp('brand', '2026-10', { pos: 1, neu: 0, neg: 0 }))], history: [hist('2026-10', 'brand', { pos: 100, neu: 0, neg: 0 })] }) }))
    expect(v.staffNotes).toEqual([])
  })
})

describe('sections', () => {
  test('the owned-channels card only with the optional widget', () => {
    expect(buildTopicView(input()).ready!.owned).toBeNull()
    const withOwned = input({ data: data({ uploads: [up(exp('brand', '2026-10', { pos: 6, neu: 3, neg: 1 }, { ownedExcluded: { pos: 3, neu: 1, neg: 1 } }))] }) })
    expect(buildTopicView(withOwned).ready!.owned).toEqual({ counts: { pos: 3, neu: 1, neg: 1 }, pct: { pos: 60, neu: 20, neg: 20 }, total: 5 })
  })
  test('media types: share, colour by name with a fallback, change vs the previous presented upload, n/a when new', () => {
    const now = exp('brand', '2026-10', { pos: 10, neu: 0, neg: 0 }, { sentimentByMedia: [{ media: 'X', pos: 6, neu: 0, neg: 0 }, { media: 'Threads', pos: 4, neu: 0, neg: 0 }] })
    const prev = exp('brand', '2026-09', { pos: 3, neu: 0, neg: 0 }, { sentimentByMedia: [{ media: 'X', pos: 3, neu: 0, neg: 0 }] })
    const r = buildTopicView(input({ data: data({ uploads: [up(now), up(prev, true, '2026-10-02T00:00:00Z')] }) })).ready!
    expect(r.media).toEqual([
      { media: 'X', count: 6, pct: 60, change: 100, color: '#60FDFF' },
      { media: 'Threads', count: 4, pct: 40, change: null, color: '#9CA3AF' },
    ])
  })
  test("media types compare with the delivered report's counts when its row has them, and say so (D4)", () => {
    const now = exp('brand', '2026-10', { pos: 10, neu: 0, neg: 0 }, { sentimentByMedia: [{ media: 'X', pos: 6, neu: 0, neg: 0 }, { media: 'Blogs', pos: 4, neu: 0, neg: 0 }] })
    const prevUpload = exp('brand', '2026-09', { pos: 3, neu: 0, neg: 0 }, { sentimentByMedia: [{ media: 'X', pos: 3, neu: 0, neg: 0 }] })
    const report = { ...hist('2026-09', 'brand', { pos: 80, neu: 15, neg: 5 }), media: [{ media: 'X', count: 4 }, { media: 'Blogs', count: 2 }] }
    const r = buildTopicView(input({ data: data({ uploads: [up(now), up(prevUpload, true, '2026-10-02T00:00:00Z')], history: [report] }) })).ready!
    expect(r.media.map((m) => [m.media, m.change])).toEqual([['X', 50], ['Blogs', 100]])
    expect(r.mediaVs).toBe('report')
  })
  test('media types say what they compare with: the export when only an upload, nothing when neither', () => {
    const now = exp('brand', '2026-10', { pos: 10, neu: 0, neg: 0 }, { sentimentByMedia: [{ media: 'X', pos: 10, neu: 0, neg: 0 }] })
    const prevUpload = exp('brand', '2026-09', { pos: 3, neu: 0, neg: 0 }, { sentimentByMedia: [{ media: 'X', pos: 3, neu: 0, neg: 0 }] })
    expect(buildTopicView(input({ data: data({ uploads: [up(now), up(prevUpload, true, '2026-10-02T00:00:00Z')] }) })).ready!.mediaVs).toBe('export')
    expect(buildTopicView(input({ data: data({ uploads: [up(now)] }) })).ready!.mediaVs).toBeNull()
  })
  test('year to date for brand: all, positive plus neutral, Reddit; gaps stay gaps', () => {
    const r = buildTopicView(input({ data: data({ uploads: [up(exp('brand', '2026-10', { pos: 60, neu: 30, neg: 10 }))], history: [hist('2026-08', 'brand', { pos: 50, neu: 40, neg: 10 })] }) })).ready!
    expect(r.ytd.map((p) => p.month)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'])
    expect(r.ytd[7].value).toEqual({ pos: 50, neu: 40, neg: 10 })
    expect(r.ytd[8].value).toBeNull()
    expect(r.posNeu[7]).toEqual({ month: '2026-08', value: 90 })
    expect(r.posNeu[8]).toEqual({ month: '2026-09', value: null })
    expect(r.reddit).not.toBeNull()
  })
  test('the brand cloud colours by sentiment; the industry cloud keeps its decoration colours', () => {
    const themes = [{ theme: 'a', share: 0.2, color: '#1FCE6E' }, { theme: 'b', share: 0.1, color: '#123456' }]
    const brand = buildTopicView(input({ data: data({ uploads: [up(exp('brand', '2026-10', { pos: 1, neu: 0, neg: 0 }, { themes }))] }) })).ready!
    expect(brand.themes.map((t) => t.color)).toEqual(['#60FF80', '#123456'])
    const industry = buildTopicView(input({ topic: 'industry', data: data({ uploads: [up(exp('industry', '2026-10', { pos: 1, neu: 0, neg: 0 }, { themes }))] }) })).ready!
    expect(industry.themes.map((t) => t.color)).toEqual(['#1FCE6E', '#123456'])
  })
  test('influencer changes are matched by author id', () => {
    const inf = (authorId: string, posts: number) => ({ authorId, name: `n${authorId}`, network: 'X', posts, reach: 1, engagement: 1, pos: posts, neu: 0, neg: 0 })
    const now = exp('brand', '2026-10', { pos: 1, neu: 0, neg: 0 }, { influencers: [inf('a', 5), inf('b', 2)] })
    const prev = exp('brand', '2026-09', { pos: 1, neu: 0, neg: 0 }, { influencers: [inf('a', 3)] })
    const r = buildTopicView(input({ data: data({ uploads: [up(now), up(prev, true, '2026-10-02T00:00:00Z')] }) })).ready!
    expect(r.influencers.map((i) => [i.authorId, i.change])).toEqual([['a', 2], ['b', null]])
  })
  test('an author id or media name taken from the file can be any text, "__proto__" included (#477)', () => {
    const inf = (authorId: string, posts: number) => ({ authorId, name: `n${authorId}`, network: 'X', posts, reach: 1, engagement: 1, pos: posts, neu: 0, neg: 0 })
    const media = (n: number) => [{ media: '__proto__', pos: n, neu: 0, neg: 0 }, { media: 'constructor', pos: n, neu: 0, neg: 0 }]
    const now = exp('brand', '2026-10', { pos: 10, neu: 0, neg: 0 }, { influencers: [inf('__proto__', 5), inf('constructor', 4)], sentimentByMedia: media(6) })
    const prev = exp('brand', '2026-09', { pos: 6, neu: 0, neg: 0 }, { influencers: [inf('__proto__', 3)], sentimentByMedia: media(3) })
    const r = buildTopicView(input({ data: data({ uploads: [up(now), up(prev, true, '2026-10-02T00:00:00Z')] }) })).ready!
    expect(r.influencers.map((i) => [i.authorId, i.change])).toEqual([['__proto__', 2], ['constructor', null]])
    expect(r.media.map((m) => [m.media, m.change])).toEqual([['__proto__', 100], ['constructor', 100]])
  })
})

describe('analysis-only sections, posts and trends by viewer (spec sections 5 and 9, R2-1)', () => {
  test('staff always see every section', () => {
    const v = buildTopicView(input())
    expect(v.show).toMatchObject({ conv: true, takeaways: true, keywords: true, posts: true, trends: true })
  })
  test('a client sees an analysis-only section only with approved analysis', () => {
    const none = buildTopicView(input({ clientView: true }))
    expect(none.show).toMatchObject({ conv: false, takeaways: false, keywords: false })
    const some = buildTopicView(input({ clientView: true, approvedBoxes: new Set<SlBoxId>(['b-conv', 'b-keywords']) }))
    expect(some.show).toMatchObject({ conv: true, takeaways: false, keywords: true })
    const industry = buildTopicView(input({ topic: 'industry', clientView: true, approvedBoxes: new Set<SlBoxId>(['b-conv', 'i-takeaways']), data: data({ uploads: [up(exp('industry', '2026-10', { pos: 1, neu: 0, neg: 0 }))] }) }))
    expect(industry.show).toMatchObject({ conv: false, takeaways: true, keywords: false })
  })
  test('a client never gets a draft post; staff see drafts; at most 12 approved and 4 images each, in position order', () => {
    const posts = [
      post({ status: 'draft', position: 0 }),
      ...Array.from({ length: 13 }, (_, i) => post({ position: 13 - i, imageIds: ['1', '2', '3', '4', '5'] })),
    ]
    const client = buildTopicView(input({ clientView: true, data: data({ uploads: [up(exp('brand', '2026-10', { pos: 1, neu: 0, neg: 0 }))], posts }) }))
    expect(client.posts.every((p) => p.status === 'approved')).toBe(true)
    expect(client.posts).toHaveLength(12)
    expect(client.posts.map((p) => p.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(client.posts[0].imageIds).toEqual(['1', '2', '3', '4'])
    const staff = buildTopicView(input({ data: data({ uploads: [up(exp('brand', '2026-10', { pos: 1, neu: 0, neg: 0 }))], posts }) }))
    expect(staff.posts.some((p) => p.status === 'draft')).toBe(true)
  })
  test('a client sees the posts section only with an approved post or approved post analysis; posts are brand only', () => {
    expect(buildTopicView(input({ clientView: true })).show.posts).toBe(false)
    expect(buildTopicView(input({ clientView: true, approvedBoxes: new Set<SlBoxId>(['b-posts']) })).show.posts).toBe(true)
    expect(buildTopicView(input({ clientView: true, data: data({ uploads: [up(exp('brand', '2026-10', { pos: 1, neu: 0, neg: 0 }))], posts: [post({})] }) })).show.posts).toBe(true)
    expect(buildTopicView(input({ topic: 'industry', data: data({ uploads: [up(exp('industry', '2026-10', { pos: 1, neu: 0, neg: 0 }))] }) })).show.posts).toBe(false)
  })
  test('trends: a client sees approved lists only, and no section without them; staff see the draft', () => {
    const lists = (theme: string) => ({ emerging: [{ theme, change: '+1%' }], decreasing: [], newThemes: [] })
    const trends = { month: '2026-10', draft: lists('draft'), approved: lists('approved'), status: 'draft' as const }
    const base = { uploads: [up(exp('brand', '2026-10', { pos: 1, neu: 0, neg: 0 }))] }
    const client = buildTopicView(input({ clientView: true, data: data({ ...base, trends }) }))
    expect(client.trends).toEqual({ lists: lists('approved'), draft: null })
    expect(client.show.trends).toBe(true)
    expect(buildTopicView(input({ clientView: true, data: data({ ...base, trends: { ...trends, approved: null } }) })).show.trends).toBe(false)
    const staff = buildTopicView(input({ data: data({ ...base, trends }) }))
    expect(staff.trends).toEqual({ lists: lists('approved'), draft: { lists: lists('draft'), status: 'draft' } })
  })
})

// Unit F (plan 2026-11-24, F11, D6 to D8, Q4): the authors the team picks, the order, the per mention columns.
describe('authors and cards', () => {
  const a = (i: number, over: Record<string, unknown> = {}) => ({
    authorId: `id-${i}`, name: `Author ${i}`, network: 'SOCIALMEDIA_INSTAGRAM', posts: 20 - i, pos: 1, neu: 0, neg: 0, reach: 1000 * (i + 1), engagement: 7 - i, ...over,
  })
  const SEVEN = Array.from({ length: 7 }, (_, i) => a(i))
  const CARDS = [
    { label: 'Most active author', who: 'Author 0', network: 'Instagram', value: 12, unit: 'Posts' },
    { label: 'Most active site', who: 'site.example', network: 'Forums', value: 4, unit: 'Posts' },
  ]
  const oct = exp('brand', '2026-10', { pos: 60, neu: 30, neg: 10 }, { influencers: SEVEN, overview: CARDS })
  const view = (over: Partial<SlViewInput> = {}, picks: SlMonthData['picks'] = []) =>
    buildTopicView(input({ data: data({ uploads: [up(oct)], picks }), ...over })).ready!
  const hide = (key: string, kind: 'author' | 'card' = 'author') => ({ id: `k-${key}`, kind, key, state: 'hidden' as const, at: '2026-11-03T10:00:00.000Z' })

  test('a month with no picks: a client sees the first 5 in export order and every card; staff see all 7 marked', () => {
    expect(view({ clientView: true }).influencers.map((i) => i.authorId)).toEqual(['id-0', 'id-1', 'id-2', 'id-3', 'id-4'])
    expect(view({ clientView: true }).overview.map((c) => c.label)).toEqual(['Most active author', 'Most active site'])
    expect(view().influencers.map((i) => [i.authorId, i.shown])).toEqual(SEVEN.map((x, i) => [x.authorId, i < 5]))
  })

  test('a month with one hide shows the other four, and the hidden author takes its card with it for a client only', () => {
    expect(view({ clientView: true }, [hide('id-0')]).influencers.map((i) => i.authorId)).toEqual(['id-1', 'id-2', 'id-3', 'id-4'])
    expect(view({ clientView: true }, [hide('id-0')]).overview.map((c) => c.label)).toEqual(['Most active site'])
    expect(view({}, [hide('id-0')]).overview.map((c) => [c.label, c.shown])).toEqual([['Most active author', false], ['Most active site', true]])
  })

  test('picks apply to the served month only: they come from the month read, which the store keys by the served month', () => {
    expect(view({ clientView: true }, []).influencers).toHaveLength(5)
  })

  test('the sort changes the order only: reach or engagement, most first; posts by default', () => {
    expect(view({ clientView: true }).influencers.map((i) => i.authorId)).toEqual(['id-0', 'id-1', 'id-2', 'id-3', 'id-4'])
    expect(view({ clientView: true, sort: 'reach' }).influencers.map((i) => i.authorId)).toEqual(['id-4', 'id-3', 'id-2', 'id-1', 'id-0'])
    expect(view({ clientView: true, sort: 'engagement' }).influencers.map((i) => i.authorId)).toEqual(['id-0', 'id-1', 'id-2', 'id-3', 'id-4'])
  })

  test('reach and engagement per mention are the totals over the posts', () => {
    const first = view({ clientView: true }).influencers[0]
    expect([first.reachPer, first.engagementPer]).toEqual([1000 / 20, 7 / 20])
  })

  test("the posts change compares with the delivered report's authors when October's row has them", () => {
    const nov = exp('brand', '2026-11', { pos: 1, neu: 0, neg: 0 }, { influencers: [a(0, { posts: 9 }), a(1, { posts: 9 })] })
    const row = { ...hist('2026-10', 'brand', { pos: 60, neu: 30, neg: 10 }), authors: [{ authorId: 'id-0', name: 'Author 0', network: 'Instagram', posts: 4 }] }
    const r = buildTopicView(input({ month: '2026-11', data: data({ uploads: [up(oct), up(nov)], history: [row] }) })).ready!
    expect(r.influencers.map((i) => [i.authorId, i.change])).toEqual([['id-0', 5], ['id-1', null]])
  })
})

// Unit H (plan 2026-11-24, F15): the industry cloud is coloured by sentiment once Savannah's widget exports sentiment
// colours; until then its colours stay decoration, as today.
describe('industry theme colours', () => {
  const industryView = (themes: SlExport['themes']) =>
    buildTopicView(input({ topic: 'industry', data: data({ uploads: [up(exp('industry', '2026-10', { pos: 1, neu: 0, neg: 0 }, { themes }))] }) })).ready!
  test("every theme in one of brand's five sentiment colours: drawn by sentiment, as brand is", () => {
    const r = industryView([{ theme: 'a', share: 0.2, color: '#1fce6e' }, { theme: 'b', share: 0.1, color: '#F2C100' }, { theme: 'c', share: 0.1, color: '#EB6F63' }])
    expect(r.themeColors).toBe('sentiment')
    expect(r.themes.map((t) => t.color)).toEqual(['#60FF80', '#FFFC60', '#FF4444'])
  })
  test('one colour outside the five, or no themes: decoration, exactly as today', () => {
    const mixed = industryView([{ theme: 'a', share: 0.2, color: '#1FCE6E' }, { theme: 'b', share: 0.1, color: '#123456' }])
    expect(mixed.themeColors).toBe('decoration')
    expect(mixed.themes.map((t) => t.color)).toEqual(['#1FCE6E', '#123456'])
    expect(industryView([]).themeColors).toBe('decoration')
  })
  test('brand is always by sentiment', () => {
    expect(buildTopicView(input()).ready!.themeColors).toBe('sentiment')
  })
})
