// @vitest-environment node
// The store's SQL against a real Postgres engine (PGlite, in memory) with migration 0031 applied as generated, the
// pattern of lib/organic-social/social-listening/store.pglite.test.ts. No shared database is touched. `db.batch`
// runs its statements in order here, without neon's single transaction.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { TA_SOURCES } from './types'
import type { SourceIssue } from './types'

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
const RUN = { date: '2026-11-01', folderId: 'folder-1' }
const issue = (over: Partial<SourceIssue> = {}): SourceIssue => ({ source: 'sf', nativeName: 'Missing H1', nativeSeverity: 'Issue', urlCount: 3, ...over })
const count = async (table: string, where = 'true') => Number((await pg.query<{ n: string }>(`SELECT count(*) AS n FROM ${table} WHERE ${where}`)).rows[0].n)

beforeAll(async () => {
  pg = new PGlite({ serializers: { 17: (x: unknown) => String(x) }, parsers: { 17: (x: string) => x } })
  await pg.exec(`CREATE TABLE "clients" ("id" uuid PRIMARY KEY);`)
  const sql = readFileSync(join(process.cwd(), 'drizzle', '0031_technical_audit.sql'), 'utf8')
  for (const s of sql.split('--> statement-breakpoint').map((x) => x.trim()).filter(Boolean)) {
    // 0031 also adds columns to the real clients table; the stub only needs its id.
    if (/ALTER TABLE "clients"/.test(s)) continue
    await pg.exec(s)
  }
  const schema = await import('@/lib/db/schema')
  h.db = drizzle(pg, { schema }) as unknown as Record<string, unknown>
  store = await import('./store')
})

beforeEach(async () => {
  await pg.exec(`TRUNCATE "tech_audit_snapshots", "tech_audit_issue_overrides", "clients" CASCADE;`)
  await pg.exec(`INSERT INTO "clients" ("id") VALUES ('${CLIENT}'), ('${OTHER}');`)
})

describe('ensureSnapshot', () => {
  test('is idempotent: second call returns created false and adds no run rows', async () => {
    const a = await store.ensureSnapshot(CLIENT, RUN)
    const b = await store.ensureSnapshot(CLIENT, RUN)
    expect(a.created).toBe(true)
    expect(b).toEqual({ id: a.id, created: false })
    expect(await count('tech_audit_snapshots')).toBe(1)
    expect(await count('tech_audit_source_runs')).toBe(TA_SOURCES.length)
    expect((await pg.query<{ status: string }>(`SELECT DISTINCT status FROM tech_audit_source_runs`)).rows).toEqual([{ status: 'pending' }])
  })
  test('self-heals a snapshot whose run rows were never written', async () => {
    const a = await store.ensureSnapshot(CLIENT, RUN)
    await pg.exec(`DELETE FROM tech_audit_source_runs`)
    const b = await store.ensureSnapshot(CLIENT, RUN)
    expect(b).toEqual({ id: a.id, created: false })
    expect(await count('tech_audit_source_runs')).toBe(TA_SOURCES.length)
  })
  test('another client or date gets its own snapshot', async () => {
    const a = await store.ensureSnapshot(CLIENT, RUN)
    const b = await store.ensureSnapshot(OTHER, RUN)
    const c = await store.ensureSnapshot(CLIENT, { ...RUN, date: '2026-12-01' })
    expect(new Set([a.id, b.id, c.id]).size).toBe(3)
  })
})

