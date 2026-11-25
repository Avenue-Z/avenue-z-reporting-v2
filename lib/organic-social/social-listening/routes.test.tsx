import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { findElements, redirectOf, runRoute } from '@/lib/test-utils/element-tree'

/** The Social Listening tab's Line / Columns choice on the real report routes (plan docs/superpowers/plans/
 *  2026-11-24-social-listening-feedback.md, Unit C): the routes read slcols, keep it through their redirects, hand it to the
 *  section, the export button and bulk export on the Social Listening tab only. Every other tab's props are exactly as
 *  before. Modelled on lib/organic-social/aeo-tab/routes.test.tsx. */
const { getClientBySlug } = vi.hoisted(() => ({ getClientBySlug: vi.fn() }))
vi.mock('@/lib/db/queries', async (orig) => ({ ...(await orig<object>()), getClientBySlug }))
vi.mock('@/components/report-sections/organic-social', () => ({ OrganicSocialReport: function OrganicSocialReport() { return null } }))
vi.mock('@/lib/auth/page-access', async (orig) => ({ ...(await orig<object>()), requireStaff: vi.fn(async () => undefined) }))

import PortalSpa from '@/app/portal/[clientSlug]/reports/page'
import DashboardSpa from '@/app/dashboard/[clientSlug]/reports/page'
import { OrganicSocialReport } from '@/components/report-sections/organic-social'
import { ExportPdfButton } from '@/components/export-pdf-button'
import { auth } from '@/auth'

const SL_CLIENT = {
  name: 'Client', slug: 'c', logoUrl: null, enabledReports: ['organic-social'], hiddenReports: [] as string[],
  dashSocialConfig: {
    brandId: 1, channels: ['instagram'], reportingMonths: { firstMonth: '2026-08' },
    socialListening: { enabled: true, brandTopic: 'Made Up Brand', industryTopic: 'Made Up Industry', industrySample: 10 },
  },
}
const SEP = 'custom:2026-09-01,2026-09-30'
const LIVE = 'custom:2026-10-01,2026-10-19'
const ENC_SEP = encodeURIComponent(SEP)
const TAB = 'organic-social-listening'

type Route = (a: never) => Promise<unknown>
const spa = (Route: Route, q: Record<string, unknown>) =>
  Route({ params: Promise.resolve({ clientSlug: 'c' }), searchParams: Promise.resolve(q) } as never)
const as = (role: string) => vi.mocked(auth).mockResolvedValue({ user: { role, email: 'someone@example.com', clientSlug: 'c' } } as never)
const sectionOf = (tree: unknown) => findElements(tree, (e) => e.type === OrganicSocialReport)[0]?.props as Record<string, unknown> | undefined
const buttonOf = (tree: unknown) => findElements(tree, (e) => e.type === ExportPdfButton)[0]?.props as
  { serverExport?: Record<string, unknown>; bulk?: Record<string, unknown> } | undefined

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-20T14:00:00Z'))
  getClientBySlug.mockResolvedValue(SL_CLIENT)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { vi.useRealTimers(); vi.mocked(auth).mockReset(); vi.restoreAllMocks() })

