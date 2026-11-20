// @vitest-environment node
// The featured post and screenshot actions (spec sections 8 and 10). The store is replaced; every rule in the action
// (who, which client, which row, the caps) is exercised here. The store's own SQL is proven on real Postgres in
// lib/organic-social/social-listening/store.pglite.test.ts.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('next/cache', () => ({ revalidateTag: vi.fn(), updateTag: vi.fn() }))
const h = vi.hoisted(() => ({
  client: (cfg: Record<string, unknown> = {}, over: Record<string, unknown> = {}) => ({
    id: 'client-uuid', slug: 'a-client', hiddenReports: [], enabledReports: ['organic-social'],
    dashSocialConfig: { brandId: 1, reportingMonths: { firstMonth: '2026-08' }, socialListening: { enabled: true, brandTopic: 'Made Up Brand' }, ...cfg },
    ...over,
  }),
}))
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn(async () => h.client()) }))
vi.mock('@/lib/organic-social/social-listening/store', () => ({
  insertUpload: vi.fn(),
  findPost: vi.fn(), countApprovedPosts: vi.fn(async () => 0), findImageOwner: vi.fn(),
  insertPost: vi.fn(async () => ({ id: NEW })), updatePostDraft: vi.fn(async () => true),
  forkPostDraft: vi.fn(async () => ({ ok: true, id: FORK })), approvePost: vi.fn(async () => true),
  revokePost: vi.fn(async () => true), softDeletePostDraft: vi.fn(async () => true),
  insertImage: vi.fn(async () => ({ id: IMG })), deleteImage: vi.fn(async () => true),
}))
const { NEW, FORK, IMG } = vi.hoisted(() => ({
  NEW: '0a000000-0000-4000-8000-000000000001', FORK: '0a000000-0000-4000-8000-000000000002', IMG: '0a000000-0000-4000-8000-000000000003',
}))

import { auth } from '@/auth'
import { getClientBySlug } from '@/lib/db/queries'
import * as store from '@/lib/organic-social/social-listening/store'
import {
  addPostImageAction, approvePostAction, deletePostDraftAction, removePostImageAction, revokePostAction, savePostAction,
} from './social-listening'

const as = (role: string, email: string | null) => (auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ user: { role, email } })
const WRITER = () => as('INTERNAL_ANALYST', 'writer@avenuez.com')
const APPROVER = () => as('INTERNAL_ADMIN', 'approver@avenuez.com')
const ID = '0b000000-0000-4000-8000-000000000001'
const OCT = 'custom:2026-10-01,2026-10-31'
const POST = { group: 'social', platform: 'Facebook', author: 'Made-up author', url: 'https://example.com/p/1', engagements: 3, sentiment: 'Positive', note: 'Made-up note', position: 0 }
const row = (over: Record<string, unknown> = {}) => ({
  id: ID, clientId: 'client-uuid', month: '2026-10', status: 'draft', replacesId: null, replacedAt: null, deletedAt: null, ...over,
})
const FORBIDDEN = { ok: false, error: 'forbidden' }
const NOT_FOUND = { ok: false, error: 'not found' }
const CHANGED = { ok: false, error: 'This post changed since you opened the page. Reload to see it.' }
const writes = () => [store.insertPost, store.updatePostDraft, store.forkPostDraft, store.approvePost, store.revokePost, store.softDeletePostDraft, store.insertImage, store.deleteImage]

function jpeg(width: number, height: number, pad = 0): Uint8Array {
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]
  const com = pad ? [0xff, 0xfe, (pad + 2) >> 8, (pad + 2) & 0xff, ...new Array(pad).fill(0x20)] : []
  return new Uint8Array([0xff, 0xd8, ...com, ...sof, 0xff, 0xd9])
}
function imageForm(over: { postId?: string; bytes?: Uint8Array; print?: Uint8Array; clientSlug?: string } = {}) {
  const f = new FormData()
  f.set('clientSlug', over.clientSlug ?? 'a-client')
  f.set('postId', over.postId ?? ID)
  f.set('bytes', new File([new Uint8Array(over.bytes ?? jpeg(1200, 800))], 'a.jpg', { type: 'image/jpeg' }))
  f.set('print', new File([new Uint8Array(over.print ?? jpeg(600, 400))], 'a-print.jpg', { type: 'image/jpeg' }))
  return f
}

