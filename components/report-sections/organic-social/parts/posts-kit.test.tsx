// top-content@4 and @5 and influencer-posts@2 (plan docs/superpowers/plans/2026-11-23-os-design-phase1.md, Tasks 7 and 8):
// the posts in the kit's card frame with the kit's pill buttons, and the Influencer totals as kit tiles. Proven against @3,
// @2 and @1 with the parity helper, for staff (with the designation toggle), a client and the PDF export, before and after
// a sort click. Each kit version awaits the old section and only sets `look="kit"` on the post components it returns
// (posts-kit.tsx), so the requests, the split, the designations and the sort are the old code; these tests pin that too.
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { Suspense, type ReactElement, type ReactNode } from 'react'

vi.mock('@/app/actions/organic-social', () => ({ setDesignationAction: vi.fn(async () => ({ ok: true })) }))
const { getDesignations, getClientBySlug, getSectionTemplate, fetchTopContentFrozen, fetchTopContent } = vi.hoisted(() => ({
  getDesignations: vi.fn(async () => new Map()), getClientBySlug: vi.fn(), getSectionTemplate: vi.fn(async () => null),
  fetchTopContentFrozen: vi.fn(), fetchTopContent: vi.fn(async () => []),
}))
vi.mock('@/lib/organic-social/designations/select', () => ({ getDesignations }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug, getSectionTemplate }))
vi.mock('@/lib/organic-social/frozen', () => ({ fetchTopContentFrozen }))
vi.mock('@/lib/organic-social/top-content', () => ({ fetchTopContent, getTopContent: vi.fn() }))

import { ExportModeProvider } from '@/components/export/export-mode'
import { ORGANIC_SOCIAL_PARTS } from './registry'
import { topContentV2 } from './top-content'
import { topContentV3 } from './top-content-outline'
import { influencerPostsV1 } from './influencer-posts'
import { influencerPostsV2, topContentV4, topContentV5 } from './posts-kit'
import { expectSameValues, visibleValues } from './version-parity'
import kit from '../design/kit.module.css'
import pk from '../posts-kit.module.css'

// Made-up posts only: owned and partner posts on Instagram, every kind of metric (a missing rate, a carousel, a link,
// none), and a UGC-marked post, so the split, the sort and the card rows all have work to do.
const post = (id: number, over: Record<string, unknown> = {}) => ({
  id, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt: `2026-08-${String(id).padStart(2, '0')}`, caption: `caption ${id}`,
  url: id % 2 ? `https://example.com/p/${id}` : null, mediaType: id === 3 ? 'CAROUSEL' : 'IMAGE', mediaGroup: null, creative: null,
  sourceType: 'organic', metrics: { effectiveness: id % 3 ? 0.012 * id : null, engagementRate: id === 4 ? null : 0.031 * id, engagements: 17 * ((id * 7) % 11), impressions: 900 + 37 * ((id * 5) % 13) },
  ...over,
})
const POSTS = [
  ...[1, 2, 3, 4, 5, 6, 7].map((id) => post(id, { author: 'brand_handle' })),
  post(8, { author: 'creator_a' }), post(9, { author: 'creator_b', metrics: { effectiveness: null, engagementRate: null, engagements: 260, impressions: 0 } }),
  post(10, { ugc: true }),
]
const IG = { clientSlug: 'client-a', dateRange: 'custom:2026-08-01,2026-08-31', compareRange: 'custom:2026-07-01,2026-07-31', channel: 'INSTAGRAM' as const, view: null }
const INFLUENCER_TAB = { ...IG, channel: null, view: 'influencer' as const }
// The Instagram tab keeps its influencer row (the Influencer tab hidden); the influencer tab's client has the tab.
const IG_CLIENT = { id: 'c1', slug: 'client-a', dashSocialConfig: { brandId: 1, ownHandles: { instagram: 'brand_handle' } }, hiddenReports: ['organic-influencer'] }
const TAB_CLIENT = { id: 'c1', slug: 'client-a', dashSocialConfig: { brandId: 1, ownHandles: { instagram: 'brand_handle' } }, reportSectionConfig: { 'organic-social:platform': { versions: { 'top-content': 3 } } } }

beforeEach(() => {
  for (const f of [getDesignations, getClientBySlug, getSectionTemplate, fetchTopContentFrozen, fetchTopContent]) f.mockClear()
  getSectionTemplate.mockResolvedValue(null)
  fetchTopContentFrozen.mockResolvedValue(POSTS)
})

/** A part's rendered element, its Suspense opened and every async section awaited, as the page would serve it. */
async function serve(node: ReactNode): Promise<ReactNode> {
  let el = node as ReactElement<Record<string, unknown>> | null
  if (el && typeof el === 'object' && el.type === Suspense) el = (el.props as { children: ReactElement<Record<string, unknown>> }).children
  while (el && typeof el === 'object' && typeof el.type === 'function' && (el.type as { constructor: { name: string } }).constructor.name === 'AsyncFunction') {
    el = (await (el.type as (p: unknown) => Promise<ReactNode>)(el.props)) as ReactElement<Record<string, unknown>> | null
  }
  return el
}
const draw = (node: ReactNode, exporting: boolean) =>
  render(exporting ? <ExportModeProvider>{node}</ExportModeProvider> : <>{node}</>).container