const ROUTES = [['portal', PortalSpa as Route, '/portal/c/reports'], ['dashboard', DashboardSpa as Route, '/dashboard/c/reports']] as const
for (const [name, Route, base] of ROUTES) {
  describe(`${name}`, () => {
    test('the Social Listening tab gets slCols, cleaned, and the export button and bulk export carry them', async () => {
      as('CLIENT_VIEWER')
      const r = await runRoute(spa(Route, { section: 'organic-social', subsection: TAB, dateRange: SEP, slcols: 'i-sentday,b-ytd,nope' }))
      if (!('element' in r)) throw new Error(`unexpected redirect ${r.redirect}`)
      expect(sectionOf(r.element)).toMatchObject({ view: 'social-listening', slCols: ['b-ytd', 'i-sentday'] })
      const button = buttonOf(r.element)
      expect(button?.serverExport).toMatchObject({ slCols: 'b-ytd,i-sentday' })
      expect(button?.bulk).toMatchObject({ slCols: 'b-ytd,i-sentday' })
    })

    test('with no charts set to columns, nothing new is passed anywhere', async () => {
      as('CLIENT_VIEWER')
      for (const slcols of [undefined, '', 'nope']) {
        const r = await runRoute(spa(Route, { section: 'organic-social', subsection: TAB, dateRange: SEP, ...(slcols === undefined ? {} : { slcols }) }))
        if (!('element' in r)) throw new Error('unexpected redirect')
        expect(sectionOf(r.element)).not.toHaveProperty('slCols')
        const button = buttonOf(r.element)
        expect(button?.serverExport ?? {}).not.toHaveProperty('slCols')
        expect(button?.bulk ?? {}).not.toHaveProperty('slCols')
      }
    })

    test('every other tab: no slCols anywhere, even with the param in the URL', async () => {
      as('CLIENT_VIEWER')
      const r = await runRoute(spa(Route, { section: 'organic-social', subsection: 'organic-instagram', dateRange: SEP, slcols: 'b-ytd' }))
      if (!('element' in r)) throw new Error('unexpected redirect')
      expect(Object.keys(sectionOf(r.element)!).sort()).toEqual(['channel', 'clientSlug', 'compareRange', 'dateRange', 'view'])
      const button = buttonOf(r.element)
      expect(button?.serverExport ?? {}).not.toHaveProperty('slCols')
      expect(button?.bulk ?? {}).not.toHaveProperty('slCols')
    })

    test('the locked-month redirect keeps slcols, cleaned', async () => {
      as('CLIENT_VIEWER')
      expect(await redirectOf(spa(Route, { section: 'organic-social', subsection: TAB, dateRange: LIVE, slcols: 'b-reddit,b-ytd,x' })))
        .toBe(`${base}?section=organic-social&subsection=${TAB}&slcols=b-ytd%2Cb-reddit&dateRange=${ENC_SEP}`)
    })

    test('the locked-month redirect drops an empty or unknown slcols, so the URL stays canonical', async () => {
      as('CLIENT_VIEWER')
      expect(await redirectOf(spa(Route, { section: 'organic-social', subsection: TAB, dateRange: LIVE, slcols: 'x' })))
        .toBe(`${base}?section=organic-social&subsection=${TAB}&dateRange=${ENC_SEP}`)
    })
  })
}

// Unit F (plan 2026-11-24, D7): slsort takes the same path as slcols.
for (const [name, Route, base] of ROUTES) {
  describe(`${name}: slsort`, () => {
    test('the Social Listening tab gets the sort, and the export button and bulk export carry it', async () => {
      as('CLIENT_VIEWER')
      const r = await runRoute(spa(Route, { section: 'organic-social', subsection: TAB, dateRange: SEP, slsort: 'reach' }))
      if (!('element' in r)) throw new Error(`unexpected redirect ${r.redirect}`)
      expect(sectionOf(r.element)).toMatchObject({ view: 'social-listening', slSort: 'reach' })
      const button = buttonOf(r.element)
      expect(button?.serverExport).toMatchObject({ slSort: 'reach' })
      expect(button?.bulk).toMatchObject({ slSort: 'reach' })
    })

    test('posts, or anything unknown, passes nothing anywhere; another tab never gets it', async () => {
      as('CLIENT_VIEWER')
      for (const slsort of [undefined, 'posts', 'nope']) {
        const r = await runRoute(spa(Route, { section: 'organic-social', subsection: TAB, dateRange: SEP, ...(slsort === undefined ? {} : { slsort }) }))
        if (!('element' in r)) throw new Error('unexpected redirect')
        expect(sectionOf(r.element)).not.toHaveProperty('slSort')
        expect(buttonOf(r.element)?.serverExport ?? {}).not.toHaveProperty('slSort')
        expect(buttonOf(r.element)?.bulk ?? {}).not.toHaveProperty('slSort')
      }
      const ig = await runRoute(spa(Route, { section: 'organic-social', subsection: 'organic-instagram', dateRange: SEP, slsort: 'reach' }))
      if (!('element' in ig)) throw new Error('unexpected redirect')
      expect(sectionOf(ig.element)).not.toHaveProperty('slSort')
      expect(buttonOf(ig.element)?.serverExport ?? {}).not.toHaveProperty('slSort')
    })

    test('the locked-month redirect keeps slsort and drops an unknown one', async () => {
      as('CLIENT_VIEWER')
      expect(await redirectOf(spa(Route, { section: 'organic-social', subsection: TAB, dateRange: LIVE, slsort: 'engagement' })))
        .toBe(`${base}?section=organic-social&subsection=${TAB}&slsort=engagement&dateRange=${ENC_SEP}`)
      expect(await redirectOf(spa(Route, { section: 'organic-social', subsection: TAB, dateRange: LIVE, slsort: 'x' })))
        .toBe(`${base}?section=organic-social&subsection=${TAB}&dateRange=${ENC_SEP}`)
    })
  })
}

test('portal: the no-section redirect keeps slcols with its subsection', async () => {
  as('CLIENT_VIEWER')
  expect(await redirectOf(spa(PortalSpa as Route, { subsection: TAB, dateRange: SEP, slcols: 'i-ytd' })))
    .toBe(`/portal/c/reports?dateRange=${ENC_SEP}&subsection=${TAB}&slcols=i-ytd&section=organic-social`)
})
