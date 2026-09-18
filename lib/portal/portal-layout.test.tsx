import { beforeEach, expect, test, vi } from 'vitest'
import { render } from '@testing-library/react'

// The database, the session and the sidebar are stubbed; the layout itself is real.
const { getClientBySlug, getAllClients, PortalSidebar, redirect } = vi.hoisted(() => ({
  getClientBySlug: vi.fn(),
  getAllClients: vi.fn(),
  PortalSidebar: vi.fn((_props: unknown) => null),
  redirect: vi.fn((to: string) => { throw new Error(`redirect:${to}`) }),
}))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug, getAllClients }))
vi.mock('next/navigation', () => ({ redirect }))
vi.mock('@/components/layout/portal-sidebar', () => ({ PortalSidebar }))

import { auth } from '@/auth'
import PortalLayout from '@/app/portal/[clientSlug]/layout'
import type { Client } from '@/lib/db/schema'

// A full row with planted values that must never reach a browser. Made up.
const FULL = {
  id: 'uuid-secret-id', slug: 'renaissance', name: 'Renaissance', logoUrl: null,
  ga4PropertyId: 'SECRET-GA4', smApiKeyEnvVar: 'SECRET_SM_ENV',
  dashSocialConfig: { brandId: 987654321 },
  enabledReports: ['organic-social'], hiddenReports: ['technical-audit'],
  sharedPasswordHash: 'SECRET-HASH', users: [{ email: 'secret-user@example.com' }],
} as unknown as Client
const OTHER = { ...FULL, slug: 'another-client', name: 'Another Client', ga4PropertyId: 'SECRET-OTHER' } as unknown as Client

const signedInAs = (role: string, clientSlug: string | null) =>
  (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { role, clientSlug } })
const openPortal = async (clientSlug: string) =>
  render(await PortalLayout({ children: null, params: Promise.resolve({ clientSlug }) }))
const sidebarProps = () => PortalSidebar.mock.calls.at(-1)?.[0]

beforeEach(() => {
  vi.clearAllMocks()
  getClientBySlug.mockImplementation(async (slug: string) => [FULL, OTHER].find((c) => c.slug === slug) ?? null)
  getAllClients.mockResolvedValue([FULL, OTHER])
})

test('the portal never loads every client, and the sidebar gets only the trimmed record', async () => {
  signedInAs('CLIENT_VIEWER', 'renaissance')
  await openPortal('renaissance')
  expect(getAllClients).not.toHaveBeenCalled()
  expect(sidebarProps()).toEqual({
    client: {
      slug: 'renaissance', name: 'Renaissance', logoUrl: null,
      enabledReports: ['organic-social'], hiddenReports: ['technical-audit'], dashSocialConfig: { channels: undefined },
    },
    userRole: 'CLIENT_VIEWER',
  })
  const sent = JSON.stringify(sidebarProps())
  for (const planted of ['SECRET', '987654321', 'uuid-secret-id', 'secret-user@example.com', 'another-client']) {
    expect(sent).not.toContain(planted)
  }
})

test('an unknown client slug gives the sidebar no client, so it renders nothing, as before', async () => {
  signedInAs('INTERNAL_ADMIN', null)
  await openPortal('no-such-client')
  expect(sidebarProps()).toEqual({ client: null, userRole: 'INTERNAL_ADMIN' })
})

// Unchanged guard: a client user can only open its own portal.
test("a client user opening another client's portal is still sent away", async () => {
  signedInAs('CLIENT_VIEWER', 'another-client')
  await expect(PortalLayout({ children: null, params: Promise.resolve({ clientSlug: 'renaissance' }) }))
    .rejects.toThrow('redirect:/unauthorized')
  expect(getClientBySlug).not.toHaveBeenCalled()
})
