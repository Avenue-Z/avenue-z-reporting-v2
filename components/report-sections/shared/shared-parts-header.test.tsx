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

test('requestedRange reaches Commentary only when passed', async () => {
  getClientBySlug.mockResolvedValue(clientOptedInOnOverview)
  const without = await SharedPartsHeader({ viewKey: 'organic-social', clientSlug: 'c' })
  expect(findByName(without, 'CommentarySection')?.props).toEqual({ clientSlug: 'c', viewKey: 'organic-social' })
  const withRange = await SharedPartsHeader({ viewKey: 'organic-social', clientSlug: 'c', requestedRange: 'custom:2026-09-01,2026-09-30' })
  expect(findByName(withRange, 'CommentarySection')?.props).toEqual({ clientSlug: 'c', viewKey: 'organic-social', requestedRange: 'custom:2026-09-01,2026-09-30' })
})

const optedInBoth = {
  reportSectionConfig: { 'organic-social': { sharedParts: [{ id: 'commentary', version: 1 }, { id: 'recommendations', version: 1 }] } },
}

test('the top placement renders Insights only, the bottom placement Recommendations only', async () => {
  getClientBySlug.mockResolvedValue(optedInBoth)
  const top = await SharedPartsHeader({ viewKey: 'organic-social:instagram', configKey: 'organic-social', clientSlug: 'c' })
  const topSection = findByName(top, 'CommentarySection')
  expect(topSection?.props).toEqual({ clientSlug: 'c', viewKey: 'organic-social:instagram' })
  const bottom = await SharedPartsHeader({ viewKey: 'organic-social:instagram', configKey: 'organic-social', clientSlug: 'c', placement: 'bottom', requestedRange: 'custom:2026-09-01,2026-09-30' })
  const bottomSection = findByName(bottom, 'CommentarySection')
  expect(bottomSection?.props).toEqual({
    clientSlug: 'c', viewKey: 'organic-social:instagram:recommendations', requestedRange: 'custom:2026-09-01,2026-09-30',
    labels: { title: 'Recommendations', noun: 'recommendations', outline: null },
  })
})

test('a client opted into Insights only renders nothing at the bottom', async () => {
  getClientBySlug.mockResolvedValue(clientOptedInOnOverview)
  expect(await SharedPartsHeader({ viewKey: 'organic-social', clientSlug: 'c', placement: 'bottom' })).toBeNull()
})

test('the recommendations part renders nothing for a non Organic Social key', async () => {
  getClientBySlug.mockResolvedValue({ reportSectionConfig: { 'peec-ai': { sharedParts: [{ id: 'recommendations', version: 1 }] } } })
  const el = await SharedPartsHeader({ viewKey: 'peec-ai', clientSlug: 'c', placement: 'bottom' })
  expect(findByName(el, 'CommentarySection')).toBeNull()
})

test('the error boundary names the part by its label', async () => {
  getClientBySlug.mockResolvedValue(optedInBoth)
  const top = await SharedPartsHeader({ viewKey: 'organic-social', clientSlug: 'c' })
  expect(findByName(top, 'ReportErrorBoundary')?.props.sectionName).toBe('Insights (commentary)')
  const bottom = await SharedPartsHeader({ viewKey: 'organic-social', clientSlug: 'c', placement: 'bottom' })
  expect(findByName(bottom, 'ReportErrorBoundary')?.props.sectionName).toBe('Recommendations (recommendations)')
})

// The last look fixes, L5: staff's "Preview as client" reaches both boxes, on @1 and @2, only when Organic Social passes it.
// Every other department never passes it, so their boxes get exactly the props above.
test('preview reaches Insights and Recommendations only when passed, on @1 and on the kit @2', async () => {
  const R = 'custom:2026-09-01,2026-09-30'
  for (const version of [1, 2]) {
    getClientBySlug.mockResolvedValue({ reportSectionConfig: { 'organic-social': { sharedParts: [{ id: 'commentary', version }, { id: 'recommendations', version }] } } })
    for (const placement of ['top', 'bottom'] as const) {
      const off = findByName(await SharedPartsHeader({ viewKey: 'organic-social:instagram', configKey: 'organic-social', clientSlug: 'c', requestedRange: R, placement }), 'CommentarySection')
      expect('preview' in (off?.props ?? {}), `v${version} ${placement}`).toBe(false)
      const on = findByName(await SharedPartsHeader({ viewKey: 'organic-social:instagram', configKey: 'organic-social', clientSlug: 'c', requestedRange: R, placement, preview: true }), 'CommentarySection')
      expect(on?.props.preview, `v${version} ${placement}`).toBe(true)
      if (version === 2) expect(on?.props.look).toBe('kit')
    }
  }
})
