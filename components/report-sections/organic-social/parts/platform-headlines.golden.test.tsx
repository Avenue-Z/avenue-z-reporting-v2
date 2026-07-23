import { expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'

// @/auth is stubbed globally in vitest.setup.ts (the registry import reaches the DataTable
// display chain -> next-auth landmine); no per-file @/auth mock needed here.
vi.mock('@/lib/organic-social/headlines', () => import('./__mocks__/headlines'))
vi.mock('@/lib/organic-social/trends', () => import('./__mocks__/trends'))
vi.mock('@/lib/organic-social/top-content', () => import('./__mocks__/top-content'))

import { ORGANIC_SOCIAL_PARTS } from './registry'
import { FIXTURE_ORGANIC_SOCIAL_CTX } from './__fixtures__/organic-social-ctx'

test('platform-headlines@1 golden (Suspense skeleton)', () => {
  const impl = ORGANIC_SOCIAL_PARTS['platform-headlines'][1]
  const resolved = { id: 'platform-headlines', version: 1, label: impl.defaultLabel }
  const { container } = render(<>{impl.render(FIXTURE_ORGANIC_SOCIAL_CTX, resolved)}</>)
  expect(container.firstChild).toMatchSnapshot()
})
