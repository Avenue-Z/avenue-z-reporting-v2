import { expect, test } from 'vitest'
import type { ChartNote } from '@/lib/db/schema'
import { latestApproved, notesByDay } from './pick'

// Every date and text is invented.
const t = (iso: string) => new Date(iso)
const row = (over: Partial<ChartNote>): ChartNote => ({
  id: 'n1', clientId: 'client-uuid', channel: 'INSTAGRAM', chart: 'followers', day: '2026-08-14',
  body: 'Event', postIds: [], status: 'approved', createdBy: 'a@avenuez.com', updatedBy: 'a@avenuez.com',
  approvedBy: 'b@avenuez.com', createdAt: t('2026-09-01T00:00:00Z'), updatedAt: t('2026-09-01T00:00:00Z'),
  approvedAt: t('2026-09-01T00:00:00Z'), deletedAt: null, deletedBy: null, ...over,
})
const WINDOW = { chart: 'followers' as const, from: '2026-08-01', to: '2026-08-31' }

test('a client sees the most recently approved note of a day, and nothing else', () => {
  const rows = [
    row({ id: 'old', body: 'Old', approvedAt: t('2026-09-01T00:00:00Z') }),
    row({ id: 'new', body: 'New', approvedAt: t('2026-09-02T00:00:00Z') }),
    row({ id: 'd', body: 'Draft', status: 'draft', approvedAt: null, approvedBy: null }),
  ]
  const m = notesByDay(rows, { ...WINDOW, canEdit: false })
  expect([...m.keys()]).toEqual(['2026-08-14'])
  expect(m.get('2026-08-14')).toEqual({ approved: { id: 'new', text: 'New', postIds: [] } })
})

test('a day with only a draft does not exist for a client', () => {
  const rows = [row({ status: 'draft', approvedAt: null, approvedBy: null })]
  expect(notesByDay(rows, { ...WINDOW, canEdit: false }).size).toBe(0)
})

test('an editor sees the approved note, the open draft and the ids to act on them', () => {
  const rows = [
    row({ id: 'a', body: 'Live', postIds: [11] }),
    row({ id: 'd', body: 'Better', postIds: [12], status: 'draft', approvedAt: null, approvedBy: null }),
  ]
  expect(notesByDay(rows, { ...WINDOW, canEdit: true }).get('2026-08-14')).toEqual({
    approved: { id: 'a', text: 'Live', postIds: [11] },
    editor: { approvedId: 'a', approvedPostIds: [11], draft: { id: 'd', text: 'Better', postIds: [12] } },
  })
})

test('a draft-only day exists for an editor, with no approved text', () => {
  const rows = [row({ id: 'd', status: 'draft', approvedAt: null, approvedBy: null })]
  expect(notesByDay(rows, { ...WINDOW, canEdit: true }).get('2026-08-14')).toEqual({
    approved: null,
    editor: { approvedId: null, approvedPostIds: [], draft: { id: 'd', text: 'Event', postIds: [] } },
  })
})

test('revoking the newest approval falls back to the one before it, as Commentary does', () => {
  // A revoked note is a draft again (status draft, approval cleared), so the older approval shows.
  const rows = [
    row({ id: 'old', body: 'Old', approvedAt: t('2026-09-01T00:00:00Z') }),
    row({ id: 'revoked', body: 'New', status: 'draft', approvedAt: null, approvedBy: null }),
  ]
  expect(notesByDay(rows, { ...WINDOW, canEdit: false }).get('2026-08-14')?.approved?.text).toBe('Old')
})

test('only this chart, only inside the window, never a deleted row', () => {
  const rows = [
    row({ id: 'eng', chart: 'engagements' }),
    row({ id: 'before', day: '2026-07-31' }),
    row({ id: 'after', day: '2026-09-01' }),
    row({ id: 'gone', status: 'draft', approvedAt: null, deletedAt: t('2026-09-03T00:00:00Z') }),
    row({ id: 'first', day: '2026-08-01' }),
    row({ id: 'last', day: '2026-08-31' }),
  ]
  expect([...notesByDay(rows, { ...WINDOW, canEdit: true }).keys()]).toEqual(['2026-08-01', '2026-08-31'])
})

test('an equal approval time breaks on the later update, so the answer never depends on row order', () => {
  const a = row({ id: 'a', updatedAt: t('2026-09-01T00:00:00Z') })
  const b = row({ id: 'b', updatedAt: t('2026-09-01T00:00:01Z') })
  expect(latestApproved([a, b])?.id).toBe('b')
  expect(latestApproved([b, a])?.id).toBe('b')
  expect(latestApproved([])).toBeNull()
})
