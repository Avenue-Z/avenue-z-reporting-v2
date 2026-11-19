// lib/organic-social/social-listening/select.ts
// Pure selection over stored rows (spec docs/superpowers/specs/2026-11-19-social-listening-tab-design.md, sections 7
// and 8): which upload a month shows, which one it presented to the client (decision D5), and the mapping from the
// store's cache-safe rows to the shared shapes in ./types. No I/O, safe in tests.

import type { SlExport, SlHistory, SlMonth, SlMonthData, SlPost, SlPostGroup, SlSentiment, SlTopic, SlTrend, SlTrendLists, SlTrends, SlUpload } from './types'

/** The upload rows of one (month, topic). The caller filters; these never look at month or topic. */
export type UploadRow = SlUpload

/** The month's current upload: the newest by `uploadedAt`. On an equal time the later row in the input wins, so a
 *  store that reads in insertion order keeps the last write. Null when there is none. */
export function currentUpload(rows: readonly UploadRow[]): UploadRow | null {
  let best: UploadRow | null = null
  for (const r of rows) {
    if (!best || r.uploadedAt.getTime() >= best.uploadedAt.getTime()) best = r
  }
  return best
}

/** The month's presented upload (D5): the newest upload made before the month opened to the client, else the first
 *  (earliest) one. A re-upload after the open date never changes it. Null when there is none. */
export function presentedUpload(rows: readonly UploadRow[]): UploadRow | null {
  const beforeOpen = rows.filter((r) => r.beforeOpen)
  if (beforeOpen.length > 0) return currentUpload(beforeOpen)
  let first: UploadRow | null = null
  for (const r of rows) {
    if (!first || r.uploadedAt.getTime() < first.uploadedAt.getTime()) first = r
  }
  return first
}

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/

/** A stored month (`date`, always the 1st) as the `YYYY-MM` key the pure modules use. */
export function monthKey(stored: string): SlMonth {
  const m = /^(\d{4}-(?:0[1-9]|1[0-2]))-01$/.exec(stored)
  if (!m) throw new Error('social-listening: a stored month must be the 1st of a month')
  return m[1]
}

/** A `YYYY-MM` key as the stored `date` (the 1st). */
export function monthDate(month: SlMonth): string {
  if (!MONTH.test(month)) throw new Error('social-listening: a month must be YYYY-MM')
  return `${month}-01`
}

function asTopic(v: string): SlTopic {
  if (v === 'brand' || v === 'industry') return v
  throw new Error('social-listening: unknown topic')
}

function asGroup(v: string): SlPostGroup {
  if (v === 'social' || v === 'forum' || v === 'web') return v
  throw new Error('social-listening: unknown post group')
}

function asSentiment(v: string): SlSentiment {
  if (v === 'Positive' || v === 'Neutral' || v === 'Negative') return v
  throw new Error('social-listening: unknown post sentiment')
}

// The rows the store's cached reads return. They are JSON-safe on purpose: Next's data cache stores JSON, so a Date
// would come back as a string on a cache hit and as a Date on a miss. Times travel as ISO text and become Dates here.

export type UploadRowJson = {
  id: string; month: string; topic: string; data: SlExport; beforeOpen: boolean; uploadedAt: string
}

export type HistoryRowJson = {
  month: string; topic: string
  results: number | null; uniqueAuthors: number | null; engagement: number | null; potentialReach: number | null
  pos: number; neu: number; neg: number
  redditPos: number | null; redditNeu: number | null; redditNeg: number | null
  source: string
}

export type PostRowJson = {
  id: string; month: string; group: string; platform: string; author: string; url: string | null
  engagements: number | null; sentiment: string; note: string; position: number
  status: 'draft' | 'approved'; replacesId: string | null
}

export type TrendsRowJson = {
  month: string
  emerging: SlTrend[]; decreasing: SlTrend[]; newThemes: SlTrend[]
  approvedEmerging: SlTrend[] | null; approvedDecreasing: SlTrend[] | null; approvedNew: SlTrend[] | null
  status: 'draft' | 'approved'
}

