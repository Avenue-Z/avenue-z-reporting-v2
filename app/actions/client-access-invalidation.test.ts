import { beforeEach, expect, test, vi } from 'vitest'

// The client-access and team actions expire the db tag themselves, once, after a write that took effect,
// and never on a refusal. updateTag works only inside a Server Action (next/cache throws anywhere else,
// after the write has landed), so it lives here rather than in lib/db/admin-queries.ts, which then works
// from any caller.
vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), updateTag: vi.fn() }))
vi.mock('@/lib/auth/password', () => ({ hashPassword: vi.fn(async () => 'hashed') }))
vi.mock('@/lib/db/admin-queries', () => ({
  getClientAccessOverview: vi.fn(),
  setClientSharedPassword: vi.fn(async () => {}),
  setClientMaxSeats: vi.fn(),
  addClientUser: vi.fn(),
  removeClientUser: vi.fn(),
}))

import { auth } from '@/auth'
import { updateTag } from 'next/cache'
import {
  addClientUser, getClientAccessOverview, removeClientUser, setClientMaxSeats, setClientSharedPassword,
} from '@/lib/db/admin-queries'
import { assignClientAdminAction, setMaxSeatsAction, setSharedPasswordAction } from './client-access'
import { inviteTeammateAction, removeTeammateAction } from './team'

const mock = (f: unknown) => f as ReturnType<typeof vi.fn>
const signedInAs = (role: string, clientSlug: string | null = null) =>
  mock(auth).mockResolvedValue({ user: { role, clientSlug, email: 'admin@acme.example' } })
const OVERVIEW = {
  clientId: 'client-uuid', slug: 'acme', name: 'Acme', maxSeats: 5, hasPassword: true,
  users: [
    { id: 'admin-id', email: 'admin@acme.example', role: 'CLIENT_ADMIN' },
    { id: 'viewer-id', email: 'viewer@acme.example', role: 'CLIENT_VIEWER' },
  ],
}

/** updateTag('db') was called exactly once, and after `write`. */
function expiredOnceAfter(write: unknown) {
  expect(updateTag).toHaveBeenCalledTimes(1)
  expect(updateTag).toHaveBeenCalledWith('db')
  expect(mock(updateTag).mock.invocationCallOrder[0]).toBeGreaterThan(mock(write).mock.invocationCallOrder[0])
}

beforeEach(() => {
  vi.clearAllMocks()
  mock(getClientAccessOverview).mockResolvedValue(OVERVIEW)
})

test('setting the shared password expires the db tag once, after the write', async () => {
  signedInAs('INTERNAL_ADMIN')
  expect(await setSharedPasswordAction('acme', 'long-enough')).toEqual({ ok: true })
  expiredOnceAfter(setClientSharedPassword)
})

test('a refused password writes nothing and expires nothing', async () => {
  signedInAs('INTERNAL_ADMIN')
  expect((await setSharedPasswordAction('acme', 'short')).ok).toBe(false)
  expect(setClientSharedPassword).not.toHaveBeenCalled()
  expect(updateTag).not.toHaveBeenCalled()
})

test('a new seat limit expires the db tag once, after the write', async () => {
  signedInAs('INTERNAL_ADMIN')
  mock(setClientMaxSeats).mockResolvedValue({ ok: true })
  expect(await setMaxSeatsAction('acme', 10)).toEqual({ ok: true })
  expiredOnceAfter(setClientMaxSeats)
})

test('a seat limit below the current users is not written, so nothing is expired', async () => {
  signedInAs('INTERNAL_ADMIN')
  mock(setClientMaxSeats).mockResolvedValue({ ok: false, reason: 'below_current_count' })
  expect((await setMaxSeatsAction('acme', 1)).ok).toBe(false)
  expect(updateTag).not.toHaveBeenCalled()
})

test('assigning the client admin expires the db tag once, after the insert', async () => {
  signedInAs('INTERNAL_ADMIN')
  mock(addClientUser).mockResolvedValue({ ok: true })
  expect((await assignClientAdminAction('acme', 'boss@acme.example')).ok).toBe(true)
  expiredOnceAfter(addClientUser)
})

test.each(['duplicate', 'seat_limit'] as const)('an admin assignment refused as %s expires nothing', async (reason) => {
  signedInAs('INTERNAL_ADMIN')
  mock(addClientUser).mockResolvedValue({ ok: false, reason })
  expect((await assignClientAdminAction('acme', 'boss@acme.example')).ok).toBe(false)
  expect(updateTag).not.toHaveBeenCalled()
})

test('inviting a teammate expires the db tag once, after the insert', async () => {
  signedInAs('CLIENT_ADMIN', 'acme')
  mock(addClientUser).mockResolvedValue({ ok: true })
  expect((await inviteTeammateAction('acme', 'new@acme.example')).ok).toBe(true)
  expiredOnceAfter(addClientUser)
})

test.each(['duplicate', 'seat_limit'] as const)('an invite refused as %s expires nothing', async (reason) => {
  signedInAs('CLIENT_ADMIN', 'acme')
  mock(addClientUser).mockResolvedValue({ ok: false, reason })
  expect((await inviteTeammateAction('acme', 'new@acme.example')).ok).toBe(false)
  expect(updateTag).not.toHaveBeenCalled()
})

test('removing a teammate expires the db tag once, after the delete', async () => {
  signedInAs('CLIENT_ADMIN', 'acme')
  mock(removeClientUser).mockResolvedValue({ ok: true })
  expect(await removeTeammateAction('acme', 'viewer-id')).toEqual({ ok: true })
  expiredOnceAfter(removeClientUser)
})

test('a removal that deletes nothing expires nothing', async () => {
  signedInAs('CLIENT_ADMIN', 'acme')
  mock(removeClientUser).mockResolvedValue({ ok: false, reason: 'not_found' })
  expect((await removeTeammateAction('acme', 'viewer-id')).ok).toBe(false)
  expect(updateTag).not.toHaveBeenCalled()
})

test('a removal the guards refuse (an admin seat) deletes nothing and expires nothing', async () => {
  signedInAs('CLIENT_ADMIN', 'acme')
  expect((await removeTeammateAction('acme', 'admin-id')).ok).toBe(false)
  expect(removeClientUser).not.toHaveBeenCalled()
  expect(updateTag).not.toHaveBeenCalled()
})
