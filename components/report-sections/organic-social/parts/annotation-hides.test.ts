import { beforeEach, expect, test, vi } from 'vitest'

// `withHides` decides what a client is allowed to see, so its failure modes are the point of
// this file. Both collaborators are stubbed: the client lookup and the hides read. Neither
// reaches a database.
const { getClientBySlug } = vi.hoisted(() => ({ getClientBySlug: vi.fn() }))
const { getAnnotationHides } = vi.hoisted(() => ({ getAnnotationHides: vi.fn() }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug }))
vi.mock('@/lib/organic-social/annotation-hides/select', () => ({ getAnnotationHides }))

import { withHides } from './annotation-hides'
import type { Annotation } from '@/lib/organic-social/annotations'

// All numbers are made up.
const A = (date: string): Annotation =>
  ({ date, value: 50, label: `${date} | 50 Engagements`, post: null }) as unknown as Annotation
const ITEMS = [A('2026-08-10'), A('2026-08-22')]
const ARGS = { clientSlug: 'a-client', channel: 'INSTAGRAM' as const, chart: 'engagements' as const, items: ITEMS }

let err: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  getClientBySlug.mockReset()
  getAnnotationHides.mockReset().mockResolvedValue(new Set<string>())
  err = vi.spyOn(console, 'error').mockImplementation(() => {})
})

// THE POINT OF THIS FILE. Without a client row the hides cannot be read at all, so there is no
// way to know which annotations the team hid. Failing open would show a client every annotation
// including the hidden ones, which is the one outcome the feature exists to prevent. Reverting
// the `if (!client) throw` in annotation-hides.ts makes this test fail.
test('no client row: a client gets no annotations at all, rather than every one of them', async () => {
  getClientBySlug.mockResolvedValue(null)
  const r = await withHides({ ...ARGS, role: 'CLIENT_VIEWER' })
  expect(r.items).toEqual([])
  expect(r.controls).toBeUndefined()
  expect(getAnnotationHides).not.toHaveBeenCalled()
  expect(err).toHaveBeenCalledTimes(1)
  expect(String(err.mock.calls[0][0])).toContain('annotation hides unreadable')
})

test('no client row: staff still see every annotation, but without the controls to change them', async () => {
  getClientBySlug.mockResolvedValue(null)
  const r = await withHides({ ...ARGS, role: 'INTERNAL_ADMIN' })
  expect(r.items).toEqual(ITEMS)
  expect(r.controls).toBeUndefined()
})

// The same fail-closed rule, reached the other way: the row exists and the hides read throws.
test('an unreadable hides table fails the same way as a missing client row', async () => {
  getClientBySlug.mockResolvedValue({ id: 'client-uuid' })
  getAnnotationHides.mockRejectedValue(new Error('relation does not exist'))
  expect((await withHides({ ...ARGS, role: 'CLIENT_VIEWER' })).items).toEqual([])
  expect((await withHides({ ...ARGS, role: 'INTERNAL_ADMIN' })).items).toEqual(ITEMS)
})

test('nothing to hide: no client row is looked up and no read is made', async () => {
  const r = await withHides({ ...ARGS, items: [], role: 'CLIENT_VIEWER' })
  expect(r.items).toEqual([])
  expect(getClientBySlug).not.toHaveBeenCalled()
  expect(getAnnotationHides).not.toHaveBeenCalled()
})

test('the happy path still applies the hides and gives staff their controls', async () => {
  getClientBySlug.mockResolvedValue({ id: 'client-uuid' })
  // The set is keyed by chart and day together (hideKey), not by day alone.
  getAnnotationHides.mockResolvedValue(new Set(['engagements|2026-08-22']))
  const client = await withHides({ ...ARGS, role: 'CLIENT_VIEWER' })
  expect(client.items.map((i) => i.date)).toEqual(['2026-08-10'])
  expect(client.controls).toBeUndefined()
  const staff = await withHides({ ...ARGS, role: 'INTERNAL_ADMIN' })
  expect(staff.items.map((i) => i.date)).toEqual(['2026-08-10', '2026-08-22'])
  expect(staff.controls).toEqual({ clientSlug: 'a-client', channel: 'INSTAGRAM', chart: 'engagements' })
})