let error: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-19T15:00:00Z'))
  process.env.COMMENTARY_APPROVERS = 'approver@avenuez.com'
  error = vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(store.findPost).mockReset().mockResolvedValue(row() as never)
  vi.mocked(store.countApprovedPosts).mockReset().mockResolvedValue(0)
})
afterEach(() => { vi.useRealTimers(); delete process.env.COMMENTARY_APPROVERS; error.mockRestore() })

describe('who', () => {
  test('a client role is refused by every action, even with an approver email; nothing is read or written', async () => {
    as('CLIENT_ADMIN', 'approver@avenuez.com')
    expect(await savePostAction({ clientSlug: 'a-client', range: OCT, post: POST })).toEqual(FORBIDDEN)
    expect(await approvePostAction({ clientSlug: 'a-client', id: ID })).toEqual(FORBIDDEN)
    expect(await revokePostAction({ clientSlug: 'a-client', id: ID })).toEqual(FORBIDDEN)
    expect(await deletePostDraftAction({ clientSlug: 'a-client', id: ID })).toEqual(FORBIDDEN)
    expect(await addPostImageAction(imageForm())).toEqual(FORBIDDEN)
    expect(await removePostImageAction({ clientSlug: 'a-client', imageId: IMG })).toEqual(FORBIDDEN)
    expect(getClientBySlug).not.toHaveBeenCalled()
    for (const w of writes()) expect(w).not.toHaveBeenCalled()
  })
  test('staff who are not approvers write but never approve or revoke', async () => {
    WRITER()
    expect(await approvePostAction({ clientSlug: 'a-client', id: ID })).toEqual(FORBIDDEN)
    expect(await revokePostAction({ clientSlug: 'a-client', id: ID })).toEqual(FORBIDDEN)
    expect((await savePostAction({ clientSlug: 'a-client', range: OCT, post: POST })).ok).toBe(true)
  })
  test('the setting is re-checked: a client without the tab is refused', async () => {
    WRITER()
    vi.mocked(getClientBySlug).mockResolvedValueOnce(h.client({ socialListening: undefined }) as never)
    expect(await savePostAction({ clientSlug: 'a-client', range: OCT, post: POST })).toEqual({ ok: false, error: 'Social listening is not on for this client.' })
  })
})

describe('savePostAction', () => {
  beforeEach(WRITER)
  test('a new post is a draft in the served finished month', async () => {
    expect(await savePostAction({ clientSlug: 'a-client', range: OCT, post: POST })).toEqual({ ok: true, id: NEW })
    expect(vi.mocked(store.insertPost).mock.calls[0][0]).toMatchObject({ clientId: 'client-uuid', month: '2026-10', by: 'writer@avenuez.com', note: 'Made-up note' })
  })
  test('a new post in the live month is refused', async () => {
    expect(await savePostAction({ clientSlug: 'a-client', range: 'custom:2026-11-01,2026-11-18', post: POST })).toEqual({ ok: false, error: 'Upload opens when November 2026 ends.' })
  })
  test('the fields are validated first', async () => {
    expect(await savePostAction({ clientSlug: 'a-client', range: OCT, post: { ...POST, url: 'http://x.test' } })).toEqual({ ok: false, error: 'The link must start with https://.' })
    expect(store.insertPost).not.toHaveBeenCalled()
  })
  test('a draft is edited in place', async () => {
    expect(await savePostAction({ clientSlug: 'a-client', id: ID, post: POST })).toEqual({ ok: true, id: ID })
    expect(vi.mocked(store.updatePostDraft).mock.calls[0][0]).toBe(ID)
  })
  test('editing an approved post forks a draft (its image rows copied by the store)', async () => {
    vi.mocked(store.findPost).mockResolvedValueOnce(row({ status: 'approved' }) as never)
    expect(await savePostAction({ clientSlug: 'a-client', id: ID, post: POST })).toEqual({ ok: true, id: FORK })
    expect(vi.mocked(store.forkPostDraft).mock.calls[0][0]).toBe(ID)
  })
  test('a second edit of an approved post while one is open says so', async () => {
    vi.mocked(store.findPost).mockResolvedValueOnce(row({ status: 'approved' }) as never)
    vi.mocked(store.forkPostDraft).mockResolvedValueOnce({ ok: false, reason: 'open-draft', draftId: FORK })
    expect(await savePostAction({ clientSlug: 'a-client', id: ID, post: POST })).toEqual({ ok: false, error: 'This post already has an open edit. Reload to see it.' })
  })
  test('another client\'s post, a deleted or replaced one, or a bad id is not found or changed', async () => {
    vi.mocked(store.findPost).mockResolvedValueOnce(row({ clientId: 'other' }) as never)
    expect(await savePostAction({ clientSlug: 'a-client', id: ID, post: POST })).toEqual(NOT_FOUND)
    vi.mocked(store.findPost).mockResolvedValueOnce(row({ deletedAt: new Date() }) as never)
    expect(await savePostAction({ clientSlug: 'a-client', id: ID, post: POST })).toEqual(NOT_FOUND)
    vi.mocked(store.findPost).mockResolvedValueOnce(row({ status: 'approved', replacedAt: new Date() }) as never)
    expect(await savePostAction({ clientSlug: 'a-client', id: ID, post: POST })).toEqual(CHANGED)
    expect(await savePostAction({ clientSlug: 'a-client', id: 'nope', post: POST })).toEqual(NOT_FOUND)
    expect(store.updatePostDraft).not.toHaveBeenCalled()
    expect(store.forkPostDraft).not.toHaveBeenCalled()
  })
  test('a draft approved or deleted since the page opened', async () => {
    vi.mocked(store.updatePostDraft).mockResolvedValueOnce(false)
    expect(await savePostAction({ clientSlug: 'a-client', id: ID, post: POST })).toEqual(CHANGED)
  })
  test('a failed write says so and logs the code only', async () => {
    vi.mocked(store.insertPost).mockRejectedValueOnce(Object.assign(new Error('Failing row contains (private)'), { code: '23514' }))
    expect(await savePostAction({ clientSlug: 'a-client', range: OCT, post: POST })).toEqual({ ok: false, error: 'Could not save. Try again.' })
    const line = error.mock.calls.map((c) => c.map(String).join(' ')).join('\n')
    expect(line).toBe('[social-listening] save post failed slug=a-client code=23514')
  })
})

