import { expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'

// The registry import below pulls in ALL THREE parts, including top-content, whose display
// component chains through DataTable -> EditableText -> app/actions/dashboard -> '@/auth'.
// Under Vitest's ESM resolver, next-auth's `next/server` import breaks (Next 16's
// package.json has no `exports` map); real Next builds never hit this. Isolate from it.
vi.mock('@/auth', () => ({ auth: vi.fn() }))

vi.mock('@/lib/organic-social/headlines', () => import('./__mocks__/headlines'))
vi.mock('@/lib/organic-social/trends', () => import('./__mocks__/trends'))
vi.mock('@/lib/organic-social/top-content', () => import('./__mocks__/top-content'))

import { resolveSection } from '@/lib/report-sections/resolve'
import { lookup } from '@/lib/report-sections/registry'
import { ORGANIC_SOCIAL_PARTS } from './registry'
import { ORGANIC_SOCIAL_TEMPLATE, ORGANIC_SOCIAL_PLATFORM_TEMPLATE } from '../template'
import { FIXTURE_ORGANIC_SOCIAL_CTX } from './__fixtures__/organic-social-ctx'

test('Overview composition resolves to the three parts in order', () => {
  const resolved = resolveSection(ORGANIC_SOCIAL_TEMPLATE, undefined)
  expect(resolved.map((r) => r.id)).toEqual(['platform-headlines', 'engagement-trend', 'top-content'])
  const nodes = resolved.map((r) => lookup(ORGANIC_SOCIAL_PARTS, r.id, r.version)?.render(FIXTURE_ORGANIC_SOCIAL_CTX, r))
  const { container } = render(<>{nodes}</>)
  // Snapshot the whole container (all three skeletons), not just firstChild.
  expect(container).toMatchSnapshot()
})

test('Platform composition resolves the same three parts (follower-graph arrives in M3)', () => {
  const ctx = { ...FIXTURE_ORGANIC_SOCIAL_CTX, channel: 'INSTAGRAM' as const }
  const resolved = resolveSection(ORGANIC_SOCIAL_PLATFORM_TEMPLATE, undefined)
  expect(resolved.map((r) => r.id)).toEqual(['platform-headlines', 'engagement-trend', 'top-content'])
  const nodes = resolved.map((r) => lookup(ORGANIC_SOCIAL_PARTS, r.id, r.version)?.render(ctx, r))
  const { container } = render(<>{nodes}</>)
  // Snapshot the whole container (all three skeletons), not just firstChild.
  expect(container).toMatchSnapshot()
})
