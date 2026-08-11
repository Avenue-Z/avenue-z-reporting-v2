import { expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'

// Integration coverage for Task 6: the live retrievals map fetched in TopContentV2Section must
// reach BOTH the owned card strip and the Influencer section through SortableTopContent's two
// `rows()` calls (owned + influencer) — not just the PostCard leaf in isolation.
//
// Mock the data modules (spec 2 §8) so the resolved output is real, deterministic, and DB-free —
// same pattern as the sibling `top-content-v2.golden.test.tsx`. `retrievalsForPosts` itself is
// mocked to a fixed Map with distinct values per post id, so a real Peec/LinkedIn-resolution call
// never happens and the assertion is purely "did the value the section fetched reach the card".
vi.mock('@/app/actions/organic-social', () => ({ setDesignationAction: vi.fn(async () => ({ ok: true })) }))
const { getDesignations } = vi.hoisted(() => ({ getDesignations: vi.fn(async () => new Map()) }))
vi.mock('@/lib/organic-social/designations/select', () => ({ getDesignations }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn(async () => ({ id: 'c1' })) }))
vi.mock('@/lib/organic-social/frozen', () => ({
  fetchTopContentFrozen: vi.fn(async () => [
    // No #ad token → suggestDesignation resolves this to 'owned'.
    { id: 1, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt: '2026-06-01', caption: 'owned post', url: 'https://x/1', mediaType: 'IMAGE', mediaGroup: null, creative: null, metrics: { effectiveness: 10, engagementRate: 0.03, engagements: 50, impressions: 100 }, sourceType: 'organic' },
    // #ad token, no stored designation row → suggestDesignation resolves this to 'influencer'.
    { id: 2, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt: '2026-06-02', caption: 'promo #ad', url: 'https://x/2', mediaType: 'IMAGE', mediaGroup: null, creative: null, metrics: { effectiveness: 20, engagementRate: 0.09, engagements: 90, impressions: 200 }, sourceType: 'organic' },
  ]),
}))
vi.mock('@/lib/organic-social/ai-retrievals', () => ({
  retrievalsForPosts: vi.fn(async () => new Map([[1, 34], [2, 56]])),
}))

import { TopContentV2Section } from './top-content'

test('AI Retrievals values reach both the owned strip and the Influencer section', async () => {
  const ctx = {
    clientSlug: 'renaissance', dateRange: 'june', compareRange: 'previous_period',
    channel: null, role: 'INTERNAL_ADMIN',
  }
  const el = await TopContentV2Section(ctx as never)
  const { findByText, getAllByText } = render(<TooltipProvider>{el}</TooltipProvider>)

  // Both cards render (owned post 1 in the platform strip, influencer post 2 in the Influencer
  // section), each with its own distinct retrievals value from the mocked map.
  expect(await findByText(/Influencer Posts/i)).toBeInTheDocument()
  expect(getAllByText('AI Retrievals')).toHaveLength(2)
  expect(await findByText('34')).toBeInTheDocument() // owned post id 1
  expect(await findByText('56')).toBeInTheDocument() // influencer post id 2
  expect(getDesignations).toHaveBeenCalled()
})
