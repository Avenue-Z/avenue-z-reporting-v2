// lib/technical-audit/store.ts
// Every database read and write of the Technical Audit snapshot page. Server only. The daily sweep, the staff
// server actions and the page all go through here.
//
// Multi-statement writes use db.batch, which the neon-http driver runs as ONE transaction (the repo's pattern,
// lib/organic-social/social-listening/store.ts). Thrown messages are fixed strings: never source bytes, row
// contents or driver error text, since callers log them.

import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  techAuditIssueOverrides, techAuditMetrics, techAuditSnapshots, techAuditSourceIssues, techAuditSourceRuns,
} from '@/lib/db/schema'
import { TA_SOURCES } from './types'
import type { SourceIssue, TaIssueSource, TaSource } from './types'

export type SnapshotRow = typeof techAuditSnapshots.$inferSelect
export type TechAuditSnapshotInsert = typeof techAuditSnapshots.$inferInsert
export type TechAuditMetricsInsert = typeof techAuditMetrics.$inferInsert
export type MetricsRow = typeof techAuditMetrics.$inferSelect
export type IssueRow = typeof techAuditSourceIssues.$inferSelect
export type OverrideRow = typeof techAuditIssueOverrides.$inferSelect
/** A run row as pages see it: never the `raw` file. */
export type RunRow = Omit<typeof techAuditSourceRuns.$inferSelect, 'raw'>

const RAW_MAX_BYTES = 2_097_152 // the column's CHECK (octet_length(raw) <= 2 MiB), rejected here with a clean message
const LAST_ERROR_MAX = 500
const NOTE_MAX = 280

/** Which tech_audit_source_issues.source (and device) each run's issue rows live under. */
const ISSUE_SCOPE: Record<TaSource, { source: TaIssueSource; device: 'mobile' | 'desktop' | null }> = {
  sf: { source: 'sf', device: null },
  ahrefs: { source: 'ahrefs', device: null },
  gsc_indexing: { source: 'gsc_indexing', device: null },
  gsc_cwv_mobile: { source: 'gsc_cwv', device: 'mobile' },
  gsc_cwv_desktop: { source: 'gsc_cwv', device: 'desktop' },
}

/** Insert the snapshot if (client, date) is new, and make sure all five run rows exist. Runs are inserted whether or
 *  not the snapshot was new, so a crash between the two inserts heals on the next call instead of leaving a snapshot
 *  the sweep can never work. */
export async function ensureSnapshot(
  clientId: string,
  run: { date: string; folderId: string },
): Promise<{ id: string; created: boolean }> {
  const inserted = await db
    .insert(techAuditSnapshots)
    .values({ id: randomUUID(), clientId, snapshotDate: run.date, sfRunFolderId: run.folderId })
    .onConflictDoNothing({ target: [techAuditSnapshots.clientId, techAuditSnapshots.snapshotDate] })
    .returning({ id: techAuditSnapshots.id })
  let id = inserted[0]?.id
  const created = Boolean(id)
  if (!id) {
    const [existing] = await db
      .select({ id: techAuditSnapshots.id })
      .from(techAuditSnapshots)
      .where(and(eq(techAuditSnapshots.clientId, clientId), eq(techAuditSnapshots.snapshotDate, run.date)))
      .limit(1)
    if (!existing) throw new Error('snapshot not found after conflict')
    id = existing.id
  }
  await db
    .insert(techAuditSourceRuns)
    .values(TA_SOURCES.map((source) => ({ snapshotId: id, source })))
    .onConflictDoNothing({ target: [techAuditSourceRuns.snapshotId, techAuditSourceRuns.source] })
  return { id, created }
}

/** Atomically take a run for this sweep. True iff this caller now owns it: the run is pending or failed (or `missing`
 *  with `includeMissing`) AND the snapshot is a draft (always: a published snapshot must not change under its readers,
 *  so a publish between the caller's read and this claim wins) AND was never started or its last claim
 *  is older than `staleAfterMs` (the previous owner is presumed dead). A just-failed run keeps its started_at, so it
 *  waits `staleAfterMs` before it can be reclaimed (pass 0 to retry at once). Two concurrent sweeps cannot both get
 *  true: the second UPDATE re-checks the row after the first commits and finds it fresh. */
