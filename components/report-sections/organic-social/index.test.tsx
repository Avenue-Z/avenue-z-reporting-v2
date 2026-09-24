import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import { auth } from '@/auth'
import type { OrganicSocialCtx } from './ctx'

// @/auth is stubbed globally in vitest.setup.ts (index.tsx -> parts registry -> top-content
// display -> DataTable -> next-auth landmine); no per-file @/auth mock needed here.
vi.mock('@/lib/organic-social/headlines', () => import('./parts/__mocks__/headlines'))
vi.mock('@/lib/organic-social/trends', () => import('./parts/__mocks__/trends'))
vi.mock('@/lib/organic-social/top-content', () => import('./parts/__mocks__/top-content'))

// The two DB lookups the thin view awaits. Spread the real module so any transitive
// importer keeps its other exports; override only these two so we can make them throw.
// vi.hoisted: the mock factory is hoisted above the file, so the fns must be too.
const { getSectionTemplate, getClientBySlug } = vi.hoisted(() => ({
  getSectionTemplate: vi.fn(),
  getClientBySlug: vi.fn(),
}))
vi.mock('@/lib/db/queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/queries')>()),
  getSectionTemplate,
  getClientBySlug,
}))

import { OrganicSocialReport, OrganicSocialBody } from './index'
import { buildOrganicSocialCtx } from './ctx'
import { elementTree } from '@/lib/test-utils/element-tree'

const ctx = buildOrganicSocialCtx({ clientSlug: 'renaissance', channel: null })

// R1 #6: the outer report is synchronous so the section skeletons paint before the template
// resolves. The template/config resolution + resilience now lives in the async OrganicSocialBody.
test('the outer report is synchronous — first paint is not gated on the DB template lookup', () => {
  const el = OrganicSocialReport({ clientSlug: 'renaissance' })
  expect(el).toBeTruthy()
  expect(el).not.toHaveProperty('then') // a React element, not a promise
})

test('OrganicSocialBody: a template/config lookup failure degrades to the code template (does NOT blank the section) and logs a signal', async () => {
  getSectionTemplate.mockRejectedValue(new Error('DB down'))
  getClientBySlug.mockRejectedValue(new Error('DB down'))
  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  // Before the defensive resolution this await rejected, taking the entire Organic Social
  // section to the route error boundary. It must now resolve so each part renders behind its
  // own Suspense/safe() boundary — and the silent degrade must leave a signal in the log.
  await expect(OrganicSocialBody({ ctx })).resolves.toBeTruthy()
  expect(err).toHaveBeenCalledWith(expect.stringContaining('template/config lookup failed'), expect.any(Error))
  err.mockRestore()
})

test('OrganicSocialBody: happy path resolves with no DB row (code-template fallback) and a present client config', async () => {
  getSectionTemplate.mockResolvedValue(null) // no seeded row yet (M4) -> code template
  getClientBySlug.mockResolvedValue({ reportSectionConfig: {} })
  await expect(OrganicSocialBody({ ctx })).resolves.toBeTruthy()
})

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

test('Overview commentary is keyed to the whole section', () => {
  const el = OrganicSocialReport({ clientSlug: 'renaissance', channel: null })
  const header = findByName(el, 'SharedPartsHeader')
  expect(header?.props.viewKey).toBe('organic-social')
})

test('a platform subpage keys commentary per channel while opting in via the base config', () => {
  const el = OrganicSocialReport({ clientSlug: 'renaissance', channel: 'INSTAGRAM' })
  const header = findByName(el, 'SharedPartsHeader')
  expect(header?.props.viewKey).toBe('organic-social:instagram')
  expect(header?.props.configKey).toBe('organic-social')
})

// Pre-change record for locked months (spec section 8): for a client without reportingMonths the
// section's OUTPUT (every part and the ctx it receives) is unchanged, on the happy path and when
// BOTH lookups fail. Extends the truthy-only test above.
test('OrganicSocialBody output is unchanged for a client without reportingMonths', async () => {
  const base = buildOrganicSocialCtx({ clientSlug: 'renaissance', channel: 'INSTAGRAM', dateRange: 'last_month', compareRange: 'previous_period' })
  getSectionTemplate.mockResolvedValue(null)
  getClientBySlug.mockResolvedValue({ slug: 'renaissance', dashSocialConfig: { brandId: 1 }, reportSectionConfig: {} })
  const happy = elementTree(await OrganicSocialBody({ ctx: base }))
  const overview = elementTree(await OrganicSocialBody({ ctx }))
  getSectionTemplate.mockRejectedValue(new Error('DB down'))
  getClientBySlug.mockRejectedValue(new Error('DB down'))
  const err = vi.spyOn(console, 'error').mockImplementation(() => {})
  const bothFail = elementTree(await OrganicSocialBody({ ctx: base }))
  err.mockRestore()
  expect({ happy, overview, bothFail }).toMatchSnapshot()
})

