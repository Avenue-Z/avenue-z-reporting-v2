// lib/organic-social/social-listening/store.ts
// Every database read and write of the Social Listening tab (spec docs/superpowers/specs/2026-11-19-social-listening-
// tab-design.md, section 8). Server only.
//
// Reads for the page go through cached() under the `db` tag (lib/cache.ts) and never select an upload's `raw` file or
// an image's bytes. Every write here calls updateTag('db') itself, so a caller cannot forget it; callers are Server
// Actions (updateTag throws anywhere else). Each write re-asserts the state it expects in its WHERE clause and reports
// whether it hit a row, so a lost race reads as "not found" rather than a false success (the reasoning of
// app/actions/commentary.ts:17-34 and lib/organic-social/chart-notes/mutations.ts:44-46).

import { randomUUID } from 'node:crypto'
import { cache } from 'react'
import { updateTag } from 'next/cache'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { cached } from '@/lib/cache'
import {
  byteaToDriver,
  socialListeningHistory, socialListeningPostImages, socialListeningPosts, socialListeningTrends, socialListeningUploads,
} from '@/lib/db/schema'
import { monthDate, monthKey, toSlMonthData, trimUploads, type SlMonthRowsJson } from './select'
import type { SlExport, SlMonth, SlMonthData, SlPostGroup, SlSentiment, SlTopic, SlTrendLists } from './types'

// ---------------------------------------------------------------------------------------------------------------
// Page read

async function getSlMonthRowsImpl(clientId: string, monthsKey: string): Promise<SlMonthRowsJson> {
  const months = monthsKey === '' ? [] : monthsKey.split(',')
  if (months.length === 0) return { uploads: [], history: [], posts: [], images: [], trends: null }
  const dates = months.map(monthDate)
  // Posts and trends belong to the served month, which is the latest month asked for.
  const served = [...dates].sort().at(-1)!
  const livePost = and(
    eq(socialListeningPosts.clientId, clientId),
    eq(socialListeningPosts.month, served),
    isNull(socialListeningPosts.deletedAt),
    isNull(socialListeningPosts.replacedAt),
  )

  const [uploads, history, posts, images, trends] = await Promise.all([
    db.select({
      id: socialListeningUploads.id,
      month: socialListeningUploads.month,
      topic: socialListeningUploads.topic,
      data: socialListeningUploads.data,
      beforeOpen: socialListeningUploads.beforeOpen,
      uploadedAt: socialListeningUploads.uploadedAt,
    })
      .from(socialListeningUploads)
      .where(and(eq(socialListeningUploads.clientId, clientId), inArray(socialListeningUploads.month, dates)))
      .orderBy(asc(socialListeningUploads.uploadedAt)),
    db.select({
      month: socialListeningHistory.month,
      topic: socialListeningHistory.topic,
      results: socialListeningHistory.results,
      uniqueAuthors: socialListeningHistory.uniqueAuthors,
      engagement: socialListeningHistory.engagement,
      potentialReach: socialListeningHistory.potentialReach,
      pos: socialListeningHistory.pos,
      neu: socialListeningHistory.neu,
      neg: socialListeningHistory.neg,
      redditPos: socialListeningHistory.redditPos,
      redditNeu: socialListeningHistory.redditNeu,
      redditNeg: socialListeningHistory.redditNeg,
      source: socialListeningHistory.source,
    })
      .from(socialListeningHistory)
      .where(and(eq(socialListeningHistory.clientId, clientId), inArray(socialListeningHistory.month, dates))),
    db.select({
      id: socialListeningPosts.id,
      month: socialListeningPosts.month,
      group: socialListeningPosts.group,
      platform: socialListeningPosts.platform,
      author: socialListeningPosts.author,
      url: socialListeningPosts.url,
      engagements: socialListeningPosts.engagements,
      sentiment: socialListeningPosts.sentiment,
      note: socialListeningPosts.note,
      position: socialListeningPosts.position,
      status: socialListeningPosts.status,
      replacesId: socialListeningPosts.replacesId,
    })
      .from(socialListeningPosts)
      .where(livePost)
      .orderBy(asc(socialListeningPosts.position), asc(socialListeningPosts.createdAt)),
    // Ids only: the bytes are served by the image route.
    db.select({ id: socialListeningPostImages.id, postId: socialListeningPostImages.postId })
      .from(socialListeningPostImages)
      .innerJoin(socialListeningPosts, eq(socialListeningPostImages.postId, socialListeningPosts.id))
      .where(livePost)
      .orderBy(asc(socialListeningPostImages.createdAt), asc(socialListeningPostImages.id)),
    db.select({
      month: socialListeningTrends.month,
      emerging: socialListeningTrends.emerging,
      decreasing: socialListeningTrends.decreasing,
      newThemes: socialListeningTrends.newThemes,
      approvedEmerging: socialListeningTrends.approvedEmerging,
      approvedDecreasing: socialListeningTrends.approvedDecreasing,
      approvedNew: socialListeningTrends.approvedNew,
      status: socialListeningTrends.status,
    })
      .from(socialListeningTrends)
      .where(and(eq(socialListeningTrends.clientId, clientId), eq(socialListeningTrends.month, served)))
      .limit(1),
  ])

  return {
    // Only the shown and the presented upload of each (month, topic) are kept, which bounds the cache entry
    // whatever the number of re-uploads. Times become ISO text so a cache hit and a miss look the same.
    uploads: trimUploads(uploads.map((u) => ({ ...u, uploadedAt: u.uploadedAt.toISOString() }))),
    history,
    posts,
    images,
    trends: trends[0] ?? null,
  }
}

