import { expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'

// PostCard imports DesignationToggle -> the server action; mock it so the import doesn't
// pull @/auth server code (mirrors top-content-v2.golden.test.tsx). canEdit=false means the
// toggle never renders, but the module is still imported at load.
vi.mock('@/app/actions/organic-social', () => ({ setDesignationAction: vi.fn(async () => ({ ok: true })) }))

import { PostCard } from './post-card'
import type { TopContentPost } from '@/lib/organic-social/content-types'

// effectiveness + engagementRate are fractions on the post (the card does ×100 for %).
function makePost(metrics: Partial<TopContentPost['metrics']>): TopContentPost {
  return {
    id: 1, channel: 'INSTAGRAM', platform: 'Instagram', publishedAt: '2026-06-01',
    caption: 'post', url: null, mediaType: 'IMAGE', mediaGroup: null,
    creative: { kind: 'image', thumb: 'https://cdn/t.jpg', full: 'https://cdn/f.jpg' },
    metrics: { effectiveness: 0, engagementRate: 0, engagements: 0, impressions: 0, ...metrics },
    sourceType: 'organic',
  }
}

// Guards the two PostCard percent sites (Effectiveness, Engagement Rate) — the goldens assert
// labels only, so these shipped unverified. Locks the pctCompact rule at the render layer.
test('PostCard rounds a >=1% rate to a whole number', () => {
  const { getByText } = render(
    <PostCard post={makePost({ engagementRate: 0.0347, effectiveness: 0.125 })} clientSlug="c" canEdit={false} />,
  )
  getByText('3%')  // engagementRate 3.47% -> whole
  getByText('13%') // effectiveness 12.5% -> 13% (half-up)
})

test('PostCard keeps a sub-1% rate at one decimal (does not collapse to "0%")', () => {
  const { getByText, queryByText } = render(
    <PostCard post={makePost({ engagementRate: 0.004, effectiveness: 0.006 })} clientSlug="c" canEdit={false} />,
  )
  getByText('0.4%') // engagementRate 0.4% preserved
  getByText('0.6%') // effectiveness 0.6% preserved
  expect(queryByText('0%')).toBeNull()
})
