import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const m = vi.hoisted(() => ({ access: vi.fn(), getReport: vi.fn() }))
vi.mock('@/lib/auth/page-access', () => ({ requireStaff: vi.fn(async () => ({ user: { role: 'INTERNAL_ANALYST', email: 'ana@avenuez.com' } })) }))
vi.mock('@/lib/aeo-outbound/access', () => ({ outboundAccess: m.access }))
vi.mock('@/lib/aeo-outbound/store', async (o) => ({ ...(await o<object>()), getReport: m.getReport }))
import EditorPage from './page'

afterEach(() => { cleanup(); vi.clearAllMocks() })
const ID = 'c7d8e0a1-1111-4111-8111-111111111111'
const page = async () => render(await EditorPage({ params: Promise.resolve({ reportId: ID }) }))

test('spec v1.1 §19.7 (A3): settings that could not be read say try again, not that Ryan has no access', async () => {
  m.access.mockResolvedValue({ ok: false, admins: [], reason: 'unavailable' })
  await page()
  expect(screen.getByText("Couldn't check access just now. Reload in a moment.")).toBeInTheDocument()
  expect(screen.queryByText(/limited to the New Business team/)).toBeNull()
  expect(m.getReport).not.toHaveBeenCalled()
})

test('a real refusal still shows no access', async () => {
  m.access.mockResolvedValue({ ok: false, admins: ['ryan@avenuez.com'], reason: 'forbidden' })
  await page()
  expect(screen.getByText(/limited to the New Business team/)).toBeInTheDocument()
})

test('#396: a refusal or a missing snapshot renders no editor marker, so the page keeps the width cap', async () => {
  m.access.mockResolvedValue({ ok: false, admins: [], reason: 'forbidden' })
  const refused = await page()
  expect(refused.container.querySelector('[data-aeo-editor]')).toBeNull()
  cleanup()
  m.access.mockResolvedValue({ ok: true, settings: {} })
  m.getReport.mockResolvedValue(null)
  const missing = await page()
  expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  expect(missing.container.querySelector('[data-aeo-editor]')).toBeNull()
})