const getSlMonthRows = cached('db', 'getSlMonth', getSlMonthRowsImpl, {
  ttlSeconds: 300,
  tags: ['db'],
  extractTags: ([, monthsKey]) => ({ months: monthsKey }),
})

const getSlMonthByKey = cache(async (clientId: string, monthsKey: string): Promise<SlMonthData> =>
  toSlMonthData(await getSlMonthRows(clientId, monthsKey)))

/** Everything the page reads for a served month, in one call per table: the uploads and history rows of every month
 *  listed (the served month, the previous month, the year-to-date months), and the posts and trends of the served
 *  month, which is the latest month in the list. Uploads are trimmed to the shown and presented row per
 *  (month, topic). Posts exclude deleted and replaced rows; drafts are included and the page decides who sees them. */
export function getSlMonth(clientId: string, months: SlMonth[]): Promise<SlMonthData> {
  const key = [...new Set(months)].sort().join(',')
  return getSlMonthByKey(clientId, key)
}

// ---------------------------------------------------------------------------------------------------------------
// Reads for the actions and the image route (uncached: they decide a write or an access)

export type PostState = {
  id: string; clientId: string; month: SlMonth; status: 'draft' | 'approved'
  replacesId: string | null; replacedAt: Date | null; deletedAt: Date | null
}

export async function findPost(id: string): Promise<PostState | undefined> {
  const rows = await db
    .select({
      id: socialListeningPosts.id,
      clientId: socialListeningPosts.clientId,
      month: socialListeningPosts.month,
      status: socialListeningPosts.status,
      replacesId: socialListeningPosts.replacesId,
      replacedAt: socialListeningPosts.replacedAt,
      deletedAt: socialListeningPosts.deletedAt,
    })
    .from(socialListeningPosts)
    .where(eq(socialListeningPosts.id, id))
    .limit(1)
  const r = rows[0]
  return r ? { ...r, month: monthKey(r.month) } : undefined
}

/** The posts that count toward the month's cap of 12: approved, not replaced, not deleted (R2-10). */
export async function countApprovedPosts(clientId: string, month: SlMonth): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(socialListeningPosts)
    .where(and(
      eq(socialListeningPosts.clientId, clientId),
      eq(socialListeningPosts.month, monthDate(month)),
      eq(socialListeningPosts.status, 'approved'),
      isNull(socialListeningPosts.replacedAt),
      isNull(socialListeningPosts.deletedAt),
    ))
  return rows[0]?.n ?? 0
}

export async function countImages(postId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(socialListeningPostImages)
    .where(eq(socialListeningPostImages.postId, postId))
  return rows[0]?.n ?? 0
}

