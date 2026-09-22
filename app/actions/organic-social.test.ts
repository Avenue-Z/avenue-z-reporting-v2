import { beforeEach, expect, test, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn(async () => ({ id: 'client-uuid' })) }))
vi.mock('@/lib/organic-social/annotation-hides/mutations', async () => {
  const actual = await vi.importActual<typeof import('@/lib/organic-social/annotation-hides/mutations')>(
    '@/lib/organic-social/annotation-hides/mutations',
  )
  return { ...actual, setAnnotationHidden: vi.fn(async () => {}) }
})

import { auth } from '@/auth'
import { revalidateTag } from 'next/cache'
import { getClientBySlug } from '@/lib/db/queries'
import { setAnnotationHidden } from '@/lib/organic-social/annotation-hides/mutations'
import { setAnnotationHiddenAction } from './organic-social'

const INPUT = { clientSlug: 'a-client', channel: 'INSTAGRAM', chart: 'followers', day: '2026-08-10', hidden: true }
const session = (value: unknown) => (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(value)
const signedInAs = (role: string) => session({ user: { role, email: 'someone@avenuez.com' } })

beforeEach(() => vi.clearAllMocks())

test('a client role is refused, and nothing is written', async () => {
  signedInAs('CLIENT_ADMIN')
  expect(await setAnnotationHiddenAction(INPUT)).toEqual({ ok: false, error: 'forbidden' })
  expect(setAnnotationHidden).not.toHaveBeenCalled()
})

test('no session is refused', async () => {
  session(null)
  expect(await setAnnotationHiddenAction(INPUT)).toEqual({ ok: false, error: 'forbidden' })
  expect(setAnnotationHidden).not.toHaveBeenCalled()
})

test('malformed input is refused before any write', async () => {
  signedInAs('INTERNAL_ADMIN')
  expect(await setAnnotationHiddenAction({ ...INPUT, day: '2026-02-30' })).toEqual({ ok: false, error: 'invalid day' })
  expect(setAnnotationHidden).not.toHaveBeenCalled()
})

test('an unknown client is refused', async () => {
  signedInAs('INTERNAL_ADMIN')
  vi.mocked(getClientBySlug).mockResolvedValueOnce(undefined as never)
  expect(await setAnnotationHiddenAction(INPUT)).toEqual({ ok: false, error: 'client not found' })
  expect(setAnnotationHidden).not.toHaveBeenCalled()
})

test('internal staff hide an annotation: one write, then the page data refreshes', async () => {
  signedInAs('INTERNAL_ANALYST')
  expect(await setAnnotationHiddenAction(INPUT)).toEqual({ ok: true })
  expect(setAnnotationHidden).toHaveBeenCalledWith({
    clientId: 'client-uuid', channel: 'INSTAGRAM', chart: 'followers', day: '2026-08-10', hidden: true, setBy: 'someone@avenuez.com',
  })
  expect(revalidateTag).toHaveBeenCalledWith('db', 'max')
})