describe('approve, revoke, delete', () => {
  test('approving a new post checks the month cap of 12 (R2-10)', async () => {
    APPROVER()
    vi.mocked(store.countApprovedPosts).mockResolvedValueOnce(11)
    expect(await approvePostAction({ clientSlug: 'a-client', id: ID })).toEqual({ ok: true })
    expect(vi.mocked(store.countApprovedPosts).mock.calls[0]).toEqual(['client-uuid', '2026-10'])
    vi.mocked(store.countApprovedPosts).mockResolvedValueOnce(12)
    expect(await approvePostAction({ clientSlug: 'a-client', id: ID })).toEqual({ ok: false, error: 'A month shows at most 12 posts. Revoke one first.' })
    expect(store.approvePost).toHaveBeenCalledTimes(1)
  })
  test('approving an edit of a current approved post swaps one for one, so the cap is not checked', async () => {
    APPROVER()
    vi.mocked(store.findPost)
      .mockResolvedValueOnce(row({ id: FORK, replacesId: ID }) as never)
      .mockResolvedValueOnce(row({ status: 'approved' }) as never)
    vi.mocked(store.countApprovedPosts).mockResolvedValue(12)
    expect(await approvePostAction({ clientSlug: 'a-client', id: FORK })).toEqual({ ok: true })
    expect(vi.mocked(store.approvePost).mock.calls[0]).toEqual([FORK, 'approver@avenuez.com'])
    expect(store.countApprovedPosts).not.toHaveBeenCalled()
  })
  test('approving an edit whose original was revoked meanwhile adds a post, so the cap is checked', async () => {
    APPROVER()
    vi.mocked(store.findPost)
      .mockResolvedValueOnce(row({ id: FORK, replacesId: ID }) as never)
      .mockResolvedValueOnce(row({ status: 'draft' }) as never)
    vi.mocked(store.countApprovedPosts).mockResolvedValueOnce(12)
    expect(await approvePostAction({ clientSlug: 'a-client', id: FORK })).toEqual({ ok: false, error: 'A month shows at most 12 posts. Revoke one first.' })
  })
  test('approving something no longer a draft', async () => {
    APPROVER()
    vi.mocked(store.findPost).mockResolvedValueOnce(row({ status: 'approved' }) as never)
    expect(await approvePostAction({ clientSlug: 'a-client', id: ID })).toEqual(CHANGED)
    vi.mocked(store.approvePost).mockResolvedValueOnce(false)
    expect(await approvePostAction({ clientSlug: 'a-client', id: ID })).toEqual(CHANGED)
  })
  test('revoke an approved, current post; anything else changed', async () => {
    APPROVER()
    vi.mocked(store.findPost).mockResolvedValueOnce(row({ status: 'approved' }) as never)
    expect(await revokePostAction({ clientSlug: 'a-client', id: ID })).toEqual({ ok: true })
    vi.mocked(store.findPost).mockResolvedValueOnce(row({ status: 'approved' }) as never)
    vi.mocked(store.revokePost).mockResolvedValueOnce(false)
    expect(await revokePostAction({ clientSlug: 'a-client', id: ID })).toEqual(CHANGED)
  })
  test('only drafts are deleted, by any staff writer', async () => {
    WRITER()
    expect(await deletePostDraftAction({ clientSlug: 'a-client', id: ID })).toEqual({ ok: true })
    expect(vi.mocked(store.softDeletePostDraft).mock.calls[0]).toEqual([ID, 'writer@avenuez.com'])
    vi.mocked(store.findPost).mockResolvedValueOnce(row({ status: 'approved' }) as never)
    expect(await deletePostDraftAction({ clientSlug: 'a-client', id: ID })).toEqual({ ok: false, error: 'Only drafts can be deleted.' })
  })
  test('a deleted draft frees the approved post for a new edit (R2-10): delete, then edit again forks', async () => {
    WRITER()
    vi.mocked(store.findPost).mockResolvedValueOnce(row({ id: FORK, replacesId: ID }) as never)
    expect(await deletePostDraftAction({ clientSlug: 'a-client', id: FORK })).toEqual({ ok: true })
    vi.mocked(store.findPost).mockResolvedValueOnce(row({ status: 'approved' }) as never)
    expect((await savePostAction({ clientSlug: 'a-client', id: ID, post: POST })).ok).toBe(true)
    expect(store.forkPostDraft).toHaveBeenCalledTimes(1)
  })
})