/** One image's bytes (the print copy with `print`) and the post state the image route checks. */
export async function findImage(id: string, print: boolean): Promise<{ bytes: Uint8Array; post: Omit<PostState, 'replacesId'> } | undefined> {
  const rows = await db
    .select({
      bytes: print ? socialListeningPostImages.printBytes : socialListeningPostImages.bytes,
      postId: socialListeningPosts.id,
      clientId: socialListeningPosts.clientId,
      month: socialListeningPosts.month,
      status: socialListeningPosts.status,
      replacedAt: socialListeningPosts.replacedAt,
      deletedAt: socialListeningPosts.deletedAt,
    })
    .from(socialListeningPostImages)
    .innerJoin(socialListeningPosts, eq(socialListeningPostImages.postId, socialListeningPosts.id))
    .where(eq(socialListeningPostImages.id, id))
    .limit(1)
  const r = rows[0]
  if (!r) return undefined
  return {
    bytes: r.bytes,
    post: { id: r.postId, clientId: r.clientId, month: monthKey(r.month), status: r.status, replacedAt: r.replacedAt, deletedAt: r.deletedAt },
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Writes

/** Store one checked upload. Append-only: never updates or replaces a row. */
export async function insertUpload(u: {
  clientId: string; month: SlMonth; topic: SlTopic; data: SlExport; raw: Uint8Array
  sha256: string; byteSize: number; beforeOpen: boolean; by: string
}): Promise<{ id: string }> {
  const [row] = await db.insert(socialListeningUploads).values({
    clientId: u.clientId, month: monthDate(u.month), topic: u.topic, data: u.data, raw: u.raw,
    sha256: u.sha256, byteSize: u.byteSize, beforeOpen: u.beforeOpen, uploadedBy: u.by,
  }).returning({ id: socialListeningUploads.id })
  updateTag('db')
  return row
}

/** A post's editable fields, already validated by the caller (lib/organic-social/social-listening/posts.ts). */
export type PostFields = {
  group: SlPostGroup; platform: string; author: string; url: string | null
  engagements: number | null; sentiment: SlSentiment; note: string; position: number
}

/** A new post, always a draft. */
export async function insertPost(p: PostFields & { clientId: string; month: SlMonth; by: string }): Promise<{ id: string }> {
  const [row] = await db.insert(socialListeningPosts).values({
    clientId: p.clientId, month: monthDate(p.month), group: p.group, platform: p.platform, author: p.author,
    url: p.url, engagements: p.engagements, sentiment: p.sentiment, note: p.note, position: p.position,
    status: 'draft', createdBy: p.by, updatedBy: p.by,
  }).returning({ id: socialListeningPosts.id })
  updateTag('db')
  return row
}

function isUniqueViolation(err: unknown): boolean {
  for (let e: unknown = err, i = 0; e && i < 4; e = (e as { cause?: unknown }).cause, i++) {
    if ((e as { code?: unknown }).code === '23505') return true
  }
  return false
}

export type ForkResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'open-draft'; draftId: string | null }

/** Edit an approved post: a new draft that replaces it, with the approved post's image rows copied (new ids, so the
 *  image route's forever cache never serves a changed image). Both inserts run in one transaction. The approved post
 *  stays what clients see until the draft is approved. At most one open draft per approved post: when one exists
 *  (found first, or lost to a second caller at the partial unique index), the caller should edit that draft. */
export async function forkPostDraft(approvedId: string, fields: PostFields, by: string): Promise<ForkResult> {
  const source = await db
    .select({ clientId: socialListeningPosts.clientId, month: socialListeningPosts.month })
    .from(socialListeningPosts)
    .where(and(
      eq(socialListeningPosts.id, approvedId),
      eq(socialListeningPosts.status, 'approved'),
      isNull(socialListeningPosts.replacedAt),
      isNull(socialListeningPosts.deletedAt),
    ))
    .limit(1)
  if (!source[0]) return { ok: false, reason: 'not-found' }

  const open = await openDraftFor(approvedId)
  if (open) return { ok: false, reason: 'open-draft', draftId: open }

  const id = randomUUID()
  try {
    await db.batch([
      db.insert(socialListeningPosts).values({
        id, clientId: source[0].clientId, month: source[0].month,
        group: fields.group, platform: fields.platform, author: fields.author, url: fields.url,
        engagements: fields.engagements, sentiment: fields.sentiment, note: fields.note, position: fields.position,
        status: 'draft', replacesId: approvedId, createdBy: by, updatedBy: by,
      }),
      db.insert(socialListeningPostImages).select((qb) => qb
        .select({
          postId: sql<string>`${id}::uuid`.as('post_id'),
          bytes: socialListeningPostImages.bytes,
          printBytes: socialListeningPostImages.printBytes,
          width: socialListeningPostImages.width,
          height: socialListeningPostImages.height,
        })
        .from(socialListeningPostImages)
        .where(eq(socialListeningPostImages.postId, approvedId))),
    ])
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: 'open-draft', draftId: await openDraftFor(approvedId) }
    throw err
  }
  updateTag('db')
  return { ok: true, id }
}

