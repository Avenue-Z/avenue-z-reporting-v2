// The only reader and writer of aeo_outbound_reports (spec §9). Every write is one conditional UPDATE with
// .returning(), so a lost race matches nothing instead of reporting success (app/actions/commentary.ts:17-37).
import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { aeoOutboundReports as t, type AeoOutboundRow } from '@/lib/db/schema'
import { STALE_GENERATING_MS } from './config'
import type { SnapshotData } from './metrics'
import type { Slots } from './slots'

const staleBefore = (now: Date) => new Date(now.getTime() - STALE_GENERATING_MS)

/** A row with its JSON columns typed. The schema keeps them untyped so it never imports this folder. */
export type ReportRow = Omit<AeoOutboundRow, 'data' | 'slots'> & { data: SnapshotData | null; slots: Slots | null }
const typed = (r: AeoOutboundRow): ReportRow => r as unknown as ReportRow

export function markStaleGeneratingQuery(projectId: string, now: Date) {
  return db.update(t)
    .set({ status: 'failed', error: 'Timed out', updatedAt: now })
    .where(and(eq(t.peecProjectId, projectId), eq(t.status, 'generating'), lt(t.createdAt, staleBefore(now))))
}

export function insertGeneratingQuery(v: { projectId: string; projectName: string; createdBy: string; rerunOf: string | null }) {
  return db.insert(t)
    .values({ peecProjectId: v.projectId, peecProjectName: v.projectName, createdBy: v.createdBy, rerunOf: v.rerunOf })
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

export function approveQuery(id: string, shownRevision: number, v: { html: string; token: string; by: string; now: Date }) {
  return db.update(t)
    .set({ status: 'approved', html: v.html, shareToken: v.token, approvedBy: v.by, approvedAt: v.now, updatedAt: v.now })
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

export async function listReports(): Promise<ReportRow[]> {
  return (await db.select().from(t).where(isNull(t.deletedAt)).orderBy(desc(t.createdAt)).limit(200)).map(typed)
}

export async function findGeneratingFor(projectId: string): Promise<string | undefined> {
  return (await db.select({ id: t.id }).from(t).where(and(eq(t.peecProjectId, projectId), eq(t.status, 'generating'))).limit(1))[0]?.id
}

export function liveByTokenQuery(token: string) {
  return db.select({ html: t.html }).from(t)
    .where(and(eq(t.shareToken, token), eq(t.status, 'approved'), isNull(t.shareRevokedAt), isNull(t.deletedAt))).limit(1)
}

/** The frozen HTML for a live link, or undefined for unknown, revoked or discarded tokens. */
export async function getLiveByToken(token: string): Promise<string | undefined> {
  const r = (await liveByTokenQuery(token))[0]
  return r?.html ?? undefined
}

export function isUniqueViolation(e: unknown): boolean {
  const code = (x: unknown) => (x as { code?: string } | null)?.code
  return code(e) === '23505' || code((e as { cause?: unknown } | null)?.cause) === '23505'
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
