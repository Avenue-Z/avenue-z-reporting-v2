import { beforeEach, expect, test, vi } from 'vitest'
vi.mock('@/app/actions/organic-social', () => ({ setDesignationAction: vi.fn(async () => ({ ok: true })) }))
const { getDesignations, getClientBySlug, getSectionTemplate, fetchTopContentFrozen, fetchTopContent, SortableTopContent } = vi.hoisted(() => ({
  getDesignations: vi.fn(async () => new Map()), getClientBySlug: vi.fn(), getSectionTemplate: vi.fn(async () => null), fetchTopContentFrozen: vi.fn(),
  fetchTopContent: vi.fn(async () => []), SortableTopContent: vi.fn(() => null),
}))
vi.mock('@/lib/organic-social/designations/select', () => ({ getDesignations }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug, getSectionTemplate }))
vi.mock('@/lib/organic-social/frozen', () => ({ fetchTopContentFrozen }))
vi.mock('@/lib/organic-social/top-content', () => ({ fetchTopContent, getTopContent: vi.fn() }))
vi.mock('../sortable-top-content', () => ({ SortableTopContent }))
import { render } from '@testing-library/react'
import { TopContentV2Section } from './top-content'

// Spec 2026-10-09 section 6: a top-content@2 client with a saved Instagram handle splits by author, the rule
// A Place For Mom's top-content@3 already uses. The client here has no Instagram in its allowlist, so it has no
// Influencer tab and the gallery keeps the Instagram influencer row for these assertions.
const CTX = { clientSlug: 'client-a', dateRange: 'custom:2026-10-01,2026-10-08', compareRange: 'previous_period', channel: 'INSTAGRAM' as const, view: null, role: 'INTERNAL_ADMIN' }
const post = (id: number, over: Record<string, unknown> = {}) => ({ id, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt: '2026-10-02',
  caption: `cap-${id}`, url: null, mediaType: 'IMAGE', mediaGroup: null, creative: null, sourceType: 'organic',
  metrics: { effectiveness: null, engagementRate: 0.5, engagements: 4, impressions: 40 }, ...over })
const withHandle = { id: 'c1', dashSocialConfig: { brandId: 1, channels: ['linkedin'], ownHandles: { instagram: 'renbenefits' } }, hiddenReports: [] }
const noHandle = { id: 'c1', dashSocialConfig: { brandId: 1, channels: ['linkedin'] }, hiddenReports: [] }
const rows = (key: 'owned' | 'influencer') => ((SortableTopContent.mock.calls.at(-1) as unknown as [Record<string, { posts: { id: number }[] }[]>])[0][key] ?? []).flatMap((g) => g.posts.map((p) => p.id))

beforeEach(() => { for (const f of [getDesignations, getClientBySlug, fetchTopContentFrozen, fetchTopContent, SortableTopContent]) f.mockClear() })

test('with a saved handle: the request asks for authors and UGC marks, and posts split by author', async () => {
  getClientBySlug.mockResolvedValue(withHandle)
  fetchTopContentFrozen.mockResolvedValue([post(1, { author: 'renbenefits' }), post(2, { author: 'famously_amy' }), post(3, { ugc: true }), post(4, { author: 'renbenefits', caption: 'x #ad' })])
  render(await TopContentV2Section(CTX))
  const injected = (fetchTopContentFrozen.mock.calls[0] as unknown[])[3] as { fetchLive: (...a: unknown[]) => unknown }
  await injected.fetchLive('s', 'd', 'INSTAGRAM')
  expect(fetchTopContent).toHaveBeenCalledWith('s', 'd', 'INSTAGRAM', { withAuthor: true, markUgc: true })
  expect(rows('owned')).toEqual([1, 4])     // the client's own posts, even one with #ad
  expect(rows('influencer')).toEqual([2, 3]) // co-authored and tagged
})

test('a stored designation wins over the author rule', async () => {
  getClientBySlug.mockResolvedValue(withHandle)
  getDesignations.mockResolvedValueOnce(new Map([[2, 'organic']]))
  // post 2 is co-authored but stored Organic; post 3 is co-authored with no stored choice, so only the author rule moves it
  fetchTopContentFrozen.mockResolvedValue([post(1, { author: 'renbenefits' }), post(2, { author: 'famously_amy' }), post(3, { author: 'arbazadventures' })])
  render(await TopContentV2Section(CTX))
  expect(rows('owned')).toEqual([1, 2])
  expect(rows('influencer')).toEqual([3])
})