async function openDraftFor(approvedId: string): Promise<string | null> {
  const rows = await db
    .select({ id: socialListeningPosts.id })
    .from(socialListeningPosts)
    .where(and(
      eq(socialListeningPosts.replacesId, approvedId),
      eq(socialListeningPosts.status, 'draft'),
      isNull(socialListeningPosts.deletedAt),
    ))
    .limit(1)
  return rows[0]?.id ?? null
}

/** Edit a draft in place. False when it is no longer an undeleted draft. */
export async function updatePostDraft(id: string, fields: PostFields, by: string): Promise<boolean> {
  const rows = await db
    .update(socialListeningPosts)
    .set({ ...fields, updatedBy: by, updatedAt: new Date() })
    .where(and(eq(socialListeningPosts.id, id), eq(socialListeningPosts.status, 'draft'), isNull(socialListeningPosts.deletedAt)))
    .returning({ id: socialListeningPosts.id })
  if (rows.length > 0) updateTag('db')
  return rows.length > 0
}

/** Approve a draft. When it edits an approved post, the same transaction sets that post's `replaced_at`, which hides
 *  it, so clients never see both or neither. False when it is no longer an undeleted draft. */
export async function approvePost(id: string, by: string): Promise<boolean> {
  const now = new Date()
  const [approved] = await db.batch([
    db.update(socialListeningPosts)
      .set({ status: 'approved', approvedBy: by, approvedAt: now, updatedAt: now })
      .where(and(eq(socialListeningPosts.id, id), eq(socialListeningPosts.status, 'draft'), isNull(socialListeningPosts.deletedAt)))
      .returning({ id: socialListeningPosts.id }),
    // Runs after the update above in the same transaction, so it only finds a replaces_id when this draft is now
    // approved; on a stale approve the old post already carries replaced_at and nothing changes.
    db.update(socialListeningPosts)
      .set({ replacedAt: now })
      .where(and(
        isNull(socialListeningPosts.replacedAt),
        sql`${socialListeningPosts.id} = (SELECT "replaces_id" FROM "social_listening_posts" WHERE "id" = ${id} AND "status" = 'approved')`,
      )),
  ])
  if (approved.length > 0) updateTag('db')
  return approved.length > 0
}

/** Return an approved, still current post to draft, so clients stop seeing it. */
export async function revokePost(id: string): Promise<boolean> {
  const rows = await db
    .update(socialListeningPosts)
    .set({ status: 'draft', approvedBy: null, approvedAt: null, updatedAt: new Date() })
    .where(and(eq(socialListeningPosts.id, id), eq(socialListeningPosts.status, 'approved'), isNull(socialListeningPosts.replacedAt)))
    .returning({ id: socialListeningPosts.id })
  if (rows.length > 0) updateTag('db')
  return rows.length > 0
}

