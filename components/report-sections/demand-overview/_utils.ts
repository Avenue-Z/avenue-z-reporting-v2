/**
 * Shared formatters + constants for demand-overview sections.
 * Pure functions — no React, no fetches.
 */

export const CLOSED_STAGE_IDS = new Set(['1043842411', '1043842412', '1047007274'])
export const HIDDEN_STAGE_IDS = new Set([...CLOSED_STAGE_IDS, '1047007274'])

export const GA4_METRICS = [
  'sessions', 'activeUsers', 'newUsers',
  'bounceRate', 'averageSessionDuration',
  'conversions', 'sessionConversionRate',
]

export function fmtNum(n: number | null | undefined) {
  if (n == null) return '—'
  return Math.round(n).toLocaleString()
}

export function fmtPct(n: number | null | undefined) {
  if (n == null) return '—'
  return `${(n * 100).toFixed(1)}%`
}

export function fmtUSD(n: number) {
  if (!n || isNaN(n)) return '—'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`
  return `$${Math.round(n).toLocaleString()}`
}

export function pctDelta(current?: number | null, prior?: number | null) {
  if (current == null || prior == null || prior === 0) return undefined
  return ((current - prior) / prior) * 100
}

export function fmtDate(d: string) {
  if (!d || d.length !== 8) return d
  const [y, m, day] = [d.slice(0, 4), d.slice(4, 6), d.slice(6, 8)]
  return new Date(`${y}-${m}-${day}`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function closeYear(d: { properties?: { closedate?: string | null } }, yr: number) {
  const cd = d.properties?.closedate
  return cd ? new Date(cd).getFullYear() === yr : false
}
