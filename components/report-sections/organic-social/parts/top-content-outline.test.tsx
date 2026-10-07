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
import { TopContentV2Section, topContentV1, topContentV2 } from './top-content'
import { ORGANIC_SOCIAL_PARTS } from './registry'

const IG = { clientSlug: 'client-a', dateRange: 'custom:2026-08-01,2026-08-31', compareRange: 'custom:2026-07-01,2026-07-31', channel: 'INSTAGRAM' as const, view: null, role: 'INTERNAL_ADMIN' }
const post = (id: number, over: Record<string, unknown> = {}) => ({
  id, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt: '2026-08-02', caption: `cap-${id}`, url: null, mediaType: 'IMAGE',
  mediaGroup: null, creative: null, sourceType: 'organic', metrics: { effectiveness: null, engagementRate: 0.5, engagements: 4, impressions: 40 }, ...over,
})
const props = () => (SortableTopContent.mock.calls.at(-1) as unknown as [Record<string, unknown>])[0] as {
  owned: { platform: string; posts: { id: number; metrics: { engagementRate: number | null } }[] }[]
  influencer: { platform: string; posts: { id: number }[] }[]
  ownedLimit?: number; pageSize?: number; sortKeys?: string[]
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

test('the frozen fetch gets a live fetch that asks for authors and UGC marking', async () => {
  fetchTopContentFrozen.mockResolvedValue([])
  await show()
  expect(fetchTopContentFrozen).toHaveBeenCalledTimes(1)
  const [slug, range, ch, injected] = fetchTopContentFrozen.mock.calls[0] as unknown as [string, string, string, { fetchLive: (...a: unknown[]) => unknown }]
  expect([slug, range, ch]).toEqual([IG.clientSlug, IG.dateRange, 'INSTAGRAM'])
  await injected.fetchLive('s', 'd', 'INSTAGRAM')
  expect(fetchTopContent).toHaveBeenCalledWith('s', 'd', 'INSTAGRAM', { withAuthor: true, markUgc: true })
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

// The warning names both situations that reach it, because the author names cannot tell them
// apart: a stale handle, or a correct handle in a window nobody from the client posted in
// (Paul, PR 255). lib/organic-social/outline-top-content.test.ts proves they are identical here.
test('a handle no post author matches is not trusted: #ad rule, one warning naming both causes', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  getClientBySlug.mockResolvedValue({ id: 'c1', dashSocialConfig: { brandId: 1, ownHandles: { instagram: 'old_handle' } } })
  fetchTopContentFrozen.mockResolvedValue([post(1, { author: 'brand_handle' }), post(2, { author: 'creator_one' }), post(3, { caption: 'yay #ad' })])
  await show()
  expect(props().owned[0].posts.map((x) => x.id)).toEqual([1, 2])
  expect(props().influencer[0].posts.map((x) => x.id)).toEqual([3])
  expect(warn).toHaveBeenCalledTimes(1)
  expect(warn).toHaveBeenCalledWith('[organic-social] own handle matches no post author slug=client-a channel=INSTAGRAM; it is either stale or nobody from the client posted in this window; collab rule fell back to #ad')
  warn.mockRestore()
})

// Plan 2026-09-24-qa-fixes §4 (F1): a tagged (UGC) post without author or #ad renders under
// Influencer Posts, never in an owned slot.
test('a UGC post is never an owned post on outline tabs', async () => {
  fetchTopContentFrozen.mockResolvedValue([post(1, { author: 'brand_handle' }), post(2, { ugc: true })])
  await show()
  expect(props().owned.flatMap((r) => r.posts.map((p) => p.id))).toEqual([1])
  expect(props().influencer.flatMap((r) => r.posts.map((p) => p.id))).toEqual([2])
})

// Jasmine's three outlines name this block "Top Performing Content". Only top-content@3, which only
// the outline clients pin, says so; @2, which Renaissance renders, keeps "Top Content".
test('top-content@3 is headed "Top Performing Content"; @2 keeps "Top Content"', async () => {
  fetchTopContentFrozen.mockResolvedValue([post(1)])
  const c = (await show()).container
  expect([...c.querySelectorAll('h2')].map((h) => h.textContent)).toEqual(['Top Performing Content'])
  const v2 = render(<>{await TopContentV2Section(IG)}</>).container
  expect([...v2.querySelectorAll('h2')].map((h) => h.textContent)).toEqual(['Top Content'])
})

test('T6 outline tabs pass only the Engagements and Views sort buttons', async () => {
  fetchTopContentFrozen.mockResolvedValue([post(1)])
  await show()
  expect(props().sortKeys).toEqual(['engagements', 'impressions'])
})

// The Renaissance-path guard: the goldens hold no toolbar, so this pins that v2 never passes a list.
test('T7 the v2 part (Renaissance) passes no sortKeys', async () => {
  fetchTopContentFrozen.mockResolvedValue([post(1)])
  render(<>{await TopContentV2Section(IG)}</>)
  expect(SortableTopContent).toHaveBeenCalledTimes(1)
  expect(props()).not.toHaveProperty('sortKeys')
})

const withSection = (influencerSection: unknown) =>
  getClientBySlug.mockResolvedValue({ id: 'c1', dashSocialConfig: { brandId: 1, ownHandles: { instagram: 'brand_handle' }, influencerSection } })
const heading = () => (SortableTopContent.mock.calls.at(-1) as unknown as [{ influencerHeading?: string }])[0].influencerHeading

test('no influencerSection: the influencer row and the default heading, exactly as today', async () => {
  fetchTopContentFrozen.mockResolvedValue([post(1, { author: 'brand_handle' }), post(2, { author: 'creator_one' })])
  await show()
  expect(props().influencer[0].posts.map((x) => x.id)).toEqual([2])
  expect((SortableTopContent.mock.calls.at(-1) as unknown as [Record<string, unknown>])[0]).not.toHaveProperty('influencerHeading')
})

test('Instagram hidden: no influencer row on the Instagram tab; the owned top 5 is unchanged; the posts are not moved', async () => {
  withSection({ INSTAGRAM: { hidden: true } })
  fetchTopContentFrozen.mockResolvedValue([post(1, { author: 'brand_handle' }), post(2, { author: 'creator_one' }), post(3)])
  await show()
  expect(props().influencer).toEqual([])
  expect(props().owned[0].posts.map((x) => x.id)).toEqual([1, 3])
})

test('a hide on another channel leaves this tab alone', async () => {
  withSection({ FACEBOOK: { hidden: true } })
  fetchTopContentFrozen.mockResolvedValue([post(1, { author: 'brand_handle' }), post(2, { author: 'creator_one' })])
  await show()
  expect(props().influencer[0].posts.map((x) => x.id)).toEqual([2])
})

test('Instagram label: the heading is "Partnership Posts" on the Instagram tab only', async () => {
  withSection({ INSTAGRAM: { label: 'Partnership Posts' } })
  fetchTopContentFrozen.mockResolvedValue([post(1, { author: 'brand_handle' }), post(2, { author: 'creator_one' })])
  await show()
  expect(heading()).toBe('Partnership Posts')
  render(<>{await TopContentOutlineSection({ ctx: { ...IG, channel: 'FACEBOOK' }, ownedLimit: 5 })}</>)
  expect(heading()).toBeUndefined()
})

test('on Overview a hidden platform drops only its own row', async () => {
  withSection({ INSTAGRAM: { hidden: true } })
  fetchTopContentFrozen.mockResolvedValue([
    post(1, { author: 'brand_handle' }),
    post(2, { author: 'creator_one' }),
    post(5, { channel: 'FACEBOOK', platform: 'Facebook', ugc: true }), // a tagged post is a collab post (outline-top-content.ts:29)
  ])
  render(<>{await TopContentOutlineSection({ ctx: { ...IG, channel: null }, ownedLimit: 5 })}</>)
  expect(props().influencer.map((g) => g.platform)).toEqual(['Facebook'])
})

test('an invalid influencerSection keeps today\'s section and warns once with the slug, never the value', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  withSection({ INSTAGRAM: { label: 'secret-looking-value', hidden: true } })
  fetchTopContentFrozen.mockResolvedValue([post(1, { author: 'brand_handle' }), post(2, { author: 'creator_one' })])
  await show()
  expect(props().influencer[0].posts.map((x) => x.id)).toEqual([2])
  expect(heading()).toBeUndefined()
  const lines = warn.mock.calls.map((c) => c.join(' ')).filter((l) => l.includes('influencerSection'))
  expect(lines).toEqual(['[organic-social] influencerSection invalid slug=client-a; showing the default Influencer section'])
  expect(lines.join('')).not.toContain('secret-looking-value')
  warn.mockRestore()
})

test('a failed client read keeps the default section and logs no influencerSection warning', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  getClientBySlug.mockRejectedValueOnce(new Error('db down'))
  fetchTopContentFrozen.mockResolvedValue([post(2, { author: 'creator_one' })])
  await show()
  expect((SortableTopContent.mock.calls.at(-1) as unknown as [Record<string, unknown>])[0]).not.toHaveProperty('influencerHeading')
  expect(warn.mock.calls.some((c) => c.join(' ').includes('influencerSection'))).toBe(false)
  warn.mockRestore()
})

