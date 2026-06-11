// lib/aeo/bucket.ts
import type { DailyPoint, BucketGranularity, ChartBucket } from './types'

function isoMonday(d: Date): Date {
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  const m = new Date(d)
  m.setUTCDate(d.getUTCDate() + diff)
  return m
}

function bucketKey(date: Date, g: BucketGranularity): string {
  const y = date.getUTCFullYear()
  switch (g) {
    case 'daily':     return date.toISOString().slice(0, 10)
    case 'weekly':    return isoMonday(date).toISOString().slice(0, 10)
    case 'monthly':   return `${y}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    case 'quarterly': return `${y}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`
  }
}

function bucketLabel(key: string, g: BucketGranularity): string {
  switch (g) {
    case 'daily':
    case 'weekly': {
      const d = new Date(key)
      const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
      return `${month} ${d.getUTCDate()}`
    }
    case 'monthly': {
      const [y, m] = key.split('-')
      const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1))
      return d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
    }
    case 'quarterly':
      return key.split('-')[1] // 'Q2'
  }
}

/** Bucket a daily series into the chosen interval, averaging visibility per bucket. */
export function bucketDaily(points: DailyPoint[], g: BucketGranularity): ChartBucket[] {
  const map = new Map<string, { sum: number; count: number }>()
  for (const p of points) {
    const d = new Date(p.date)
    if (isNaN(d.getTime())) continue
    const key = bucketKey(d, g)
    const e = map.get(key)
    if (e) { e.sum += p.visibility; e.count += 1 }
    else map.set(key, { sum: p.visibility, count: 1 })
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { sum, count }]) => ({ key, label: bucketLabel(key, g), visibility: sum / count }))
}