const r = (id: string, version: number) => ({ id, version, label: 'x' })

const PAIRS = [
  ['top-content@4 from @3 (an outline client\'s Instagram tab)', topContentV3, topContentV4, IG, IG_CLIENT],
  ['top-content@5 from @2 (Overview and Renaissance\'s platform tabs)', topContentV2, topContentV5, IG, IG_CLIENT],
  ['influencer-posts@2 from @1 (the Influencer tab)', influencerPostsV1, influencerPostsV2, INFLUENCER_TAB, TAB_CLIENT],
] as const
const VIEWS = [
  ['staff', { role: 'INTERNAL_ADMIN' }, false],
  ['a client', { role: 'CLIENT_VIEWER' }, false],
  ['the PDF export', { role: 'CLIENT_VIEWER' }, true],
] as const

describe.each(VIEWS)('the posts with the kit read exactly as today, for %s', (_who, view, exporting) => {
  test.each(PAIRS)('%s', async (_name, oldV, kitV, ctx, client) => {
    getClientBySlug.mockResolvedValue(client)
    const old = draw(await serve(oldV.render({ ...ctx, ...view }, r(oldV.id, oldV.version))), exporting)
    const kitted = draw(await serve(kitV.render({ ...ctx, ...view }, r(kitV.id, kitV.version))), exporting)
    expect(visibleValues(old).length).toBeGreaterThan(20)
    expectSameValues(old, kitted)
    // The kit really drew: its colours on the block, its frame on every card, and no old frame left.
    expect(kitted.firstElementChild?.classList.contains(kit.root)).toBe(true)
    // Round 3, Task 6: line height normal, as the artifact (the class only Organic Social's kit wrappers carry).
    expect(kitted.firstElementChild?.classList.contains(kit.tight)).toBe(true)
    const cards = kitted.querySelectorAll(`.${pk.frame}`)
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.length).toBe(old.querySelectorAll('.rounded-xl.border').length)
    expect(kitted.querySelector('.rounded-xl.border')).toBeNull()
  })
})