describe('claimRun', () => {
  test('claims a pending run once; a second sweep gets false', async () => {
    const { id } = await store.ensureSnapshot(CLIENT, RUN)
    expect(await store.claimRun(id, 'sf')).toBe(true)
    expect(await store.claimRun(id, 'sf')).toBe(false)
    const row = (await pg.query<{ attempts: number }>(`SELECT attempts FROM tech_audit_source_runs WHERE source = 'sf'`)).rows[0]
    expect(row.attempts).toBe(1)
  })
  test('returns false when the run is complete', async () => {
    const { id } = await store.ensureSnapshot(CLIENT, RUN)
    await store.completeRun(CLIENT, id, 'sf', new Uint8Array([1]), {})
    expect(await store.claimRun(id, 'sf', 0)).toBe(false)
  })
  test('returns false for a missing run', async () => {
    const { id } = await store.ensureSnapshot(CLIENT, RUN)
    await store.failRun(CLIENT, id, 'sf', 'missing', 'no file')
    expect(await store.claimRun(id, 'sf', 0)).toBe(false)
  })
  test('reclaims a stale claim and a failed run, but not a fresh claim', async () => {
    const { id } = await store.ensureSnapshot(CLIENT, RUN)
    await store.claimRun(id, 'sf')
    expect(await store.claimRun(id, 'sf', 600_000)).toBe(false)
    await pg.exec(`UPDATE tech_audit_source_runs SET started_at = now() - interval '11 minutes' WHERE source = 'sf'`)
    expect(await store.claimRun(id, 'sf', 600_000)).toBe(true)
    await store.failRun(CLIENT, id, 'sf', 'failed', 'boom')
    expect(await store.claimRun(id, 'sf', 0)).toBe(true)
  })
  test('includeMissing makes a missing run claimable under the same stale rule', async () => {
    const { id } = await store.ensureSnapshot(CLIENT, RUN)
    await store.claimRun(id, 'sf')
    await store.failRun(CLIENT, id, 'sf', 'missing', 'no file')
    expect(await store.claimRun(id, 'sf', 0)).toBe(false)
    expect(await store.claimRun(id, 'sf', 600_000, { includeMissing: true })).toBe(false) // fresh claim
    expect(await store.claimRun(id, 'sf', 0, { includeMissing: true })).toBe(true)
    await store.completeRun(CLIENT, id, 'sf', new Uint8Array([1]), {})
    expect(await store.claimRun(id, 'sf', 0, { includeMissing: true })).toBe(false) // complete stays closed
  })
  test('includeMissing never claims a run on a published snapshot', async () => {
    const { id } = await store.ensureSnapshot(CLIENT, RUN)
    await store.failRun(CLIENT, id, 'sf', 'missing', 'no file')
    await store.setSnapshotStatus(CLIENT, id, 'published', 'paul@example.com')
    expect(await store.claimRun(id, 'sf', 0, { includeMissing: true })).toBe(false)
    await store.setSnapshotStatus(CLIENT, id, 'draft', 'paul@example.com')
    expect(await store.claimRun(id, 'sf', 0, { includeMissing: true })).toBe(true)
  })
  test('rejects a non-finite or negative staleness window', async () => {
    const { id } = await store.ensureSnapshot(CLIENT, RUN)
    await expect(store.claimRun(id, 'sf', Number.NaN)).rejects.toThrow('staleAfterMs')
    await expect(store.claimRun(id, 'sf', -1)).rejects.toThrow('staleAfterMs')
  })
})

