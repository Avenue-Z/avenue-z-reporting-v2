// Shared formatting for the Technical Audit page. A plain module (no 'use client'), so both the server parts and the
// client chart import the same functions.
import type { KpiDef } from '@/lib/technical-audit/kpis'

/** "2026-11-01" → "Nov 1, 2026". Snapshot and crawl dates are calendar dates, so read in UTC. */
export function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

/** A KPI value as the page shows it; null is "—". */
export function fmtKpi(unit: KpiDef['unit'], v: number | null): string {
  if (v === null) return '—'
  return unit === 'pct' ? `${v.toFixed(1)}%` : Math.round(v).toLocaleString('en-US')
}

/** A signed delta: "+3 pts", "−1,204", "+2.5 pts" for a percentage; null is "—". */
export function fmtDelta(unit: KpiDef['unit'], d: number | null): string {
  if (d === null) return '—'
  const abs = unit === 'pct' ? Math.abs(d).toFixed(1) : Math.round(Math.abs(d)).toLocaleString('en-US')
  const sign = d > 0 ? '+' : d < 0 ? '−' : ''
  return `${sign}${abs}${unit === 'count' ? '' : ' pts'}`
}

export const TONE_COLOR = { good: '#60FF80', bad: '#FF4444', flat: '#8A8A8A' } as const
