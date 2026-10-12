// The only reader and writer of aeo_outbound_reports and aeo_outbound_opens (spec §9, v1.1 §6). Every write is one conditional statement; all but markStaleGeneratingQuery, progressStepQuery and the open writes end in .returning(), so a lost race matches nothing instead of reporting success (app/actions/commentary.ts:17-37).
import { and, desc, eq, ilike, inArray, isNull, lt, not, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { aeoOutboundOpens as o, aeoOutboundReports as t, type AeoOutboundRow } from '@/lib/db/schema'
import { STALE_GENERATING_MS, type ContractBoundary } from './config'
import { checkContract, REPORT_ID_RE, STORED_DATA, STORED_NOTES, STORED_SLOTS } from './contracts'
import type { ZodType } from 'zod'
import type { SnapshotData } from './metrics'
import type { StoredNote } from './notes'
import type { Slots } from './slots'
import type { ErrorCode } from './error-codes'
import { OPEN_REASONS } from './opens'
import { isShareTokenShape } from './token'

const staleBefore = (now: Date) => new Date(now.getTime() - STALE_GENERATING_MS)

/** A row with its JSON columns typed. The schema keeps them untyped so it never imports this folder. unreadable is true
 *  when a stored column breaks its contract (v1.1 §10): the editor then says so instead of rendering it. */
export type ReportRow = Omit<AeoOutboundRow, 'data' | 'slots' | 'notes'> & { data: SnapshotData | null; slots: Slots | null; notes: StoredNote[] | null; unreadable?: boolean }
const breaks = (boundary: ContractBoundary, schema: ZodType, value: unknown): boolean => value !== null && !checkContract(boundary, schema, value).ok
function typed(r: AeoOutboundRow): ReportRow {
  const unreadable = breaks('stored.data', STORED_DATA, r.data) || breaks('stored.slots', STORED_SLOTS, r.slots) || breaks('stored.notes', STORED_NOTES, r.notes)
  return { ...(r as unknown as Omit<ReportRow, 'unreadable'>), unreadable }
}

export function markStaleGeneratingQuery(projectId: string, now: Date) {
  return db.update(t)
    .set({ status: 'failed', error: 'Timed out', errorCode: 'stale', updatedAt: now })
    .where(and(eq(t.peecProjectId, projectId), eq(t.status, 'generating'), lt(t.createdAt, staleBefore(now))))
}

/** The two named constraints a write can lose a race on (spec §7a step 4). Recognized by name, never by code alone. */
export const ONE_GENERATING_INDEX = 'aeo_outbound_one_generating'
export const SHARE_TOKEN_UNIQUE = 'aeo_outbound_reports_share_token_unique'

export function insertGeneratingQuery(v: { projectId: string; projectName: string; createdBy: string; rerunOf: string | null; range: { start: string; end: string } | null }) {
  return db.insert(t)
    .values({ peecProjectId: v.projectId, peecProjectName: v.projectName, createdBy: v.createdBy, rerunOf: v.rerunOf, requestedStart: v.range?.start ?? null, requestedEnd: v.range?.end ?? null })
    .returning({ id: t.id })
}

export function finishDraftQuery(id: string, v: { brandName: string; data: SnapshotData; slots: Slots; notes: StoredNote[]; now: Date }) {
  return db.update(t)
    .set({ status: 'draft', brandName: v.brandName, data: v.data as unknown as Record<string, unknown>, slots: v.slots as unknown as Record<string, unknown>, notes: v.notes, updatedAt: v.now })
    .where(and(eq(t.id, id), eq(t.status, 'generating')))
    .returning({ id: t.id })
}

export function finishFailedQuery(id: string, error: string, brandName: string | null, now: Date, code: ErrorCode | null = null) {
  return db.update(t)
    .set({ status: 'failed', error: error.slice(0, 500), errorCode: code, brandName, updatedAt: now })
    .where(and(eq(t.id, id), eq(t.status, 'generating')))
    .returning({ id: t.id })
}

/** The generating row's latest step (spec v1.1 §7). Only forward, only while generating, never touches updated_at. */
export function progressStepQuery(id: string, step: number) {
  return db.update(t).set({ progressStep: step }).where(and(eq(t.id, id), eq(t.status, 'generating'), lt(t.progressStep, step)))
}

/** brandName is passed only for a save of the brand slot (spec v1.1 §3), so the hub and search use the edited name. */
export function saveSlotsQuery(id: string, shownRevision: number, slots: Slots, notes: StoredNote[], brandName?: string) {
  return db.update(t)
    .set({
      slots: slots as unknown as Record<string, unknown>, notes, revision: sql`${t.revision} + 1`, updatedAt: new Date(),
      ...(brandName !== undefined ? { brandName } : {}),
    })
    .where(and(eq(t.id, id), eq(t.status, 'draft'), eq(t.revision, shownRevision), isNull(t.deletedAt)))
    .returning({ revision: t.revision })
}

export function approveQuery(id: string, shownRevision: number, v: { html: string; token: string; recipient: string; by: string; now: Date }) {
  return db.update(t)
    .set({ status: 'approved', html: v.html, shareToken: v.token, shareRecipient: v.recipient, approvedBy: v.by, approvedAt: v.now, updatedAt: v.now })
    .where(and(eq(t.id, id), eq(t.status, 'draft'), eq(t.revision, shownRevision), isNull(t.deletedAt)))
    .returning({ id: t.id, shareToken: t.shareToken })
}

export function revokeQuery(id: string, by: string, now: Date) {
  return db.update(t)
    .set({ shareRevokedAt: now, revokedBy: by, updatedAt: now })
    .where(and(eq(t.id, id), eq(t.status, 'approved'), isNull(t.shareRevokedAt), isNull(t.deletedAt)))
    .returning({ id: t.id })
}

export function discardQuery(id: string, by: string, now: Date) {
  const stale = staleBefore(now)
  return db.update(t)
    .set({
      status: sql`case when ${t.status} = 'generating' then 'failed'::aeo_outbound_status else ${t.status} end`,
      deletedAt: now,
      deletedBy: by,
      updatedAt: now,
    })
    .where(and(
      eq(t.id, id),
      isNull(t.deletedAt),
      or(inArray(t.status, ['draft', 'failed']), and(eq(t.status, 'generating'), lt(t.createdAt, stale))),
    ))
    .returning({ id: t.id })
}

const UUID = REPORT_ID_RE
export const isReportId = (id: unknown): id is string => typeof id === 'string' && UUID.test(id)

/** undefined for a malformed id, an unknown id or a discarded row (a malformed id never reaches Postgres). */
export async function getReport(id: string): Promise<ReportRow | undefined> {
  if (!isReportId(id)) return undefined
  const r = (await db.select().from(t).where(and(eq(t.id, id), isNull(t.deletedAt))).limit(1))[0]
  return r ? typed(r) : undefined
}

export async function findGeneratingFor(projectId: string): Promise<string | undefined> {
  return (await db.select({ id: t.id }).from(t).where(and(eq(t.peecProjectId, projectId), eq(t.status, 'generating'))).limit(1))[0]?.id
}

export function liveByTokenQuery(token: string) {
  return db.select({ id: t.id, html: t.html, approvedAt: t.approvedAt }).from(t)
    .where(and(eq(t.shareToken, token), eq(t.status, 'approved'), isNull(t.shareRevokedAt), isNull(t.deletedAt))).limit(1)
}

/** The row id, frozen HTML and link creation time for a live link, or undefined for unknown, revoked or discarded tokens. */
export async function getLiveByToken(token: string): Promise<{ id: string; html: string; approvedAt: Date | null } | undefined> {
  if (!isShareTokenShape(token)) return undefined
  const r = (await liveByTokenQuery(token))[0]
  return r?.html ? { id: r.id, html: r.html, approvedAt: r.approvedAt } : undefined
}

/**
 * One counted open as one statement (spec v1.1 §6): the counter update and the event insert both come from the same
 * live-row match, so they always agree, and the event's classification reads the previous open in that statement. Two
 * opens in the same instant may both miss each other (best effort, stated in the hub's caveat).
 */
export function recordOpenSql(id: string, now: Date, v: { uaFamily: string; linkFresh: boolean }): SQL {
  const at = now.toISOString()
  return sql`with "prev" as (select "id", "last_opened_at" from "aeo_outbound_reports" where "id" = ${id} and "status" = 'approved' and "share_revoked_at" is null and "deleted_at" is null), "upd" as (update "aeo_outbound_reports" set "open_count" = "aeo_outbound_reports"."open_count" + 1, "first_opened_at" = coalesce("aeo_outbound_reports"."first_opened_at", ${at}::timestamptz), "last_opened_at" = ${at}::timestamptz from "prev" where "aeo_outbound_reports"."id" = "prev"."id" returning "aeo_outbound_reports"."id"), "cls" as (select "prev"."id", ${v.linkFresh}::boolean as "fresh", ("prev"."last_opened_at" is not null and ${at}::timestamptz - "prev"."last_opened_at" < interval '10 seconds') as "quick", ${v.uaFamily}::text = 'Other' as "unknown" from "prev") insert into "aeo_outbound_opens" ("report_id", "opened_at", "ua_family", "likely_automated", "reason") select "upd"."id", ${at}::timestamptz, ${v.uaFamily}::text, ("cls"."fresh" or "cls"."quick" or "cls"."unknown"), case when "cls"."fresh" then ${OPEN_REASONS.fresh} when "cls"."quick" then ${OPEN_REASONS.quick} when "cls"."unknown" then ${OPEN_REASONS.unknown} else null end from "upd" join "cls" on "cls"."id" = "upd"."id"`
}

export async function recordOpen(id: string, now: Date, v: { uaFamily: string; linkFresh: boolean }): Promise<void> {
  await db.execute(recordOpenSql(id, now, v))
}

/** Edit a copy: a new draft carrying an approved row's data, slots and notes, with rerun_of pointing at it and the requested range carried over. */
export function copyAsDraftQuery(sourceId: string, by: string, now: Date) {
  // One literal statement: insert-select cannot carry the 'draft' literal or the parameters through Drizzle's typed builder.
  const at = now.toISOString()
  return sql`insert into "aeo_outbound_reports" ("peec_project_id", "peec_project_name", "brand_name", "status", "data", "slots", "notes", "rerun_of", "requested_start", "requested_end", "created_by", "created_at", "updated_at") select "peec_project_id", "peec_project_name", "brand_name", 'draft', "data", "slots", "notes", "id", "requested_start", "requested_end", ${by}, ${at}::timestamptz, ${at}::timestamptz from "aeo_outbound_reports" where "id" = ${sourceId} and "status" = 'approved' and "deleted_at" is null returning "id"`
}

/** The new draft's id, or undefined when the source is not an approved (live or revoked) row (a lost race matches nothing). */
export async function copyAsDraft(sourceId: string, by: string, now: Date): Promise<string | undefined> {
  if (!isReportId(sourceId)) return undefined
  const res = await db.execute(copyAsDraftQuery(sourceId, by, now))
  return (res.rows[0] as { id?: string } | undefined)?.id
}

// The hub's per-row open counts, from an aggregate over aeo_outbound_opens (spec v1.1 §6). Written as raw SQL because a
// Drizzle column inside sql`` in a one-table select renders unqualified, and a bare "id" here would mean the opens row.
const OPENS_PERSON = sql<number>`(select count(*) from "aeo_outbound_opens" o where o."report_id" = "aeo_outbound_reports"."id" and not o."likely_automated")`.mapWith(Number)
const OPENS_AUTOMATED = sql<number>`(select count(*) from "aeo_outbound_opens" o where o."report_id" = "aeo_outbound_reports"."id" and o."likely_automated")`.mapWith(Number)
const plainHubColumns = {
  id: t.id, peecProjectId: t.peecProjectId, peecProjectName: t.peecProjectName, brandName: t.brandName, status: t.status,
  error: t.error, errorCode: t.errorCode, progressStep: t.progressStep, shareToken: t.shareToken, shareRecipient: t.shareRecipient,
  openCount: t.openCount, firstOpenedAt: t.firstOpenedAt, lastOpenedAt: t.lastOpenedAt, createdAt: t.createdAt, createdBy: t.createdBy,
  approvedAt: t.approvedAt, approvedBy: t.approvedBy, shareRevokedAt: t.shareRevokedAt, requestedStart: t.requestedStart, requestedEnd: t.requestedEnd,
}
const hubColumns = { ...plainHubColumns, opensPerson: OPENS_PERSON, opensAutomated: OPENS_AUTOMATED }
/** One hub row: the columns the list shows plus the two open counts, never data, slots, notes or html. */
export type ReportSummary = Pick<AeoOutboundRow, keyof typeof plainHubColumns> & { opensPerson: number; opensAutomated: number }
/** Where Show older continues: the oldest recent row already sent, as ISO time and id. */
export type HubCursor = { before: string; beforeId: string }

/** Search over brand, Peec project, recipient and creator; %, _ and \ match literally (spec v1.1 §5). */
function searchWhere(q: string | null): SQL | undefined {
  if (!q) return undefined
  const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
  return or(ilike(t.brandName, pattern), ilike(t.peecProjectName, pattern), ilike(t.shareRecipient, pattern), ilike(t.createdBy, pattern))
}
/** created_at at millisecond precision, the precision a JS Date carries, so a cursor never skips a row. */
const createdMs = sql`date_trunc('milliseconds', ${t.createdAt})`

/** Every live link, with no limit, so a live link can never fall off the hub. */
export function liveSummariesQuery(q: string | null = null) {
  return db.select(hubColumns).from(t).where(and(eq(t.status, 'approved'), isNull(t.shareRevokedAt), isNull(t.deletedAt), searchWhere(q)))
}

/** The newest rows that are not live and not discarded, below an optional cursor. */
export function recentSummariesQuery(limit: number, q: string | null = null, before: { createdAt: Date; id: string } | null = null) {
  const iso = before?.createdAt.toISOString()
  const below = before ? or(sql`${createdMs} < ${iso}::timestamptz`, and(sql`${createdMs} = ${iso}::timestamptz`, lt(t.id, before.id))) : undefined
  return db.select(hubColumns).from(t)
    .where(and(isNull(t.deletedAt), not(and(eq(t.status, 'approved'), isNull(t.shareRevokedAt))!), searchWhere(q), below))
    .orderBy(desc(createdMs), desc(t.id)).limit(limit)
}

export const HUB_RECENT_LIMIT = 500

/** All live links plus the newest HUB_RECENT_LIMIT others, each row once, newest first; with a cursor, only the next
 *  HUB_RECENT_LIMIT older rows (the live ones are already on screen). */
export async function listReportSummaries(opts: { q?: string | null; before?: { createdAt: Date; id: string } | null } = {}): Promise<{ rows: ReportSummary[]; cursor: HubCursor | null }> {
  const q = opts.q ?? null
  const before = opts.before ?? null
  const [live, recent] = await Promise.all([
    before ? Promise.resolve([] as ReportSummary[]) : liveSummariesQuery(q),
    recentSummariesQuery(HUB_RECENT_LIMIT + 1, q, before),
  ])
  const page = recent.slice(0, HUB_RECENT_LIMIT)
  const last = page.at(-1)
  const cursor = recent.length > HUB_RECENT_LIMIT && last ? { before: last.createdAt.toISOString(), beforeId: last.id } : null
  const seen = new Set<string>()
  const rows = [...live, ...page]
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  return { rows, cursor }
}

export type HubCounts = { all: number; draft: number; live: number; revoked: number; failed: number }
/** The tab counts in one statement over every row not discarded (spec v1.1 §5), a stale generating row counting as failed. */
export function hubCountsQuery(q: string | null, now: Date) {
  const stale = staleBefore(now).toISOString()
  return db.select({
    all: sql<number>`count(*)`.mapWith(Number),
    draft: sql<number>`count(*) filter (where ${t.status} = 'draft')`.mapWith(Number),
    live: sql<number>`count(*) filter (where ${t.status} = 'approved' and ${t.shareRevokedAt} is null)`.mapWith(Number),
    revoked: sql<number>`count(*) filter (where ${t.status} = 'approved' and ${t.shareRevokedAt} is not null)`.mapWith(Number),
    failed: sql<number>`count(*) filter (where ${t.status} = 'failed' or (${t.status} = 'generating' and ${t.createdAt} < ${stale}::timestamptz))`.mapWith(Number),
  }).from(t).where(and(isNull(t.deletedAt), searchWhere(q)))
}
export async function hubCounts(q: string | null, now: Date): Promise<HubCounts> {
  return (await hubCountsQuery(q, now))[0] ?? { all: 0, draft: 0, live: 0, revoked: 0, failed: 0 }
}

export type ProjectStat = { count: number; last: string }
/** For the project picker's "{n} snapshots, last {date}" (spec v1.1 §11). */
export function projectStatsQuery() {
  return db.select({ projectId: t.peecProjectId, count: sql<number>`count(*)`.mapWith(Number), last: sql<Date>`max(${t.createdAt})`.mapWith(t.createdAt) })
    .from(t).where(isNull(t.deletedAt)).groupBy(t.peecProjectId)
}
export async function projectStats(): Promise<Record<string, ProjectStat>> {
  const out: Record<string, ProjectStat> = {}
  for (const r of await projectStatsQuery()) out[r.projectId] = { count: r.count, last: r.last.toISOString() }
  return out
}

/** The open list the editor shows for a live or revoked row: newest first, at most 200. */
export function opensForReportQuery(id: string) {
  return db.select({ openedAt: o.openedAt, uaFamily: o.uaFamily, likelyAutomated: o.likelyAutomated, reason: o.reason })
    .from(o).where(eq(o.reportId, id)).orderBy(desc(o.openedAt)).limit(200)
}

/** True when a write lost a race on the named unique constraint: Postgres 23505 with that constraint name. Drizzle wraps the
 *  driver's error (DrizzleQueryError.cause), so the chain is walked, at most 5 deep (lib/organic-social/chart-notes/mutations.ts:125). */
export function isConstraintViolation(e: unknown, name: string): boolean {
  let cur: unknown = e
  for (let i = 0; i < 5 && cur && typeof cur === 'object'; i++) {
    const { code, constraint, message, cause } = cur as { code?: unknown; constraint?: unknown; message?: unknown; cause?: unknown }
    const named = constraint === name || (typeof message === 'string' && message.includes(name))
    if (code === '23505' && named) return true
    cur = cause
  }
  return false
}

/** The reason shown for a failed row; a generating row past the stale limit reads "Timed out" (spec §9). */
export function failureReason(row: Pick<AeoOutboundRow, 'status' | 'createdAt' | 'error'>, nowMs: number): string | null {
  if (row.error) return row.error
  return row.status === 'generating' && nowMs - new Date(row.createdAt).getTime() > STALE_GENERATING_MS ? 'Timed out' : null
}

export type DisplayStatus = 'generating' | 'draft' | 'live' | 'revoked' | 'failed'
export function displayStatus(row: Pick<AeoOutboundRow, 'status' | 'createdAt' | 'shareRevokedAt'>, nowMs: number): DisplayStatus {
  if (row.status === 'generating') return nowMs - new Date(row.createdAt).getTime() > STALE_GENERATING_MS ? 'failed' : 'generating'
  if (row.status === 'approved') return row.shareRevokedAt ? 'revoked' : 'live'
  return row.status
}

/** The code shown for a failed row; a generating row past the stale limit reads stale (spec v1.1 §7). */
export function failureCode(row: Pick<AeoOutboundRow, 'status' | 'createdAt' | 'errorCode'>, nowMs: number): string | null {
  if (row.errorCode) return row.errorCode
  return row.status === 'generating' && nowMs - new Date(row.createdAt).getTime() > STALE_GENERATING_MS ? 'stale' : null
}