describe('completeRun', () => {
  test('replaces only that source\'s issues and marks the run complete', async () => {
    const { id } = await store.ensureSnapshot(CLIENT, RUN)
    await store.completeRun(CLIENT, id, 'sf', new Uint8Array([1, 2]), { issues: [issue({ nativeName: 'Old' })] })
    await store.completeRun(CLIENT, id, 'ahrefs', new Uint8Array([3]), { issues: [issue({ source: 'ahrefs', nativeName: 'Ahrefs one' })] })
    await store.completeRun(CLIENT, id, 'sf', new Uint8Array([4]), { issues: [issue({ nativeName: 'New A' }), issue({ nativeName: 'New B' })] })
    const names = (await pg.query<{ native_issue_name: string }>(`SELECT native_issue_name FROM tech_audit_source_issues ORDER BY native_issue_name`)).rows.map((r) => r.native_issue_name)
    expect(names).toEqual(['Ahrefs one', 'New A', 'New B'])
    const run = (await pg.query<{ status: string; finished_at: string | null; last_error: string | null }>(`SELECT status, finished_at, last_error FROM tech_audit_source_runs WHERE source = 'sf'`)).rows[0]
    expect(run.status).toBe('complete')
    expect(run.finished_at).not.toBeNull()
    expect(run.last_error).toBeNull()
  })
  test('the two CWV runs replace only their own device\'s issues', async () => {
    const { id } = await store.ensureSnapshot(CLIENT, RUN)
    const cwv = (device: 'mobile' | 'desktop', name: string) => issue({ source: 'gsc_cwv', device, nativeName: name })
    await store.completeRun(CLIENT, id, 'gsc_cwv_mobile', new Uint8Array([1]), { issues: [cwv('mobile', 'M1')] })
    await store.completeRun(CLIENT, id, 'gsc_cwv_desktop', new Uint8Array([1]), { issues: [cwv('desktop', 'D1')] })
    await store.completeRun(CLIENT, id, 'gsc_cwv_mobile', new Uint8Array([1]), { issues: [cwv('mobile', 'M2')] })
    const names = (await pg.query<{ native_issue_name: string }>(`SELECT native_issue_name FROM tech_audit_source_issues ORDER BY 1`)).rows.map((r) => r.native_issue_name)
    expect(names).toEqual(['D1', 'M2'])
  })
  test('is re-runnable: the same input twice leaves one copy', async () => {
    const { id } = await store.ensureSnapshot(CLIENT, RUN)
    const write = { issues: [issue()], metrics: { sfUrlsIssue: 5 } }
    await store.completeRun(CLIENT, id, 'sf', new Uint8Array([1]), write)
    await store.completeRun(CLIENT, id, 'sf', new Uint8Array([1]), write)
    expect(await count('tech_audit_source_issues')).toBe(1)
    expect(await count('tech_audit_metrics')).toBe(1)
  })
  test('upserts metrics per source without wiping the other sources\' columns', async () => {
    const { id } = await store.ensureSnapshot(CLIENT, RUN)
    await store.completeRun(CLIENT, id, 'sf', new Uint8Array([1]), { metrics: { sfUrlsIssue: 5, sfUrlsWarning: 2 } })
    await store.completeRun(CLIENT, id, 'ahrefs', new Uint8Array([1]), { metrics: { ahrefsHealthScore: 88 } })
    const m = (await pg.query<{ sf_urls_issue: number; ahrefs_health_score: number }>(`SELECT sf_urls_issue, ahrefs_health_score FROM tech_audit_metrics`)).rows[0]
    expect(m).toEqual({ sf_urls_issue: 5, ahrefs_health_score: 88 })
  })
  test('writes an explicit null metric, and an empty write leaves metrics and issues alone', async () => {
    const { id } = await store.ensureSnapshot(CLIENT, RUN)
    await store.completeRun(CLIENT, id, 'sf', new Uint8Array([1]), { metrics: { sfUrlsIssue: 5 }, issues: [issue()] })
    await store.completeRun(CLIENT, id, 'ahrefs', new Uint8Array([1]), {})
    expect(await count('tech_audit_source_issues')).toBe(1)
    await store.completeRun(CLIENT, id, 'sf', new Uint8Array([1]), { metrics: { sfUrlsIssue: null }, issues: [] })
    expect((await pg.query<{ sf_urls_issue: number | null }>(`SELECT sf_urls_issue FROM tech_audit_metrics`)).rows[0].sf_urls_issue).toBeNull()
    expect(await count('tech_audit_source_issues')).toBe(0)
  })
  test('updates snapshot dates and score, and cannot rewrite its identity', async () => {
    const { id } = await store.ensureSnapshot(CLIENT, RUN)
    await store.completeRun(CLIENT, id, 'sf', new Uint8Array([1]), {
      snapshot: { sfCrawlDate: '2026-10-30', crawlSettingsChanged: true, clientId: OTHER, status: 'published' },
    })
    const s = (await pg.query<{ sf_crawl_date: string; crawl_settings_changed: boolean; client_id: string; status: string }>(`SELECT sf_crawl_date::text, crawl_settings_changed, client_id, status FROM tech_audit_snapshots`)).rows[0]
    expect(s).toEqual({ sf_crawl_date: '2026-10-30', crawl_settings_changed: true, client_id: CLIENT, status: 'draft' })
  })
  test('rejects an issue belonging to a different source before writing anything', async () => {
    const { id } = await store.ensureSnapshot(CLIENT, RUN)
    await store.completeRun(CLIENT, id, 'sf', new Uint8Array([1]), { issues: [issue()] })
    await expect(store.completeRun(CLIENT, id, 'sf', new Uint8Array([1]), { issues: [issue({ source: 'ahrefs' })] })).rejects.toThrow('does not belong')
    expect(await count('tech_audit_source_issues')).toBe(1)
  })
  test('rejects raw over the 2 MiB column limit and an unknown snapshot, with generic messages', async () => {
    const { id } = await store.ensureSnapshot(CLIENT, RUN)
    await expect(store.completeRun(CLIENT, id, 'sf', new Uint8Array(2_097_153), {})).rejects.toThrow('raw file too large')
    await expect(store.completeRun(CLIENT, '33333333-3333-4333-8333-333333333333', 'sf', new Uint8Array([1]), {})).rejects.toThrow('run not found')
  })
  test('keeps the raw bytes it was given', async () => {
    const { id } = await store.ensureSnapshot(CLIENT, RUN)
    await store.completeRun(CLIENT, id, 'sf', new Uint8Array([9, 8, 7]), {})
    const raw = (await pg.query<{ raw: string }>(`SELECT raw FROM tech_audit_source_runs WHERE source = 'sf'`)).rows[0].raw
    expect(raw).toBe('\\x090807')
  })
})

