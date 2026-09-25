import { beforeEach, describe, expect, test, vi } from 'vitest'

// withNotes decides what a viewer may see of the team's notes. Both collaborators are stubbed:
// the client lookup and the notes read. Nothing reaches a database. Every value is invented.
const { getClientBySlug } = vi.hoisted(() => ({ getClientBySlug: vi.fn() }))
const { getChartNotes } = vi.hoisted(() => ({ getChartNotes: vi.fn() }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug }))
vi.mock('@/lib/organic-social/chart-notes/select', () => ({ getChartNotes }))

import { windowDays, withNotes } from './chart-notes'
import type { ChartNote } from '@/lib/db/schema'
import { cardThumbs, toChartAnnotations, type Annotation } from '@/lib/organic-social/annotations'
import type { TopContentPost } from '@/lib/organic-social/content-types'

const t = (iso: string) => new Date(iso)
const row = (over: Partial<ChartNote>): ChartNote => ({
  id: 'n1', clientId: 'client-uuid', channel: 'INSTAGRAM', chart: 'followers', day: '2026-08-14',
  body: 'Event', postIds: [], status: 'approved', createdBy: 'a@avenuez.com', updatedBy: 'a@avenuez.com',
  approvedBy: 'b@avenuez.com', createdAt: t('2026-09-01T00:00:00Z'), updatedAt: t('2026-09-01T00:00:00Z'),
  approvedAt: t('2026-09-01T00:00:00Z'), deletedAt: null, deletedBy: null, ...over,
})
const post = (id: number, publishedAt: string, engagements: number): TopContentPost => ({
  id, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt, caption: `post ${id}`,
  url: `https://example.com/${id}`, mediaType: 'IMAGE', mediaGroup: null,
  creative: { kind: 'image', thumb: `https://cdn.example.com/t${id}.jpg`, full: `https://cdn.example.com/f${id}.jpg` },
  metrics: { effectiveness: null, engagementRate: null, engagements, impressions: 0 },
  sourceType: 'organic',
})
const PEAK: Annotation = { date: '2026-08-10', value: 28, label: '8/10 | +28 Followers', post: null }
const BASE = {
  clientSlug: 'a-client', channel: 'INSTAGRAM' as const, chart: 'followers' as const,
  series: { channels: ['Instagram'], points: [{ date: '2026-08-10', Instagram: 28 }, { date: '2026-08-14', Instagram: -3 }] },
  from: '2026-08-01', to: '2026-08-31', today: '2026-09-24', items: [PEAK], posts: [] as TopContentPost[],
}
const CLIENT = { ...BASE, role: 'CLIENT_VIEWER', email: 'writer@avenuez.com' }
const EDITOR = { ...BASE, role: 'INTERNAL_ADMIN', email: 'writer@avenuez.com' }

let err: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  // On locked months, like the October clients. Renaissance's config has no reportingMonths.
  getClientBySlug.mockReset().mockResolvedValue({ id: 'client-uuid', dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' } } })
  getChartNotes.mockReset().mockResolvedValue([])
  err = vi.spyOn(console, 'error').mockImplementation(() => {})
})

test('a day that lost followers keeps its note and never gets a signed number', async () => {
  getChartNotes.mockResolvedValue([row({})])
  const { items } = await withNotes(CLIENT)
  expect(items.map((a) => a.date)).toEqual(['2026-08-10', '2026-08-14'])
  expect(items[1]).toMatchObject({ label: '8/14', noteOnly: true, note: { text: 'Event', posts: [] } })
  expect(items[1].label).not.toContain('+')
})

// Jasmine's outlines put annotations on the Instagram, Facebook, LinkedIn and TikTok graphs. Each
// graph reads its own platform's notes, and the team's controls save to that platform.
test.each(['INSTAGRAM', 'FACEBOOK', 'LINKEDIN', 'TIKTOK'] as const)('a %s graph reads that platform\'s notes and its controls name it', async (channel) => {
  getChartNotes.mockResolvedValue([row({ channel })])
  const r = await withNotes({ ...EDITOR, channel })
  expect(getChartNotes).toHaveBeenCalledWith('client-uuid', channel)
  expect(r.items.map((a) => a.date)).toEqual(['2026-08-10', '2026-08-14'])
  expect(r.controls?.channel).toBe(channel)
})

