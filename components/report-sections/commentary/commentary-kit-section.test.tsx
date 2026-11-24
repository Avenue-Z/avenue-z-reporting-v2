// The kit look reaches the panel only where it should (plan docs/superpowers/plans/2026-11-23-os-design-phase1.md, Task 11):
// CommentarySection passes `look` on to the panel on both its paths (an Organic Social view on locked months goes through
// monthlyCommentary), only for an Organic Social view key; commentary@2 and recommendations@2 ask for it; both are
// published, so a client's sharedParts pin of them saves; and Recommendations stays at the bottom.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'

let captured: Record<string, unknown> | null = null
vi.mock('./commentary-panel', () => ({ CommentaryPanel: (props: Record<string, unknown>) => { captured = props; return null } }))
const mockAuth = vi.fn()
vi.mock('@/auth', () => ({ auth: () => mockAuth() }))
const client = vi.hoisted(() => ({ value: { id: 'client-1', slug: 'acme' } as Record<string, unknown> }))
vi.mock('@/lib/db/queries', () => ({
  getClientBySlug: async () => client.value,
  getCommentaryForView: async () => [],
}))

import { CommentarySection } from './index'
import { SHARED_PARTS, SHARED_PART_PLACEMENT, commentaryPart, recommendationsPart } from '@/components/report-sections/shared/parts/registry'
import { validateSectionOverride } from '@/lib/report-sections/mutations'

const staff = { user: { email: 'writer@avenuez.com', role: 'INTERNAL_ADMIN' } }
beforeEach(() => { captured = null; mockAuth.mockResolvedValue(staff); client.value = { id: 'client-1', slug: 'acme' } })
afterEach(() => vi.unstubAllEnvs())

async function propsFor(viewKey: string, look?: 'kit') {
  const el = await CommentarySection({ clientSlug: 'acme', viewKey: viewKey as never, ...(look ? { look } : {}) })
  if (el) render(el as ReactElement)
  return captured
}

describe('CommentarySection', () => {
  test('passes the kit look to the panel on an Organic Social view', async () => {
    for (const key of ['organic-social', 'organic-social:instagram', 'organic-social:instagram:recommendations']) {
      expect((await propsFor(key, 'kit'))?.look, key).toBe('kit')
    }
  })
  test('never on another report, so commentary@2 pinned on another report keeps today\'s panel', async () => {
    for (const key of ['peec-ai', 'meta-ads', 'executive-overview']) {
      const props = await propsFor(key, 'kit')
      expect(props, key).not.toBeNull()
      expect(props, key).not.toHaveProperty('look')
    }
  })
  test('without the look, the panel is handed no look key at all, on every view', async () => {
    for (const key of ['organic-social:instagram', 'peec-ai']) expect(await propsFor(key), key).not.toHaveProperty('look')
  })
  test('on locked months (monthlyCommentary), the look reaches the panel too', async () => {
    client.value = { id: 'client-1', slug: 'acme', dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-01' } } }
    const props = await propsFor('organic-social:instagram', 'kit')
    expect(props).not.toBeNull()
    expect(props?.look).toBe('kit')
  })
})

describe('commentary@2 and recommendations@2', () => {
  const ctx = { slug: 'acme', viewKey: 'organic-social:instagram' as const }
  const r = { id: 'x', version: 2, label: 'x' }
  test('render the same section as @1, with the kit look, and nothing else different', () => {
    const v1 = commentaryPart.render(ctx, r) as ReactElement<Record<string, unknown>>
    const v2 = SHARED_PARTS.commentary[2].render(ctx, r) as ReactElement<Record<string, unknown>>
    expect(v2.type).toBe(v1.type)
    expect(v2.props).toEqual({ ...v1.props, look: 'kit' })
    const rv1 = recommendationsPart.render({ ...ctx, requestedRange: 'custom:2026-10-01,2026-10-31' }, r) as ReactElement<Record<string, unknown>>
    const rv2 = SHARED_PARTS.recommendations[2].render({ ...ctx, requestedRange: 'custom:2026-10-01,2026-10-31' }, r) as ReactElement<Record<string, unknown>>
    expect(rv2.props).toEqual({ ...rv1.props, look: 'kit' })
    expect(SHARED_PARTS.recommendations[2].render({ slug: 'acme', viewKey: 'peec-ai' as never }, r)).toBeNull()
  })
  test('are published with @1\'s labels, and Recommendations is still placed at the bottom', () => {
    for (const id of ['commentary', 'recommendations'] as const) {
      expect(SHARED_PARTS[id][2]).toMatchObject({ id, version: 2, published: true, defaultLabel: SHARED_PARTS[id][1].defaultLabel })
      expect(SHARED_PARTS[id][1]).toBe(id === 'commentary' ? commentaryPart : recommendationsPart)
    }
    expect(SHARED_PART_PLACEMENT).toEqual({ commentary: 'top', recommendations: 'bottom' })
  })
  test('a client\'s Organic Social config pinning both saves (shared parts must be published)', () => {
    const out = validateSectionOverride('organic-social', { sharedParts: [{ id: 'commentary', version: 2 }, { id: 'recommendations', version: 2 }] }, {}, [], SHARED_PARTS as never)
    expect(out['organic-social'].sharedParts).toEqual([{ id: 'commentary', version: 2 }, { id: 'recommendations', version: 2 }])
  })
})
