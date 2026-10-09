import { expect, test } from 'vitest'
import { approveQuery, discardQuery, displayStatus, failureReason, isReportId, isUniqueViolation, markStaleGeneratingQuery, revokeQuery, saveSlotsQuery } from './store'
import type { AeoOutboundRow } from '@/lib/db/schema'
import type { Slots } from './slots'

const ID = 'c7d8e0a1-1111-4111-8111-111111111111'
const NOW = new Date('2026-10-08T15:00:00Z')
const where = (q: { sql: string }) => q.sql.slice(q.sql.indexOf(' where '))
const SLOTS = {} as Slots

test('save matches a live draft at the shown revision and bumps it', () => {
  const q = saveSlotsQuery(ID, 4, SLOTS, ['n']).toSQL()
  expect(where(q)).toContain('"aeo_outbound_reports"."status" = $')
  expect(where(q)).toContain('"aeo_outbound_reports"."revision" = $')
  expect(where(q)).toContain('"aeo_outbound_reports"."deleted_at" is null')
  expect(q.params).toContain('draft')
  expect(q.params).toContain(4)
  expect(q.sql).toContain('"revision" = "aeo_outbound_reports"."revision" + 1')
})

test('approve matches a live draft at the shown revision', () => {
  const q = approveQuery(ID, 7, { html: '<html>', token: 'a'.repeat(24), by: 'ryan@avenuez.com', now: NOW }).toSQL()
  expect(q.params).toEqual(expect.arrayContaining(['approved', 'draft', 7, '<html>', 'a'.repeat(24), 'ryan@avenuez.com']))
  expect(where(q)).toContain('"aeo_outbound_reports"."deleted_at" is null')
})

test('revoke only touches a live approved link', () => {
  const q = revokeQuery(ID, 'ryan@avenuez.com', NOW).toSQL()
  expect(where(q)).toContain('"aeo_outbound_reports"."share_revoked_at" is null')
  expect(where(q)).toContain('"aeo_outbound_reports"."deleted_at" is null')
  expect(q.params).toContain('approved')
})

test('discard matches draft, failed, or generating older than 6 minutes, and turns generating into failed', () => {
  const q = discardQuery(ID, 'ryan@avenuez.com', NOW).toSQL()
  expect(where(q)).toContain('"aeo_outbound_reports"."deleted_at" is null')
  expect(q.sql).toContain('case when')
  expect(q.params).toContain(new Date(NOW.getTime() - 6 * 60_000).toISOString())
})

test('stale generating rows for a project are failed before a new insert', () => {
  const q = markStaleGeneratingQuery('or_a', NOW).toSQL()
  expect(q.params).toEqual(expect.arrayContaining(['failed', 'or_a', 'generating']))
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
