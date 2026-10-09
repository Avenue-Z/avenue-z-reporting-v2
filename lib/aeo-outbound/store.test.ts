import { expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { PgDialect } from 'drizzle-orm/pg-core'
import { approveQuery, copyAsDraftQuery, discardQuery, displayStatus, failureReason, finishDraftQuery, finishFailedQuery, insertGeneratingQuery, isConstraintViolation, isReportId, liveByTokenQuery, liveSummariesQuery, markStaleGeneratingQuery, ONE_GENERATING_INDEX, recentSummariesQuery, recordOpenQuery, revokeQuery, saveSlotsQuery, SHARE_TOKEN_UNIQUE } from './store'
import type { AeoOutboundRow } from '@/lib/db/schema'
import type { Slots } from './slots'
import type { SnapshotData } from './metrics'

const ID = 'c7d8e0a1-1111-4111-8111-111111111111'
const NOW = new Date('2026-10-08T15:00:00Z')
const SLOTS = {} as Slots

const T = '"aeo_outbound_reports"'
// Drizzle hands timestamps to the driver as ISO strings.
const SAVED_AT = '2026-10-09T12:00:00.000Z'
const STALE = '2026-10-08T14:54:00.000Z'
const NOW_ISO = NOW.toISOString()

test('save matches a live draft at the shown revision and bumps it', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(SAVED_AT))
  try {
    const q = saveSlotsQuery(ID, 4, SLOTS, ['n']).toSQL()
    expect(q.sql).toBe(
      `update ${T} set "slots" = $1, "notes" = $2, "revision" = ${T}."revision" + 1, "updated_at" = $3 where (${T}."id" = $4 and ${T}."status" = $5 and ${T}."revision" = $6 and ${T}."deleted_at" is null) returning "revision"`)
    expect(q.params).toEqual(['{}', '["n"]', SAVED_AT, ID, 'draft', 4])
  } finally {
    vi.useRealTimers()
  }
})

test('approve matches a live draft at the shown revision and records the recipient', () => {
  const q = approveQuery(ID, 7, { html: '<html>', token: 'tok', recipient: 'Jane Doe, Acme', by: 'ryan@avenuez.com', now: NOW }).toSQL()
  expect(q.sql).toBe(
    `update ${T} set "status" = $1, "html" = $2, "share_token" = $3, "share_recipient" = $4, "approved_by" = $5, "updated_at" = $6, "approved_at" = $7 where (${T}."id" = $8 and ${T}."status" = $9 and ${T}."revision" = $10 and ${T}."deleted_at" is null) returning "id", "share_token"`)
  expect(q.params).toEqual(['approved', '<html>', 'tok', 'Jane Doe, Acme', 'ryan@avenuez.com', NOW_ISO, NOW_ISO, ID, 'draft', 7])
})

test('revoke only touches a live approved link', () => {
  const q = revokeQuery(ID, 'ryan@avenuez.com', NOW).toSQL()
  expect(q.sql).toBe(
    `update ${T} set "revoked_by" = $1, "updated_at" = $2, "share_revoked_at" = $3 where (${T}."id" = $4 and ${T}."status" = $5 and ${T}."share_revoked_at" is null and ${T}."deleted_at" is null) returning "id"`)
  expect(q.params).toEqual(['ryan@avenuez.com', NOW_ISO, NOW_ISO, ID, 'approved'])
})

test('discard matches draft, failed, or generating older than 6 minutes, and turns generating into failed', () => {
  const q = discardQuery(ID, 'ryan@avenuez.com', NOW).toSQL()
  expect(q.sql).toBe(
    `update ${T} set "status" = case when ${T}."status" = 'generating' then 'failed'::aeo_outbound_status else ${T}."status" end, "deleted_by" = $1, "updated_at" = $2, "deleted_at" = $3 where (${T}."id" = $4 and ${T}."deleted_at" is null and (${T}."status" in ($5, $6) or (${T}."status" = $7 and ${T}."created_at" < $8))) returning "id"`)
  expect(q.params).toEqual(['ryan@avenuez.com', NOW_ISO, NOW_ISO, ID, 'draft', 'failed', 'generating', STALE])
})

