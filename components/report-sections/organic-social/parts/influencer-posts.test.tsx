import { beforeEach, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
vi.mock('@/app/actions/organic-social', () => ({ setDesignationAction: vi.fn(async () => ({ ok: true })) }))
const { getDesignations, getClientBySlug, getSectionTemplate, fetchTopContentFrozen, fetchTopContent, InfluencerGrid } = vi.hoisted(() => ({
  getDesignations: vi.fn(async () => new Map()), getClientBySlug: vi.fn(), getSectionTemplate: vi.fn(async () => null),
  fetchTopContentFrozen: vi.fn(), fetchTopContent: vi.fn(async () => []), InfluencerGrid: vi.fn(() => null),
}))
vi.mock('@/lib/organic-social/designations/select', () => ({ getDesignations }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug, getSectionTemplate }))
vi.mock('@/lib/organic-social/frozen', () => ({ fetchTopContentFrozen }))
vi.mock('@/lib/organic-social/top-content', () => ({ fetchTopContent, getTopContent: vi.fn() }))
vi.mock('../influencer-grid', () => ({ InfluencerGrid }))

import { InfluencerPostsSection, influencerPostsV1 } from './influencer-posts'
import { ORGANIC_SOCIAL_PARTS } from './registry'

const CTX = { clientSlug: 'client-a', dateRange: 'custom:2026-09-01,2026-09-30', compareRange: 'custom:2026-08-01,2026-08-31', channel: null, view: 'influencer' as const, role: 'INTERNAL_ADMIN' }
const post = (id: number, over: Record<string, unknown> = {}) => ({
  id, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt: '2026-09-02', caption: `cap-${id}`, url: null, mediaType: 'IMAGE',
  mediaGroup: null, creative: null, sourceType: 'organic', metrics: { effectiveness: null, engagementRate: 0.5, engagements: 4, impressions: 40 }, ...over,
})
const shown = () => (InfluencerGrid.mock.calls.at(-1) as unknown as [{ posts: { id: number }[]; canEdit: boolean }])[0]
const outlineClient = { id: 'c1', slug: 'client-a', dashSocialConfig: { brandId: 1, ownHandles: { instagram: 'brand_handle' } }, reportSectionConfig: { 'organic-social:platform': { versions: { 'top-content': 3 } } } }
const v2Client = { id: 'c1', slug: 'client-a', dashSocialConfig: { brandId: 1 }, reportSectionConfig: {} }

beforeEach(() => {
  for (const f of [getDesignations, getClientBySlug, getSectionTemplate, fetchTopContentFrozen, fetchTopContent, InfluencerGrid]) f.mockClear()
  getSectionTemplate.mockResolvedValue(null)
})

test('registered, published, labelled', () => {
  expect(ORGANIC_SOCIAL_PARTS['influencer-posts'][1]).toBe(influencerPostsV1)
  expect([influencerPostsV1.published, influencerPostsV1.defaultLabel]).toEqual([true, 'Influencer Posts'])
})

test('an outline client: the Instagram tab request with authors and UGC marks, split by author', async () => {
  getClientBySlug.mockResolvedValue(outlineClient)
  fetchTopContentFrozen.mockResolvedValue([post(1, { author: 'brand_handle' }), post(2, { author: 'creator' }), post(3, { ugc: true })])
  render(await InfluencerPostsSection({ ctx: CTX }))
  const [slug, range, ch, injected] = fetchTopContentFrozen.mock.calls[0] as unknown as [string, string, string, { fetchLive: (...a: unknown[]) => unknown }]
  expect([slug, range, ch]).toEqual(['client-a', CTX.dateRange, 'INSTAGRAM'])
  await injected.fetchLive('s', 'd', 'INSTAGRAM')
  expect(fetchTopContent).toHaveBeenCalledWith('s', 'd', 'INSTAGRAM', { withAuthor: true, markUgc: true })
  expect(shown().posts.map((p) => p.id)).toEqual([2, 3])
  expect(shown().canEdit).toBe(true)
})

