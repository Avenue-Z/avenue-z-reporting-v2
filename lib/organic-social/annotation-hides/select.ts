import { cache } from 'react'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { chartAnnotationHides } from '@/lib/db/schema'
import { hideKey } from './apply'
import type { AnnotationChart } from '../annotations'
import type { DashChannel } from '../metrics'

/** The annotations hidden from the client on one platform, as hideKey strings. React.cache
 *  for per-render dedup; freshness after a write comes from revalidateTag('db') in the
 *  server action. */
export const getAnnotationHides = cache(async (clientId: string, channel: DashChannel): Promise<Set<string>> => {
  const rows = await db
    .select({ chart: chartAnnotationHides.chart, day: chartAnnotationHides.day })
    .from(chartAnnotationHides)
    .where(and(
      eq(chartAnnotationHides.clientId, clientId),
      eq(chartAnnotationHides.channel, channel),
      eq(chartAnnotationHides.hidden, true),
    ))
  return new Set(rows.map((r) => hideKey(r.chart as AnnotationChart, String(r.day))))
})
