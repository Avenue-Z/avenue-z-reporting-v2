// The only reader and writer of aeo_outbound_reports (spec §9). Every write (updates and inserts) is one conditional
// statement, and all but markStaleGeneratingQuery and recordOpenQuery end in .returning(), so a lost race matches
// nothing instead of reporting success (app/actions/commentary.ts:17-37). Those two do not return rows.
import { and, desc, eq, inArray, isNull, lt, not, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { aeoOutboundReports as t, type AeoOutboundRow } from '@/lib/db/schema'
import { STALE_GENERATING_MS } from './config'
import type { SnapshotData } from './metrics'
import type { Slots } from './slots'
import { isShareTokenShape } from './token'

const staleBefore = (now: Date) => new Date(now.getTime() - STALE_GENERATING_MS)

/** A row with its JSON columns typed. The schema keeps them untyped so it never imports this folder. */
export type ReportRow = Omit<AeoOutboundRow, 'data' | 'slots'> & { data: SnapshotData | null; slots: Slots | null }
const typed = (r: AeoOutboundRow): ReportRow => r as unknown as ReportRow

export function markStaleGeneratingQuery(projectId: string, now: Date) {
  return db.update(t)
    .set({ status: 'failed', error: 'Timed out', updatedAt: now })
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

export function finishDraftQuery(id: string, v: { brandName: string; data: SnapshotData; slots: Slots; notes: string[]; now: Date }) {
  return db.update(t)
    .set({ status: 'draft', brandName: v.brandName, data: v.data as unknown as Record<string, unknown>, slots: v.slots as unknown as Record<string, unknown>, notes: v.notes, updatedAt: v.now })
    .where(and(eq(t.id, id), eq(t.status, 'generating')))
    .returning({ id: t.id })
}

export function finishFailedQuery(id: string, error: string, brandName: string | null, now: Date) {
  return db.update(t)
    .set({ status: 'failed', error: error.slice(0, 500), brandName, updatedAt: now })
    .where(and(eq(t.id, id), eq(t.status, 'generating')))
    .returning({ id: t.id })
}

export function saveSlotsQuery(id: string, shownRevision: number, slots: Slots, notes: string[]) {
  return db.update(t)
    .set({ slots: slots as unknown as Record<string, unknown>, notes, revision: sql`${t.revision} + 1`, updatedAt: new Date() })
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
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
  return db.select({ id: t.id, html: t.html }).from(t)
    .where(and(eq(t.shareToken, token), eq(t.status, 'approved'), isNull(t.shareRevokedAt), isNull(t.deletedAt))).limit(1)
}

/** The row id and frozen HTML for a live link, or undefined for unknown, revoked or discarded tokens. */
export async function getLiveByToken(token: string): Promise<{ id: string; html: string } | undefined> {
  if (!isShareTokenShape(token)) return undefined
  const r = (await liveByTokenQuery(token))[0]
  return r?.html ? { id: r.id, html: r.html } : undefined
}

/** Counts one open of a live link. Leaves updated_at alone: an open is not an edit. Returns no rows. */
export function recordOpenQuery(id: string, now: Date) {
  return db.update(t)
    .set({ openCount: sql`${t.openCount} + 1`, firstOpenedAt: sql`coalesce(${t.firstOpenedAt}, ${now.toISOString()}::timestamptz)`, lastOpenedAt: now })
    .where(and(eq(t.id, id), eq(t.status, 'approved'), isNull(t.shareRevokedAt), isNull(t.deletedAt)))
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

const hubColumns = {
  id: t.id,
  peecProjectId: t.peecProjectId,
  peecProjectName: t.peecProjectName,
  brandName: t.brandName,
  status: t.status,
  error: t.error,
  shareToken: t.shareToken,
  shareRecipient: t.shareRecipient,
  openCount: t.openCount,
  firstOpenedAt: t.firstOpenedAt,
  lastOpenedAt: t.lastOpenedAt,
  createdAt: t.createdAt,
  approvedAt: t.approvedAt,
  shareRevokedAt: t.shareRevokedAt,
}
/** One hub row: the columns the list shows, never data, slots, notes or html. */
export type ReportSummary = Pick<AeoOutboundRow, keyof typeof hubColumns>

/** Every live link, with no limit, so a live link can never fall off the hub. */
export function liveSummariesQuery() {
  return db.select(hubColumns).from(t).where(and(eq(t.status, 'approved'), isNull(t.shareRevokedAt), isNull(t.deletedAt)))
}

/** The newest rows that are not live and not discarded. */
export function recentSummariesQuery(limit: number) {
  return db.select(hubColumns).from(t).where(and(isNull(t.deletedAt), not(and(eq(t.status, 'approved'), isNull(t.shareRevokedAt))!))).orderBy(desc(t.createdAt)).limit(limit)
}

export const HUB_RECENT_LIMIT = 500

/** All live links plus the newest HUB_RECENT_LIMIT others, each row once, newest first. */
export async function listReportSummaries(): Promise<ReportSummary[]> {
  const [live, recent] = await Promise.all([liveSummariesQuery(), recentSummariesQuery(HUB_RECENT_LIMIT)])
  const seen = new Set<string>()
  return [...live, ...recent]
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
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
