import { expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'

// Mock the data modules (spec 2 §8) so the resolved output is real, deterministic, and DB-free.
// The server action is mocked so importing the toggle doesn't pull @/auth/server code.
vi.mock('@/app/actions/organic-social', () => ({ setDesignationAction: vi.fn(async () => ({ ok: true })) }))
const { getDesignations } = vi.hoisted(() => ({ getDesignations: vi.fn(async () => new Map()) }))
vi.mock('@/lib/organic-social/designations/select', () => ({ getDesignations }))
// A client WITHOUT the Influencer tab (no Instagram in its allowlist): its Influencer section stays in the gallery.
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn(async () => ({ id: 'c1', dashSocialConfig: { brandId: 1, channels: ['linkedin'] }, hiddenReports: [] })) }))
vi.mock('@/lib/organic-social/frozen', () => ({
  fetchTopContentFrozen: vi.fn(async () => [
    { id: 1, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt: '2026-06-01', caption: 'owned post', url: 'https://x/1', mediaType: 'IMAGE', mediaGroup: null, creative: { kind: 'image', thumb: 'https://cdn/t.jpg', full: 'https://cdn/f.jpg' }, metrics: { effectiveness: 10, engagementRate: 0.03, engagements: 50, impressions: 100 }, sourceType: 'organic' },
    { id: 2, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt: '2026-06-02', caption: 'promo #ad', url: null, mediaType: 'IMAGE', mediaGroup: null, creative: null, metrics: { effectiveness: 20, engagementRate: 0.09, engagements: 90, impressions: 200 }, sourceType: 'organic' },
  ]),
}))

import { TopContentV2Section, topContentV2 } from './top-content'
import { ORGANIC_SOCIAL_PARTS } from './registry'

test('top-content is registered at version 2 and published', () => {
  expect(ORGANIC_SOCIAL_PARTS['top-content'][2]).toBe(topContentV2)
  expect(topContentV2.published).toBe(true)
})

test('top-content@2 renders the card gallery: Influencer section + placeholder on purged creative', async () => {
  const ctx = {
    clientSlug: 'renaissance', dateRange: 'june', compareRange: 'previous_period',
    channel: null, view: null, role: 'INTERNAL_ADMIN',
  }
  const el = await TopContentV2Section(ctx)
  const { findByText } = render(<TooltipProvider>{el}</TooltipProvider>)
  // #ad post (no stored row) is suggested influencer → the Influencer section renders,
  expect(await findByText(/Influencer Posts/i)).toBeInTheDocument()
  // and its creative:null card shows the placeholder (not a hidden/unmounted card).
  expect(await findByText(/creative no longer available/i)).toBeInTheDocument()
  expect(getDesignations).toHaveBeenCalled()
})

// A client WITH the Influencer tab (the Renaissance shape: no allowlist, no setting): the Instagram influencer group
// leaves the gallery on Overview and the Instagram tab alike; other platforms' groups stay (spec B1, F15.1).
test('with the Influencer tab, the gallery drops the Instagram influencer group and keeps the others', async () => {
  const { getClientBySlug } = await import('@/lib/db/queries')
  // Two reads per render (loadDesignations, then the tab rule), so the shape is answered twice.
  const withTab = { id: 'c1', dashSocialConfig: { brandId: 1 }, hiddenReports: [] } as never
  vi.mocked(getClientBySlug).mockResolvedValueOnce(withTab).mockResolvedValueOnce(withTab)
  const { fetchTopContentFrozen } = await import('@/lib/organic-social/frozen')
  vi.mocked(fetchTopContentFrozen).mockResolvedValueOnce([
    { id: 2, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt: '2026-06-02', caption: 'promo #ad', url: null, mediaType: 'IMAGE', mediaGroup: null, creative: null, metrics: { effectiveness: 20, engagementRate: 0.09, engagements: 90, impressions: 200 }, sourceType: 'organic' },
    { id: 3, channel: 'FACEBOOK', platform: 'Facebook', publishedAt: '2026-06-03', caption: 'paid #ad', url: null, mediaType: 'IMAGE', mediaGroup: null, creative: null, metrics: { effectiveness: null, engagementRate: 0.02, engagements: 7, impressions: 70 }, sourceType: 'organic' },
  ] as never)
  const el = await TopContentV2Section({ clientSlug: 'c', dateRange: 'june', compareRange: 'previous_period', channel: null, view: null, role: 'CLIENT_VIEWER' })
  const { queryByText } = render(<TooltipProvider>{el}</TooltipProvider>)
  expect(queryByText('promo #ad')).toBeNull()
  expect(queryByText('paid #ad')).not.toBeNull()
})
