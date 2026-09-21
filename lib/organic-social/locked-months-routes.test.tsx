import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { ReactElement } from 'react'
import { findElements, redirectOf, runRoute } from '@/lib/test-utils/element-tree'

/** Outer acceptance test for locked months (spec section 9): the real route modules, an opted-in
 *  client, a fixed clock (20 Oct 2026, 10:00 New York). The section is stubbed with a named
 *  component, so its props are what the route passed. The async range control, the section and
 *  Commentary are tested on their own, since a returned tree does not render async children. */
const { getClientBySlug } = vi.hoisted(() => ({ getClientBySlug: vi.fn() }))
vi.mock('@/lib/db/queries', async (orig) => ({ ...(await orig<object>()), getClientBySlug }))
vi.mock('@/components/report-sections/organic-social', () => ({
  OrganicSocialReport: function OrganicSocialReport() { return null },
}))

import PortalSpa from '@/app/portal/[clientSlug]/reports/page'
import DashboardSpa from '@/app/dashboard/[clientSlug]/reports/page'
import { OrganicSocialReport } from '@/components/report-sections/organic-social'
import { OrganicRangeControl } from '@/components/report-sections/organic-social/range-control'
import { auth } from '@/auth'

const OPTED = {
  name: 'Client', slug: 'c', logoUrl: null, enabledReports: ['organic-social', 'ga4'], hiddenReports: ['organic-overview'],
  dashSocialConfig: { brandId: 1, channels: ['instagram'], reportingMonths: { firstMonth: '2026-08' } },
}
const SEP = 'custom:2026-09-01,2026-09-30'
const AUG = 'custom:2026-08-01,2026-08-31'
const LIVE = 'custom:2026-10-01,2026-10-19'
const DERIVED: Record<string, string> = { [SEP]: AUG, [AUG]: 'custom:2026-07-01,2026-07-31', [LIVE]: 'custom:2026-09-01,2026-09-19' }
const ALLOWED: Record<string, string[]> = { CLIENT_VIEWER: [SEP, AUG], INTERNAL_ADMIN: [LIVE, SEP, AUG] }
const INPUTS: (string | string[] | undefined)[] = [undefined, 'last_30_days', 'last_month', SEP, AUG, LIVE, 'custom:2026-09-01,2026-09-15', 'custom:2026-07-01,2026-07-31', 'junk', ['a', 'b']]

type Route = (a: never) => Promise<unknown>
const spa = (Route: Route, q: Record<string, unknown>) =>
  Route({ params: Promise.resolve({ clientSlug: 'c' }), searchParams: Promise.resolve(Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined))) } as never)
const as = (role: string) => vi.mocked(auth).mockResolvedValue({ user: { role, email: 'someone@example.com' } } as never)
const sectionOf = (tree: unknown) => findElements(tree, (e) => e.type === OrganicSocialReport)[0]?.props as { dateRange: string; compareRange: string | null } | undefined
const pickerOf = (tree: unknown) => findElements(tree, (e) => e.type === OrganicRangeControl)[0]?.props

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-20T14:00:00Z'))
  getClientBySlug.mockResolvedValue(OPTED)
})
afterEach(() => { vi.useRealTimers(); vi.mocked(auth).mockReset(); vi.restoreAllMocks() })

