import { expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'

// @/auth is stubbed globally in vitest.setup.ts (the registry import reaches the DataTable
// display chain -> next-auth landmine); no per-file @/auth mock needed here.
vi.mock('@/lib/organic-social/headlines', () => import('./__mocks__/headlines'))
vi.mock('@/lib/organic-social/trends', () => import('./__mocks__/trends'))
vi.mock('@/lib/organic-social/followers', () => import('./__mocks__/followers'))
vi.mock('@/lib/organic-social/top-content', () => import('./__mocks__/top-content'))

import { getFollowerGraph } from '@/lib/organic-social/followers'
import { FollowerSection, followerGraphV1 } from './follower-graph'
import { ORGANIC_SOCIAL_PARTS } from './registry'
import { FIXTURE_ORGANIC_SOCIAL_CTX } from './__fixtures__/organic-social-ctx'

test('follower-graph@1 golden (Suspense skeleton)', () => {
  const impl = ORGANIC_SOCIAL_PARTS['follower-graph'][1]
  const resolved = { id: 'follower-graph', version: 1, label: impl.defaultLabel }
  const { container } = render(<>{impl.render(FIXTURE_ORGANIC_SOCIAL_CTX, resolved)}</>)
  expect(container.firstChild).toMatchSnapshot()
})

// Platform-only: an admin extraParts override is the only way to reach this part with
// channel=null (validate.ts has no channel-scoping concept — PR #174 review). It must not
// silently overlay every configured channel's follower count on one Overview chart.
test('follower-graph renders nothing for channel=null and never fetches', async () => {
  const el = await FollowerSection({ ...FIXTURE_ORGANIC_SOCIAL_CTX, channel: null })
  expect(el).toBeNull()
  expect(getFollowerGraph).not.toHaveBeenCalled()
})

test('follower-graph fetches and renders for a real channel', async () => {
  const el = await FollowerSection({ ...FIXTURE_ORGANIC_SOCIAL_CTX, channel: 'INSTAGRAM' })
  render(<>{el}</>)
  expect(getFollowerGraph).toHaveBeenCalledWith('fixture-client', 'last_30_days', 'INSTAGRAM')
})

test('followerGraphV1 is registered and published', () => {
  expect(ORGANIC_SOCIAL_PARTS['follower-graph'][1]).toBe(followerGraphV1)
  expect(followerGraphV1.published).toBe(true)
})
