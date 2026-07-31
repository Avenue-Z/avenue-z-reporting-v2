import { cache } from 'react'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { postDesignations } from '@/lib/db/schema'
import type { SourceType } from '../types'

/** Stored designations for the given posts, keyed by Dash post id. Absent posts are
 *  simply not in the map — partitionPosts falls back to the suggestion for those.
 *  React.cache-wrapped for per-render dedup; freshness after a write comes from
 *  revalidateTag('db') in the server action. */
export const getDesignations = cache(
  async (clientId: string, postIds: number[]): Promise<Map<number, SourceType>> => {
    if (postIds.length === 0) return new Map()
    const rows = await db
      .select({ postId: postDesignations.postId, designation: postDesignations.designation })
      .from(postDesignations)
      .where(and(eq(postDesignations.clientId, clientId), inArray(postDesignations.postId, postIds)))
    return new Map(rows.map((r) => [r.postId, r.designation as SourceType]))
  },
)
