import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const m = vi.hoisted(() => ({ access: vi.fn(), list: vi.fn() }))
vi.mock('@/lib/auth/page-access', () => ({ requireStaff: vi.fn(async () => ({ user: { role: 'INTERNAL_ANALYST', email: 'ana@avenuez.com' } })) }))
vi.mock('@/lib/aeo-outbound/access', () => ({ outboundAccess: m.access }))
vi.mock('@/lib/aeo-outbound/store', async (o) => ({ ...(await o<object>()), listReportSummaries: m.list }))
import HubPage from './page'

afterEach(() => { cleanup(); vi.clearAllMocks() })
const page = async () => render(await HubPage({ searchParams: Promise.resolve({}) }))

// Final review M4: the hub is Ryan's first screen, so unreadable settings say try again there too (spec v1.1 §19.7, A3).
test('settings that could not be read say try again on the hub, not that Ryan has no access', async () => {
  m.access.mockResolvedValue({ ok: false, admins: [], unavailable: true })
  await page()
  expect(screen.getByText("Couldn't check access just now. Reload in a moment.")).toBeInTheDocument()
  expect(screen.queryByText(/limited to the New Business team/)).toBeNull()
  expect(m.list).not.toHaveBeenCalled()
})

test('a real refusal still shows no access on the hub', async () => {
  m.access.mockResolvedValue({ ok: false, admins: ['ryan@avenuez.com'] })
  await page()
  expect(screen.getByText(/limited to the New Business team/)).toBeInTheDocument()
  expect(m.list).not.toHaveBeenCalled()
})
