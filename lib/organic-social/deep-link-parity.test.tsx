import { beforeEach, expect, test, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'

/**
 * A deep link (`/reports/organic-social`) must BE the SPA landing page (`/reports?section=
 * organic-social`): same tab, same title, same error-boundary label. The health sweep and the
 * cache warmer fetch the deep link, so any drift means we monitor and warm a page no client sees.
 *
 * This test runs the real route modules, not their source text. Paul's review of PR 255 showed a
 * text match passing on two broken fixes (`channel={ null }`, and the resolver commented out).
 * Running the pages catches any spelling of a regression, in either route, because it compares
 * what each page actually hands the section. `app/` sits outside vitest's `include`, but that only
 * selects which test FILES run; a test can import any module.
 *
 * Nothing renders and nothing fetches: the section is stubbed with a named component, so its props
 * are exactly what the route passed. `@/auth` is stubbed globally (vitest.setup.ts) and given a
 * session per test here; the database is reached only through the mocked `getClientBySlug`.
 */
const { getClientBySlug } = vi.hoisted(() => ({ getClientBySlug: vi.fn() }))
vi.mock('@/lib/db/queries', async (orig) => ({ ...(await orig<object>()), getClientBySlug }))
vi.mock('@/components/report-sections/organic-social', () => ({
  OrganicSocialReport: function OrganicSocialReport() { return null },
}))

import DashboardDeepLink from '@/app/dashboard/[clientSlug]/reports/[reportSlug]/page'
import PortalDeepLink from '@/app/portal/[clientSlug]/reports/[reportSlug]/page'
import DashboardSpa from '@/app/dashboard/[clientSlug]/reports/page'
import PortalSpa from '@/app/portal/[clientSlug]/reports/page'
import { OrganicSocialReport } from '@/components/report-sections/organic-social'
import { Header } from '@/components/layout/header'
import { StickyReportHeader } from '@/components/layout/sticky-report-header'
import { ReportErrorBoundary } from '@/components/report-sections/error-boundary'
import { auth } from '@/auth'

/** Every element in a returned tree matching `pred`, walking props (children, element props). */
function findAll(node: ReactNode, pred: (e: ReactElement<Record<string, unknown>>) => boolean) {
  const out: ReactElement<Record<string, unknown>>[] = []
  const seen = new Set<unknown>()
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object' || seen.has(n)) return
    seen.add(n)
    if (Array.isArray(n)) return n.forEach(walk)
    if (!isValidElement(n)) return
    const e = n as ReactElement<Record<string, unknown>>
    if (pred(e)) out.push(e)
    Object.values(e.props ?? {}).forEach(walk)
  }
  walk(node)
  return out
}

function only(node: ReactNode, pred: (e: ReactElement<Record<string, unknown>>) => boolean, what: string) {
  const hits = findAll(node, pred)
  expect(hits, `expected exactly one ${what}`).toHaveLength(1)
  return hits[0]
}

type View = { channel: unknown; title: unknown; boundary: unknown }

function viewOf(tree: ReactNode, titleFrom: 'Header' | 'h1' | 'StickyReportHeader'): View {
  const section = only(tree, (e) => e.type === OrganicSocialReport, 'OrganicSocialReport')
  const boundary = only(tree, (e) => e.type === ReportErrorBoundary, 'ReportErrorBoundary')
  const title =
    titleFrom === 'h1' ? only(tree, (e) => e.type === 'h1', 'h1').props.children
    : titleFrom === 'Header' ? only(tree, (e) => e.type === Header, 'Header').props.title
    : only(tree, (e) => e.type === StickyReportHeader, 'StickyReportHeader').props.title
  return { channel: section.props.channel, title, boundary: boundary.props.sectionName }
}