test('without a handle: today exactly, the plain request and the #ad split', async () => {
  getClientBySlug.mockResolvedValue(noHandle)
  fetchTopContentFrozen.mockResolvedValue([post(1, { author: 'famously_amy' }), post(2, { caption: 'y #ad' })])
  render(await TopContentV2Section(CTX))
  expect((fetchTopContentFrozen.mock.calls[0] as unknown[]).length).toBe(3)
  expect(rows('owned')).toEqual([1])
  expect(rows('influencer')).toEqual([2])
})

test('a kept frozen window (posts with no author): warns and keeps the #ad split', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  getClientBySlug.mockResolvedValue(withHandle)
  fetchTopContentFrozen.mockResolvedValue([post(1), post(2, { caption: 'y #ad' })])
  render(await TopContentV2Section(CTX))
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('top content has no post authors slug=client-a channel=INSTAGRAM'))
  expect(rows('owned')).toEqual([1])
  expect(rows('influencer')).toEqual([2])
  warn.mockRestore()
})

test('a failed client read keeps today: the plain request and the #ad split', async () => {
  getClientBySlug.mockRejectedValue(new Error('db down'))
  fetchTopContentFrozen.mockResolvedValue([post(1, { author: 'famously_amy' }), post(2, { caption: 'y #ad' })])
  render(await TopContentV2Section(CTX))
  expect((fetchTopContentFrozen.mock.calls[0] as unknown[]).length).toBe(3)
  expect(rows('influencer')).toEqual([2])
})

test('Overview with a handle: Instagram splits by author, other channels by #ad', async () => {
  getClientBySlug.mockResolvedValue(withHandle)
  // post 7 is the client's own, so the handle matches an author and is kept (ownHandlesFor drops a handle no author matches)
  fetchTopContentFrozen.mockResolvedValue([post(1, { author: 'famously_amy' }), post(7, { author: 'renbenefits' }),
    { ...post(5, { caption: 'fb #ad' }), channel: 'FACEBOOK', platform: 'Facebook' }, { ...post(6), channel: 'FACEBOOK', platform: 'Facebook' }])
  render(await TopContentV2Section({ ...CTX, channel: null }))
  expect(rows('owned')).toEqual([7, 6])
  expect(rows('influencer')).toEqual([1, 5])
})

// Paul, #358 review (comment 1): Overview and the Influencer tab read one rule, influencerRulesFor on the platform layout,
// so a post is never Influencer on one and nowhere on the other.
test('a saved handle with the platform tabs pinned to top-content@1: today exactly (the Influencer tab uses #ad there too)', async () => {
  getClientBySlug.mockResolvedValue({ ...withHandle, reportSectionConfig: { 'organic-social:platform': { versions: { 'top-content': 1 } } } })
  fetchTopContentFrozen.mockResolvedValue([post(1, { author: 'famously_amy' }), post(7, { author: 'renbenefits' }), post(2, { caption: 'y #ad' })])
  render(await TopContentV2Section({ ...CTX, channel: null }))
  expect((fetchTopContentFrozen.mock.calls[0] as unknown[]).length).toBe(3)
  expect(rows('influencer')).toEqual([2])
})

test("a top-content@3 client's Overview (on @2) asks for UGC marks as its Instagram and Influencer tabs do, handle or not", async () => {
  getClientBySlug.mockResolvedValue({ ...noHandle, reportSectionConfig: { 'organic-social:platform': { versions: { 'top-content': 3 } } } })
  fetchTopContentFrozen.mockResolvedValue([post(1), post(3, { ugc: true })])
  render(await TopContentV2Section({ ...CTX, channel: null }))
  expect((fetchTopContentFrozen.mock.calls[0] as unknown[]).length).toBe(4)
  expect(rows('influencer')).toEqual([3]) // the tagged post, which the Influencer tab ('outline') also counts as Influencer
})
