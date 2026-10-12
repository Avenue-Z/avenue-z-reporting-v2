import { beforeEach, expect, test, vi } from 'vitest'
import { findElements, runRoute } from '@/lib/test-utils/element-tree'

const { getClientBySlug, requirePortalAccess } = vi.hoisted(() => ({ getClientBySlug: vi.fn(), requirePortalAccess: vi.fn() }))
vi.mock('@/lib/db/queries', async (orig) => ({ ...(await orig<object>()), getClientBySlug }))
vi.mock('@/lib/auth/page-access', async (orig) => ({ ...(await orig<object>()), requirePortalAccess }))
vi.mock('@/components/report-sections/organic-social', () => ({
  OrganicSocialReport: function OrganicSocialReport() { return null },
}))

import ExportPage from './page'

const CLIENT = { name: 'Renaissance', slug: 'renaissance', logoUrl: '/logos/ren.png', enabledReports: ['organic-social'], hiddenReports: [], dashSocialConfig: { brandId: 1 } }
const nameOf = (t: unknown) => (typeof t === 'function' ? (t as { name: string }).name : String(t))
const textOf = (n: unknown): string => {
  if (n == null || typeof n === 'boolean') return ''
  if (typeof n === 'string' || typeof n === 'number') return String(n)
  if (Array.isArray(n)) return n.map(textOf).join('')
  return textOf((n as { props?: { children?: unknown } }).props?.children)
}
const open = (sp: Record<string, string>, section = 'organic-social') =>
  runRoute(ExportPage({ params: Promise.resolve({ clientSlug: 'renaissance', section }), searchParams: Promise.resolve(sp) } as never))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-06T14:17:00Z'))
  getClientBySlug.mockResolvedValue(CLIENT)
  requirePortalAccess.mockResolvedValue({ user: { role: 'CLIENT_VIEWER', clientSlug: 'renaissance' } })
})

test("the page runs the portal's access check on its own slug first", async () => {
  await open({ dateRange: 'last_30_days' })
  expect(requirePortalAccess).toHaveBeenCalledWith('renaissance')
})

test('a client without Organic Social is a 404', async () => {
  getClientBySlug.mockResolvedValue({ ...CLIENT, enabledReports: ['paid-media'] })
  await expect(open({ dateRange: 'last_30_days' })).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_HTTP_ERROR_FALLBACK;404/) })
})

test('renders the report as the live page does, in export mode, with the ready reporter', async () => {
  const r = await open({ dateRange: 'custom:2026-09-01,2026-09-30', compareRange: 'previous_period', subsection: 'organic-linkedin', tz: 'America/New_York' })
  if ('redirect' in r) throw new Error('unexpected redirect')
  const [report] = findElements(r.element, (e) => nameOf(e.type) === 'OrganicSocialReport')
  // view as the live pages pass it (null on a platform tab; 'influencer' on that tab, organic-social-view.pages.test.tsx).
  expect(report.props).toEqual({ clientSlug: 'renaissance', dateRange: 'custom:2026-09-01,2026-09-30', compareRange: 'previous_period', channel: 'LINKEDIN', view: null })
  expect(findElements(r.element, (e) => nameOf(e.type) === 'ExportModeProvider')).toHaveLength(1)
  expect(findElements(r.element, (e) => nameOf(e.type) === 'ExportReadyReporter')).toHaveLength(1)
})

test('the header names the client and the view, and stamps the export time and period', async () => {
  const r = await open({ dateRange: 'custom:2026-09-01,2026-09-30', tz: 'America/New_York' })
  if ('redirect' in r) throw new Error('unexpected redirect')
  const [header] = findElements(r.element, (e) => e.type === 'header')
  const text = textOf(header)
  expect(text).toContain('Renaissance')
  expect(text).toContain('Organic Social')
  expect(text).toContain('Exported Oct 6, 2026, 10:17 AM EDT · Reporting period Sep 1 – Sep 30, 2026')
  expect(header.props['data-export-block']).toBe('')
})

test('without a range the page uses the live default, last 30 days', async () => {
  const r = await open({})
  if ('redirect' in r) throw new Error('unexpected redirect')
  const [report] = findElements(r.element, (e) => nameOf(e.type) === 'OrganicSocialReport')
  expect(report.props.dateRange).toBe('last_30_days')
})

// Nunito Sans has no arrows or emoji, and the server's Chromium has no system font with them, so they printed as
// empty boxes (the KPI deltas' ↑ ↓, "View post ↗", caption emoji). The export page loads web fonts that cover them.
test('the page loads the fallback fonts for arrows, symbols and emoji', async () => {
  const r = await open({})
  if ('redirect' in r) throw new Error('unexpected redirect')
  const links = findElements(r.element, (e) => e.type === 'link').map((e) => e.props as { rel: string; href: string })
  expect(links).toEqual([expect.objectContaining({ rel: 'stylesheet', href: expect.stringMatching(/family=Noto\+Sans\+Math&family=Noto\+Color\+Emoji/) })])
})

// Only sections switched on for the server export render here (lib/export/sections.ts). A section the client has
// enabled but that has no export yet is a 404, so this page can't print a report its components aren't ready for.
test('a section not switched on for the export is a 404, even when the client has it enabled', async () => {
  getClientBySlug.mockResolvedValue({ ...CLIENT, enabledReports: ['organic-social', 'peec-ai'] })
  await expect(open({ dateRange: 'last_30_days' }, 'peec-ai')).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_HTTP_ERROR_FALLBACK;404/) })
})

test('an unknown section is a 404', async () => {
  await expect(open({ dateRange: 'last_30_days' }, 'not-a-section')).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_HTTP_ERROR_FALLBACK;404/) })
})

// #334 (task B7): the Influencer tab has no channel but a view, so the export must carry the view, or it would print
// Overview under the title "Organic Social".
test("the export page hands the report the tab's view and channel", async () => {
  const reportProps = async (subsection: string) => {
    const r = await open({ subsection, dateRange: 'last_30_days' })
    if ('redirect' in r) throw new Error(`unexpected redirect to ${r.redirect}`)
    return findElements(r.element, (e) => nameOf(e.type) === 'OrganicSocialReport')[0].props
  }
  expect(await reportProps('organic-influencer')).toMatchObject({ channel: null, view: 'influencer' })
  expect(await reportProps('organic-linkedin')).toMatchObject({ channel: 'LINKEDIN', view: null })
})
