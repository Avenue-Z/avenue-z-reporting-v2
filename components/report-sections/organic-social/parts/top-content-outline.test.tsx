import { beforeEach, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'

// Data modules mocked as in top-content-v2.golden.test.tsx; the gallery is mocked to read its props.
vi.mock('@/app/actions/organic-social', () => ({ setDesignationAction: vi.fn(async () => ({ ok: true })) }))
const { getDesignations, getClientBySlug, fetchTopContentFrozen, fetchTopContent, SortableTopContent } = vi.hoisted(() => ({
  getDesignations: vi.fn(async () => new Map()),
  getClientBySlug: vi.fn(),
  fetchTopContentFrozen: vi.fn(),
  fetchTopContent: vi.fn(async () => []),
  SortableTopContent: vi.fn(() => null),
}))
vi.mock('@/lib/organic-social/designations/select', () => ({ getDesignations }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug }))
vi.mock('@/lib/organic-social/frozen', () => ({ fetchTopContentFrozen }))
vi.mock('@/lib/organic-social/top-content', () => ({ fetchTopContent, getTopContent: vi.fn() }))
vi.mock('../sortable-top-content', () => ({ SortableTopContent }))

import { TopContentOutlineSection, topContentV3 } from './top-content-outline'
import { topContentV1, topContentV2 } from './top-content'
import { ORGANIC_SOCIAL_PARTS } from './registry'

const IG = { clientSlug: 'client-a', dateRange: 'custom:2026-08-01,2026-08-31', compareRange: 'custom:2026-07-01,2026-07-31', channel: 'INSTAGRAM' as const, role: 'INTERNAL_ADMIN' }
const post = (id: number, over: Record<string, unknown> = {}) => ({
  id, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt: '2026-08-02', caption: `cap-${id}`, url: null, mediaType: 'IMAGE',
  mediaGroup: null, creative: null, sourceType: 'organic', metrics: { effectiveness: null, engagementRate: 0.5, engagements: 4, impressions: 40 }, ...over,
})
const props = () => (SortableTopContent.mock.calls.at(-1) as unknown as [Record<string, unknown>])[0] as {
  owned: { platform: string; posts: { id: number; metrics: { engagementRate: number | null } }[] }[]
  influencer: { platform: string; posts: { id: number }[] }[]
  ownedLimit?: number; pageSize?: number
}
const show = async (ownedLimit = 5) => render(<>{await TopContentOutlineSection({ ctx: IG, ownedLimit })}</>)

beforeEach(() => {
  for (const f of [getDesignations, getClientBySlug, fetchTopContentFrozen, fetchTopContent, SortableTopContent]) f.mockClear()
  getClientBySlug.mockResolvedValue({ id: 'c1', dashSocialConfig: { brandId: 1, ownHandles: { instagram: 'brand_handle' } } })
})

test('top-content@3 is registered unpublished; @1 and @2 are the same objects as before', () => {
  expect(ORGANIC_SOCIAL_PARTS['top-content'][3]).toBe(topContentV3)
  expect(topContentV3.published).toBe(false)
  expect(ORGANIC_SOCIAL_PARTS['top-content'][1]).toBe(topContentV1)
  expect(ORGANIC_SOCIAL_PARTS['top-content'][2]).toBe(topContentV2)
})

test('the frozen fetch gets a live fetch that asks for authors', async () => {
  fetchTopContentFrozen.mockResolvedValue([])
  await show()
  expect(fetchTopContentFrozen).toHaveBeenCalledTimes(1)
  const [slug, range, ch, injected] = fetchTopContentFrozen.mock.calls[0] as unknown as [string, string, string, { fetchLive: (...a: unknown[]) => unknown }]
  expect([slug, range, ch]).toEqual([IG.clientSlug, IG.dateRange, 'INSTAGRAM'])
  await injected.fetchLive('s', 'd', 'INSTAGRAM')
  expect(fetchTopContent).toHaveBeenCalledWith('s', 'd', 'INSTAGRAM', { withAuthor: true })
})

test('owned rows get the cap and no page size; an author post is an influencer post; Instagram rates are views based', async () => {
  fetchTopContentFrozen.mockResolvedValue([post(1, { author: 'brand_handle' }), post(2, { author: 'creator_one' }), post(3)])
  await show(5)
  const p = props()
  expect(p.ownedLimit).toBe(5)
  expect(p.pageSize).toBeUndefined()
  expect(p.owned[0].posts.map((x) => x.id)).toEqual([1, 3])
  expect(p.influencer[0].posts.map((x) => x.id)).toEqual([2])
  expect(p.owned[0].posts.map((x) => x.metrics.engagementRate)).toEqual([0.1, 0.1])
})

test('render passes the pin threshold as the cap, default 5', () => {
  const el = (t?: number) => (topContentV3.render(IG, { id: 'top-content', version: 3, label: 'x', threshold: t }) as { props: { children: { props: { ownedLimit: number } } } }).props.children.props.ownedLimit
  expect([el(undefined), el(6), el(0)]).toEqual([5, 6, 5])
})

test('an own handle with no post authors (a window frozen before the pin) warns once and falls back to #ad', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  fetchTopContentFrozen.mockResolvedValue([post(1), post(2, { caption: 'yay #ad' })])
  await show()
  expect(warn).toHaveBeenCalledTimes(1)
  expect(warn).toHaveBeenCalledWith('[organic-social] top content has no post authors slug=client-a channel=INSTAGRAM; collab rule fell back to #ad')
  expect(props().influencer[0].posts.map((x) => x.id)).toEqual([2])
  warn.mockRestore()
})

test('a failed config read means no own handles: the #ad rule, no warning', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  getClientBySlug.mockRejectedValueOnce(new Error('db down'))
  fetchTopContentFrozen.mockResolvedValue([post(1, { author: 'creator_one' })])
  await show()
  expect(props().owned[0].posts.map((x) => x.id)).toEqual([1])
  expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('no post authors'))
  warn.mockRestore()
})

test('a handle no post author matches (renamed or mistyped) is not trusted: #ad rule, one warning', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  getClientBySlug.mockResolvedValue({ id: 'c1', dashSocialConfig: { brandId: 1, ownHandles: { instagram: 'old_handle' } } })
  fetchTopContentFrozen.mockResolvedValue([post(1, { author: 'brand_handle' }), post(2, { author: 'creator_one' }), post(3, { caption: 'yay #ad' })])
  await show()
  expect(props().owned[0].posts.map((x) => x.id)).toEqual([1, 2])
  expect(props().influencer[0].posts.map((x) => x.id)).toEqual([3])
  expect(warn).toHaveBeenCalledTimes(1)
  expect(warn).toHaveBeenCalledWith('[organic-social] own handle matches no post author slug=client-a channel=INSTAGRAM; collab rule fell back to #ad')
  warn.mockRestore()
})
