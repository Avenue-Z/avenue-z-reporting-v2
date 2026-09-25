import { db } from '@/lib/db/client'
import { chartAnnotationHides } from '@/lib/db/schema'
import { CHANNELS, type DashChannel } from '../metrics'
import { ANNOTATION_CHARTS, type AnnotationChart } from '../annotations'

const CHARTS = new Set<string>(ANNOTATION_CHARTS)

export function isRealDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false
  const d = new Date(`${day}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day
}

/** The key every annotation write shares: a known platform, a known annotated chart and a real
 *  calendar day. Hides and notes both call it, so the two cannot drift (Paul's review of #273, C12). */
export function checkAnnotationKey(input: { channel: unknown; chart: unknown; day: unknown }): { ok: boolean; error?: string } {
  if (typeof input.channel !== 'string' || !(CHANNELS as readonly string[]).includes(input.channel)) return { ok: false, error: 'invalid channel' }
  if (typeof input.chart !== 'string' || !CHARTS.has(input.chart)) return { ok: false, error: 'invalid chart' }
  if (typeof input.day !== 'string' || !isRealDay(input.day)) return { ok: false, error: 'invalid day' }
  return { ok: true }
}

/** Pure validation for the server-action payload. Kept out of the action file so it is
 *  unit-testable (a 'use server' module may only export async actions). */
export function authorizeAnnotationHide(input: {
  channel: string; chart: string; day: string; hidden: unknown
}): { ok: boolean; error?: string } {
  const key = checkAnnotationKey(input)
  if (!key.ok) return key
  if (typeof input.hidden !== 'boolean') return { ok: false, error: 'invalid hidden' }
  return { ok: true }
}

/** Upsert one annotation's hidden flag. Unhiding writes hidden=false rather than deleting,
 *  so who last touched it and when stays on record. */
export async function setAnnotationHidden(args: {
  clientId: string; channel: DashChannel; chart: AnnotationChart; day: string; hidden: boolean; setBy: string
}): Promise<void> {
  await db
    .insert(chartAnnotationHides)
    .values({ clientId: args.clientId, channel: args.channel, chart: args.chart, day: args.day, hidden: args.hidden, setBy: args.setBy })
    .onConflictDoUpdate({
      target: [chartAnnotationHides.clientId, chartAnnotationHides.channel, chartAnnotationHides.chart, chartAnnotationHides.day],
      set: { hidden: args.hidden, setBy: args.setBy, setAt: new Date() },
    })
}