export async function claimRun(
  snapshotId: string,
  source: TaSource,
  staleAfterMs = 600_000,
  opts: { includeMissing?: boolean } = {},
): Promise<boolean> {
  if (!Number.isFinite(staleAfterMs) || staleAfterMs < 0) throw new Error('staleAfterMs must be a non-negative number')
  const rows = await db
    .update(techAuditSourceRuns)
    .set({ attempts: sql`${techAuditSourceRuns.attempts} + 1`, startedAt: sql`now()`, updatedAt: sql`now()` })
    .where(and(
      eq(techAuditSourceRuns.snapshotId, snapshotId),
      eq(techAuditSourceRuns.source, source),
      inArray(techAuditSourceRuns.status, opts.includeMissing ? ['pending', 'failed', 'missing'] : ['pending', 'failed']),
      // Drafts only, whatever includeMissing says: a snapshot published since the caller read it must not be claimed.
      inArray(techAuditSourceRuns.snapshotId, db.select({ id: techAuditSnapshots.id }).from(techAuditSnapshots)
        .where(and(eq(techAuditSnapshots.id, snapshotId), eq(techAuditSnapshots.status, 'draft')))),
      or(
        isNull(techAuditSourceRuns.startedAt),
        sql`${techAuditSourceRuns.startedAt} < now() - (${Math.floor(staleAfterMs)} * interval '1 millisecond')`,
      ),
    ))
    .returning({ id: techAuditSourceRuns.id })
  return rows.length > 0
}

/** Persist a parsed source in one transaction: replace that source's issue rows, upsert its metrics columns, update
 *  the snapshot's dates/score, and mark the run complete (keeping `raw`). Re-running for the same source converges on
 *  the same rows. Only the keys present in `metrics` are written (null is a real value, undefined is "not mine"), so
 *  one source never wipes another's columns. `uploadedBy` (a staff upload) is recorded on the run. `requireDraft` (the sweep) writes nothing and throws `run not found`
 *  when the snapshot has been published since the caller claimed the run. */
export async function completeRun(
  clientId: string,
  snapshotId: string,
  source: TaSource,
  raw: Uint8Array,
  write: {
    metrics?: Partial<TechAuditMetricsInsert>
    issues?: SourceIssue[]
    snapshot?: Partial<TechAuditSnapshotInsert>
  },
  opts: { requireDraft?: boolean; uploadedBy?: string } = {},
): Promise<void> {
  if (raw.byteLength > RAW_MAX_BYTES) throw new Error('raw file too large')
  const scope = ISSUE_SCOPE[source]
  const issues = write.issues ?? []
  if (issues.some((i) => i.source !== scope.source || (scope.device !== null && i.device !== scope.device))) {
    throw new Error('issue does not belong to this source')
  }
  const [run] = await db
    .select({ id: techAuditSourceRuns.id })
    .from(techAuditSourceRuns)
    .innerJoin(techAuditSnapshots, eq(techAuditSnapshots.id, techAuditSourceRuns.snapshotId))
    .where(and(
      eq(techAuditSourceRuns.snapshotId, snapshotId),
      eq(techAuditSourceRuns.source, source),
      eq(techAuditSnapshots.clientId, clientId),
      ...(opts.requireDraft ? [eq(techAuditSnapshots.status, 'draft')] : []),
    ))
    .limit(1)
  if (!run) throw new Error('run not found')

  const metrics = definedEntries(write.metrics, ['id', 'snapshotId'])
  const snapshot = definedEntries(write.snapshot, ['id', 'clientId', 'snapshotDate', 'status', 'publishedAt', 'publishedBy', 'createdAt', 'updatedAt'])

  const statements = [
    db.delete(techAuditSourceIssues).where(and(
      eq(techAuditSourceIssues.snapshotId, snapshotId),
      eq(techAuditSourceIssues.source, scope.source),
      scope.device ? eq(techAuditSourceIssues.device, scope.device) : isNull(techAuditSourceIssues.device),
    )),
    ...(issues.length > 0
      ? [db.insert(techAuditSourceIssues).values(issues.map((i) => ({
          snapshotId, source: i.source, nativeIssueName: i.nativeName, nativeSeverity: i.nativeSeverity,
          urlCount: i.urlCount, device: i.device ?? null,
        })))]
      : []),
    ...(Object.keys(metrics).length > 0
      ? [db.insert(techAuditMetrics).values({ ...metrics, snapshotId })
          .onConflictDoUpdate({ target: techAuditMetrics.snapshotId, set: metrics })]
      : []),
    db.update(techAuditSnapshots).set({ ...snapshot, updatedAt: sql`now()` }).where(eq(techAuditSnapshots.id, snapshotId)),
    db.update(techAuditSourceRuns)
      .set({
        status: 'complete', raw, lastError: null, finishedAt: sql`now()`, updatedAt: sql`now()`,
        // Only a staff upload names an uploader; the sweep passes none, so its runs keep this null.
        ...(opts.uploadedBy ? { uploadedBy: opts.uploadedBy } : {}),
      })
      .where(eq(techAuditSourceRuns.id, run.id)),
  ]
  await db.batch(statements as unknown as Parameters<typeof db.batch>[0])
}

