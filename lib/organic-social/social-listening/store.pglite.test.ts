// @vitest-environment node
// The store's SQL against a real Postgres engine (PGlite, in memory): the migration 0030 is applied as generated, then
// every read and write in store.ts runs for real. No shared database is touched. `db.batch` (neon-http) runs its
// statements in order here, without neon's single transaction, which the cases below do not depend on.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'

vi.mock('next/cache', () => ({ updateTag: vi.fn() }))
// cached() memoizes through Next's data cache; here every read goes straight to the database.
vi.mock('@/lib/cache', () => ({ cached: (_v: string, _f: string, impl: unknown) => impl }))
const h = vi.hoisted(() => ({ db: null as unknown as Record<string, unknown> }))
vi.mock('@/lib/db/client', () => ({
  db: new Proxy({}, {
    get: (_t, k) => {
      if (k === 'batch') return async (qs: PromiseLike<unknown>[]) => { const out: unknown[] = []; for (const q of qs) out.push(await q); return out }
      const v = h.db[k as string]
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(h.db) : v
    },
  }),
}))

type Store = typeof import('./store')
let store: Store
let pg: PGlite
const CLIENT = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const exportFor = (month: string, results: number) => ({ version: 1, topic: 'brand', month, results, daily: [], sentiment: { pos: results, neu: 0, neg: 0 }, sentimentByMedia: [], themes: [] }) as never
const bytes = (n: number, fill = 7) => new Uint8Array(n).fill(fill)
const POST = { group: 'social' as const, platform: 'Facebook', author: 'Made-up author', url: 'https://example.com/p/1', engagements: 3, sentiment: 'Positive' as const, note: 'Made-up note', position: 0 }

beforeAll(async () => {
  // Neon's HTTP driver sends and returns bytea as `\x` hex text, which is what the schema's bytea type writes and
  // reads. PGlite's own bytea handling wants a Uint8Array, so oid 17 is set to Neon's text form here.
  pg = new PGlite({ serializers: { 17: (x: unknown) => String(x) }, parsers: { 17: (x: string) => x } })
  await pg.exec(`CREATE TYPE "commentary_status" AS ENUM ('draft', 'approved'); CREATE TABLE "clients" ("id" uuid PRIMARY KEY, "slug" text NOT NULL DEFAULT 'a-client', "dash_social_config" jsonb, "hidden_reports" text[] NOT NULL DEFAULT '{}', "enabled_reports" text[] NOT NULL DEFAULT '{organic-social}');`)
  const dir = join(process.cwd(), 'drizzle')
  const sql = readFileSync(join(dir, readdirSync(dir).find((f) => f.startsWith('0030_'))!), 'utf8')
  for (const s of sql.split('--> statement-breakpoint').map((x) => x.trim()).filter(Boolean)) await pg.exec(s)
  const schema = await import('@/lib/db/schema')
  h.db = drizzle(pg, { schema }) as unknown as Record<string, unknown>
  store = await import('./store')
})

beforeEach(async () => {
  await pg.exec(`TRUNCATE "social_listening_post_images", "social_listening_posts", "social_listening_uploads", "social_listening_history", "social_listening_trends", "clients" CASCADE;`)
  await pg.exec(`INSERT INTO "clients" ("id", "slug", "dash_social_config") VALUES ('${CLIENT}', 'a-client', '{"brandId": 1}'), ('${OTHER}', 'other-client', null);`)
})

const upload = (month: string, results: number, beforeOpen: boolean, clientId = CLIENT) =>
  store.insertUpload({ clientId, month, topic: 'brand', data: exportFor(month, results), raw: bytes(10), sha256: 'x', byteSize: 10, beforeOpen, by: 'staff@avenuez.com' })