describe('screenshots', () => {
  beforeEach(WRITER)
  test('one image on a draft: both copies checked, the size read from the JPEG, at most 4', async () => {
    expect(await addPostImageAction(imageForm())).toEqual({ ok: true, id: IMG })
    expect(vi.mocked(store.insertImage).mock.calls[0][0]).toMatchObject({ postId: ID, width: 1200, height: 800, maxImages: 4 })
  })
  test('a fifth image is refused (the store checks the cap inside the insert)', async () => {
    vi.mocked(store.insertImage).mockResolvedValueOnce(null)
    expect(await addPostImageAction(imageForm())).toEqual({ ok: false, error: 'A post holds at most 4 images.' })
  })
  test('over 300 KB, a print copy over 60 KB, or not a JPEG is refused before storing (R2-12)', async () => {
    expect(await addPostImageAction(imageForm({ bytes: jpeg(10, 10, 300 * 1024) }))).toEqual({ ok: false, error: 'The image is over 300 KB.' })
    expect(await addPostImageAction(imageForm({ print: jpeg(10, 10, 60 * 1024) }))).toEqual({ ok: false, error: 'The print copy is over 60 KB.' })
    expect(await addPostImageAction(imageForm({ bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) }))).toEqual({ ok: false, error: 'The image must be a JPEG.' })
    expect(store.insertImage).not.toHaveBeenCalled()
  })
  test('images go on a draft of this client only', async () => {
    vi.mocked(store.findPost).mockResolvedValueOnce(row({ status: 'approved' }) as never)
    expect(await addPostImageAction(imageForm())).toEqual({ ok: false, error: 'Images are added to a draft. Edit the post first.' })
    vi.mocked(store.findPost).mockResolvedValueOnce(row({ clientId: 'other' }) as never)
    expect(await addPostImageAction(imageForm())).toEqual(NOT_FOUND)
    expect(store.insertImage).not.toHaveBeenCalled()
  })
  test('remove an image of this client\'s draft only', async () => {
    vi.mocked(store.findImageOwner).mockResolvedValueOnce({ postId: ID, clientId: 'client-uuid' })
    expect(await removePostImageAction({ clientSlug: 'a-client', imageId: IMG })).toEqual({ ok: true })
    vi.mocked(store.findImageOwner).mockResolvedValueOnce({ postId: ID, clientId: 'other' })
    expect(await removePostImageAction({ clientSlug: 'a-client', imageId: IMG })).toEqual(NOT_FOUND)
    vi.mocked(store.findImageOwner).mockResolvedValueOnce({ postId: ID, clientId: 'client-uuid' })
    vi.mocked(store.deleteImage).mockResolvedValueOnce(false)
    expect(await removePostImageAction({ clientSlug: 'a-client', imageId: IMG })).toEqual({ ok: false, error: 'Images are removed from a draft. Edit the post first.' })
    expect(await removePostImageAction({ clientSlug: 'a-client', imageId: 'nope' })).toEqual(NOT_FOUND)
  })
})