/** Record a run that did not produce data. `failed` is retried by a later sweep; `missing` is a source file that was
 *  not there. A run that is already complete is left alone: a late failure from a slow duplicate sweep must not
 *  erase good data. The reason is stored truncated; callers pass a sanitized message, never file contents. */
export async function failRun(
  clientId: string,
  snapshotId: string,
  source: TaSource,
  status: 'failed' | 'missing',
  reason: string,
): Promise<void> {
  await db
    .update(techAuditSourceRuns)
    .set({ status, lastError: reason.slice(0, LAST_ERROR_MAX), finishedAt: sql`now()`, updatedAt: sql`now()` })
    .where(and(
      eq(techAuditSourceRuns.snapshotId, snapshotId),
      inArray(techAuditSourceRuns.snapshotId, ownSnapshot(clientId, snapshotId)),
      eq(techAuditSourceRuns.source, source),
      ne(techAuditSourceRuns.status, 'complete'),
    ))
}

export async function setSnapshotStatus(
  clientId: string,
  snapshotId: string,
  status: 'draft' | 'published',
  by: string,
): Promise<void> {
  const rows = await db
    .update(techAuditSnapshots)
    .set(status === 'published'
      ? { status, publishedAt: sql`now()`, publishedBy: by, updatedAt: sql`now()` }
      : { status, publishedAt: null, publishedBy: null, updatedAt: sql`now()` })
    .where(and(eq(techAuditSnapshots.id, snapshotId), eq(techAuditSnapshots.clientId, clientId)))
    .returning({ id: techAuditSnapshots.id })
  if (rows.length === 0) throw new Error('Snapshot not found')
}

/** A client's snapshots, newest first. */
export async function getSnapshots(clientId: string, opts: { publishedOnly: boolean }): Promise<SnapshotRow[]> {
  return db
    .select()
    .from(techAuditSnapshots)
    .where(opts.publishedOnly
      ? and(eq(techAuditSnapshots.clientId, clientId), eq(techAuditSnapshots.status, 'published'))
      : eq(techAuditSnapshots.clientId, clientId))
    .orderBy(desc(techAuditSnapshots.snapshotDate))
}