describe('uploads', () => {
  test('the page read keeps the shown and the presented upload, never the raw file, for this client only', async () => {
    await upload('2026-11', 100, true)
    await new Promise((r) => setTimeout(r, 5))
    await upload('2026-11', 200, true)
    await new Promise((r) => setTimeout(r, 5))
    await upload('2026-11', 300, false)
    await upload('2026-11', 999, true, OTHER)
    const d = await store.getSlMonth(CLIENT, ['2026-11'])
    expect(d.uploads.map((u) => u.data.results).sort()).toEqual([200, 300])
    expect(d.uploads.every((u) => u.month === '2026-11' && !('raw' in u))).toBe(true)
  })

  test('a stored upload refreshes the page once (updateTag db)', async () => {
    const { updateTag } = await import('next/cache')
    vi.mocked(updateTag).mockClear()
    await upload('2026-11', 1, true)
    expect(vi.mocked(updateTag).mock.calls).toEqual([['db']])
  })

  test('the database refuses a month that is not the 1st, and a byte size that does not match the file', async () => {
    await expect(pg.exec(`INSERT INTO "social_listening_uploads" ("client_id","month","topic","data","raw","sha256","byte_size","before_open","uploaded_by")
      VALUES ('${CLIENT}','2026-11-15','brand','{}','\\x00','x',1,true,'s')`)).rejects.toThrow(/month_first/)
    await expect(pg.exec(`INSERT INTO "social_listening_uploads" ("client_id","month","topic","data","raw","sha256","byte_size","before_open","uploaded_by")
      VALUES ('${CLIENT}','2026-11-01','brand','{}','\\x00','x',5,true,'s')`)).rejects.toThrow(/raw_size/)
  })
})

describe('posts', () => {
  test('approve, fork a draft with copied images, one open draft only, approving the draft hides the old post', async () => {
    const { id: a } = await store.insertPost({ ...POST, clientId: CLIENT, month: '2026-11', by: 's' })
    expect(await store.insertImage({ postId: a, bytes: bytes(20, 1), printBytes: bytes(5, 2), width: 10, height: 10, maxImages: 4 })).not.toBeNull()
    expect(await store.approvePost(a, 'approver')).toBe(true)
    expect(await store.approvePost(a, 'approver')).toBe(false)

    const fork = await store.forkPostDraft(a, { ...POST, note: 'Edited' }, 's')
    if (!fork.ok) throw new Error('fork failed')
    expect(await store.forkPostDraft(a, POST, 's')).toEqual({ ok: false, reason: 'open-draft', draftId: fork.id })

    let d = await store.getSlMonth(CLIENT, ['2026-11'])
    const draft = d.posts.find((p) => p.id === fork.id)!
    const old = d.posts.find((p) => p.id === a)!
    expect(draft.status).toBe('draft')
    expect(draft.replacesId).toBe(a)
    expect(draft.imageIds).toHaveLength(1)
    expect(draft.imageIds[0]).not.toBe(old.imageIds[0])
    expect((await store.findImage(draft.imageIds[0], false))!.bytes).toEqual(bytes(20, 1))
    expect((await store.findImage(draft.imageIds[0], true))!.bytes).toEqual(bytes(5, 2))
    expect((await store.findImage(draft.imageIds[0], false))!.client).toEqual({
      id: CLIENT, slug: 'a-client', dashSocialConfig: { brandId: 1 }, hiddenReports: [], enabledReports: ['organic-social'],
    })
    expect(await store.findImageOwner(draft.imageIds[0])).toEqual({ postId: fork.id, clientId: CLIENT })
    expect(await store.findImageOwner('33333333-3333-4333-8333-333333333333')).toBeUndefined()

    expect(await store.approvePost(fork.id, 'approver')).toBe(true)
    d = await store.getSlMonth(CLIENT, ['2026-11'])
    expect(d.posts.map((p) => p.id)).toEqual([fork.id])
    expect(await store.revokePost(a)).toBe(false)
    expect((await store.findPost(a))!.replacedAt).not.toBeNull()
  })

  test('a deleted draft edit frees the post for a new edit (R2-10); only drafts are deleted', async () => {
    const { id: a } = await store.insertPost({ ...POST, clientId: CLIENT, month: '2026-11', by: 's' })
    await store.approvePost(a, 'approver')
    expect(await store.softDeletePostDraft(a, 's')).toBe(false)
    const first = await store.forkPostDraft(a, POST, 's')
    if (!first.ok) throw new Error('fork failed')
    expect(await store.softDeletePostDraft(first.id, 's')).toBe(true)
    expect((await store.forkPostDraft(a, POST, 's')).ok).toBe(true)
  })

  test('the image cap and the draft rule hold inside the insert; approved images are never deleted in place', async () => {
    const { id } = await store.insertPost({ ...POST, clientId: CLIENT, month: '2026-11', by: 's' })
    const add = () => store.insertImage({ postId: id, bytes: bytes(10), printBytes: bytes(5), width: 1, height: 1, maxImages: 2 })
    const one = await add()
    expect(await add()).not.toBeNull()
    expect(await add()).toBeNull()
    await store.approvePost(id, 'approver')
    expect(await store.insertImage({ postId: id, bytes: bytes(10), printBytes: bytes(5), width: 1, height: 1, maxImages: 4 })).toBeNull()
    expect(await store.deleteImage(one!.id)).toBe(false)
  })

  test('the database refuses an image over 300 KB or a print copy over 60 KB', async () => {
    const { id } = await store.insertPost({ ...POST, clientId: CLIENT, month: '2026-11', by: 's' })
    await expect(store.insertImage({ postId: id, bytes: bytes(307201), printBytes: bytes(5), width: 1, height: 1, maxImages: 4 })).rejects.toThrow()
    await expect(store.insertImage({ postId: id, bytes: bytes(10), printBytes: bytes(61441), width: 1, height: 1, maxImages: 4 })).rejects.toThrow()
  })

  test('the month cap counts approved posts that are not replaced or deleted, for the month asked', async () => {
    const p = () => store.insertPost({ ...POST, clientId: CLIENT, month: '2026-11', by: 's' })
    const { id: a } = await p()
    const { id: b } = await p()
    await p()
    await store.approvePost(a, 'x')
    await store.approvePost(b, 'x')
    const fork = await store.forkPostDraft(b, POST, 's')
    if (fork.ok) await store.approvePost(fork.id, 'x')
    await store.insertPost({ ...POST, clientId: CLIENT, month: '2026-10', by: 's' })
    expect(await store.countApprovedPosts(CLIENT, '2026-11')).toBe(2)
  })

  test('the page read lists only the served month: the latest month asked for', async () => {
    await store.insertPost({ ...POST, clientId: CLIENT, month: '2026-10', by: 's', note: 'October' })
    await store.insertPost({ ...POST, clientId: CLIENT, month: '2026-11', by: 's', note: 'November' })
    const d = await store.getSlMonth(CLIENT, ['2026-01', '2026-10', '2026-11'])
    expect(d.posts.map((p) => p.note)).toEqual(['November'])
  })
})

