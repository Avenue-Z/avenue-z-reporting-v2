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

export async function readSnapshot(
  clientId: string, channel: string, rangeStart: string, rangeEnd: string,
): Promise<TopContentPost[]> {
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
  // sourceType placeholder — the caller overlays live designations (partitionPosts).
  return rows.map((r) => fromSnapshot(r.payload, 'organic'))
}

/** Full-window replace: delete this window's rows, then insert the current set. Sequential
 *  (the neon-http driver has no interactive transactions; the repo uses none). Only closed
 *  windows are written, and only once (frozen.ts reads thereafter), but two viewers can still
 *  hit a just-closed window before any snapshot exists and interleave delete→insert; the insert
 *  is race-safed with onConflictDoNothing on the (client,channel,range,post) unique key so the
 *  loser is a no-op rather than a unique-violation throw. A post deleted mid-period drops out
 *  naturally. */
export async function writeSnapshot(
  clientId: string, channel: string, rangeStart: string, rangeEnd: string, posts: TopContentPost[],
): Promise<void> {
  await db.delete(topContentSnapshots).where(and(
    eq(topContentSnapshots.clientId, clientId),
    eq(topContentSnapshots.channel, channel),
    eq(topContentSnapshots.rangeStart, rangeStart),
    eq(topContentSnapshots.rangeEnd, rangeEnd),
  ))
  if (posts.length === 0) return
  await db.insert(topContentSnapshots).values(
    posts.map((post, i) => ({
      clientId, channel, rangeStart, rangeEnd,
      postId: post.id, rank: i, payload: toPayload(post),
    })),
  ).onConflictDoNothing({
    target: [
      topContentSnapshots.clientId, topContentSnapshots.channel,
      topContentSnapshots.rangeStart, topContentSnapshots.rangeEnd, topContentSnapshots.postId,
    ],
  })
}
