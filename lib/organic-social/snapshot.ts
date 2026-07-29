import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { topContentSnapshots } from '@/lib/db/schema'
import type { SnapshotPayload, TopContentPost } from './content-types'
import type { SourceType } from './types'

/** Freeze the Dash facts; sourceType is intentionally excluded (stays live, §4). */
export function toPayload(post: TopContentPost): SnapshotPayload {
  const { sourceType: _drop, ...rest } = post
  return rest
}

/** Reconstruct a TopContentPost from a frozen payload. sourceType is supplied by the
 *  caller (re-resolved from post_designations at render time), never read from the snapshot. */
export function fromSnapshot(payload: SnapshotPayload, sourceType: SourceType): TopContentPost {
  return { ...payload, sourceType }
}

// A window frozen while GENUINELY EMPTY is marked by a single out-of-band row at rank -1 (real
// ranks are the 0..N array index), so "captured-and-empty" stays distinguishable from "never
// captured" — otherwise both have zero real rows and an empty closed window re-hits live forever
// (§3). Detection is by rank, NOT post id: the marker's post_id is an inert filler for the NOT
// NULL/unique column, so a (near-impossible) genuine id-0 post is never mistaken for the marker.
const EMPTY_MARKER_RANK = -1
const EMPTY_MARKER_POST_ID = 0
const EMPTY_MARKER_PAYLOAD: SnapshotPayload = {
  id: EMPTY_MARKER_POST_ID, channel: 'INSTAGRAM', platform: '', publishedAt: '', caption: '',
  url: null, mediaType: 'IMAGE', mediaGroup: null, creative: null,
  metrics: { effectiveness: null, engagementRate: null, engagements: 0, impressions: 0 },
}

interface NewSnapshotRow {
  clientId: string; channel: string; rangeStart: string; rangeEnd: string
  postId: number; rank: number; payload: SnapshotPayload
}

/** Pure: the rows to persist for a window — real posts at ranks 0..N, or a single empty-marker
 *  row (rank -1) when there are none, so the empty freeze is representable. */
export function encodeSnapshotRows(
  clientId: string, channel: string, rangeStart: string, rangeEnd: string, posts: TopContentPost[],
): NewSnapshotRow[] {
  if (posts.length === 0) {
    return [{ clientId, channel, rangeStart, rangeEnd, postId: EMPTY_MARKER_POST_ID, rank: EMPTY_MARKER_RANK, payload: EMPTY_MARKER_PAYLOAD }]
  }
  return posts.map((post, i) => ({
    clientId, channel, rangeStart, rangeEnd, postId: post.id, rank: i, payload: toPayload(post),
  }))
}

/** Pure: rows read back for a window → { frozen, posts }. `frozen` = any row exists (incl. the
 *  empty marker); the marker (rank < 0) is stripped from `posts`. sourceType is a placeholder —
 *  the caller overlays live designations (partitionPosts). */
export function decodeSnapshot(
  rows: { rank: number; payload: SnapshotPayload }[],
): { frozen: boolean; posts: TopContentPost[] } {
  const posts = rows.filter((r) => r.rank >= 0).map((r) => fromSnapshot(r.payload, 'organic'))
  return { frozen: rows.length > 0, posts }
}

/** `frozen` = a snapshot exists for this window (possibly the empty marker); `posts` = its real
 *  rows. The caller freezes iff !frozen, and returns `posts` when frozen — including the
 *  frozen-empty case, which returns []. */
export async function readSnapshot(
  clientId: string, channel: string, rangeStart: string, rangeEnd: string,
): Promise<{ frozen: boolean; posts: TopContentPost[] }> {
  const rows = await db
    .select({ rank: topContentSnapshots.rank, payload: topContentSnapshots.payload })
    .from(topContentSnapshots)
    .where(and(
      eq(topContentSnapshots.clientId, clientId),
      eq(topContentSnapshots.channel, channel),
      eq(topContentSnapshots.rangeStart, rangeStart),
      eq(topContentSnapshots.rangeEnd, rangeEnd),
    ))
    .orderBy(topContentSnapshots.rank)
  return decodeSnapshot(rows)
}

/** Full-window replace: delete this window's rows, then insert the encoded set (real posts or the
 *  empty marker). The delete + insert run in ONE db.batch — a single transaction on the neon-http
 *  driver — so a concurrent READER never observes the gap between delete and insert (which would
 *  look like "never captured" and trigger a redundant freeze), and a half-applied write can't
 *  persist. Only closed windows are written, and only once (frozen.ts reads thereafter).
 *  onConflictDoNothing on the (client,channel,range,post) unique key keeps a concurrent same-set
 *  first-freeze from aborting on a unique violation (both settle on the same rows). A post deleted
 *  mid-period drops out naturally.
 *  (A dup-RANK union would need two concurrent first-freezes returning DIFFERENT post sets for the
 *  same closed window — only possible past the 500/channel limit, which has ~16× headroom here — so
 *  a rank-unique constraint isn't warranted for this data.) */
export async function writeSnapshot(
  clientId: string, channel: string, rangeStart: string, rangeEnd: string, posts: TopContentPost[],
): Promise<void> {
  const del = db.delete(topContentSnapshots).where(and(
    eq(topContentSnapshots.clientId, clientId),
    eq(topContentSnapshots.channel, channel),
    eq(topContentSnapshots.rangeStart, rangeStart),
    eq(topContentSnapshots.rangeEnd, rangeEnd),
  ))
  const ins = db
    .insert(topContentSnapshots)
    .values(encodeSnapshotRows(clientId, channel, rangeStart, rangeEnd, posts))
    .onConflictDoNothing({
      target: [
        topContentSnapshots.clientId, topContentSnapshots.channel,
        topContentSnapshots.rangeStart, topContentSnapshots.rangeEnd, topContentSnapshots.postId,
      ],
    })
  await db.batch([del, ins])
}
