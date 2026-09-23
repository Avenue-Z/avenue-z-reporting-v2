import { expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('next/navigation', () => ({ usePathname: vi.fn(), useSearchParams: vi.fn() }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))
vi.mock('next/image', () => ({
  default: ({ src, alt, width, height, className }: { src: string; alt: string; width?: number; height?: number; className?: string }) =>
    <img src={src} alt={alt} width={width} height={height} className={className} />,
}))
vi.mock('@/app/actions/auth', () => ({ signOutAction: vi.fn() }))

import { usePathname, useSearchParams } from 'next/navigation'
import { PortalSidebar } from '@/components/layout/portal-sidebar'
import { toPortalSidebarClient } from '@/lib/portal/sidebar-client'
import type { Client } from '@/lib/db/schema'

// THE RENAISSANCE GUARD FOR THE PORTAL SIDEBAR. Written before the sidebar stopped receiving
// every client's record. A client shaped like Renaissance: its real enabled and hidden
// reports in prod (read 2026-09-18) and no channel allowlist. What the sidebar draws for it
// must stay byte-identical. Names and URLs are made up.
const REN = {
  slug: 'renaissance', name: 'Renaissance', logoUrl: 'https://example.com/logo.png',
  enabledReports: ['organic-social', 'paid-media', 'peec-ai', 'request-a-report', 'executive-overview'],
  hiddenReports: ['technical-audit', 'content-impact'],
  dashSocialConfig: { brandId: 1 },
} as unknown as Client

function at(url: string) {
  const u = new URL(url, 'https://portal.example.com')
  vi.mocked(usePathname).mockReturnValue(u.pathname)
  vi.mocked(useSearchParams).mockReturnValue(u.searchParams as unknown as ReturnType<typeof useSearchParams>)
}
// The one place the props are built, so the before and after runs differ only here. Before the
// fix this passed every client (clients={[ren, anotherClient]}); now the sidebar gets the trimmed record.
// The snapshots were written against the old props and must still match.
const renderSidebar = (ren: Client, userRole: string) =>
  render(<PortalSidebar client={toPortalSidebarClient(ren)} userRole={userRole} />)

test('reports landing, client viewer', () => {
  at('/portal/renaissance/reports')
  expect(renderSidebar(REN, 'CLIENT_VIEWER').container.innerHTML).toMatchSnapshot()
})

test('Organic Social with its tabs, client viewer', () => {
  at('/portal/renaissance/reports?section=organic-social')
  expect(renderSidebar(REN, 'CLIENT_VIEWER').container.innerHTML).toMatchSnapshot()
})

test('Organic Social, LinkedIn tab, client viewer', () => {
  at('/portal/renaissance/reports?section=organic-social&subsection=organic-linkedin')
  expect(renderSidebar(REN, 'CLIENT_VIEWER').container.innerHTML).toMatchSnapshot()
})

test('Answer Engine Optimization with its tabs, client viewer', () => {
  at('/portal/renaissance/reports?section=peec-ai')
  expect(renderSidebar(REN, 'CLIENT_VIEWER').container.innerHTML).toMatchSnapshot()
})

test('Paid Media with its tabs, client viewer', () => {
  at('/portal/renaissance/reports?section=paid-media')
  expect(renderSidebar(REN, 'CLIENT_VIEWER').container.innerHTML).toMatchSnapshot()
})

test('Organic Social, client admin (adds the Team link)', () => {
  at('/portal/renaissance/reports?section=organic-social')
  expect(renderSidebar(REN, 'CLIENT_ADMIN').container.innerHTML).toMatchSnapshot()
})