describe('locked months in the section', () => {
  const OPTED = { slug: 'c', dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' } }, reportSectionConfig: {} }
  const SEP = 'custom:2026-09-01,2026-09-30'
  const LIVE = 'custom:2026-10-01,2026-10-19'
  let seen: OrganicSocialCtx[] = []
  let restoreLookup: () => void = () => {}
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-20T14:00:00Z'))
    seen = []
    const registry = await import('@/lib/report-sections/registry')
    const spy = vi.spyOn(registry, 'lookup').mockReturnValue({ render: (c: OrganicSocialCtx) => { seen.push(c); return null } } as never)
    restoreLookup = () => spy.mockRestore()
    getSectionTemplate.mockResolvedValue(null)
  })
  afterEach(() => { restoreLookup(); vi.useRealTimers(); vi.mocked(auth).mockReset(); vi.restoreAllMocks() })
  const as = (role: string) => vi.mocked(auth).mockResolvedValue({ user: { role } } as never)
  const ctxFor = (dateRange: string) => buildOrganicSocialCtx({ clientSlug: 'c', channel: 'INSTAGRAM', dateRange, compareRange: 'previous_year' })

  test('a client asking for the live month gets September and its comparison, logged once (edge 22)', async () => {
    as('CLIENT_VIEWER'); getClientBySlug.mockResolvedValue(OPTED)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await OrganicSocialBody({ ctx: ctxFor(LIVE) })
    expect(seen.length).toBeGreaterThan(0)
    for (const c of seen) expect([c.dateRange, c.compareRange]).toEqual([SEP, 'custom:2026-08-01,2026-08-31'])
    expect(warn).toHaveBeenCalledTimes(1)
  })

  test('the team with a stale preset gets the most recent finished month; nothing is logged', async () => {
    as('INTERNAL_ADMIN'); getClientBySlug.mockResolvedValue(OPTED)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await OrganicSocialBody({ ctx: ctxFor('last_30_days') })
    expect(seen.length).toBeGreaterThan(0)
    for (const c of seen) expect(c.dateRange).toBe(SEP)
    expect(warn).not.toHaveBeenCalled()
  })

  test('a template-lookup failure does not disable the lock (edge 2)', async () => {
    as('CLIENT_VIEWER'); getClientBySlug.mockResolvedValue(OPTED); getSectionTemplate.mockRejectedValue(new Error('DB down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await OrganicSocialBody({ ctx: ctxFor(LIVE) })
    expect(seen.length).toBeGreaterThan(0)
    for (const c of seen) expect(c.dateRange).toBe(SEP)
  })

  test('the lock read failing runs today\'s path (edge 3)', async () => {
    as('CLIENT_VIEWER'); getClientBySlug.mockRejectedValue(new Error('DB down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const ctx0 = ctxFor(LIVE)
    await OrganicSocialBody({ ctx: ctx0 })
    expect(seen.length).toBeGreaterThan(0)
    for (const c of seen) expect(c).toEqual({ ...ctx0, role: 'CLIENT_VIEWER' })
  })

  test('no months: the one line and no parts', async () => {
    as('CLIENT_VIEWER')
    getClientBySlug.mockResolvedValue({ ...OPTED, dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2027-01' } } })
    const el = await OrganicSocialBody({ ctx: ctxFor('last_30_days') })
    expect(seen).toEqual([])
    expect(render(el).container.textContent).toBe('Your first report opens on Feb 12')
  })

  test('a malformed config is logged by slug and key (edge 6); the team keeps its month on a bad knob', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    as('CLIENT_VIEWER'); getClientBySlug.mockResolvedValue({ ...OPTED, dashSocialConfig: { brandId: 1, reportingMonths: null } })
    await OrganicSocialBody({ ctx: ctxFor('last_30_days') })
    expect(err).toHaveBeenCalledWith('[organic-social] reportingMonths setting is invalid slug=c key=reportingMonths')
    expect(seen).toEqual([])
    as('INTERNAL_ADMIN'); getClientBySlug.mockResolvedValue({ ...OPTED, dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08', opensOnDay: 3 } } })
    await OrganicSocialBody({ ctx: ctxFor('last_30_days') })
    expect(err).toHaveBeenLastCalledWith('[organic-social] reportingMonths setting is invalid slug=c key=opensOnDay')
    expect(seen.length).toBeGreaterThan(0)
    for (const c of seen) expect(c.dateRange).toBe(SEP)
  })

  test('a session read that fails means client rules', async () => {
    vi.mocked(auth).mockImplementation(() => { throw new Error('sync') })
    getClientBySlug.mockResolvedValue(OPTED)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await OrganicSocialBody({ ctx: ctxFor(LIVE) })
    expect(seen.length).toBeGreaterThan(0)
    for (const c of seen) expect(c.dateRange).toBe(SEP)
  })
})
