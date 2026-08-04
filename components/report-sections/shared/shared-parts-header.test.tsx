import { expect, test, vi } from 'vitest'

// The single DB read the header awaits. Spread the real module so transitive importers keep
// their other exports; override only getClientBySlug. @/auth is stubbed globally in vitest.setup.ts.
const { getClientBySlug } = vi.hoisted(() => ({ getClientBySlug: vi.fn() }))
vi.mock('@/lib/db/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/queries')>()),
  getClientBySlug,
}))

import { SharedPartsHeader } from './shared-parts-header'

/** Depth-first find of the first element whose component type has the given name. */
function findByName(node: unknown, name: string): { props: Record<string, unknown> } | null {
  if (!node || typeof node !== 'object') return null
  const el = node as { type?: { name?: string }; props?: { children?: unknown } }
  if (typeof el.type === 'function' && el.type.name === name) return el as never
  const kids = el.props?.children
  const arr = Array.isArray(kids) ? kids : kids != null ? [kids] : []
  for (const k of arr) {
    const found = findByName(k, name)
    if (found) return found
  }
  return null
}

const clientOptedInOnOverview = {
  reportSectionConfig: { 'organic-social': { sharedParts: [{ id: 'commentary', version: 1 }] } },
}

// A platform subpage opts in through the base 'organic-social' config (configKey), but its
// commentary content is keyed per channel (viewKey). This is what keeps commentary from
// vanishing on the platform tabs while still giving each channel its own stream.
test('opt-in is gated on configKey, not viewKey', async () => {
  getClientBySlug.mockResolvedValue(clientOptedInOnOverview)
  const el = await SharedPartsHeader({
    viewKey: 'organic-social:instagram',
    configKey: 'organic-social',
    clientSlug: 'renaissance',
  })
  expect(el).not.toBeNull()
})

test('the shared part receives the per-channel viewKey as its content identity', async () => {
  getClientBySlug.mockResolvedValue(clientOptedInOnOverview)
  const el = await SharedPartsHeader({
    viewKey: 'organic-social:instagram',
    configKey: 'organic-social',
    clientSlug: 'renaissance',
  })
  const commentary = findByName(el, 'CommentarySection')
  expect(commentary?.props.viewKey).toBe('organic-social:instagram')
})

test('configKey defaults to viewKey (unchanged behavior for every other caller)', async () => {
  getClientBySlug.mockResolvedValue(clientOptedInOnOverview)
  const el = await SharedPartsHeader({ viewKey: 'organic-social', clientSlug: 'renaissance' })
  expect(el).not.toBeNull()
})

test('not opted in under configKey → renders nothing', async () => {
  getClientBySlug.mockResolvedValue({ reportSectionConfig: {} })
  const el = await SharedPartsHeader({
    viewKey: 'organic-social:instagram',
    configKey: 'organic-social',
    clientSlug: 'renaissance',
  })
  expect(el).toBeNull()
})