export function toSlUpload(row: UploadRowJson): SlUpload {
  return {
    id: row.id,
    month: monthKey(row.month),
    topic: asTopic(row.topic),
    data: row.data,
    beforeOpen: row.beforeOpen,
    uploadedAt: new Date(row.uploadedAt),
  }
}

export function toSlHistory(row: HistoryRowJson): SlHistory {
  return {
    month: monthKey(row.month),
    topic: asTopic(row.topic),
    results: row.results,
    uniqueAuthors: row.uniqueAuthors,
    engagement: row.engagement,
    potentialReach: row.potentialReach,
    pos: row.pos,
    neu: row.neu,
    neg: row.neg,
    redditPos: row.redditPos,
    redditNeu: row.redditNeu,
    redditNeg: row.redditNeg,
    source: row.source,
  }
}

/** `imageIds` in display order (the store reads them oldest first). */
export function toSlPost(row: PostRowJson, imageIds: string[]): SlPost {
  return {
    id: row.id,
    month: monthKey(row.month),
    group: asGroup(row.group),
    platform: row.platform,
    author: row.author,
    url: row.url,
    engagements: row.engagements,
    sentiment: asSentiment(row.sentiment),
    note: row.note,
    position: row.position,
    status: row.status,
    replacesId: row.replacesId,
    imageIds,
  }
}

/** Approved lists are null until the first approval; after that they stay what clients see while a new draft is
 *  edited (R2-11). */
export function toSlTrends(row: TrendsRowJson): SlTrends {
  const draft: SlTrendLists = { emerging: row.emerging, decreasing: row.decreasing, newThemes: row.newThemes }
  const approved: SlTrendLists | null = row.approvedEmerging === null && row.approvedDecreasing === null && row.approvedNew === null
    ? null
    : { emerging: row.approvedEmerging ?? [], decreasing: row.approvedDecreasing ?? [], newThemes: row.approvedNew ?? [] }
  return { month: monthKey(row.month), draft, approved, status: row.status }
}

/** What the store's cached page read returns (JSON-safe). */
export type SlMonthRowsJson = {
  uploads: UploadRowJson[]
  history: HistoryRowJson[]
  posts: PostRowJson[]
  /** Image ids of the listed posts, in display order. Never the bytes. */
  images: { id: string; postId: string }[]
  trends: TrendsRowJson | null
}

/** Keep the shown (current) and the presented upload of each (month, topic) and drop the rest, in input order. Every
 *  other upload is audit history the page never reads, so this bounds the cached read whatever the re-uploads. */
export function trimUploads(rows: readonly UploadRowJson[]): UploadRowJson[] {
  const groups = new Map<string, SlUpload[]>()
  for (const r of rows) {
    const key = `${r.month}|${r.topic}`
    const asUpload = { id: r.id, month: r.month, topic: r.topic as SlTopic, data: r.data, beforeOpen: r.beforeOpen, uploadedAt: new Date(r.uploadedAt) }
    groups.set(key, [...(groups.get(key) ?? []), asUpload])
  }
  const keep = new Set<string>()
  for (const g of groups.values()) {
    const shown = currentUpload(g)
    const presented = presentedUpload(g)
    if (shown) keep.add(shown.id)
    if (presented) keep.add(presented.id)
  }
  return rows.filter((r) => keep.has(r.id))
}

/** The page's shape from the cached rows. */
export function toSlMonthData(rows: SlMonthRowsJson): SlMonthData {
  const imagesByPost = new Map<string, string[]>()
  for (const i of rows.images) imagesByPost.set(i.postId, [...(imagesByPost.get(i.postId) ?? []), i.id])
  return {
    uploads: rows.uploads.map(toSlUpload),
    history: rows.history.map(toSlHistory),
    posts: rows.posts.map((p) => toSlPost(p, imagesByPost.get(p.id) ?? [])),
    trends: rows.trends ? toSlTrends(rows.trends) : null,
  }
}