describe('the posts with the kit', () => {
  test.each(PAIRS)('%s: the sort buttons are the kit\'s pills, and a sort click reorders exactly as today', async (_name, oldV, kitV, ctx, client) => {
    getClientBySlug.mockResolvedValue(client)
    const old = draw(await serve(oldV.render({ ...ctx, role: 'CLIENT_VIEWER' }, r(oldV.id, oldV.version))), false)
    const kitted = draw(await serve(kitV.render({ ...ctx, role: 'CLIENT_VIEWER' }, r(kitV.id, kitV.version))), false)
    const pills = [...kitted.querySelectorAll('button[aria-pressed]')]
    expect(pills.length).toBeGreaterThan(1)
    for (const p of pills) expect(p.classList.contains(kit.pill)).toBe(true)
    for (const c of [old, kitted]) {
      const views = [...c.querySelectorAll('button[aria-pressed]')].find((b) => b.textContent?.startsWith('Views'))!
      fireEvent.click(views)
    }
    expectSameValues(old, kitted)
    expect(visibleValues(kitted).some((v) => v.startsWith('Views / Impr.') && v.endsWith('↓'))).toBe(true)
  })
  // Round 3 (plan docs/superpowers/plans/2026-11-24-os-design-round3.md, Task 5): the staff designation toggle is the kit's
  // small button inside the kit's cards, and today's pill everywhere else.
  test.each(PAIRS)('%s: the designation toggles are the kit\'s buttons, and only on the kit', async (_name, oldV, kitV, ctx, client) => {
    getClientBySlug.mockResolvedValue(client)
    const toggles = (c: HTMLElement) => [...c.querySelectorAll('button')].filter((b) => b.textContent?.endsWith('· change'))
    const old = toggles(draw(await serve(oldV.render({ ...ctx, role: 'INTERNAL_ADMIN' }, r(oldV.id, oldV.version))), false))
    const kitted = toggles(draw(await serve(kitV.render({ ...ctx, role: 'INTERNAL_ADMIN' }, r(kitV.id, kitV.version))), false))
    expect(old.length).toBeGreaterThan(0)
    expect(kitted.length).toBe(old.length)
    for (const b of old) expect(b.classList.contains(kit.tbtn)).toBe(false)
    for (const b of kitted) expect(b.className).toBe(`whitespace-nowrap ${kit.tbtn}`)
  })
  test('the Influencer totals are kit tiles, on the page and in the PDF\'s first block', async () => {
    getClientBySlug.mockResolvedValue(TAB_CLIENT)
    for (const exporting of [false, true]) {
      const c = draw(await serve(influencerPostsV2.render({ ...INFLUENCER_TAB, role: 'CLIENT_VIEWER' }, r('influencer-posts', 2))), exporting)
      const tiles = c.querySelectorAll(`.${kit.kpi}`)
      // On the page: the totals once (the live grid ignores `lead`, influencer-grid.tsx). In the PDF: the copy in the first
      // block (`lead`) plus the page copy, hidden there by data-export-hide but still in the markup.
      expect(tiles.length, `exporting=${exporting}`).toBe(exporting ? 8 : 4)
      expect(c.querySelector('div.rounded-lg.px-6.py-5')).toBeNull()
    }
  })
  // Pinned the way a client moved onto the kit will be: the platform composition carries the kit version, and the split
  // rule (influencerRulesFor) reads that pin. The same posts on each tab, the same totals and the same reads as today.
  test.each([
    ['the Influencer tab, platform top-content@3 moved to @4 (the outline rule)', influencerPostsV1, influencerPostsV2, INFLUENCER_TAB, 3, 4, {}],
    ['a top-content@2 tab with a saved handle, moved to @5 (the author rule)', topContentV2, topContentV5, IG, 2, 5, { hiddenReports: ['organic-influencer'] }],
  ] as const)('%s', async (_name, oldV, kitV, ctx, from, to, extra) => {
    const pinned = (v: number) => ({ ...TAB_CLIENT, ...extra, reportSectionConfig: { 'organic-social:platform': { versions: { 'top-content': v } } } })
    const serveAt = async (v: number, part: typeof oldV | typeof kitV) => {
      getClientBySlug.mockResolvedValue(pinned(v))
      for (const f of [fetchTopContentFrozen, getDesignations]) f.mockClear()
      const c = draw(await serve(part.render({ ...ctx, role: 'INTERNAL_ADMIN' }, r(part.id, part.version))), false)
      return { c, reads: JSON.stringify([fetchTopContentFrozen.mock.calls, getDesignations.mock.calls]) }
    }
    const today = await serveAt(from, oldV)
    const moved = await serveAt(to, kitV)
    expectSameValues(today.c, moved.c)
    expect(moved.reads).toBe(today.reads)
  })
  test('asks exactly what the old versions ask: the same post read, client read and designations', async () => {
    const calls = () => JSON.stringify([fetchTopContentFrozen.mock.calls.map((c) => c.slice(0, 3)), getClientBySlug.mock.calls, getDesignations.mock.calls])
    for (const [, oldV, kitV, ctx, client] of PAIRS) {
      getClientBySlug.mockResolvedValue(client)
      for (const f of [fetchTopContentFrozen, getClientBySlug, getDesignations]) f.mockClear()
      await serve(oldV.render({ ...ctx, role: 'INTERNAL_ADMIN' }, r(oldV.id, oldV.version)))
      const was = calls()
      for (const f of [fetchTopContentFrozen, getClientBySlug, getDesignations]) f.mockClear()
      await serve(kitV.render({ ...ctx, role: 'INTERNAL_ADMIN' }, r(kitV.id, kitV.version)))
      expect(calls()).toBe(was)
    }
  })
  test('a failed post read shows exactly the card the old version shows', async () => {
    for (const [, oldV, kitV, ctx, client] of PAIRS) {
      getClientBySlug.mockResolvedValue(client)
      fetchTopContentFrozen.mockRejectedValueOnce(new Error('boom'))
      const old = draw(await serve(oldV.render({ ...ctx, role: 'INTERNAL_ADMIN' }, r(oldV.id, oldV.version))), false).innerHTML
      fetchTopContentFrozen.mockRejectedValueOnce(new Error('boom'))
      expect(draw(await serve(kitV.render({ ...ctx, role: 'INTERNAL_ADMIN' }, r(kitV.id, kitV.version))), false).innerHTML).toBe(old)
    }
  })
  test('the Influencer version renders nothing off the Influencer tab, as @1', () => {
    expect(influencerPostsV2.render({ ...IG, role: 'INTERNAL_ADMIN' }, r('influencer-posts', 2))).toBeNull()
  })
  test('keeps each old version\'s Suspense and skeleton', () => {
    for (const [, oldV, kitV, ctx] of PAIRS) {
      const was = oldV.render({ ...ctx, role: 'INTERNAL_ADMIN' }, r(oldV.id, oldV.version)) as ReactElement<{ fallback: ReactNode }>
      const now = kitV.render({ ...ctx, role: 'INTERNAL_ADMIN' }, r(kitV.id, kitV.version)) as ReactElement<{ fallback: ReactNode }>
      expect(now.type).toBe(Suspense)
      expect(now.props.fallback).toEqual(was.props.fallback)
    }
  })
  test('are registered unpublished as top-content@4 and @5 and influencer-posts@2, with the old labels', () => {
    expect(ORGANIC_SOCIAL_PARTS['top-content'][4]).toBe(topContentV4)
    expect(ORGANIC_SOCIAL_PARTS['top-content'][5]).toBe(topContentV5)
    expect(ORGANIC_SOCIAL_PARTS['influencer-posts'][2]).toBe(influencerPostsV2)
    for (const [, oldV, kitV] of PAIRS) {
      expect(kitV.published).toBe(false)
      expect(kitV.defaultLabel).toBe(oldV.defaultLabel)
    }
  })
})
