import { expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('next/navigation', () => ({ usePathname: vi.fn(), useSearchParams: vi.fn() }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLinkStatus: () => ({ pending: false }),
}))
vi.mock('next/image', () => ({ default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} /> }))
vi.mock('@/app/actions/auth', () => ({ signOutAction: vi.fn() }))

import { usePathname, useSearchParams } from 'next/navigation'
import { PortalSidebar } from '@/components/layout/portal-sidebar'
import { Sidebar } from '@/components/layout/sidebar'
import { toPortalSidebarClient } from '@/lib/portal/sidebar-client'
import type { Client } from '@/lib/db/schema'

// Spec 4.2b. Every report section enabled, so every range-copying branch renders. Made-up names.
const BASE = {
  id: 'c1', slug: 'acme', name: 'Acme', logoUrl: null, users: [],
  enabledReports: ['organic-social', 'paid-media', 'peec-ai', 'ga4', 'inbound-funnel', 'executive-overview', 'request-a-report'],
  hiddenReports: [], dashSocialConfig: { brandId: 1 },
} as unknown as Client
const LOCKED = { ...BASE, dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-07' } } } as unknown as Client
const RANGE = 'dateRange=custom%3A2026-09-01%2C2026-09-30&compareRange=custom%3A2026-08-01%2C2026-08-31'

function at(url: string) {
  const u = new URL(url, 'https://app.example.com')
  vi.mocked(usePathname).mockReturnValue(u.pathname)
  vi.mocked(useSearchParams).mockReturnValue(u.searchParams as unknown as ReturnType<typeof useSearchParams>)
}
const links = (el: HTMLElement) => [...el.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? '').filter((h) => h.includes('/reports?'))
const q = (href: string) => new URL(href, 'https://app.example.com').searchParams
const portal = (c: Client) => links(render(<PortalSidebar client={toPortalSidebarClient(c)} userRole="CLIENT_VIEWER" />).container)
const dashboard = (c: Client) => links(render(<Sidebar clients={[c]} />).container)

// The pages each sidebar can be on, as section to path (deep link included).
const PAGES = (area: 'portal' | 'dashboard') => [
  ['organic-social', `/${area}/acme/reports?section=organic-social&${RANGE}`],
  ['organic-social', `/${area}/acme/reports/organic-social?${RANGE}`],
  ['paid-media', `/${area}/acme/reports?section=paid-media&${RANGE}`],
  ['peec-ai', `/${area}/acme/reports?section=peec-ai&${RANGE}`],
  ['ga4', `/${area}/acme/reports?section=ga4&${RANGE}`],
  ['inbound-funnel', `/${area}/acme/reports?section=inbound-funnel&${RANGE}`],
  ['executive-overview', `/${area}/acme/reports?section=executive-overview&${RANGE}`],
] as const

for (const [name, draw] of [['portal', portal], ['dashboard', dashboard]] as const) {
  test(`${name} sidebar: a locked client's links drop the range exactly when they cross the Organic Social boundary; every other link is as for a client without locked months`, () => {
    const sectionsSeen = new Set<string>()
    // Which links copy the range at all, for a client without locked months: every portal link; on the dashboard only
    // AEO, Paid Media and Organic Social (its generic, GA4 and Inbound Funnel links carry none).
    const copiesRange = (target: string) => name === 'portal' || ['peec-ai', 'paid-media', 'organic-social'].includes(target)
    let droppedFromCarrier = 0
    for (const [pageSection, url] of PAGES(name)) {
      at(url)
      const control = draw(BASE)
      at(url)
      const locked = draw(LOCKED)
      expect(locked).toHaveLength(control.length)
      locked.forEach((href, i) => {
        const target = q(href).get('section') ?? ''
        sectionsSeen.add(target)
        const crosses = (pageSection === 'organic-social') !== (target === 'organic-social')
        if (crosses) {
          // Not vacuous: where the control copies the range, it really had one, and the locked link dropped it.
          if (copiesRange(target)) {
            expect(q(control[i]).get('dateRange'), `control ${control[i]}`).not.toBeNull()
            if (name === 'dashboard') expect(q(control[i]).get('compareRange'), `control ${control[i]}`).not.toBeNull()
            droppedFromCarrier++
          }
          expect(q(href).get('dateRange'), `${url} -> ${href}`).toBeNull()
          expect(q(href).get('compareRange'), `${url} -> ${href}`).toBeNull()
          // Only the range goes: the rest of the link is the control's.
          const c = q(control[i]); c.delete('dateRange'); c.delete('compareRange')
          const l = q(href); l.delete('dateRange'); l.delete('compareRange')
          expect(l.toString()).toBe(c.toString())
        } else {
          expect(href, `${url}`).toBe(control[i])
        }
      })
    }
    expect(droppedFromCarrier).toBeGreaterThan(0)
    // Every section rendered, so every range-copying branch of both sidebars was exercised.
    expect([...sectionsSeen].sort()).toEqual(['executive-overview', 'ga4', 'inbound-funnel', 'organic-social', 'paid-media', 'peec-ai', 'request-a-report'])
  })

  test(`${name} sidebar: Organic Social's own tab links keep the range for a locked client`, () => {
    at(`/${name}/acme/reports?section=organic-social&${RANGE}`)
    const os = draw(LOCKED).filter((h) => q(h).get('section') === 'organic-social')
    expect(os.length).toBeGreaterThan(1)
    for (const h of os) expect(q(h).get('dateRange')).toBe('custom:2026-09-01,2026-09-30')
  })
}