/** Soft delete a draft (only drafts; the table's check enforces it too). Its image rows stay with it. */
export async function softDeletePostDraft(id: string, by: string): Promise<boolean> {
  const rows = await db
    .update(socialListeningPosts)
    .set({ deletedAt: new Date(), deletedBy: by })
    .where(and(eq(socialListeningPosts.id, id), eq(socialListeningPosts.status, 'draft'), isNull(socialListeningPosts.deletedAt)))
    .returning({ id: socialListeningPosts.id })
  if (rows.length > 0) updateTag('db')
  return rows.length > 0
}

/** Add one image (already checked by the caller) to an undeleted draft that holds fewer than `maxImages`. The state
 *  and the count are checked in the same statement as the insert, so two uploads at once cannot pass the cap and an
 *  image never lands on an approved post. Null when refused. */
export async function insertImage(img: {
  postId: string; bytes: Uint8Array; printBytes: Uint8Array; width: number; height: number; maxImages: number
}): Promise<{ id: string } | null> {
  const rows = await db.insert(socialListeningPostImages).select((qb) => qb
    .select({
      postId: socialListeningPosts.id,
      bytes: sql<Uint8Array>`${byteaToDriver(img.bytes)}::bytea`.as('bytes'),
      printBytes: sql<Uint8Array>`${byteaToDriver(img.printBytes)}::bytea`.as('print_bytes'),
      width: sql<number>`${img.width}::int`.as('width'),
      height: sql<number>`${img.height}::int`.as('height'),
    })
    .from(socialListeningPosts)
    .where(and(
      eq(socialListeningPosts.id, img.postId),
      eq(socialListeningPosts.status, 'draft'),
      isNull(socialListeningPosts.deletedAt),
      sql`(SELECT count(*) FROM "social_listening_post_images" WHERE "post_id" = ${img.postId}) < ${img.maxImages}`,
    )))
    .returning({ id: socialListeningPostImages.id })
  if (rows.length > 0) updateTag('db')
  return rows[0] ?? null
}

/** Remove one image from an undeleted draft. Images of an approved post are never removed in place: editing it forks
 *  a draft with its own copies. */
export async function deleteImage(id: string): Promise<boolean> {
  const rows = await db
    .delete(socialListeningPostImages)
    .where(and(
      eq(socialListeningPostImages.id, id),
      inArray(
        socialListeningPostImages.postId,
        db.select({ id: socialListeningPosts.id }).from(socialListeningPosts)
          .where(and(eq(socialListeningPosts.status, 'draft'), isNull(socialListeningPosts.deletedAt))),
      ),
    ))
    .returning({ id: socialListeningPostImages.id })
  if (rows.length > 0) updateTag('db')
  return rows.length > 0
}

/** Save the month's trend lists as a draft. The approved lists are left as they are, so clients keep seeing them
 *  until the next approval (R2-11). */
export async function saveTrendsDraft(t: { clientId: string; month: SlMonth; lists: SlTrendLists; by: string }): Promise<void> {
  const now = new Date()
  const set = {
    emerging: t.lists.emerging, decreasing: t.lists.decreasing, newThemes: t.lists.newThemes,
    status: 'draft' as const, updatedBy: t.by, updatedAt: now,
  }
  await db.insert(socialListeningTrends)
    .values({ clientId: t.clientId, month: monthDate(t.month), ...set })
    .onConflictDoUpdate({ target: [socialListeningTrends.clientId, socialListeningTrends.month], set })
  updateTag('db')
}

/** Approve the month's draft lists: copy them into the approved columns clients read. False when there is no draft. */
export async function approveTrends(t: { clientId: string; month: SlMonth; by: string }): Promise<boolean> {
  const now = new Date()
  const rows = await db
    .update(socialListeningTrends)
    .set({
      approvedEmerging: sql`${socialListeningTrends.emerging}`,
      approvedDecreasing: sql`${socialListeningTrends.decreasing}`,
      approvedNew: sql`${socialListeningTrends.newThemes}`,
      status: 'approved', approvedBy: t.by, approvedAt: now,
    })
    .where(and(
      eq(socialListeningTrends.clientId, t.clientId),
      eq(socialListeningTrends.month, monthDate(t.month)),
      eq(socialListeningTrends.status, 'draft'),
    ))
    .returning({ id: socialListeningTrends.id })
  if (rows.length > 0) updateTag('db')
  return rows.length > 0
}