// PR #306 review: a miscased key does nothing (by design), but now says so, by slug, without any other key's text.
test('a miscased or unknown key keeps today\'s section and warns once, naming only the miscased key', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  withSection({ Instagram: { hidden: true }, 'brand 123456': { hidden: true } })
  fetchTopContentFrozen.mockResolvedValue([post(1, { author: 'brand_handle' }), post(2, { author: 'creator_one' })])
  await show()
  expect(props().influencer[0].posts.map((x) => x.id)).toEqual([2])
  const lines = warn.mock.calls.map((c) => c.join(' ')).filter((l) => l.includes('influencerSection'))
  expect(lines).toEqual(['[organic-social] influencerSection ignored keys slug=client-a keys=Instagram other=1'])
  expect(lines.join('\n')).not.toContain('123456')
  warn.mockRestore()
})

// Batch B review: an invalid setting gets only the invalid warning, even when it also has a skipped key.
test('an invalid setting with a miscased key warns once, as invalid, and not about ignored keys', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  withSection({ INSTAGRAM: { label: 'x', hidden: true }, Instagram: {} })
  fetchTopContentFrozen.mockResolvedValue([post(1, { author: 'brand_handle' }), post(2, { author: 'creator_one' })])
  await show()
  const lines = warn.mock.calls.map((c) => c.join(' ')).filter((l) => l.includes('influencerSection'))
  expect(lines).toEqual(['[organic-social] influencerSection invalid slug=client-a; showing the default Influencer section'])
  warn.mockRestore()
})