test('stale generating rows for a project are failed before a new insert', () => {
  const q = markStaleGeneratingQuery('or_a', NOW).toSQL()
  expect(q.sql).toBe(
    `update ${T} set "status" = $1, "error" = $2, "updated_at" = $3 where (${T}."peec_project_id" = $4 and ${T}."status" = $5 and ${T}."created_at" < $6)`)
  expect(q.params).toEqual(['failed', 'Timed out', NOW_ISO, 'or_a', 'generating', STALE])
})

test('the token lookup requires approved and excludes revoked and deleted rows', () => {
  const q = liveByTokenQuery('tok').toSQL()
  expect(q.sql).toBe(
    `select "id", "html" from ${T} where (${T}."share_token" = $1 and ${T}."status" = $2 and ${T}."share_revoked_at" is null and ${T}."deleted_at" is null) limit $3`)
  expect(q.params).toEqual(['tok', 'approved', 1])
})

test('recording an open bumps the count on a live link only and leaves updated_at alone', () => {
  const q = recordOpenQuery(ID, NOW).toSQL()
  expect(q.sql).toBe(
    `update ${T} set "open_count" = ${T}."open_count" + 1, "first_opened_at" = coalesce(${T}."first_opened_at", $1::timestamptz), "last_opened_at" = $2 where (${T}."id" = $3 and ${T}."status" = $4 and ${T}."share_revoked_at" is null and ${T}."deleted_at" is null)`)
  expect(q.params).toEqual([NOW_ISO, NOW_ISO, ID, 'approved'])
  expect(q.sql).not.toContain('"updated_at"')
})

test('Edit a copy is one insert-select from an approved (live or revoked) row', () => {
  const q = new PgDialect().sqlToQuery(copyAsDraftQuery(ID, 'ryan@avenuez.com', NOW))
  expect(q.sql).toBe(
    'insert into "aeo_outbound_reports" ("peec_project_id", "peec_project_name", "brand_name", "status", "data", "slots", "notes", "rerun_of", "requested_start", "requested_end", "created_by", "created_at", "updated_at") select "peec_project_id", "peec_project_name", "brand_name", \'draft\', "data", "slots", "notes", "id", "requested_start", "requested_end", $1, $2::timestamptz, $3::timestamptz from "aeo_outbound_reports" where "id" = $4 and "status" = \'approved\' and "deleted_at" is null returning "id"')
  expect(q.params).toEqual(['ryan@avenuez.com', NOW_ISO, NOW_ISO, ID])
})

const HUB_COLS = '"id", "peec_project_id", "peec_project_name", "brand_name", "status", "error", "share_token", "share_recipient", "open_count", "first_opened_at", "last_opened_at", "created_at", "approved_at", "share_revoked_at"'
test('hub summaries select exactly the hub columns and never the heavy ones', () => {
  const live = liveSummariesQuery().toSQL()
  expect(live.sql).toBe(
    `select ${HUB_COLS} from ${T} where (${T}."status" = $1 and ${T}."share_revoked_at" is null and ${T}."deleted_at" is null)`)
  expect(live.params).toEqual(['approved'])
  const recent = recentSummariesQuery(500).toSQL()
  expect(recent.sql).toBe(
    `select ${HUB_COLS} from ${T} where (${T}."deleted_at" is null and not (${T}."status" = $1 and ${T}."share_revoked_at" is null)) order by ${T}."created_at" desc limit $2`)
  expect(recent.params).toEqual(['approved', 500])
  for (const s of [live.sql, recent.sql]) for (const c of ['"data"', '"slots"', '"notes"', '"html"']) expect(s).not.toContain(c)
})

test('listReportSummaries merges the live rows with the recent ones once, newest first', async () => {
  vi.resetModules()
  const mk = (id: string, day: number) => ({ id, createdAt: new Date(Date.UTC(2026, 9, day)) })
  const oldLive = mk('live-old', 1)
  const recent = [mk('r3', 9), mk('r2', 8), mk('r1', 7)]
  const chain = (rows: unknown[]) => ({ from: () => ({ where: () => Object.assign(Promise.resolve(rows), { orderBy: () => ({ limit: () => Promise.resolve(rows) }) }) }) })
  const select = vi.fn()
    .mockReturnValueOnce(chain([oldLive, recent[2]]))
    .mockReturnValueOnce(chain(recent))
  vi.doMock('@/lib/db/client', () => ({ db: { select } }))
  try {
    const store = await import('./store')
    const out = await store.listReportSummaries()
    expect(out.map((r) => r.id)).toEqual(['r3', 'r2', 'r1', 'live-old'])
  } finally {
    vi.doUnmock('@/lib/db/client')
    vi.resetModules()
  }
})

