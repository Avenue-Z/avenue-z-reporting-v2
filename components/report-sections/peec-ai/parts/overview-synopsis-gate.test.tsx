import { expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import { PEEC_PARTS } from './registry'
import { FIXTURE_PEEC_CTX } from './__fixtures__/peec-ctx'

// Integration test for the AEO synopsis gate (FB-064), not the helper in isolation.
//
// The helper unit test (../aeo-synopsis-gate.test.ts) proves showAeoSynopsis returns
// the right boolean. This proves the Overview synopsis PART actually honors it: the
// real render function renders the synopsis subtree for `avenue-z` and renders null
// for every other client. Without this, a future edit could stop calling the helper
// at the gate and the unit test would still pass green (the vacuum risk).
//
// The async Glean-backed child is mocked so the gate decision is what's under test
// and no real gleanChat runs. A component returning a string is enough to prove the
// gate opened (firstChild is non-null).
vi.mock('../overview-synopsis', () => ({
  OverviewSynopsis: () => 'SYNOPSIS_RENDERED',
}))

const impl = PEEC_PARTS['overview-synopsis'][1]
const resolved = { id: 'overview-synopsis', version: 1, label: impl.defaultLabel }

test('Overview synopsis gate RENDERS for avenue-z', () => {
  const ctx = { ...FIXTURE_PEEC_CTX, clientSlug: 'avenue-z' }
  const { container } = render(<>{impl.render(ctx, resolved)}</>)
  expect(container.firstChild).not.toBeNull()
})

test('Overview synopsis gate renders NULL for a non-avenue-z client (no leak)', () => {
  const ctx = { ...FIXTURE_PEEC_CTX, clientSlug: 'renaissance' }
  const { container } = render(<>{impl.render(ctx, resolved)}</>)
  expect(container.firstChild).toBeNull()
})

test('Overview synopsis gate renders NULL when clientSlug is undefined', () => {
  const ctx = { ...FIXTURE_PEEC_CTX, clientSlug: undefined }
  const { container } = render(<>{impl.render(ctx, resolved)}</>)
  expect(container.firstChild).toBeNull()
})