describe('trends', () => {
  const lists = (theme: string) => ({ emerging: [{ theme, change: '+5%' }], decreasing: [], newThemes: [] })

  test('approved lists stay what clients see while a later draft is edited (R2-11)', async () => {
    await store.saveTrendsDraft({ clientId: CLIENT, month: '2026-11', lists: lists('first'), by: 's' })
    let t = (await store.getSlMonth(CLIENT, ['2026-11'])).trends!
    expect([t.status, t.approved]).toEqual(['draft', null])
    expect(await store.approveTrends({ clientId: CLIENT, month: '2026-11', by: 'a', seen: lists('first') })).toBe(true)
    expect(await store.approveTrends({ clientId: CLIENT, month: '2026-11', by: 'a', seen: lists('first') })).toBe(false)
    await store.saveTrendsDraft({ clientId: CLIENT, month: '2026-11', lists: lists('second'), by: 's' })
    t = (await store.getSlMonth(CLIENT, ['2026-11'])).trends!
    expect(t.status).toBe('draft')
    expect(t.draft.emerging[0].theme).toBe('second')
    expect(t.approved!.emerging[0].theme).toBe('first')
  })

  test('a draft changed since the approver opened the page is never approved unseen', async () => {
    await store.saveTrendsDraft({ clientId: CLIENT, month: '2026-11', lists: lists('newer'), by: 's' })
    expect(await store.approveTrends({ clientId: CLIENT, month: '2026-11', by: 'a', seen: lists('older') })).toBe(false)
    expect((await store.getSlMonth(CLIENT, ['2026-11'])).trends!.approved).toBeNull()
    expect(await store.approveTrends({ clientId: CLIENT, month: '2026-11', by: 'a', seen: lists('newer') })).toBe(true)
  })
})
