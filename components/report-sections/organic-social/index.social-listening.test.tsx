// The Social Listening tab's wiring in the Organic Social report (spec 2026-11-19 sections 4, 9; plan Task 10). The section
// itself is tested in social-listening/section.test.tsx; here only what the report and the body hand it.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { ReactElement } from 'react'
import { auth } from '@/auth'

vi.mock('./social-listening/section', () => ({ SocialListeningSection: function SocialListeningSection() { return null } }))
const { getSectionTemplate, getClientBySlug } = vi.hoisted(() => ({ getSectionTemplate: vi.fn(), getClientBySlug: vi.fn() }))
vi.mock('@/lib/db/queries', async (orig) => ({ ...(await orig<typeof import('@/lib/db/queries')>()), getSectionTemplate, getClientBySlug }))

import { OrganicSocialBody, OrganicSocialReport } from './index'
import { SocialListeningSection } from './social-listening/section'
import { NoMonths } from './no-months'
import { buildOrganicSocialCtx } from './ctx'

const OCT = 'custom:2026-10-01,2026-10-31'
const LIVE = 'custom:2026-11-01,2026-11-18'
const OPTED = { slug: 'c', dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' } } }

/** Elements of a component, by the component itself or by its function name. */
function find(node: unknown, name: string | ((...a: never[]) => unknown)): { props: Record<string, unknown> }[] {
  const out: { props: Record<string, unknown> }[] = []
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) { n.forEach(walk); return }
    const e = n as { type?: unknown; props?: Record<string, unknown> }
    if (typeof e.type === 'function' && (typeof name === 'string' ? (e.type as { name: string }).name === name : e.type === name)) out.push(e as never)
    walk(e.props?.children)
  }
  walk(node)
  return out
}
const as = (role: string, email = 'writer@avenuez.com') => vi.mocked(auth).mockResolvedValue({ user: { role, email } } as never)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-19T15:00:00Z'))
  getSectionTemplate.mockReset()
  getClientBySlug.mockReset().mockResolvedValue(OPTED)
})
afterEach(() => { vi.useRealTimers(); vi.mocked(auth).mockReset(); vi.restoreAllMocks() })

describe('the report', () => {
  test('the tab renders neither shared header box, so the organic-social commentary is never read (R2-7)', () => {
    const el = OrganicSocialReport({ clientSlug: 'c', channel: null, view: 'social-listening' })
    expect(find(el, 'SharedPartsHeader')).toEqual([])
    expect(find(el, 'OrganicSocialBody')[0].props.sl).toEqual({ topic: 'brand', exporting: false })
  })
  test('sl and the export flag reach the body on this tab only; every other tab is exactly as before', () => {
    const el = OrganicSocialReport({ clientSlug: 'c', channel: null, view: 'social-listening', sl: 'industry', exporting: true })
    expect(find(el, 'OrganicSocialBody')[0].props.sl).toEqual({ topic: 'industry', exporting: true })
    for (const other of [{ channel: null }, { channel: 'INSTAGRAM' as const }, { channel: null, view: 'influencer' as const }]) {
      const report = OrganicSocialReport({ clientSlug: 'renaissance', sl: 'industry', exporting: true, ...other })
      expect(Object.keys(find(report, 'OrganicSocialBody')[0].props)).toEqual(['ctx'])
      expect(find(report, 'SharedPartsHeader')).toHaveLength(2)
    }
  })
})

describe('the body', () => {
  test('hands the section the served month, the role, the email and the open pill, and reads no template', async () => {
    as('INTERNAL_ADMIN')
    const out = await OrganicSocialBody({ ctx: buildOrganicSocialCtx({ clientSlug: 'c', channel: null, view: 'social-listening', dateRange: OCT }), sl: { topic: 'industry', exporting: false } }) as ReactElement
    expect(out.type).toBe(SocialListeningSection)
    expect(out.props).toEqual({ clientSlug: 'c', servedRange: OCT, role: 'INTERNAL_ADMIN', email: 'writer@avenuez.com', topic: 'industry', exporting: false })
    expect(getSectionTemplate).not.toHaveBeenCalled()
  })
  test('the export prints brand then industry, whichever pill was open (R2-5)', async () => {
    as('INTERNAL_ADMIN')
    const out = await OrganicSocialBody({ ctx: buildOrganicSocialCtx({ clientSlug: 'c', channel: null, view: 'social-listening', dateRange: OCT }), sl: { topic: 'industry', exporting: true } }) as ReactElement
    const sections = find(out, SocialListeningSection)
    expect(sections.map((s) => [s.props.topic, s.props.exporting])).toEqual([['brand', true], ['industry', true]])
  })
  test('a client asking for the live month is served the locked month, as on every other tab', async () => {
    as('CLIENT_VIEWER', 'someone@client.test')
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const out = await OrganicSocialBody({ ctx: buildOrganicSocialCtx({ clientSlug: 'c', channel: null, view: 'social-listening', dateRange: LIVE }), sl: { topic: 'brand', exporting: false } }) as ReactElement
    expect(out.props).toMatchObject({ servedRange: OCT, role: 'CLIENT_VIEWER' })
  })
  test('malformed reporting months show NoMonths and log the key', async () => {
    as('INTERNAL_ADMIN')
    getClientBySlug.mockResolvedValue({ slug: 'c', dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: 'soon' } } })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const out = await OrganicSocialBody({ ctx: buildOrganicSocialCtx({ clientSlug: 'c', channel: null, view: 'social-listening', dateRange: OCT }), sl: { topic: 'brand', exporting: false } }) as ReactElement
    expect(out.type).toBe(NoMonths)
    expect(String(error.mock.calls[0][0])).toContain('slug=c key=firstMonth')
  })
})
