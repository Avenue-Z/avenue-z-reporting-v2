import { expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { PgDialect } from 'drizzle-orm/pg-core'
import { approveQuery, hubCountsQuery, opensForReportQuery, progressStepQuery, projectStatsQuery, copyAsDraftQuery, discardQuery, displayStatus, failureReason, finishDraftQuery, finishFailedQuery, insertGeneratingQuery, isConstraintViolation, isReportId, liveByTokenQuery, liveSummariesQuery, markStaleGeneratingQuery, ONE_GENERATING_INDEX, recentSummariesQuery, recordOpenQuery, recordOpenSql, revokeQuery, saveSlotsQuery, SHARE_TOKEN_UNIQUE } from './store'
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

test('stale generating rows for a project are failed, with the stale code, before a new insert', () => {
  const q = markStaleGeneratingQuery('or_a', NOW).toSQL()
  expect(q.sql).toBe(
    `update ${T} set "status" = $1, "error" = $2, "updated_at" = $3, "error_code" = $4 where (${T}."peec_project_id" = $5 and ${T}."status" = $6 and ${T}."created_at" < $7)`)
  expect(q.params).toEqual(['failed', 'Timed out', NOW_ISO, 'stale', 'or_a', 'generating', STALE])
})

test('the token lookup requires approved, excludes revoked and deleted rows, and reads approved_at', () => {
  const q = liveByTokenQuery('tok').toSQL()
  expect(q.sql).toBe(
    `select "id", "html", "approved_at" from ${T} where (${T}."share_token" = $1 and ${T}."status" = $2 and ${T}."share_revoked_at" is null and ${T}."deleted_at" is null) limit $3`)
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

const OPENS = '(select count(*) from "aeo_outbound_opens" o where o."report_id" = "aeo_outbound_reports"."id" and not o."likely_automated"), (select count(*) from "aeo_outbound_opens" o where o."report_id" = "aeo_outbound_reports"."id" and o."likely_automated")'
const HUB_COLS = `"id", "peec_project_id", "peec_project_name", "brand_name", "status", "error", "error_code", "progress_step", "share_token", "share_recipient", "open_count", "first_opened_at", "last_opened_at", "created_at", "created_by", "approved_at", "approved_by", "share_revoked_at", "requested_start", "requested_end", ${OPENS}`
const CREATED_MS = `date_trunc('milliseconds', ${T}."created_at")`
test('hub summaries select exactly the hub columns, with both open counts, and never the heavy ones', () => {
  const live = liveSummariesQuery().toSQL()
  expect(live.sql).toBe(
    `select ${HUB_COLS} from ${T} where (${T}."status" = $1 and ${T}."share_revoked_at" is null and ${T}."deleted_at" is null)`)
  expect(live.params).toEqual(['approved'])
  const recent = recentSummariesQuery(501).toSQL()
  expect(recent.sql).toBe(
    `select ${HUB_COLS} from ${T} where (${T}."deleted_at" is null and not (${T}."status" = $1 and ${T}."share_revoked_at" is null)) order by ${CREATED_MS} desc, ${T}."id" desc limit $2`)
  expect(recent.params).toEqual(['approved', 501])
  for (const s of [live.sql, recent.sql]) for (const c of ['"data"', '"slots"', '"notes"', '"html"']) expect(s).not.toContain(c)
})
test('the open counts are correlated to the outer row by its qualified id, never a bare "id"', () => {
  expect(liveSummariesQuery().toSQL().sql).not.toContain('"report_id" = "id"')
})
test('Show older pages by the millisecond created_at, then id, below the cursor', () => {
  const at = new Date('2026-09-01T00:00:00Z')
  const q = recentSummariesQuery(501, null, { createdAt: at, id: ID }).toSQL()
  expect(q.sql).toBe(
    `select ${HUB_COLS} from ${T} where (${T}."deleted_at" is null and not (${T}."status" = $1 and ${T}."share_revoked_at" is null) and (${CREATED_MS} < $2::timestamptz or (${CREATED_MS} = $3::timestamptz and ${T}."id" < $4))) order by ${CREATED_MS} desc, ${T}."id" desc limit $5`)
  expect(q.params).toEqual(['approved', at.toISOString(), at.toISOString(), ID, 501])
})
test('search text is matched literally, %, _ and \\ included, over brand, project, recipient and creator', () => {
  const q = liveSummariesQuery('50%_a\\b').toSQL()
  expect(q.sql).toContain(`(${T}."brand_name" ilike $2 or ${T}."peec_project_name" ilike $3 or ${T}."share_recipient" ilike $4 or ${T}."created_by" ilike $5)`)
  expect(q.params.slice(1)).toEqual(Array(4).fill('%50\\%\\_a\\\\b%'))
})
test('tab counts are one statement over every row that is not discarded, a stale generating row counting as failed', () => {
  const q = hubCountsQuery(null, NOW).toSQL()
  expect(q.sql).toBe(
    `select count(*), count(*) filter (where "status" = 'draft'), count(*) filter (where "status" = 'approved' and "share_revoked_at" is null), count(*) filter (where "status" = 'approved' and "share_revoked_at" is not null), count(*) filter (where "status" = 'failed' or ("status" = 'generating' and "created_at" < $1::timestamptz)) from ${T} where ${T}."deleted_at" is null`)
  expect(q.params).toEqual([STALE])
  expect(hubCountsQuery('acme', NOW).toSQL().sql).toContain(`${T}."brand_name" ilike $2`)
})
test('project stats count every row not discarded and keep the newest created_at', () => {
  expect(projectStatsQuery().toSQL().sql).toBe(
    `select "peec_project_id", count(*), max("created_at") from ${T} where ${T}."deleted_at" is null group by ${T}."peec_project_id"`)
})
test('the open list for a report is newest first and capped at 200', () => {
  const q = opensForReportQuery(ID).toSQL()
  expect(q.sql).toBe('select "opened_at", "ua_family", "likely_automated", "reason" from "aeo_outbound_opens" where "aeo_outbound_opens"."report_id" = $1 order by "aeo_outbound_opens"."opened_at" desc limit $2')
  expect(q.params).toEqual([ID, 200])
})

async function withDb(select: ReturnType<typeof vi.fn>, run: (store: typeof import('./store')) => Promise<void>) {
  vi.resetModules()
  vi.doMock('@/lib/db/client', () => ({ db: { select } }))
  try { await run(await import('./store')) } finally { vi.doUnmock('@/lib/db/client'); vi.resetModules() }
}
const chain = (rows: unknown[]) => ({ from: () => ({ where: () => Object.assign(Promise.resolve(rows), { orderBy: () => ({ limit: () => Promise.resolve(rows) }) }) }) })
const mk = (id: string, ms: number) => ({ id, createdAt: new Date(ms) })

test('listReportSummaries merges the live rows with the recent ones once, newest first, with no cursor under 501', async () => {
  const day = (d: number) => Date.UTC(2026, 9, d)
  const oldLive = mk('live-old', day(1))
  const recent = [mk('r3', day(9)), mk('r2', day(8)), mk('r1', day(7))]
  const select = vi.fn().mockReturnValueOnce(chain([oldLive, recent[2]])).mockReturnValueOnce(chain(recent))
  await withDb(select, async (store) => {
    const out = await store.listReportSummaries()
    expect(out.rows.map((r) => r.id)).toEqual(['r3', 'r2', 'r1', 'live-old'])
    expect(out.cursor).toBeNull()
  })
})
test('a full page keeps 500 recent rows and returns a cursor at the 500th; a cursor read skips the live rows', async () => {
  const recent = Array.from({ length: 501 }, (_, i) => mk(`r${i}`, Date.UTC(2026, 8, 1) - i * 60_000))
  const select = vi.fn().mockReturnValueOnce(chain([])).mockReturnValueOnce(chain(recent))
  await withDb(select, async (store) => {
    const out = await store.listReportSummaries()
    expect(out.rows).toHaveLength(500)
    expect(out.cursor).toEqual({ before: recent[499].createdAt.toISOString(), beforeId: 'r499' })
  })
  const select2 = vi.fn().mockReturnValueOnce(chain(recent.slice(0, 2)))
  await withDb(select2, async (store) => {
    const out = await store.listReportSummaries({ before: { createdAt: new Date(), id: ID } })
    expect(select2).toHaveBeenCalledTimes(1)
    expect(out.rows.map((r) => r.id)).toEqual(['r0', 'r1'])
  })
})

test('finishing a draft only matches a generating row', () => {
  const q = finishDraftQuery(ID, { brandName: 'B', data: { x: 1 } as unknown as SnapshotData, slots: { y: 2 } as unknown as Slots, notes: ['n'], now: NOW }).toSQL()
  expect(q.sql).toBe(
    `update ${T} set "brand_name" = $1, "status" = $2, "data" = $3, "slots" = $4, "notes" = $5, "updated_at" = $6 where (${T}."id" = $7 and ${T}."status" = $8) returning "id"`)
  expect(q.params).toEqual(['B', 'draft', '{"x":1}', '{"y":2}', '["n"]', NOW_ISO, ID, 'generating'])
})

test('finishing as failed only matches a generating row and stores the code', () => {
  const q = finishFailedQuery(ID, 'boom', 'B', NOW, 'peec_error').toSQL()
  expect(q.sql).toBe(
    `update ${T} set "brand_name" = $1, "status" = $2, "error" = $3, "updated_at" = $4, "error_code" = $5 where (${T}."id" = $6 and ${T}."status" = $7) returning "id"`)
  expect(q.params).toEqual(['B', 'failed', 'boom', NOW_ISO, 'peec_error', ID, 'generating'])
  expect(finishFailedQuery(ID, 'boom', 'B', NOW).toSQL().params[4]).toBeNull()
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
    'insert into "aeo_outbound_reports" ("id", "peec_project_id", "peec_project_name", "brand_name", "status", "data", "slots", "notes", "revision", "error", "html", "share_token", "rerun_of", "requested_start", "requested_end", "share_recipient", "open_count", "first_opened_at", "last_opened_at", "created_by", "approved_by", "revoked_by", "deleted_by", "created_at", "updated_at", "approved_at", "share_revoked_at", "deleted_at", "progress_step", "error_code") values (default, $1, $2, default, default, default, default, default, default, default, default, default, $3, $4, $5, default, default, default, default, $6, default, default, default, default, default, default, default, default, default, default) returning "id"')
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

test('progress only moves forward, only while generating, and never touches updated_at', () => {
  const q = progressStepQuery(ID, 4).toSQL()
  expect(q.sql).toBe(`update ${T} set "progress_step" = $1 where (${T}."id" = $2 and ${T}."status" = $3 and ${T}."progress_step" < $4)`)
  expect(q.params).toEqual([4, ID, 'generating', 4])
})

test('a brand save also writes brand_name; any other save leaves it alone', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(SAVED_AT))
  try {
    const q = saveSlotsQuery(ID, 4, SLOTS, [], 'New Co').toSQL()
    expect(q.sql).toBe(
      `update ${T} set "brand_name" = $1, "slots" = $2, "notes" = $3, "revision" = ${T}."revision" + 1, "updated_at" = $4 where (${T}."id" = $5 and ${T}."status" = $6 and ${T}."revision" = $7 and ${T}."deleted_at" is null) returning "revision"`)
    expect(q.params[0]).toBe('New Co')
    expect(saveSlotsQuery(ID, 4, SLOTS, []).toSQL().sql).not.toContain('"brand_name"')
  } finally {
    vi.useRealTimers()
  }
})

test('recording an open is one statement: the counter and its event come from the same matched row', () => {
  const q = new PgDialect().sqlToQuery(recordOpenSql(ID, NOW, { uaFamily: 'Chrome on Mac', linkFresh: false }))
  expect(q.sql).toBe('with "prev" as (select "id", "last_opened_at" from "aeo_outbound_reports" where "id" = $1 and "status" = \'approved\' and "share_revoked_at" is null and "deleted_at" is null), "upd" as (update "aeo_outbound_reports" set "open_count" = "aeo_outbound_reports"."open_count" + 1, "first_opened_at" = coalesce("aeo_outbound_reports"."first_opened_at", $2::timestamptz), "last_opened_at" = $3::timestamptz from "prev" where "aeo_outbound_reports"."id" = "prev"."id" returning "aeo_outbound_reports"."id"), "cls" as (select "prev"."id", $4::boolean as "fresh", ("prev"."last_opened_at" is not null and $5::timestamptz - "prev"."last_opened_at" < interval \'10 seconds\') as "quick", $6::text = \'Other\' as "unknown" from "prev") insert into "aeo_outbound_opens" ("report_id", "opened_at", "ua_family", "likely_automated", "reason") select "upd"."id", $7::timestamptz, $8::text, ("cls"."fresh" or "cls"."quick" or "cls"."unknown"), case when "cls"."fresh" then $9 when "cls"."quick" then $10 when "cls"."unknown" then $11 else null end from "upd" join "cls" on "cls"."id" = "upd"."id"')
  expect(q.params).toEqual([ID, NOW_ISO, NOW_ISO, false, NOW_ISO, 'Chrome on Mac', NOW_ISO, 'Chrome on Mac',
    'Opened within a minute of the link being created', 'Opened within 10 seconds of the previous open', 'Not a known browser'])
  expect(q.sql).not.toContain('"updated_at"')
})

test('the 0027 migration adds only the opens and settings tables and two report columns, and is additive', () => {
  const sqlText = readFileSync('drizzle/0027_aeo_outbound_v1_1.sql', 'utf8')
  for (const c of ['ADD COLUMN "progress_step" integer DEFAULT 0 NOT NULL', 'ADD COLUMN "error_code" text', '"likely_automated" boolean NOT NULL', '"ua_family" text NOT NULL', 'CONSTRAINT "aeo_outbound_settings_single_row" CHECK ("aeo_outbound_settings"."id")', '"old_value" jsonb']) expect(sqlText).toContain(c)
  const tables = [...sqlText.matchAll(/(?:CREATE TABLE|ALTER TABLE|ON|REFERENCES)\s+"(?:public"\.")?([a-z_]+)"/g)].map((m) => m[1])
  expect(new Set(tables)).toEqual(new Set(['aeo_outbound_reports', 'aeo_outbound_opens', 'aeo_outbound_settings', 'aeo_outbound_settings_log']))
  expect(sqlText).not.toMatch(/\bDROP\b|ALTER COLUMN|RENAME/)
  expect(sqlText).not.toMatch(/\bip\b|user_agent/i)
})

test('a stored row that breaks its contract is read as unreadable, with one log line naming the field; a sound row is not', async () => {
  vi.resetModules()
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const good = { id: ID, status: 'draft', data: null, slots: { category: 'c', market: 'm', headline: 'h', summary: 's', context: 'c', competitive_bullets: [{ lead: 'a', text: 'b' }, { lead: 'a', text: 'b' }], sources_bullets: [{ lead: 'a', text: 'b' }, { lead: 'a', text: 'b' }], why: 'w', opportunities: [0, 1, 2].map(() => ({ signal: 's', opportunity: 'o', workstream: 'w' })), methodology: 'm', next_step: 'n' }, notes: ['old note'] }
  const bad = { ...good, slots: { ...good.slots, competitive_bullets: [{ lead: 'a', text: 'b' }] } }
  const select = vi.fn()
    .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve([good]) }) }) })
    .mockReturnValueOnce({ from: () => ({ where: () => ({ limit: () => Promise.resolve([bad]) }) }) })
  vi.doMock('@/lib/db/client', () => ({ db: { select } }))
  try {
    const store = await import('./store')
    expect((await store.getReport(ID))?.unreadable).toBe(false)
    expect((await store.getReport(ID))?.unreadable).toBe(true)
    expect(error.mock.calls.map((c) => String(c[0]))).toEqual(['[aeo-outbound] contract boundary=stored.slots field=competitive_bullets issue=too_small count=1 mode=enforce'])
  } finally {
    vi.doUnmock('@/lib/db/client')
    vi.resetModules()
    error.mockRestore()
  }
})