test('a client gets approved notes only, with no editor state and no controls', async () => {
  getChartNotes.mockResolvedValue([row({}), row({ id: 'd', day: '2026-08-20', status: 'draft', approvedAt: null, approvedBy: null })])
  const r = await withNotes(CLIENT)
  expect(r.items.map((a) => a.date)).toEqual(['2026-08-10', '2026-08-14'])
  expect(r.items[1].note?.editor).toBeUndefined()
  expect(r.controls).toBeUndefined()
})

test('a note on a peak day joins that day instead of adding one', async () => {
  getChartNotes.mockResolvedValue([row({ day: '2026-08-10', body: 'Went live' })])
  const { items } = await withNotes(CLIENT)
  expect(items).toHaveLength(1)
  expect(items[0]).toMatchObject({ label: '8/10 | +28 Followers', note: { text: 'Went live' } })
  expect(items[0].noteOnly).toBeUndefined()
})

test('picked posts come only from that day, skipping any Dash no longer returns', async () => {
  getChartNotes.mockResolvedValue([row({ postIds: [2, 99, 3] })])
  const { items } = await withNotes({ ...CLIENT, posts: [post(2, '2026-08-14', 5), post(3, '2026-08-15', 50)] })
  expect(items[1].note?.posts.map((p) => p.id)).toEqual([2])
})

test('when every pick is gone, the day keeps its top post', async () => {
  getChartNotes.mockResolvedValue([row({ postIds: [99] })])
  const { items } = await withNotes({ ...CLIENT, posts: [post(4, '2026-08-14', 9)] })
  expect(items[1].note?.posts).toEqual([])
  expect(items[1].post?.id).toBe(4)
})

test('the team gets the draft, the ids and the controls, with that day\'s posts', async () => {
  getChartNotes.mockResolvedValue([row({ id: 'd', status: 'draft', approvedAt: null, approvedBy: null, body: 'Soon' })])
  const r = await withNotes({ ...EDITOR, posts: [post(5, '2026-08-10', 1)] })
  // No picks and no post that day: the draft preview is empty (R2: present for every draft).
  expect(r.items[1].note).toEqual({ text: null, posts: [], editor: { approvedId: null, approvedPostIds: [], draft: { id: 'd', text: 'Soon', postIds: [] }, draftThumbs: [] } })
  expect(r.controls).toMatchObject({ clientSlug: 'a-client', channel: 'INSTAGRAM', chart: 'followers', canApprove: false })
  // Phase 2b: only the days with at least one post are offered.
  expect(r.controls?.days).toHaveLength(1)
  expect(r.controls?.days.find((d) => d.day === '2026-08-10')?.posts).toEqual([
    { id: 5, thumb: { creative: post(5, '2026-08-10', 1).creative, mediaType: 'IMAGE', url: 'https://example.com/5' } },
  ])
})

test('a team role without an @avenuez.com email gets exactly the client view', async () => {
  getChartNotes.mockResolvedValue([row({ id: 'd', status: 'draft', approvedAt: null, approvedBy: null })])
  const r = await withNotes({ ...EDITOR, email: null })
  expect(r.items).toEqual([PEAK])
  expect(r.controls).toBeUndefined()
})

test('in the live month the form offers no day after today', async () => {
  // Posts on today AND tomorrow: with no posts the list would be empty and prove nothing.
  const r = await withNotes({
    ...EDITOR, from: '2026-09-01', to: '2026-09-30', today: '2026-09-24', series: { channels: ['Instagram'], points: [] },
    posts: [post(7, '2026-09-24', 1), post(8, '2026-09-25', 1)],
  })
  expect(r.controls?.days.map((d) => d.day)).toEqual(['2026-09-24'])
})

test('the form is offered only the days with at least one post, oldest first', async () => {
  const r = await withNotes({ ...EDITOR, posts: [post(9, '2026-08-12', 1), post(5, '2026-08-10', 1), post(6, '2026-08-10', 2)] })
  expect(r.controls?.days.map((d) => [d.day, d.posts.map((p) => p.id)])).toEqual([['2026-08-10', [5, 6]], ['2026-08-12', [9]]])
})

test('unreadable notes fail closed for everyone, and say which chart', async () => {
  getChartNotes.mockRejectedValue(new Error('relation "chart_notes" does not exist'))
  for (const who of [CLIENT, EDITOR]) {
    const r = await withNotes(who)
    expect(r).toEqual({ items: [PEAK] })
  }
  expect(String(err.mock.calls[0][0])).toContain('chart notes unreadable for a-client INSTAGRAM followers')
})

