import { afterEach, beforeEach, expect, test, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
// An October-shaped client: on locked months. Renaissance's config has no reportingMonths.
// vi.hoisted, because vi.mock is hoisted above every plain const in the file.
const { ON } = vi.hoisted(() => ({ ON: { id: 'client-uuid', dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' } } } }))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn(async () => ON) }))
vi.mock('@/lib/organic-social/chart-notes/mutations', async () => {
  const actual = await vi.importActual<typeof import('@/lib/organic-social/chart-notes/mutations')>(
    '@/lib/organic-social/chart-notes/mutations',
  )
  return {
    ...actual,
    findChartNote: vi.fn(), findOpenDraft: vi.fn(async () => undefined), insertDraft: vi.fn(async () => {}),
    updateDraft: vi.fn(async () => true), approveNote: vi.fn(async () => true),
    revokeNote: vi.fn(async () => true), softDeleteDraft: vi.fn(async () => true),
  }
})

import { auth } from '@/auth'
import { revalidateTag } from 'next/cache'
import { getClientBySlug } from '@/lib/db/queries'
import * as m from '@/lib/organic-social/chart-notes/mutations'
import { approveChartNoteAction, deleteChartNoteDraftAction, revokeChartNoteAction, saveChartNoteAction } from './chart-notes'

// Every slug, email, id and date is invented.
const ID = 'c7d8e0a1-1111-4111-8111-111111111111'
const OTHER = 'c7d8e0a1-2222-4222-8222-222222222222'
const INPUT = { clientSlug: 'a-client', channel: 'INSTAGRAM', chart: 'followers', day: '2026-08-14', body: '  Influencer post went live  ', postIds: [11] }
const session = (value: unknown) => (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(value)
const as = (role: string, email: string | null = 'writer@avenuez.com') => session({ user: { role, email } })
const ROW = { clientId: 'client-uuid', status: 'draft', deletedAt: null, channel: 'INSTAGRAM', chart: 'followers', day: '2026-08-14' }
// What the approver was shown on the card: the draft's text and picked posts.
const SEEN = { text: 'Influencer post went live', postIds: [11] }
const FORBIDDEN = { ok: false, error: 'forbidden' }
const writes = () => [m.insertDraft, m.updateDraft, m.approveNote, m.revokeNote, m.softDeleteDraft]

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-24T15:00:00Z'))
  process.env.CHART_NOTES_APPROVERS = 'approver@avenuez.com'
})
afterEach(() => { vi.useRealTimers(); delete process.env.CHART_NOTES_APPROVERS })

test('a client role is refused by every action, even with an @avenuez.com email', async () => {
  as('CLIENT_ADMIN', 'approver@avenuez.com')
  expect(await saveChartNoteAction(INPUT)).toEqual(FORBIDDEN)
  expect(await approveChartNoteAction('a-client', ID, SEEN)).toEqual(FORBIDDEN)
  expect(await revokeChartNoteAction('a-client', ID)).toEqual(FORBIDDEN)
  expect(await deleteChartNoteDraftAction('a-client', ID)).toEqual(FORBIDDEN)
  for (const w of writes()) expect(w).not.toHaveBeenCalled()
})

test('a client not on locked months, shaped like Renaissance, is refused by every action; nothing is read or written', async () => {
  as('INTERNAL_ADMIN', 'approver@avenuez.com')
  const renaissanceShaped = { id: 'another-uuid', dashSocialConfig: { brandId: 1 } }
  for (let i = 0; i < 4; i++) vi.mocked(getClientBySlug).mockResolvedValueOnce(renaissanceShaped as never)
  const NOT_ON = { ok: false, error: 'Notes are not on for this client.' }
  expect(await saveChartNoteAction(INPUT)).toEqual(NOT_ON)
  expect(await approveChartNoteAction('a-client', ID, SEEN)).toEqual(NOT_ON)
  expect(await revokeChartNoteAction('a-client', ID)).toEqual(NOT_ON)
  expect(await deleteChartNoteDraftAction('a-client', ID)).toEqual(NOT_ON)
  expect(m.findOpenDraft).not.toHaveBeenCalled()
  expect(m.findChartNote).not.toHaveBeenCalled()
  for (const w of writes()) expect(w).not.toHaveBeenCalled()
})

test('no session, or a team session with no email, is refused', async () => {
  session(null)
  expect(await saveChartNoteAction(INPUT)).toEqual(FORBIDDEN)
  as('INTERNAL_ADMIN', null)
  expect(await saveChartNoteAction(INPUT)).toEqual(FORBIDDEN)
  for (const w of writes()) expect(w).not.toHaveBeenCalled()
})

test('save: malformed or future input is refused before any read or write', async () => {
  as('INTERNAL_ANALYST')
  expect(await saveChartNoteAction({ ...INPUT, day: '2026-09-25' })).toEqual({ ok: false, error: 'That day has not happened yet.' })
  expect(await saveChartNoteAction({ ...INPUT, clientSlug: ' ' })).toEqual({ ok: false, error: 'invalid client' })
  expect(await saveChartNoteAction({ ...INPUT, postIds: [1, 2, 3] })).toEqual({ ok: false, error: 'Pick at most 2 posts.' })
  expect(getClientBySlug).not.toHaveBeenCalled()
  expect(m.findOpenDraft).not.toHaveBeenCalled()
})

test('save: an unknown client is refused', async () => {
  as('INTERNAL_ANALYST')
  vi.mocked(getClientBySlug).mockResolvedValueOnce(undefined as never)
  expect(await saveChartNoteAction(INPUT)).toEqual({ ok: false, error: 'client not found' })
  expect(m.insertDraft).not.toHaveBeenCalled()
})

test('save: with no open draft, a trimmed draft is created by the signed-in editor, then the page refreshes', async () => {
  as('INTERNAL_ANALYST')
  expect(await saveChartNoteAction(INPUT)).toEqual({ ok: true })
  expect(m.insertDraft).toHaveBeenCalledWith({
    clientId: 'client-uuid', channel: 'INSTAGRAM', chart: 'followers', day: '2026-08-14',
    body: 'Influencer post went live', postIds: [11], by: 'writer@avenuez.com',
  })
  expect(revalidateTag).toHaveBeenCalledWith('db', 'max')
})

test('save: with an open draft, that draft is edited in place', async () => {
  as('INTERNAL_ANALYST')
  vi.mocked(m.findOpenDraft).mockResolvedValueOnce({ id: ID })
  expect(await saveChartNoteAction(INPUT)).toEqual({ ok: true })
  expect(m.updateDraft).toHaveBeenCalledWith(ID, { body: 'Influencer post went live', postIds: [11], by: 'writer@avenuez.com' })
  expect(m.insertDraft).not.toHaveBeenCalled()
})

test('save: a draft deleted between the read and the write is reported, not faked', async () => {
  as('INTERNAL_ANALYST')
  vi.mocked(m.findOpenDraft).mockResolvedValueOnce({ id: ID })
  vi.mocked(m.updateDraft).mockResolvedValueOnce(false)
  expect(await saveChartNoteAction(INPUT)).toEqual({ ok: false, error: 'not found' })
  expect(revalidateTag).not.toHaveBeenCalled()
})

test('save: losing the race for the day\'s one open draft is a clear message, not a thrown error', async () => {
  as('INTERNAL_ANALYST')
  vi.mocked(m.insertDraft).mockRejectedValueOnce({ message: 'query failed', cause: { code: '23505', constraint: 'chart_notes_one_open_draft' } })
  expect(await saveChartNoteAction(INPUT)).toEqual({ ok: false, error: 'A draft is already open on this day. Reload to see it.' })
})

test('save: any other database error still surfaces', async () => {
  as('INTERNAL_ANALYST')
  vi.mocked(m.insertDraft).mockRejectedValueOnce(new Error('connection reset'))
  await expect(saveChartNoteAction(INPUT)).rejects.toThrow('connection reset')
})

test('approve: an editor who is not on the approvers list is refused', async () => {
  as('INTERNAL_ADMIN', 'writer@avenuez.com')
  expect(await approveChartNoteAction('a-client', ID, SEEN)).toEqual(FORBIDDEN)
  expect(m.approveNote).not.toHaveBeenCalled()
})

test('approve: a malformed id, another client\'s note or a deleted note is "not found"', async () => {
  as('INTERNAL_ADMIN', 'approver@avenuez.com')
  expect(await approveChartNoteAction('a-client', 'nope', SEEN)).toEqual({ ok: false, error: 'not found' })
  expect(m.findChartNote).not.toHaveBeenCalled()
  vi.mocked(m.findChartNote).mockResolvedValueOnce({ ...ROW, clientId: 'someone-else' } as never)
  expect(await approveChartNoteAction('a-client', ID, SEEN)).toEqual({ ok: false, error: 'not found' })
  vi.mocked(m.findChartNote).mockResolvedValueOnce({ ...ROW, deletedAt: new Date() } as never)
  expect(await approveChartNoteAction('a-client', ID, SEEN)).toEqual({ ok: false, error: 'not found' })
  expect(m.approveNote).not.toHaveBeenCalled()
})

test('approve: a malformed "what I saw" is refused before any read', async () => {
  as('INTERNAL_ADMIN', 'approver@avenuez.com')
  for (const bad of [null, { text: 1, postIds: [] }, { text: 'x', postIds: [1, 2, 3] }, { text: 'x', postIds: ['1'] }]) {
    expect(await approveChartNoteAction('a-client', ID, bad as never)).toEqual({ ok: false, error: 'not found' })
  }
  expect(m.findChartNote).not.toHaveBeenCalled()
})

test('approve: an approver approves exactly what they were shown, stamped with their email', async () => {
  as('INTERNAL_ADMIN', 'approver@avenuez.com')
  vi.mocked(m.findChartNote).mockResolvedValueOnce(ROW as never)
  expect(await approveChartNoteAction('a-client', ID, SEEN)).toEqual({ ok: true })
  expect(m.approveNote).toHaveBeenCalledWith(ID, 'approver@avenuez.com', SEEN)
  expect(revalidateTag).toHaveBeenCalledWith('db', 'max')
})

test('approve: a note edited after the approver opened the page is not approved', async () => {
  as('INTERNAL_ADMIN', 'approver@avenuez.com')
  vi.mocked(m.findChartNote).mockResolvedValueOnce(ROW as never)
  vi.mocked(m.approveNote).mockResolvedValueOnce(false)
  expect(await approveChartNoteAction('a-client', ID, SEEN)).toEqual({ ok: false, error: 'This note changed since you opened the page. Reload to see it.' })
  expect(revalidateTag).not.toHaveBeenCalled()
})

test('revoke: refused while another draft is open on that day, so a day never holds two', async () => {
  as('INTERNAL_ADMIN', 'approver@avenuez.com')
  vi.mocked(m.findChartNote).mockResolvedValueOnce({ ...ROW, status: 'approved' } as never)
  vi.mocked(m.findOpenDraft).mockResolvedValueOnce({ id: OTHER })
  expect(await revokeChartNoteAction('a-client', ID)).toEqual({ ok: false, error: 'A draft is already open on this day. Delete or approve it first.' })
  expect(m.revokeNote).not.toHaveBeenCalled()
})

test('revoke: an approved note returns to draft', async () => {
  as('INTERNAL_ADMIN', 'approver@avenuez.com')
  vi.mocked(m.findChartNote).mockResolvedValueOnce({ ...ROW, status: 'approved' } as never)
  expect(await revokeChartNoteAction('a-client', ID)).toEqual({ ok: true })
  expect(m.findOpenDraft).toHaveBeenCalledWith({ clientId: 'client-uuid', channel: 'INSTAGRAM', chart: 'followers', day: '2026-08-14' })
  expect(m.revokeNote).toHaveBeenCalledWith(ID)
})

test('revoke: a draft racing in between is caught by the index and reported', async () => {
  as('INTERNAL_ADMIN', 'approver@avenuez.com')
  vi.mocked(m.findChartNote).mockResolvedValueOnce({ ...ROW, status: 'approved' } as never)
  vi.mocked(m.revokeNote).mockRejectedValueOnce({ code: '23505', constraint: 'chart_notes_one_open_draft' })
  expect(await revokeChartNoteAction('a-client', ID)).toEqual({ ok: false, error: 'A draft is already open on this day. Delete or approve it first.' })
})

test('delete: only a draft, soft deleted by the signed-in editor', async () => {
  as('INTERNAL_ANALYST')
  vi.mocked(m.findChartNote).mockResolvedValueOnce({ ...ROW, status: 'approved' } as never)
  expect(await deleteChartNoteDraftAction('a-client', ID)).toEqual({ ok: false, error: 'Only drafts can be deleted.' })
  vi.mocked(m.findChartNote).mockResolvedValueOnce(ROW as never)
  expect(await deleteChartNoteDraftAction('a-client', ID)).toEqual({ ok: true })
  expect(m.softDeleteDraft).toHaveBeenCalledWith(ID, 'writer@avenuez.com')
})

test('delete: a second delete of the same draft is "not found", not a false success', async () => {
  as('INTERNAL_ANALYST')
  vi.mocked(m.findChartNote).mockResolvedValueOnce(ROW as never)
  vi.mocked(m.softDeleteDraft).mockResolvedValueOnce(false)
  expect(await deleteChartNoteDraftAction('a-client', ID)).toEqual({ ok: false, error: 'not found' })
})
