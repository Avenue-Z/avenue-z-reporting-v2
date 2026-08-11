import { expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'

// Toggle import pulls a server action transitively — stub it (same pattern as sibling tests).
vi.mock('@/app/actions/organic-social', () => ({ setDesignationAction: vi.fn(async () => ({ ok: true })) }))

import { PostCard } from '../post-card'
import type { TopContentPost } from '@/lib/organic-social/content-types'

const base: TopContentPost = {
  id: 1,
  channel: 'LINKEDIN',
  platform: 'LinkedIn',
  publishedAt: '2026-06-01',
  caption: 'hi',
  url: 'https://x/p',
  mediaType: 'IMAGE',
  mediaGroup: null,
  creative: null,
  metrics: { effectiveness: null, engagementRate: null, engagements: 3, impressions: 9 },
  sourceType: 'organic',
}

test('renders the AI Retrievals value when present', () => {
  const { getByText } = render(<PostCard post={base} clientSlug="renaissance" canEdit={false} retrievals={34} />)
  expect(getByText('AI Retrievals')).toBeTruthy()
  expect(getByText('34')).toBeTruthy()
})

test('renders an em dash when retrievals is null', () => {
  const { getByText } = render(<PostCard post={base} clientSlug="renaissance" canEdit={false} retrievals={null} />)
  const label = getByText('AI Retrievals')
  expect(label.nextSibling?.textContent).toBe('—')
})