test('a version 2 client: the plain request, split by stored choice then #ad', async () => {
  getClientBySlug.mockResolvedValue(v2Client)
  fetchTopContentFrozen.mockResolvedValue([post(1, { author: 'creator' }), post(2, { caption: 'yay #ad' })])
  render(await InfluencerPostsSection({ ctx: { ...CTX, role: 'CLIENT_VIEWER' } }))
  expect((fetchTopContentFrozen.mock.calls[0] as unknown[])[3]).toBeUndefined()
  expect(shown().posts.map((p) => p.id)).toEqual([2])
  expect(shown().canEdit).toBe(false)
})

test('a failed fetch is the error card', async () => {
  getClientBySlug.mockResolvedValue(v2Client)
  fetchTopContentFrozen.mockRejectedValue(new Error('down'))
  const { getByText } = render(await InfluencerPostsSection({ ctx: CTX }))
  expect(getByText("Couldn't load this section.")).toBeTruthy()
})

test('the part renders only on the Influencer view', () => {
  expect(influencerPostsV1.render({ ...CTX, view: null }, { id: 'influencer-posts', version: 1, label: 'x' })).toBeNull()
})

// Paul, #334 review item 3: a client whose Instagram influencer section carries a label keeps the tab, and the label
// then applied nowhere. The tab's heading now takes it; the tab name itself stays "Influencer".
test("the heading takes the client's Instagram label when one is set; otherwise Influencer Posts", async () => {
  getClientBySlug.mockResolvedValue({ ...v2Client, dashSocialConfig: { brandId: 1, influencerSection: { INSTAGRAM: { label: 'Partnership Posts' } } } })
  fetchTopContentFrozen.mockResolvedValue([post(1, { caption: 'yay #ad' })])
  expect(render(await InfluencerPostsSection({ ctx: CTX })).getByText('Partnership Posts')).toBeTruthy()
  getClientBySlug.mockResolvedValue(v2Client)
  expect(render(await InfluencerPostsSection({ ctx: CTX })).getByText('Influencer Posts')).toBeTruthy()
})

// Paul, #334 round 2 (non-blocker 4): the tab logged the Instagram tab's two handle warnings word for word, so nothing
// said which tab wrote them. The tab's lines carry view=influencer; the Instagram tab's lines are unchanged.
test("a stale handle warns with the tab named, so the line is not mistaken for the Instagram tab's", async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  getClientBySlug.mockResolvedValue({ ...outlineClient, dashSocialConfig: { brandId: 1, ownHandles: { instagram: 'old_handle' } } })
  fetchTopContentFrozen.mockResolvedValue([post(1, { author: 'brand_handle' })])
  render(await InfluencerPostsSection({ ctx: CTX }))
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('slug=client-a channel=INSTAGRAM view=influencer;'))
  warn.mockRestore()
})

test('totals sit above the cards: posts, engagements, per post, and views shown as a dash when none are reported', async () => {
  getClientBySlug.mockResolvedValue(v2Client)
  fetchTopContentFrozen.mockResolvedValue([
    post(1, { caption: 'a #ad', metrics: { effectiveness: null, engagementRate: null, engagements: 31002, impressions: 0 } }),
    post(2, { caption: 'b #ad', metrics: { effectiveness: null, engagementRate: null, engagements: 5359, impressions: 0 } }),
  ])
  const { getByText } = render(await InfluencerPostsSection({ ctx: CTX }))
  for (const [title, value] of [['Posts', '2'], ['Total Engagements', '36,361'], ['Avg. Engagements per Post', '18,181'], ['Total Views', '—']]) {
    expect(getByText(title).closest('div.rounded-lg')!.textContent).toContain(value)
  }
  expect(getByText('Not reported for these posts')).toBeTruthy()
})

test('no influencer posts: no totals, only the empty line the cards show', async () => {
  getClientBySlug.mockResolvedValue(v2Client)
  fetchTopContentFrozen.mockResolvedValue([post(1)])
  const { queryByText } = render(await InfluencerPostsSection({ ctx: CTX }))
  expect(queryByText('Total Engagements')).toBeNull()
})
