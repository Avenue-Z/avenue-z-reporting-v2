import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const m = vi.hoisted(() => ({ access: vi.fn(), log: vi.fn() }))
vi.mock('@/lib/auth/page-access', () => ({ requireStaff: vi.fn(async () => ({ user: { role: 'INTERNAL_ANALYST', email: 'ana@avenuez.com' } })) }))
vi.mock('@/lib/aeo-outbound/access', () => ({ outboundAccess: m.access }))
vi.mock('@/lib/aeo-outbound/settings-store', () => ({ recentSettingsLogQuery: m.log }))
import SettingsPage from './page'

afterEach(() => { cleanup(); vi.clearAllMocks() })
const page = async () => render(await SettingsPage())

// Paul's review of #388 (C1): Settings is one of the views that must say try again when settings can't be read.
test('settings that could not be read say try again on the Settings page, not that the user has no access', async () => {
  m.access.mockResolvedValue({ ok: false, admins: [], reason: 'unavailable' })
  await page()
  expect(screen.getByText("Couldn't check access just now. Reload in a moment.")).toBeInTheDocument()
  expect(screen.queryByText(/limited to the New Business team/)).toBeNull()
  expect(m.log).not.toHaveBeenCalled()
})

test('a real refusal still shows no access on the Settings page', async () => {
  m.access.mockResolvedValue({ ok: false, admins: ['ryan@avenuez.com'], reason: 'forbidden' })
  await page()
  expect(screen.getByText(/limited to the New Business team/)).toBeInTheDocument()
})
