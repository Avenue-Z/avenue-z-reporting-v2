import { vi } from 'vitest'

// Spread the real module so every export exists (see __mocks__/trends.ts for the why); override
// only the data-fetching getter with an empty stub.
const actual = await vi.importActual<typeof import('@/lib/organic-social/headlines')>('@/lib/organic-social/headlines')

export const onChannelError = actual.onChannelError
export const getPlatformHeadlines = vi.fn(async () => [])