type Fixture = { channels: string[] | undefined; hidden: string[] }
const FIXTURES: Record<string, Fixture> = {
  'renaissance-shaped (no allowlist, Overview shown)': { channels: undefined, hidden: ['technical-audit', 'content-impact'] },
  'a-place-for-mom-shaped': { channels: ['instagram', 'facebook', 'linkedin'], hidden: ['organic-overview'] },
  'joy-of-life-shaped': { channels: ['instagram', 'facebook', 'tiktok'], hidden: ['organic-overview'] },
  'akara-shaped': { channels: ['instagram', 'facebook'], hidden: ['organic-overview'] },
  'hides Overview and Instagram': { channels: ['instagram', 'facebook'], hidden: ['organic-overview', 'organic-instagram'] },
  'nonsense allowlist (no platform tab left)': { channels: ['nonsense'], hidden: ['organic-overview'] },
  'empty allowlist (means every channel)': { channels: [], hidden: ['organic-overview'] },
}

const SLUG = 'c'
function useClient(f: Fixture) {
  getClientBySlug.mockResolvedValue({
    name: 'Client', slug: SLUG, logoUrl: null, enabledReports: ['organic-social'],
    hiddenReports: f.hidden, dashSocialConfig: { brandId: 1, channels: f.channels },
  })
}

const deepArgs = (search: Record<string, string> = {}) =>
  ({ params: Promise.resolve({ clientSlug: SLUG, reportSlug: 'organic-social' }), searchParams: Promise.resolve(search) })
const spaArgs = () =>
  ({ params: Promise.resolve({ clientSlug: SLUG }), searchParams: Promise.resolve({ section: 'organic-social' }) })

beforeEach(() => {
  getClientBySlug.mockReset()
  vi.mocked(auth).mockResolvedValue({ user: { email: 'staff@avenuez.com', role: 'INTERNAL_ADMIN', clientSlug: null } } as never)
})

test.each(Object.entries(FIXTURES))('dashboard: the deep link is the SPA landing page (%s)', async (_n, f) => {
  useClient(f)
  const spa = viewOf(await DashboardSpa(spaArgs() as never), 'StickyReportHeader')
  const deep = viewOf(await DashboardDeepLink(deepArgs() as never), 'Header')
  expect(deep).toEqual(spa)
})

test.each(Object.entries(FIXTURES))('portal: the deep link is the SPA landing page (%s)', async (_n, f) => {
  useClient(f)
  const spa = viewOf(await PortalSpa(spaArgs() as never), 'StickyReportHeader')
  const deep = viewOf(await PortalDeepLink(deepArgs() as never), 'h1')
  expect(deep).toEqual(spa)
})

// The sweep fetches the portal deep link with ?health=1 as INTERNAL_ADMIN, which returns a
// HealthProbe wrapping the section instead of the page. It must probe the same tab.
test.each(Object.entries(FIXTURES))('portal health probe checks the SPA landing tab (%s)', async (_n, f) => {
  useClient(f)
  const spa = viewOf(await PortalSpa(spaArgs() as never), 'StickyReportHeader')
  const probe = await PortalDeepLink(deepArgs({ health: '1' }) as never)
  const section = only(probe, (e) => e.type === OrganicSocialReport, 'OrganicSocialReport')
  expect(section.props.channel).toEqual(spa.channel)
})

// Anchors, so the two routes can't pass the parity above by drifting TOGETHER. Renaissance's
// deep link must be exactly what it was before any of this work: Overview, titled Organic Social.
test('anchor: Renaissance-shaped deep link is still Overview, titled Organic Social', async () => {
  useClient(FIXTURES['renaissance-shaped (no allowlist, Overview shown)'])
  expect(viewOf(await DashboardDeepLink(deepArgs() as never), 'Header'))
    .toEqual({ channel: null, title: 'Organic Social', boundary: 'Organic Social' })
  expect(viewOf(await PortalDeepLink(deepArgs() as never), 'h1'))
    .toEqual({ channel: null, title: 'Organic Social', boundary: 'Organic Social' })
})

test('anchor: a client that hides Overview deep-links to its first platform tab, titled with it', async () => {
  useClient(FIXTURES['a-place-for-mom-shaped'])
  expect(viewOf(await DashboardDeepLink(deepArgs() as never), 'Header'))
    .toEqual({ channel: 'INSTAGRAM', title: 'Instagram', boundary: 'Instagram' })
  useClient(FIXTURES['hides Overview and Instagram'])
  expect(viewOf(await PortalDeepLink(deepArgs() as never), 'h1'))
    .toEqual({ channel: 'FACEBOOK', title: 'Facebook', boundary: 'Facebook' })
})
