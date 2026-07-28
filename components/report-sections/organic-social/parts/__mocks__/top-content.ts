import { vi } from 'vitest'

// Spread the real module so every export exists (see __mocks__/trends.ts for the why); override
// only the data-fetching getter with an empty stub. The pure transforms (transformTopContent /
// groupByPlatform) come from the real module so a test mocking this module still gets them.
const actual = await vi.importActual<typeof import('@/lib/organic-social/top-content')>('@/lib/organic-social/top-content')

export const transformTopContent = actual.transformTopContent
export const groupByPlatform = actual.groupByPlatform
export const getTopContent = vi.fn(async () => [])
