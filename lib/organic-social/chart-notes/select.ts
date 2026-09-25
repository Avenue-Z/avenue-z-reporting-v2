import { cache } from 'react'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { chartNotes, type ChartNote } from '@/lib/db/schema'
import type { DashChannel } from '../metrics'

/** Every live note on one platform, both charts, so a tab's two graphs share one read. The same
 *  read path as getAnnotationHides (lib/organic-social/annotation-hides/select.ts:9-12): React.cache
 *  for per-render dedup, freshness after a write from revalidateTag('db') in the action. */
export const getChartNotes = cache(async (clientId: string, channel: DashChannel): Promise<ChartNote[]> =>
  db.select().from(chartNotes).where(and(
    eq(chartNotes.clientId, clientId),
    eq(chartNotes.channel, channel),
    isNull(chartNotes.deletedAt),
  )))