test('finishing a draft only matches a generating row', () => {
  const q = finishDraftQuery(ID, { brandName: 'B', data: { x: 1 } as unknown as SnapshotData, slots: { y: 2 } as unknown as Slots, notes: ['n'], now: NOW }).toSQL()
  expect(q.sql).toBe(
    `update ${T} set "brand_name" = $1, "status" = $2, "data" = $3, "slots" = $4, "notes" = $5, "updated_at" = $6 where (${T}."id" = $7 and ${T}."status" = $8) returning "id"`)
  expect(q.params).toEqual(['B', 'draft', '{"x":1}', '{"y":2}', '["n"]', NOW_ISO, ID, 'generating'])
})

test('finishing as failed only matches a generating row', () => {
  const q = finishFailedQuery(ID, 'boom', 'B', NOW).toSQL()
  expect(q.sql).toBe(
    `update ${T} set "brand_name" = $1, "status" = $2, "error" = $3, "updated_at" = $4 where (${T}."id" = $5 and ${T}."status" = $6) returning "id"`)
  expect(q.params).toEqual(['B', 'failed', 'boom', NOW_ISO, ID, 'generating'])
})

const row = (p: Partial<AeoOutboundRow>) => ({ status: 'draft', createdAt: NOW, shareRevokedAt: null, deletedAt: null, error: null, ...p }) as AeoOutboundRow
test('failure reason: stored error, else Timed out for a stale generating row', () => {
  const t = NOW.getTime()
  expect(failureReason(row({ status: 'failed', error: 'Copy generation failed. Rerun.' }), t)).toBe('Copy generation failed. Rerun.')
  expect(failureReason(row({ status: 'generating', error: null }), t + 6 * 60_000 + 1)).toBe('Timed out')
  expect(failureReason(row({ status: 'generating', error: null }), t + 60_000)).toBeNull()
})

test('display status', () => {
  const t = NOW.getTime()
  expect(displayStatus(row({ status: 'generating' }), t + 60_000)).toBe('generating')
  expect(displayStatus(row({ status: 'generating' }), t + 6 * 60_000 + 1)).toBe('failed')
  expect(displayStatus(row({ status: 'draft' }), t)).toBe('draft')
  expect(displayStatus(row({ status: 'approved' }), t)).toBe('live')
  expect(displayStatus(row({ status: 'approved', shareRevokedAt: NOW }), t)).toBe('revoked')
  expect(displayStatus(row({ status: 'failed' }), t)).toBe('failed')
})

test('report ids must be UUIDs before anything reaches Postgres', () => {
  expect(isReportId('c7d8e0a1-1111-4111-8111-111111111111')).toBe(true)
  for (const bad of ['', 'abc', "1' or '1'='1", 'c7d8e0a1-1111-4111-8111-11111111111Z', 5]) expect(isReportId(bad)).toBe(false)
})

test('the constraint names are exported', () => {
  expect(ONE_GENERATING_INDEX).toBe('aeo_outbound_one_generating')
  expect(SHARE_TOKEN_UNIQUE).toBe('aeo_outbound_reports_share_token_unique')
})

