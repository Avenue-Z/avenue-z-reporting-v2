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

/** A known platform. Shared by every annotation and note key check. */
export function checkAnnotationChannel(channel: unknown): { ok: boolean; error?: string } {
  return typeof channel === 'string' && (CHANNELS as readonly string[]).includes(channel) ? { ok: true } : { ok: false, error: 'invalid channel' }
}

/** A real calendar day, yyyy-mm-dd. Shared by every annotation and note key check. */
export function checkAnnotationDay(day: unknown): { ok: boolean; error?: string } {
  return typeof day === 'string' && isRealDay(day) ? { ok: true } : { ok: false, error: 'invalid day' }
}

/** The key every annotation write shares: a known platform, a known annotated chart and a real
 *  calendar day, checked in that order. Hides and notes both call it, so the two cannot drift (Paul's review of
 *  #273, C12); the YTD note charts reuse its platform and day checks (chart-notes/validate.ts). */
export function checkAnnotationKey(input: { channel: unknown; chart: unknown; day: unknown }): { ok: boolean; error?: string } {
  const channel = checkAnnotationChannel(input.channel)
  if (!channel.ok) return channel
  if (typeof input.chart !== 'string' || !CHARTS.has(input.chart)) return { ok: false, error: 'invalid chart' }
  return checkAnnotationDay(input.day)
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