describe('tenant scoping (client B id with client A)', () => {
  test('getSnapshotBundle returns null for another client\'s snapshot', async () => {
    const { id } = await store.ensureSnapshot(CLIENT, RUN)
    expect(await store.getSnapshotBundle(OTHER, id)).toBeNull()
  })
  test('setSnapshotStatus throws and changes nothing', async () => {
    const { id } = await store.ensureSnapshot(CLIENT, RUN)
    await expect(store.setSnapshotStatus(OTHER, id, 'published', 'x@x.com')).rejects.toThrow('Snapshot not found')
    expect((await pg.query<{ status: string }>(`SELECT status FROM tech_audit_snapshots`)).rows[0].status).toBe('draft')
  })
  test('completeRun throws run not found and writes nothing', async () => {
    const { id } = await store.ensureSnapshot(CLIENT, RUN)
    await expect(store.completeRun(OTHER, id, 'sf', new Uint8Array([1]), { issues: [issue()], metrics: { sfUrlsIssue: 1 } })).rejects.toThrow('run not found')
    expect(await count('tech_audit_source_issues')).toBe(0)
    expect(await count('tech_audit_metrics')).toBe(0)
    expect(await count('tech_audit_source_runs', `status <> 'pending'`)).toBe(0)
  })
  test('failRun is a no-op', async () => {
    const { id } = await store.ensureSnapshot(CLIENT, RUN)
    await store.failRun(OTHER, id, 'sf', 'failed', 'boom')
    expect(await count('tech_audit_source_runs', `status <> 'pending'`)).toBe(0)
  })
})

describe('failRun', () => {
  test('records the reason, finished_at and status; truncates a long reason', async () => {
    const { id } = await store.ensureSnapshot(CLIENT, RUN)
    await store.failRun(CLIENT, id, 'ahrefs', 'failed', 'x'.repeat(2000))
    const r = (await pg.query<{ status: string; last_error: string; finished_at: string | null }>(`SELECT status, last_error, finished_at FROM tech_audit_source_runs WHERE source = 'ahrefs'`)).rows[0]
    expect(r.status).toBe('failed')
    expect(r.last_error.length).toBe(500)
    expect(r.finished_at).not.toBeNull()
  })
  test('does not overwrite a complete run', async () => {
    const { id } = await store.ensureSnapshot(CLIENT, RUN)
    await store.completeRun(CLIENT, id, 'sf', new Uint8Array([1]), {})
    await store.failRun(CLIENT, id, 'sf', 'failed', 'late')
    expect((await pg.query<{ status: string }>(`SELECT status FROM tech_audit_source_runs WHERE source = 'sf'`)).rows[0].status).toBe('complete')
  })
})