test('a client not on locked months, shaped like Renaissance, never reads notes and gets no controls', async () => {
  getClientBySlug.mockResolvedValue({ id: 'another-uuid', dashSocialConfig: { brandId: 1 } })
  expect(await withNotes(EDITOR)).toEqual({ items: [PEAK] })
  expect(getChartNotes).not.toHaveBeenCalled()
  expect(err).not.toHaveBeenCalled()
})

test('no client row fails the same way', async () => {
  getClientBySlug.mockResolvedValue(null)
  expect(await withNotes(EDITOR)).toEqual({ items: [PEAK] })
  expect(getChartNotes).not.toHaveBeenCalled()
  // "The same way" includes the log: a missing client row is an anomaly an operator must see, and
  // without the throw the locked-months check would return the same items silently.
  expect(err).toHaveBeenCalledTimes(1)
  expect(String(err.mock.calls[0][0])).toContain('chart notes unreadable for a-client INSTAGRAM followers')
})

test('windowDays is inclusive, empty when reversed, and bounded', () => {
  expect(windowDays('2026-08-30', '2026-09-01')).toEqual(['2026-08-30', '2026-08-31', '2026-09-01'])
  expect(windowDays('2026-09-02', '2026-09-01')).toEqual([])
  expect(windowDays('2026-01-01', '2027-12-31')).toHaveLength(400)
})

// Paul's review of #273 (C3), then his second review (R2): the approver must see the pictures clients will
// get once the draft is approved. The draft preview follows the client's rule exactly: the picks Dash
// still returns for that day, in pick order, else the day's top post, else none. Checked against the real
// approved path: the same picks approved, trimmed for the chart, and drawn by the card's own rule.
describe("an editor's draft preview is what the card will show once it is approved", () => {
  const DAY = '2026-08-14'
  const dayPosts = [post(11, DAY, 5), post(12, DAY, 50)] // 12 is the day's top post
  const approvedCard = async (postIds: number[], posts: TopContentPost[]) => {
    getChartNotes.mockResolvedValue([row({ postIds })])
    const { items } = await withNotes({ ...EDITOR, posts })
    return cardThumbs(toChartAnnotations(items).find((a) => a.date === DAY)!)
  }
  const draftPreview = async (postIds: number[], posts: TopContentPost[]) => {
    getChartNotes.mockResolvedValue([row({ id: 'd', status: 'draft', approvedAt: null, approvedBy: null, postIds })])
    const { items } = await withNotes({ ...EDITOR, posts })
    return items.find((a) => a.date === DAY)!.note!.editor!.draftThumbs
  }
  test.each([
    ['every pick found', [11, 12], dayPosts],
    ['one pick gone', [11, 99], dayPosts],
    ['every pick gone: the top post', [99], dayPosts],
    ['no picks: the top post', [], dayPosts],
    ['no posts that day: nothing', [11], [post(30, '2026-08-20', 1)]],
  ])('%s', async (_name, postIds, posts) => {
    const want = await approvedCard(postIds, posts)
    expect(await draftPreview(postIds, posts)).toEqual(want)
  })
})

// Paul's review of #273 (C4): a failed posts fetch looked like a month with no posts, and Edit then
// saved the note without its picked posts.
test('when the posts could not load, the controls say so', async () => {
  const r = await withNotes({ ...EDITOR, posts: null })
  expect(r.controls?.postsFailed).toBe(true)
  expect(r.controls?.days).toEqual([])
})

test('when the posts loaded, even none, the controls carry no flag', async () => {
  expect((await withNotes({ ...EDITOR, posts: [] })).controls).not.toHaveProperty('postsFailed')
  expect((await withNotes({ ...EDITOR, posts: [post(11, '2026-08-14', 5)] })).controls).not.toHaveProperty('postsFailed')
})

// Paul's review of #273 (C14): the day's posts are grouped once; this pins what the grouping must keep.
test("the panel's days list each day's posts in Dash's order, and a post with no date is on no day", async () => {
  const undated = { ...post(30, '2026-08-14', 1), publishedAt: null } as unknown as TopContentPost
  const r = await withNotes({ ...EDITOR, posts: [post(21, '2026-08-14', 1), post(12, '2026-08-10', 9), undated, post(20, '2026-08-14', 3)] })
  expect(r.controls!.days.map((d) => [d.day, d.posts.map((p) => p.id)])).toEqual([['2026-08-10', [12]], ['2026-08-14', [21, 20]]])
})

