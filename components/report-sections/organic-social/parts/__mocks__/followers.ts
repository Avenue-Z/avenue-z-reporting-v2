import { vi } from 'vitest'

// Spread the real module so every export exists — otherwise a test that mocks this module and
// reads a second export (e.g. onFollowerChannelError) silently gets `undefined`. importActual
// bypasses the vi.mock and loads the real, import-safe module (no DB connection at import); only
// the data-fetching getter is overridden with an empty stub.
const actual = await vi.importActual<typeof import('@/lib/organic-social/followers')>('@/lib/organic-social/followers')

export const onFollowerChannelError = actual.onFollowerChannelError
export const getFollowerGraph = vi.fn(async () => ({ points: [], channels: [] }))