describe('setSnapshotStatus and getSnapshots', () => {
  test('publishedOnly filters drafts; newest first', async () => {
    const a = await store.ensureSnapshot(CLIENT, { ...RUN, date: '2026-09-01' })
    const b = await store.ensureSnapshot(CLIENT, { ...RUN, date: '2026-10-01' })
    await store.ensureSnapshot(CLIENT, { ...RUN, date: '2026-11-01' })
    await store.setSnapshotStatus(CLIENT, a.id, 'published', 'p@x.com')
    await store.setSnapshotStatus(CLIENT, b.id, 'published', 'p@x.com')
    const pub = await store.getSnapshots(CLIENT, { publishedOnly: true })
    expect(pub.map((s) => s.snapshotDate)).toEqual(['2026-10-01', '2026-09-01'])
    const all = await store.getSnapshots(CLIENT, { publishedOnly: false })
    expect(all.map((s) => s.snapshotDate)).toEqual(['2026-11-01', '2026-10-01', '2026-09-01'])
    expect(pub[0].publishedBy).toBe('p@x.com')
    expect(pub[0].publishedAt).not.toBeNull()
  })
  test('unpublishing clears the publish stamp', async () => {
    const a = await store.ensureSnapshot(CLIENT, RUN)
    await store.setSnapshotStatus(CLIENT, a.id, 'published', 'p@x.com')
    await store.setSnapshotStatus(CLIENT, a.id, 'draft', 'p@x.com')
    const [s] = await store.getSnapshots(CLIENT, { publishedOnly: false })
    expect(s.status).toBe('draft')
    expect(s.publishedAt).toBeNull()
    expect(s.publishedBy).toBeNull()
  })
  test('scopes to the client', async () => {
    await store.ensureSnapshot(OTHER, RUN)
    expect(await store.getSnapshots(CLIENT, { publishedOnly: false })).toEqual([])
  })
})

describe('getSnapshotBundle', () => {
  test('returns snapshot, runs without raw, metrics and issues; null for an unknown id', async () => {
    const { id } = await store.ensureSnapshot(CLIENT, RUN)
    await store.completeRun(CLIENT, id, 'sf', new Uint8Array([1]), { metrics: { sfUrlsIssue: 1 }, issues: [issue()] })
    const bundle = await store.getSnapshotBundle(CLIENT, id)
    expect(bundle?.snapshot.id).toBe(id)
    expect(bundle?.runs).toHaveLength(TA_SOURCES.length)
    expect(bundle?.runs[0]).not.toHaveProperty('raw')
    expect(bundle?.metrics?.sfUrlsIssue).toBe(1)
    expect(bundle?.issues).toHaveLength(1)
    expect(await store.getSnapshotBundle(CLIENT, '33333333-3333-4333-8333-333333333333')).toBeNull()
  })
})

describe('overrides', () => {
  test('upserts a patch, keeping fields the patch leaves out', async () => {
    await store.setOverride(CLIENT, 'missing-h1', { hidden: true }, 'a@x.com')
    await store.setOverride(CLIENT, 'missing-h1', { note: 'Known, fixing in Q1' }, 'b@x.com')
    const rows = await store.getOverrides(CLIENT)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ issueKey: 'missing-h1', hidden: true, note: 'Known, fixing in Q1', updatedBy: 'b@x.com' })
    await store.setOverride(CLIENT, 'missing-h1', { note: null }, 'b@x.com')
    expect((await store.getOverrides(CLIENT))[0].note).toBeNull()
  })
  test('scopes to the client, ignores an empty patch, rejects an over-long note', async () => {
    await store.setOverride(OTHER, 'k', { hidden: true }, 'a@x.com')
    expect(await store.getOverrides(CLIENT)).toEqual([])
    await store.setOverride(CLIENT, 'k', {}, 'a@x.com')
    expect(await store.getOverrides(CLIENT)).toEqual([])
    await expect(store.setOverride(CLIENT, 'k', { note: 'n'.repeat(281) }, 'a@x.com')).rejects.toThrow('note too long')
  })
})