// PR #306 review: staff can still reach a hidden platform's posts behind a closed control; clients never receive them.
const hiddenProp = () => (SortableTopContent.mock.calls.at(-1) as unknown as [{ hiddenInfluencer?: { platform: string; posts: { id: number }[] }[] }])[0].hiddenInfluencer

// A pin: this passed before X6 too, and must keep passing.
test('Instagram hidden, client viewer: the hidden posts are not passed to the component at all', async () => {
  withSection({ INSTAGRAM: { hidden: true } })
  fetchTopContentFrozen.mockResolvedValue([post(1, { author: 'brand_handle' }), post(2, { author: 'creator_one' })])
  render(<>{await TopContentOutlineSection({ ctx: { ...IG, role: 'CLIENT_VIEWER' }, ownedLimit: 5 })}</>)
  expect(props().influencer).toEqual([])
  expect((SortableTopContent.mock.calls.at(-1) as unknown as [Record<string, unknown>])[0]).not.toHaveProperty('hiddenInfluencer')
  expect(JSON.stringify(SortableTopContent.mock.calls.at(-1))).not.toContain('creator_one')
})

test('Instagram hidden, staff: the hidden row is passed as hiddenInfluencer, and still not as a visible influencer row', async () => {
  withSection({ INSTAGRAM: { hidden: true } })
  fetchTopContentFrozen.mockResolvedValue([post(1, { author: 'brand_handle' }), post(2, { author: 'creator_one' })])
  await show()
  expect(props().influencer).toEqual([])
  expect(hiddenProp()!.map((g) => [g.platform, g.posts.map((p) => p.id)])).toEqual([['Instagram', [2]]])
})

// A pin: this passed before X6 too, and must keep passing.
test('a hidden-platform post a team member marked Organic leaves the hidden row and is in the owned row', async () => {
  withSection({ INSTAGRAM: { hidden: true } })
  getDesignations.mockResolvedValueOnce(new Map([[2, 'organic']]))
  fetchTopContentFrozen.mockResolvedValue([post(1, { author: 'brand_handle' }), post(2, { author: 'creator_one', ugc: true })])
  await show()
  expect(props().owned[0].posts.map((x) => x.id).sort()).toEqual([1, 2])
  expect((SortableTopContent.mock.calls.at(-1) as unknown as [Record<string, unknown>])[0]).not.toHaveProperty('hiddenInfluencer')
})

// A pin: this passed before X6 too, and must keep passing.
test('no hidden platform: staff get no hiddenInfluencer', async () => {
  fetchTopContentFrozen.mockResolvedValue([post(1, { author: 'brand_handle' }), post(2, { author: 'creator_one' })])
  await show()
  expect((SortableTopContent.mock.calls.at(-1) as unknown as [Record<string, unknown>])[0]).not.toHaveProperty('hiddenInfluencer')
})

// Batch C review: on Overview, every hidden platform sits behind the one control; a visible platform keeps its row.
test('Overview with Instagram and Facebook hidden: both rows go to hiddenInfluencer, LinkedIn stays visible', async () => {
  withSection({ INSTAGRAM: { hidden: true }, FACEBOOK: { hidden: true } })
  fetchTopContentFrozen.mockResolvedValue([
    post(1, { ugc: true }), // tagged, so influencer whatever the own-handle rule decides
    post(2, { channel: 'FACEBOOK', platform: 'Facebook', ugc: true }),
    post(3, { channel: 'FACEBOOK', platform: 'Facebook', ugc: true }),
    post(4, { channel: 'LINKEDIN', platform: 'LinkedIn', ugc: true }),
  ])
  render(<>{await TopContentOutlineSection({ ctx: { ...IG, channel: null }, ownedLimit: 5 })}</>)
  expect(props().influencer.map((g) => g.platform)).toEqual(['LinkedIn'])
  expect(hiddenProp()!.map((g) => [g.platform, g.posts.map((p) => p.id).sort()]).sort()).toEqual([['Facebook', [2, 3]], ['Instagram', [1]]])
})