test('constraint violation detection is by name', () => {
  const gen = { code: '23505', constraint: ONE_GENERATING_INDEX }
  const tok = { code: '23505', constraint: SHARE_TOKEN_UNIQUE }
  expect(isConstraintViolation(gen, ONE_GENERATING_INDEX)).toBe(true)
  expect(isConstraintViolation(tok, SHARE_TOKEN_UNIQUE)).toBe(true)
  expect(isConstraintViolation(gen, SHARE_TOKEN_UNIQUE)).toBe(false)
  expect(isConstraintViolation(tok, ONE_GENERATING_INDEX)).toBe(false)
  expect(isConstraintViolation({ code: '23505' }, ONE_GENERATING_INDEX)).toBe(false)
  expect(isConstraintViolation({ code: '23505', message: `duplicate key value violates unique constraint "${SHARE_TOKEN_UNIQUE}"` }, SHARE_TOKEN_UNIQUE)).toBe(true)
  expect(isConstraintViolation({ code: '23503', constraint: ONE_GENERATING_INDEX }, ONE_GENERATING_INDEX)).toBe(false)
  expect(isConstraintViolation({ cause: { cause: gen } }, ONE_GENERATING_INDEX)).toBe(true)
  expect(isConstraintViolation(new Error('x'), ONE_GENERATING_INDEX)).toBe(false)
  expect(isConstraintViolation(null, ONE_GENERATING_INDEX)).toBe(false)
  const deep = { cause: { cause: { cause: { cause: { cause: gen } } } } }
  expect(isConstraintViolation(deep, ONE_GENERATING_INDEX)).toBe(false)
})

test('the insert stores the requested range, or both columns null', () => {
  const base = { projectId: 'or_a', projectName: 'Acme', createdBy: 'ryan@avenuez.com', rerunOf: null }
  const withRange = insertGeneratingQuery({ ...base, range: { start: '2026-09-01', end: '2026-09-30' } }).toSQL()
  expect(withRange.sql).toBe(
    'insert into "aeo_outbound_reports" ("id", "peec_project_id", "peec_project_name", "brand_name", "status", "data", "slots", "notes", "revision", "error", "html", "share_token", "rerun_of", "requested_start", "requested_end", "share_recipient", "open_count", "first_opened_at", "last_opened_at", "created_by", "approved_by", "revoked_by", "deleted_by", "created_at", "updated_at", "approved_at", "share_revoked_at", "deleted_at") values (default, $1, $2, default, default, default, default, default, default, default, default, default, $3, $4, $5, default, default, default, default, $6, default, default, default, default, default, default, default, default) returning "id"')
  expect(withRange.params).toEqual(['or_a', 'Acme', null, '2026-09-01', '2026-09-30', 'ryan@avenuez.com'])
  const none = insertGeneratingQuery({ ...base, range: null }).toSQL()
  expect(none.params).toEqual(['or_a', 'Acme', null, null, null, 'ryan@avenuez.com'])
})

test('a malformed share token returns undefined without building a query', async () => {
  vi.resetModules()
  const select = vi.fn()
  vi.doMock('@/lib/db/client', () => ({ db: { select } }))
  try {
    const store = await import('./store')
    expect(await store.getLiveByToken('short')).toBeUndefined()
    expect(await store.getLiveByToken("x' or 1=1 --")).toBeUndefined()
    expect(select).not.toHaveBeenCalled()
  } finally {
    vi.doUnmock('@/lib/db/client')
    vi.resetModules()
  }
})

test('the 0026 migration carries the open-tracking columns and the recipient check, and names no other table', () => {
  const sqlText = readFileSync('drizzle/0026_aeo_outbound_reports.sql', 'utf8')
  for (const c of ['"requested_start" date', '"requested_end" date', '"share_recipient" text', '"open_count" integer DEFAULT 0 NOT NULL', '"first_opened_at" timestamp with time zone', '"last_opened_at" timestamp with time zone']) expect(sqlText).toContain(c)
  const approved = sqlText.split('\n').find((l) => l.includes('CONSTRAINT "aeo_outbound_approved_complete"')) ?? ''
  expect(approved).toContain('"aeo_outbound_reports"."share_recipient" IS NOT NULL')
  const range = sqlText.split('\n').find((l) => l.includes('CONSTRAINT "aeo_outbound_range_both_or_neither" CHECK')) ?? ''
  expect(range).toContain('"aeo_outbound_reports"."requested_start" IS NULL')
  expect(range).toContain('"aeo_outbound_reports"."requested_end" IS NULL')
  const tables = [...sqlText.matchAll(/(?:CREATE TABLE|ALTER TABLE|ON|REFERENCES)\s+"(?:public"\.")?([a-z_]+)"/g)].map((m) => m[1])
  expect(new Set(tables)).toEqual(new Set(['aeo_outbound_reports']))
})
