import { expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'

// Its own file, so the Instagram tab's test file is not edited here (the Influencer tab PR appends to it; the two PRs
// must merge in either order). The gallery is mocked to nothing: only the heading renders.
vi.mock('@/app/actions/organic-social', () => ({ setDesignationAction: vi.fn(async () => ({ ok: true })) }))
const { getDesignations, getClientBySlug, fetchTopContentFrozen, fetchTopContent, SortableTopContent } = vi.hoisted(() => ({
  getDesignations: vi.fn(async () => new Map()),
  getClientBySlug: vi.fn(async () => ({ id: 'c1', dashSocialConfig: { brandId: 1 } })),
  fetchTopContentFrozen: vi.fn(async () => []),
  fetchTopContent: vi.fn(async () => []),
  SortableTopContent: vi.fn(() => null),
}))
vi.mock('@/lib/organic-social/designations/select', () => ({ getDesignations }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug }))
vi.mock('@/lib/organic-social/frozen', () => ({ fetchTopContentFrozen }))
vi.mock('@/lib/organic-social/top-content', () => ({ fetchTopContent, getTopContent: vi.fn() }))
vi.mock('../sortable-top-content', () => ({ SortableTopContent }))

import { TopContentOutlineSection } from './top-content-outline'
import { TopContentV2Section } from './top-content'
import { TOP_POSTS_DEFINITION } from '@/lib/organic-social/metric-definitions'

const IG = { clientSlug: 'client-a', dateRange: 'custom:2026-08-01,2026-08-31', compareRange: 'custom:2026-07-01,2026-07-31', channel: 'INSTAGRAM' as const, role: 'INTERNAL_ADMIN' }

test('the Top Performing Content heading (top-content@3) carries the appendix hint', async () => {
  const { getByText } = render(<>{await TopContentOutlineSection({ ctx: IG, ownedLimit: 5 })}</>)
  expect(getByText(TOP_POSTS_DEFINITION)).toBeTruthy()
})

test('the Top Content heading (top-content@2) carries the appendix hint', async () => {
  const { getByText } = render(<>{await TopContentV2Section(IG)}</>)
  expect(getByText(TOP_POSTS_DEFINITION)).toBeTruthy()
})
