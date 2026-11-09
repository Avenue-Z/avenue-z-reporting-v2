// lib/organic-social/aeo-informed/graphs.ts
// The four graph series. Buckets are 7 days from that graph's own start date (not ISO weeks), because the charts we mirror are drawn that way.
// "Own" means the URL is owned by our brand (ownership.ts). A platform with no own source in the graph's window is null in every bucket
// (the "No source data" state); once it has any own source, an empty bucket is a real 0.
import { eachDay, weeklyBuckets, assertIsoDate } from './windows'
import { ownerOf, type BrandChannels } from './ownership'
import { peecPlatformOf } from './platform'
import type { PeecUrlRow } from './types'

export type GraphId = 'used_as_source_all' | 'citations_all' | 'citations_linkedin' | 'citations_instagram'
export type Platform = 'linkedin' | 'youtube' | 'instagram' | 'tiktok' | 'reddit'
export type GraphPoint = {
  graphId: GraphId
  series: string
  weekStart: string
  weekEnd: string
  value: number | null
  unit: 'citations' | 'percent'
  partial: boolean
}

export const FIVE_PLATFORMS: Platform[] = ['linkedin', 'youtube', 'instagram', 'tiktok', 'reddit']

/** The graph platform a URL belongs to, or null (a facebook or medium URL is not on any of these charts). */
export function platformOf(url: string): Platform | null {
  const p = peecPlatformOf(url)
  return p !== null && (FIVE_PLATFORMS as string[]).includes(p) ? (p as Platform) : null
}

type Common = { brands: BrandChannels[]; ownBrandId: string; ownBrandName: string; from: string; weeks: number; asOf: string }

type Bucket = { start: string; end: string; usedEnd: string; partial: boolean }
function bucketsFor(from: string, weeks: number, asOf: string): Bucket[] {
  assertIsoDate(asOf)
  return weeklyBuckets(from, weeks)
    .filter((b) => b.start <= asOf)
    .map((b) => ({ start: b.start, end: b.end, usedEnd: b.end > asOf ? asOf : b.end, partial: b.end > asOf }))
}

function ownerCache(brands: BrandChannels[], ownBrandId: string) {
  const memo = new Map<string, boolean>()
  return (r: PeecUrlRow): boolean => {
    const key = `${r.url}\u0000${r.channel_title ?? ''}`
    let v = memo.get(key)
    if (v === undefined) { v = ownerOf({ url: r.url, channelTitle: r.channel_title }, brands) === ownBrandId; memo.set(key, v) }
    return v
  }
}

export function buildCitationGraph(i: Common & { graphId: GraphId; platforms: Platform[]; rows: PeecUrlRow[] }): GraphPoint[] {
  const buckets = bucketsFor(i.from, i.weeks, i.asOf)
  if (buckets.length === 0) return []
  const isOwn = ownerCache(i.brands, i.ownBrandId)
  const winStart = buckets[0].start, winEnd = buckets[buckets.length - 1].usedEnd
  const own = i.rows.filter((r) => r.date !== undefined && r.date >= winStart && r.date <= winEnd && isOwn(r) && (() => { const p = platformOf(r.url); return p !== null && i.platforms.includes(p) })())
  const hasSource = own.some((r) => r.retrieval_count > 0)
  return buckets.map((b) => ({
    graphId: i.graphId, series: i.ownBrandName, weekStart: b.start, weekEnd: b.end, unit: 'citations' as const, partial: b.partial,
    value: hasSource ? own.filter((r) => r.date! >= b.start && r.date! <= b.usedEnd).reduce((s, r) => s + r.citation_count, 0) : null,
  }))
}

/** Per bucket: chats with at least one own-owned source on the five platforms retrieved, over that bucket's chats. Rows are the chat-level pull. */
export function buildUsedAsSource(i: Common & { rows: PeecUrlRow[]; chatsByDay: Map<string, number> }): GraphPoint[] {
  const buckets = bucketsFor(i.from, i.weeks, i.asOf)
  if (buckets.length === 0) return []
  const isOwn = ownerCache(i.brands, i.ownBrandId)
  const winStart = buckets[0].start, winEnd = buckets[buckets.length - 1].usedEnd
  const own = i.rows.filter((r) => r.date !== undefined && r.date >= winStart && r.date <= winEnd && r.chat !== undefined && r.retrieval_count > 0 && platformOf(r.url) !== null && isOwn(r))
  const hasSource = own.length > 0
  return buckets.map((b) => {
    const chats = new Set<string>()
    for (const r of own) if (r.date! >= b.start && r.date! <= b.usedEnd) chats.add(r.chat!.id)
    const denom = eachDay({ start: b.start, end: b.usedEnd }).reduce((s, d) => s + (i.chatsByDay.get(d) ?? 0), 0)
    return {
      graphId: 'used_as_source_all' as const, series: i.ownBrandName, weekStart: b.start, weekEnd: b.end, unit: 'percent' as const, partial: b.partial,
      value: hasSource && denom > 0 ? chats.size / denom : null,
    }
  })
}