/** One snapshot with its runs (never `raw`), metrics and issues; null when the id is unknown or another client's. */
export async function getSnapshotBundle(clientId: string, snapshotId: string): Promise<{
  snapshot: SnapshotRow
  runs: RunRow[]
  metrics: MetricsRow | null
  issues: IssueRow[]
} | null> {
  const [snapshot] = await db.select().from(techAuditSnapshots)
    .where(and(eq(techAuditSnapshots.id, snapshotId), eq(techAuditSnapshots.clientId, clientId))).limit(1)
  if (!snapshot) return null
  const [runs, metrics, issues] = await Promise.all([
    db.select({
      id: techAuditSourceRuns.id, snapshotId: techAuditSourceRuns.snapshotId, source: techAuditSourceRuns.source,
      status: techAuditSourceRuns.status, attempts: techAuditSourceRuns.attempts, lastError: techAuditSourceRuns.lastError,
      uploadedBy: techAuditSourceRuns.uploadedBy, startedAt: techAuditSourceRuns.startedAt,
      finishedAt: techAuditSourceRuns.finishedAt, createdAt: techAuditSourceRuns.createdAt,
      updatedAt: techAuditSourceRuns.updatedAt,
    }).from(techAuditSourceRuns).where(eq(techAuditSourceRuns.snapshotId, snapshotId)).orderBy(asc(techAuditSourceRuns.source)),
    db.select().from(techAuditMetrics).where(eq(techAuditMetrics.snapshotId, snapshotId)).limit(1),
    db.select().from(techAuditSourceIssues).where(eq(techAuditSourceIssues.snapshotId, snapshotId)),
  ])
  return { snapshot, runs, metrics: metrics[0] ?? null, issues }
}

export async function getOverrides(clientId: string): Promise<OverrideRow[]> {
  return db.select().from(techAuditIssueOverrides).where(eq(techAuditIssueOverrides.clientId, clientId))
}

/** Hide or annotate one issue row for a brand. Only the fields in `patch` change; an empty patch writes nothing. */
export async function setOverride(
  clientId: string,
  issueKey: string,
  patch: { hidden?: boolean; note?: string | null },
  by: string,
): Promise<void> {
  if (patch.note != null && patch.note.length > NOTE_MAX) throw new Error('note too long')
  const fields = definedEntries(patch, [])
  if (Object.keys(fields).length === 0) return
  // A note keeps its own author and time (cleared with the note); a hidden-only patch must not re-attribute it.
  const noteStamp = 'note' in fields
    ? (fields.note === null ? { noteBy: null, noteAt: null } : { noteBy: by, noteAt: sql`now()` })
    : {}
  await db
    .insert(techAuditIssueOverrides)
    .values({ clientId, issueKey, ...fields, ...noteStamp, updatedBy: by })
    .onConflictDoUpdate({
      target: [techAuditIssueOverrides.clientId, techAuditIssueOverrides.issueKey],
      set: { ...fields, ...noteStamp, updatedBy: by, updatedAt: sql`now()` },
    })
}

/** Hide or unhide several override rows of one brand in a single statement (atomic). Notes and their author/time are
 *  untouched; a missing row is created. */
export async function setHidden(clientId: string, issueKeys: string[], hidden: boolean, by: string): Promise<void> {
  const keys = [...new Set(issueKeys)]
  if (keys.length === 0) return
  await db
    .insert(techAuditIssueOverrides)
    .values(keys.map((issueKey) => ({ clientId, issueKey, hidden, updatedBy: by })))
    .onConflictDoUpdate({
      target: [techAuditIssueOverrides.clientId, techAuditIssueOverrides.issueKey],
      set: { hidden, updatedBy: by, updatedAt: sql`now()` },
    })
}

/** Subquery: the snapshot id, only if it belongs to the client. */
function ownSnapshot(clientId: string, snapshotId: string) {
  return db.select({ id: techAuditSnapshots.id }).from(techAuditSnapshots)
    .where(and(eq(techAuditSnapshots.id, snapshotId), eq(techAuditSnapshots.clientId, clientId)))
}

/** The entries of `obj` whose value is not undefined (null is kept), minus the keys a caller may not set. */
function definedEntries<T extends object>(obj: T | undefined, drop: string[]): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj ?? {}).filter(([k, v]) => v !== undefined && !drop.includes(k)),
  ) as Partial<T>
}
