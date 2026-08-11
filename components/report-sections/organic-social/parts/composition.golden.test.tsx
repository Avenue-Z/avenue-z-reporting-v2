import { expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'

// @/auth is stubbed globally in vitest.setup.ts (the registry import reaches the DataTable
// display chain -> next-auth landmine); no per-file @/auth mock needed here.
vi.mock('@/lib/organic-social/headlines', () => import('./__mocks__/headlines'))
vi.mock('@/lib/organic-social/trends', () => import('./__mocks__/trends'))
vi.mock('@/lib/organic-social/top-content', () => import('./__mocks__/top-content'))

import { resolveSection } from '@/lib/report-sections/resolve'
import { lookup } from '@/lib/report-sections/registry'
import { ORGANIC_SOCIAL_PARTS } from './registry'
import { ORGANIC_SOCIAL_TEMPLATE, ORGANIC_SOCIAL_PLATFORM_TEMPLATE } from '../template'
import { FIXTURE_ORGANIC_SOCIAL_CTX } from './__fixtures__/organic-social-ctx'

test('Overview composition resolves to the four parts in order', () => {
  const resolved = resolveSection(ORGANIC_SOCIAL_TEMPLATE, undefined)
  expect(resolved.map((r) => r.id)).toEqual(['platform-headlines', 'engagement-trend', 'top-content', 'top-ai-retrieved'])
  const nodes = resolved.map((r) => lookup(ORGANIC_SOCIAL_PARTS, r.id, r.version)?.render(FIXTURE_ORGANIC_SOCIAL_CTX, r))
  const { container } = render(<>{nodes}</>)
  // Snapshot the whole container (all four skeletons), not just firstChild.
  expect(container).toMatchSnapshot()
})

test('Platform composition inserts follower-graph as the second part', () => {
  const ctx = { ...FIXTURE_ORGANIC_SOCIAL_CTX, channel: 'INSTAGRAM' as const }
  const resolved = resolveSection(ORGANIC_SOCIAL_PLATFORM_TEMPLATE, undefined)
  expect(resolved.map((r) => r.id)).toEqual(['platform-headlines', 'follower-graph', 'engagement-trend', 'top-content', 'top-ai-retrieved'])
  const nodes = resolved.map((r) => lookup(ORGANIC_SOCIAL_PARTS, r.id, r.version)?.render(ctx, r))
  const { container } = render(<>{nodes}</>)
  // Composition still pins all five parts (assertion above), but on a non-LinkedIn
  // platform (INSTAGRAM here) the LinkedIn-only 'top-ai-retrieved' part renders null,
  // so the container shows four skeletons — it's hidden off-LinkedIn by design.
  expect(container).toMatchSnapshot()
})
