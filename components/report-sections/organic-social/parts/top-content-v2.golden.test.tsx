import { expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'

// Mock the four data modules (spec 2 §8) so the resolved output is real, deterministic, and
// DB-free. The server action is mocked so importing the toggle doesn't pull @/auth/server code.
vi.mock('@/app/actions/organic-social', () => ({ setDesignationAction: vi.fn(async () => ({ ok: true })) }))
const { getDesignations } = vi.hoisted(() => ({ getDesignations: vi.fn(async () => new Map()) }))
vi.mock('@/lib/organic-social/designations/select', () => ({ getDesignations }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn(async () => ({ id: 'c1' })) }))
vi.mock('@/lib/organic-social/top-content', async () => {
  const actual = await vi.importActual<typeof import('@/lib/organic-social/top-content')>('@/lib/organic-social/top-content')
  return {
    ...actual,
    fetchTopContent: vi.fn(async () => [
      { id: 1, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt: '2026-06-01', caption: 'owned post', url: null, mediaType: 'IMAGE', mediaGroup: null, creative: null, metrics: { effectiveness: 10, engagementRate: 0.03, engagements: 50, impressions: 100 }, sourceType: 'organic' },
      { id: 2, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt: '2026-06-02', caption: 'promo #ad', url: null, mediaType: 'IMAGE', mediaGroup: null, creative: null, metrics: { effectiveness: 20, engagementRate: 0.09, engagements: 90, impressions: 200 }, sourceType: 'organic' },
    ]),
  }
})

import { TopContentV2Section, topContentV2 } from './top-content'
import { ORGANIC_SOCIAL_PARTS } from './registry'

test('top-content is registered at version 2 and published', () => {
  expect(ORGANIC_SOCIAL_PARTS['top-content'][2]).toBe(topContentV2)
  expect(topContentV2.published).toBe(true)
})

test('top-content@2 renders an Influencer section for an #ad post (designations mocked)', async () => {
  const ctx = {
    clientSlug: 'renaissance', dateRange: 'last_30_days', compareRange: 'previous_period',
    channel: null, role: 'INTERNAL_ADMIN',
  }
  const el = await TopContentV2Section(ctx)
  const { findByText } = render(<TooltipProvider>{el}</TooltipProvider>)
  // #ad post is suggested influencer (no stored row) → the Influencer section renders.
  expect(await findByText(/Influencer Posts/i)).toBeInTheDocument()
  expect(getDesignations).toHaveBeenCalled()
})
