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

// No real Dash post has id 0; a lone row with this id marks a window that was frozen while
// GENUINELY EMPTY, so "captured (and empty)" is distinguishable from "never captured" — both
// otherwise have zero real rows, which would make an empty closed window re-hit live forever (§3).
const SENTINEL_POST_ID = 0
const EMPTY_MARKER_PAYLOAD: SnapshotPayload = {
  id: SENTINEL_POST_ID, channel: 'INSTAGRAM', platform: '', publishedAt: '', caption: '',
  url: null, mediaType: 'IMAGE', mediaGroup: null, creative: null,
  metrics: { effectiveness: null, engagementRate: null, engagements: 0, impressions: 0 },
}

/** `frozen` = a snapshot exists for this window (possibly the empty marker); `posts` = its real
 *  rows (the marker is stripped). The caller freezes iff !frozen, and returns `posts` when frozen
 *  — including the frozen-empty case, which returns []. */
export async function readSnapshot(
  clientId: string, channel: string, rangeStart: string, rangeEnd: string,
): Promise<{ frozen: boolean; posts: TopContentPost[] }> {
  const rows = await db
    .select({ postId: topContentSnapshots.postId, rank: topContentSnapshots.rank, payload: topContentSnapshots.payload })
    .from(topContentSnapshots)
    .where(and(
      eq(topContentSnapshots.clientId, clientId),
      eq(topContentSnapshots.channel, channel),
      eq(topContentSnapshots.rangeStart, rangeStart),
      eq(topContentSnapshots.rangeEnd, rangeEnd),
    ))
    .orderBy(topContentSnapshots.rank)
  // sourceType placeholder — the caller overlays live designations (partitionPosts).
  const posts = rows
    .filter((r) => r.postId !== SENTINEL_POST_ID)
    .map((r) => fromSnapshot(r.payload, 'organic'))
  return { frozen: rows.length > 0, posts }
}

/** Full-window replace: delete this window's rows, then insert the current set (or the empty
 *  marker for a genuinely-empty window). The delete + insert run in ONE db.batch — a single
 *  transaction on the neon-http driver — so a concurrent READER never observes the gap between
 *  delete and insert (which would look like "never captured" and trigger a redundant freeze), and
 *  a half-applied write can't persist. Only closed windows are written, and only once (frozen.ts
 *  reads thereafter). onConflictDoNothing on the (client,channel,range,post) unique key keeps a
 *  concurrent same-set first-freeze from aborting on a unique violation (both settle on the same
 *  rows). A post deleted mid-period drops out naturally.
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
  const values = posts.length > 0
    ? posts.map((post, i) => ({
        clientId, channel, rangeStart, rangeEnd,
        postId: post.id, rank: i, payload: toPayload(post),
      }))
    : [{ clientId, channel, rangeStart, rangeEnd, postId: SENTINEL_POST_ID, rank: 0, payload: EMPTY_MARKER_PAYLOAD }]
  const ins = db.insert(topContentSnapshots).values(values).onConflictDoNothing({
    target: [
      topContentSnapshots.clientId, topContentSnapshots.channel,
      topContentSnapshots.rangeStart, topContentSnapshots.rangeEnd, topContentSnapshots.postId,
    ],
  })
  await db.batch([del, ins])
}