describe('SPA routes', () => {
  const ROUTES = [['portal', PortalSpa as Route, '/portal/c/reports'], ['dashboard', DashboardSpa as Route, '/dashboard/c/reports']] as const
  for (const [name, Route, base] of ROUTES) {
    test(`${name}: a client with no dateRange lands on September in place, with the month picker and a keyed Suspense`, async () => {
      as('CLIENT_VIEWER')
      const r = await runRoute(spa(Route, { section: 'organic-social' }))
      if (!('element' in r)) throw new Error(`unexpected redirect ${r.redirect}`)
      expect(sectionOf(r.element)).toMatchObject({ dateRange: SEP, compareRange: AUG })
      expect(pickerOf(r.element)).toMatchObject({ requested: undefined, role: 'CLIENT_VIEWER' })
      const keys = findElements(r.element, (e) => typeof e.key === 'string' && e.key.startsWith('organic-social:')).map((e) => e.key)
      expect(keys.some((k) => k!.includes(`:${SEP}:${AUG}:`))).toBe(true)
    })
    test(`${name}: a client asking for the live month is redirected to September and logged once`, async () => {
      as('CLIENT_VIEWER')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(await redirectOf(spa(Route, { section: 'organic-social', subsection: 'instagram', dateRange: LIVE, compareRange: 'previous_year', models: 'm' })))
        .toBe(`${base}?section=organic-social&subsection=instagram&models=m&dateRange=custom%3A2026-09-01%2C2026-09-30`)
      expect(warn).toHaveBeenCalledTimes(1)
    })
    test(`${name}: stale presets and repeated params redirect silently; the canonical month does not redirect`, async () => {
      as('CLIENT_VIEWER')
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      expect(await redirectOf(spa(Route, { section: 'organic-social', dateRange: 'last_30_days' }))).toBe(`${base}?section=organic-social&dateRange=custom%3A2026-09-01%2C2026-09-30`)
      expect(await redirectOf(spa(Route, { section: 'organic-social', dateRange: ['a', 'b'] }))).toBe(`${base}?section=organic-social&dateRange=custom%3A2026-09-01%2C2026-09-30`)
      expect(await redirectOf(spa(Route, { section: 'organic-social', dateRange: SEP }))).toBeNull()
      expect(warn).not.toHaveBeenCalled()
    })
    test(`${name}: a tampered compareRange is ignored on the canonical month (edge 12)`, async () => {
      as('CLIENT_VIEWER')
      const r = await runRoute(spa(Route, { section: 'organic-social', dateRange: SEP, compareRange: 'previous_year' }))
      if (!('element' in r)) throw new Error('unexpected redirect')
      expect(sectionOf(r.element)).toMatchObject({ dateRange: SEP, compareRange: AUG })
    })
    test(`${name}: the team may open the live month`, async () => {
      as('INTERNAL_ADMIN')
      const r = await runRoute(spa(Route, { section: 'organic-social', dateRange: LIVE }))
      if (!('element' in r)) throw new Error('unexpected redirect')
      expect(sectionOf(r.element)).toMatchObject({ dateRange: LIVE, compareRange: 'custom:2026-09-01,2026-09-19' })
    })
    test(`${name}: another section for the same client is untouched`, async () => {
      as('CLIENT_VIEWER')
      const r = await runRoute(spa(Route, { section: 'ga4', dateRange: 'last_30_days' }))
      if (!('element' in r)) throw new Error('unexpected redirect')
      expect(pickerOf(r.element)).toBeUndefined()
    })
    test(`${name}: sweep, every input and both roles: at most one hop, and only an allowed month is served (edges 9, 22)`, async () => {
      for (const role of ['CLIENT_VIEWER', 'INTERNAL_ADMIN'] as const) {
        as(role)
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        for (const dateRange of INPUTS) for (const compareRange of [undefined, 'previous_year']) {
          const first = await runRoute(spa(Route, { section: 'organic-social', dateRange, compareRange }))
          let tree: unknown
          if ('redirect' in first) {
            const target = new URL(first.redirect, 'http://x')
            expect(target.searchParams.has('compareRange')).toBe(false)
            const second = await runRoute(spa(Route, Object.fromEntries(target.searchParams)))
            if (!('element' in second)) throw new Error(`second hop for ${role} ${JSON.stringify(dateRange)}`)
            tree = second.element
          } else tree = first.element
          const served = sectionOf(tree)!
          expect(ALLOWED[role]).toContain(served.dateRange)
          expect(served.compareRange).toBe(DERIVED[served.dateRange])
        }
      }
    })
  }
  test('dashboard: health mode serves the default month in place and never redirects (edge 7)', async () => {
    as('INTERNAL_ADMIN')
    const r = await runRoute(spa(DashboardSpa as Route, { section: 'organic-social', dateRange: 'last_30_days', health: '1' }))
    if (!('element' in r)) throw new Error('health mode redirected')
    const probe = findElements(r.element, (e) => typeof e.type === 'function' && (e.type as { name?: string }).name === 'HealthProbe')[0]
    expect((probe.props.element as ReactElement<Record<string, unknown>>).props).toMatchObject({ dateRange: SEP, compareRange: AUG })
  })
  test('dashboard: a client appending health=1 is still redirected away from the live month', async () => {
    as('CLIENT_VIEWER')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await redirectOf(spa(DashboardSpa as Route, { section: 'organic-social', dateRange: LIVE, health: '1' })))
      .toBe('/dashboard/c/reports?section=organic-social&health=1&dateRange=custom%3A2026-09-01%2C2026-09-30')
  })
  test('bare /reports keeps the existing first hop, carrying the param', async () => {
    as('CLIENT_VIEWER')
    getClientBySlug.mockResolvedValue({ ...OPTED, enabledReports: ['organic-social'] })
    expect(await redirectOf(spa(PortalSpa as Route, { dateRange: 'last_30_days' }))).toBe('/portal/c/reports?dateRange=last_30_days&section=organic-social')
  })
})
