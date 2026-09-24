import { beforeEach, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'

// Same pattern as the golden tests: the data getters are stubbed, everything between them
// and the rendered chart is real. All numbers are made up.
vi.mock('@/lib/organic-social/followers', () => import('./__mocks__/followers'))
vi.mock('@/lib/organic-social/trends', () => import('./__mocks__/trends'))
const { graphPosts } = vi.hoisted(() => ({ graphPosts: vi.fn() }))
vi.mock('@/lib/organic-social/graph-posts', () => ({ graphPosts }))
// Nothing is hidden unless a test says so. The client lookup never reaches a database.
const { getAnnotationHides } = vi.hoisted(() => ({ getAnnotationHides: vi.fn(async () => new Set<string>()) }))
vi.mock('@/lib/organic-social/annotation-hides/select', () => ({ getAnnotationHides }))
const { getChartNotes } = vi.hoisted(() => ({ getChartNotes: vi.fn(async () => [] as unknown[]) }))
vi.mock('@/lib/organic-social/chart-notes/select', () => ({ getChartNotes }))
vi.mock('@/lib/db/queries', () => ({
  getClientBySlug: vi.fn(async () => ({ id: 'client-uuid', dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' } } })),
}))
vi.mock('@/app/actions/organic-social', () => ({ setAnnotationHiddenAction: vi.fn(async () => ({ ok: true })) }))

import { getFollowerGraph } from '@/lib/organic-social/followers'
import { getEngagementTrend } from '@/lib/organic-social/trends'
import { FollowerSection, FollowerSectionV2, followerGraphV2 } from './follower-graph'
import { TrendSectionV2, engagementTrendV2 } from './engagement-trend'
import { ORGANIC_SOCIAL_PARTS } from './registry'
import { FIXTURE_ORGANIC_SOCIAL_CTX } from './__fixtures__/organic-social-ctx'
import type { ChartAnnotation } from '@/lib/organic-social/annotations'
import type { TopContentPost } from '@/lib/organic-social/content-types'
import type { TrendSeries } from '@/lib/organic-social/types'

// A closed month, in the served canonical form locked months hands the parts.
const AUG = { ...FIXTURE_ORGANIC_SOCIAL_CTX, dateRange: 'custom:2026-08-01,2026-08-31', channel: 'INSTAGRAM' as const }
const ig = (values: Record<string, number>): TrendSeries => ({
  channels: ['Instagram'],
  points: Object.entries(values).map(([date, v]) => ({ date, Instagram: v })),
})
const post = (id: number, publishedAt: string, engagements: number): TopContentPost => ({
  id, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt, caption: `post ${id}`,
  url: `https://example.com/${id}`, mediaType: 'IMAGE', mediaGroup: null,
  creative: { kind: 'image', thumb: `https://cdn.example.com/t${id}.jpg`, full: `https://cdn.example.com/f${id}.jpg` },
  metrics: { effectiveness: null, engagementRate: null, engagements, impressions: 0 },
  sourceType: 'organic',
})
const annotationsOf = (el: unknown) => (el as ReactElement<{ annotations?: ChartAnnotation[] }>).props.annotations
const summary = (el: unknown) => annotationsOf(el)?.map((a) => [a.label, a.thumb?.url ?? null])

beforeEach(() => vi.clearAllMocks())

// v1 is what Renaissance renders. It must still ask for total followers with exactly three
// arguments, never fetch posts, and pass no annotations.
test('v1 follower graph is unchanged: total followers, no posts, no annotations', async () => {
  vi.mocked(getFollowerGraph).mockResolvedValueOnce(ig({ '2026-08-10': 5 }))
  const el = await FollowerSection(AUG)
  expect(getFollowerGraph).toHaveBeenCalledWith('fixture-client', 'custom:2026-08-01,2026-08-31', 'INSTAGRAM')
  expect(graphPosts).not.toHaveBeenCalled()
  expect(annotationsOf(el)).toBeUndefined()
})

test('both v2 parts are registered unpublished; v1 stays the published default', () => {
  expect(ORGANIC_SOCIAL_PARTS['follower-graph'][2]).toBe(followerGraphV2)
  expect(ORGANIC_SOCIAL_PARTS['engagement-trend'][2]).toBe(engagementTrendV2)
  expect([followerGraphV2.published, engagementTrendV2.published]).toEqual([false, false])
  expect([ORGANIC_SOCIAL_PARTS['follower-graph'][1].published, ORGANIC_SOCIAL_PARTS['engagement-trend'][1].published]).toEqual([true, true])
})

test('v2 follower graph asks for daily gains over the UTC month and annotates the top 2 days', async () => {
  vi.mocked(getFollowerGraph).mockResolvedValueOnce(ig({ '2026-08-05': 12, '2026-08-10': 28, '2026-08-20': 19, '2026-09-01': 99 }))
  graphPosts.mockResolvedValueOnce([post(1, '2026-08-10', 40)])
  const el = await FollowerSectionV2(AUG)
  expect(getFollowerGraph).toHaveBeenCalledWith('fixture-client', 'custom:2026-08-01,2026-08-31', 'INSTAGRAM', 'netNewFollowers', 'utc')
  expect(graphPosts).toHaveBeenCalledWith('fixture-client', 'custom:2026-08-01,2026-08-31', 'INSTAGRAM')
  expect(summary(el)).toEqual([['8/10 | +28 Followers', 'https://example.com/1'], ['8/20 | +19 Followers', null]])
})

test('no post ever crosses to the chart: only the day, the value, the label and a thumbnail', async () => {
  vi.mocked(getFollowerGraph).mockResolvedValueOnce(ig({ '2026-08-10': 28 }))
  graphPosts.mockResolvedValueOnce([post(1, '2026-08-10', 40)])
  const [a] = annotationsOf(await FollowerSectionV2(AUG))!
  expect(Object.keys(a).sort()).toEqual(['date', 'hidden', 'label', 'thumb', 'value'])
  for (const gone of ['caption', 'metrics', 'publishedAt', 'sourceType']) expect(JSON.stringify(a)).not.toContain(gone)
})

test('v2 follower graph carries the outline title and renders its annotations', async () => {
  vi.mocked(getFollowerGraph).mockResolvedValueOnce(ig({ '2026-08-10': 28 }))
  graphPosts.mockResolvedValueOnce([])
  render(<>{await FollowerSectionV2(AUG)}</>)
  expect(screen.getByText('Instagram Follower Growth Graph')).toBeTruthy()
  expect(screen.getByText('8/10 | +28 Followers')).toBeTruthy()
})

test('when the posts cannot be fetched, the follower annotations still show, without thumbnails', async () => {
  vi.mocked(getFollowerGraph).mockResolvedValueOnce(ig({ '2026-08-10': 28, '2026-08-20': 19 }))
  graphPosts.mockRejectedValueOnce(new Error('dash down'))
  const el = await FollowerSectionV2(AUG)
  expect(summary(el)).toEqual([['8/10 | +28 Followers', null], ['8/20 | +19 Followers', null]])
})

test('when the follower series cannot be fetched, v2 shows the same error card as v1', async () => {
  vi.mocked(getFollowerGraph).mockRejectedValueOnce(new Error('dash down'))
  graphPosts.mockResolvedValueOnce([])
  render(<>{await FollowerSectionV2(AUG)}</>)
  expect(screen.getByText("Couldn't load this section.")).toBeTruthy()
})

test('v2 follower graph on Overview renders nothing and fetches nothing, like v1', async () => {
  expect(await FollowerSectionV2({ ...AUG, channel: null })).toBeNull()
  expect(getFollowerGraph).not.toHaveBeenCalled()
  expect(graphPosts).not.toHaveBeenCalled()
})

test('v2 engagement graph asks for the UTC month and annotates the top 3 days with their top posts', async () => {
  vi.mocked(getEngagementTrend).mockResolvedValueOnce(ig({ '2026-08-03': 5, '2026-08-09': 40, '2026-08-10': 65, '2026-08-11': 38, '2026-09-01': 500 }))
  graphPosts.mockResolvedValueOnce([post(7, '2026-08-10', 3), post(8, '2026-08-10', 60), post(9, '2026-08-11', 12)])
  const el = await TrendSectionV2(AUG)
  expect(getEngagementTrend).toHaveBeenCalledWith('fixture-client', 'custom:2026-08-01,2026-08-31', 'INSTAGRAM', 'utc')
  expect(graphPosts).toHaveBeenCalledWith('fixture-client', 'custom:2026-08-01,2026-08-31', 'INSTAGRAM')
  expect(summary(el)).toEqual([['8/9 | 40 Engagements', null], ['8/10 | 65 Engagements', 'https://example.com/8'], ['8/11 | 38 Engagements', 'https://example.com/9']])
})

test('when the posts cannot be fetched, the engagement annotations still show, without thumbnails', async () => {
  vi.mocked(getEngagementTrend).mockResolvedValueOnce(ig({ '2026-08-10': 65 }))
  graphPosts.mockRejectedValueOnce(new Error('dash down'))
  expect(summary(await TrendSectionV2(AUG))).toEqual([['8/10 | 65 Engagements', null]])
})

test('v2 engagement graph on Overview has no annotations and fetches no posts', async () => {
  vi.mocked(getEngagementTrend).mockResolvedValueOnce({
    channels: ['Instagram', 'Facebook'],
    points: [{ date: '2026-08-10', Instagram: 50, Facebook: 40 }],
  })
  const el = await TrendSectionV2({ ...AUG, channel: null })
  expect(getEngagementTrend).toHaveBeenCalledWith('fixture-client', 'custom:2026-08-01,2026-08-31', null, 'utc')
  expect(graphPosts).not.toHaveBeenCalled()
  expect(annotationsOf(el)).toBeUndefined()
  render(<>{el}</>)
  expect(screen.getByText('Engagement Over Time')).toBeTruthy()
})

test('v2 engagement graph on a platform tab carries the outline title', async () => {
  vi.mocked(getEngagementTrend).mockResolvedValueOnce(ig({ '2026-08-10': 65 }))
  graphPosts.mockResolvedValueOnce([])
  render(<>{await TrendSectionV2(AUG)}</>)
  expect(screen.getByText('Instagram Engagement Graph')).toBeTruthy()
})

const controlsOf = (el: unknown) => (el as ReactElement<{ annotationControls?: unknown }>).props.annotationControls
const STAFF = { ...AUG, role: 'INTERNAL_ADMIN' }

test('a client never receives an annotation the team hid', async () => {
  vi.mocked(getFollowerGraph).mockResolvedValueOnce(ig({ '2026-08-10': 28, '2026-08-20': 19 }))
  graphPosts.mockResolvedValueOnce([])
  getAnnotationHides.mockResolvedValueOnce(new Set(['followers|2026-08-10']))
  const el = await FollowerSectionV2(AUG)
  expect(summary(el)).toEqual([['8/20 | +19 Followers', null]])
  expect(controlsOf(el)).toBeUndefined()
})

test('the team receives every annotation, the hidden one marked, with the controls', async () => {
  vi.mocked(getEngagementTrend).mockResolvedValueOnce(ig({ '2026-08-10': 65, '2026-08-11': 38 }))
  graphPosts.mockResolvedValueOnce([])
  getAnnotationHides.mockResolvedValueOnce(new Set(['engagements|2026-08-10']))
  const el = await TrendSectionV2(STAFF)
  expect(annotationsOf(el)?.map((a) => [a.date, a.hidden])).toEqual([['2026-08-10', true], ['2026-08-11', false]])
  expect(controlsOf(el)).toEqual({ clientSlug: 'fixture-client', channel: 'INSTAGRAM', chart: 'engagements' })
})

test('if the hides cannot be read, a client gets no annotations at all', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(getFollowerGraph).mockResolvedValueOnce(ig({ '2026-08-10': 28 }))
  graphPosts.mockResolvedValueOnce([])
  getAnnotationHides.mockRejectedValueOnce(new Error('relation "chart_annotation_hides" does not exist'))
  const el = await FollowerSectionV2(AUG)
  expect(annotationsOf(el)).toEqual([])
  expect(log).toHaveBeenCalled()
  log.mockRestore()
})

test('if the hides cannot be read, the team gets every annotation but no controls', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(getFollowerGraph).mockResolvedValueOnce(ig({ '2026-08-10': 28 }))
  graphPosts.mockResolvedValueOnce([])
  getAnnotationHides.mockRejectedValueOnce(new Error('timeout'))
  const el = await FollowerSectionV2(STAFF)
  expect(summary(el)).toEqual([['8/10 | +28 Followers', null]])
  expect(controlsOf(el)).toBeUndefined()
  log.mockRestore()
})

test('a chart with nothing to annotate never reads the hides', async () => {
  vi.mocked(getFollowerGraph).mockResolvedValueOnce(ig({ '2026-08-10': 0 }))
  graphPosts.mockResolvedValueOnce([])
  await FollowerSectionV2(AUG)
  expect(getAnnotationHides).not.toHaveBeenCalled()
})

const noteRow = (over: Record<string, unknown>) => ({
  id: 'n1', clientId: 'client-uuid', channel: 'INSTAGRAM', chart: 'followers', day: '2026-08-14',
  body: 'Event', postIds: [], status: 'approved', createdBy: 'a@avenuez.com', updatedBy: 'a@avenuez.com',
  approvedBy: 'b@avenuez.com', createdAt: new Date('2026-09-01T00:00:00Z'), updatedAt: new Date('2026-09-01T00:00:00Z'),
  approvedAt: new Date('2026-09-01T00:00:00Z'), deletedAt: null, deletedBy: null, ...over,
})
const propsOf = (el: unknown) => (el as ReactElement<{ annotations?: ChartAnnotation[]; noteControls?: unknown }>).props

test('v1 never reads notes', async () => {
  vi.mocked(getFollowerGraph).mockResolvedValueOnce(ig({ '2026-08-10': 5 }))
  await FollowerSection(AUG)
  expect(getChartNotes).not.toHaveBeenCalled()
})

test('a client sees an approved note on a quiet day as its own callout, with no controls', async () => {
  vi.mocked(getFollowerGraph).mockResolvedValueOnce(ig({ '2026-08-10': 28, '2026-08-14': -3 }))
  graphPosts.mockResolvedValueOnce([])
  getChartNotes.mockResolvedValueOnce([noteRow({})])
  const el = await FollowerSectionV2(AUG)
  expect(propsOf(el).annotations?.map((a) => [a.label, a.note ?? null, a.noteOnly ?? null])).toEqual([
    ['8/10 | +28 Followers', null, null], ['8/14', 'Event', true],
  ])
  expect(propsOf(el).noteControls).toBeUndefined()
})

test('an editor gets the note controls on the v2 engagement graph', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-24T15:00:00Z'))
  vi.mocked(getEngagementTrend).mockResolvedValueOnce(ig({ '2026-08-10': 65 }))
  graphPosts.mockResolvedValueOnce([post(8, '2026-08-10', 60)])
  const el = await TrendSectionV2({ ...AUG, role: 'INTERNAL_ADMIN', email: 'writer@avenuez.com' })
  expect(propsOf(el).noteControls).toMatchObject({ chart: 'engagements', clientSlug: 'fixture-client' })
  vi.useRealTimers()
})

// Notes merge before hides, so a hide on a day still takes that day's note away from the client.
// Each v2 part runs the two layers itself, so each order is pinned.
test('a hide on a note\'s day removes that note from the client, on the follower graph', async () => {
  vi.mocked(getFollowerGraph).mockResolvedValueOnce(ig({ '2026-08-10': 28, '2026-08-14': -3 }))
  graphPosts.mockResolvedValueOnce([])
  getChartNotes.mockResolvedValueOnce([noteRow({})])
  getAnnotationHides.mockResolvedValueOnce(new Set(['followers|2026-08-14']))
  const el = await FollowerSectionV2(AUG)
  expect(propsOf(el).annotations?.map((a) => a.date)).toEqual(['2026-08-10'])
})

test('a hide on a note\'s day removes that note from the client, on the engagement graph', async () => {
  vi.mocked(getEngagementTrend).mockResolvedValueOnce(ig({ '2026-08-10': 65, '2026-08-14': 4 }))
  graphPosts.mockResolvedValueOnce([])
  getChartNotes.mockResolvedValueOnce([noteRow({ chart: 'engagements' })])
  getAnnotationHides.mockResolvedValueOnce(new Set(['engagements|2026-08-14']))
  const el = await TrendSectionV2(AUG)
  expect(propsOf(el).annotations?.map((a) => a.date)).toEqual(['2026-08-10'])
})
