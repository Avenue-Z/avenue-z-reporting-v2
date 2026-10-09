import { expect, test, vi } from 'vitest'
import { approveQuery, discardQuery, displayStatus, failureReason, finishDraftQuery, finishFailedQuery, isReportId, isUniqueViolation, liveByTokenQuery, markStaleGeneratingQuery, revokeQuery, saveSlotsQuery } from './store'
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

test('approve matches a live draft at the shown revision', () => {
  const q = approveQuery(ID, 7, { html: '<html>', token: 'tok', by: 'ryan@avenuez.com', now: NOW }).toSQL()
  expect(q.sql).toBe(
    `update ${T} set "status" = $1, "html" = $2, "share_token" = $3, "approved_by" = $4, "updated_at" = $5, "approved_at" = $6 where (${T}."id" = $7 and ${T}."status" = $8 and ${T}."revision" = $9 and ${T}."deleted_at" is null) returning "id", "share_token"`)
  expect(q.params).toEqual(['approved', '<html>', 'tok', 'ryan@avenuez.com', NOW_ISO, NOW_ISO, ID, 'draft', 7])
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
    `select "html" from ${T} where (${T}."share_token" = $1 and ${T}."status" = $2 and ${T}."share_revoked_at" is null and ${T}."deleted_at" is null) limit $3`)
  expect(q.params).toEqual(['tok', 'approved', 1])
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

test('unique violation detection', () => {
  expect(isUniqueViolation({ code: '23505' })).toBe(true)
  expect(isUniqueViolation({ cause: { code: '23505' } })).toBe(true)
  expect(isUniqueViolation(new Error('x'))).toBe(false)
})
