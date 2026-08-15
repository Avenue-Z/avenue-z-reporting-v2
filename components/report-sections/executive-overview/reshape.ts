import { CHART_COLORS } from '@/lib/constants'
import type { TrendRow } from './sessions-trend-chart'
import type { AudienceRow } from './new-returning'
import type { ChannelVolumeRow, ChannelConvRow, SourceMediumEntry } from './channel-tabs-chart'

/**
 * A single GA4 API row. Field presence and typing vary by query (which
 * dimensions/metrics were requested), so this stays a loose bag of values —
 * callers know which fields their query shape actually produces.
 */
export type Ga4Row = Record<string, string | number | null | undefined>

// ── Formatters — ported verbatim from components/report-sections/ga4/index.tsx:33-76 ──

export function fmtNum(n: number | null | undefined): string {
  if (n == null) return '—'
  return Math.round(n).toLocaleString()
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—'
  return `${(n * 100).toFixed(1)}%`
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

/** Format GA4 date string "20250101" → "Jan 1" */
export function fmtDate(d: string): string {
  if (!d || d.length !== 8) return d
  const year = parseInt(d.slice(0, 4))
  const month = parseInt(d.slice(4, 6)) - 1
  const day = parseInt(d.slice(6, 8))
  return new Date(year, month, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

/** Format ISO date "2025-01-01" → "Jan 1, 2025" */
export function fmtISODate(d: string): string {
  if (!d) return d
  const [year, month, day] = d.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function pct(current: number | null | undefined, baseline: number | null | undefined): number | undefined {
  if (current == null || baseline == null || baseline === 0) return undefined
  return ((current - baseline) / baseline) * 100
}

// ── Trend — ported from ga4/index.tsx:316-334 ──

export function buildTrendRows(current: Ga4Row[] | null, compare: Ga4Row[] | null): TrendRow[] {
  if (!current) return []

  const currentRows = [...current].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const compareRows = [...(compare ?? [])].sort((a, b) => String(a.date).localeCompare(String(b.date)))

  return currentRows.map((r, i) => {
    const prev = compareRows[i] ?? null
    return {
      date:         fmtDate(String(r.date ?? '')),
      sessions:     (r.sessions    as number) ?? 0,
      users:        (r.activeUsers as number) ?? 0,
      newUsers:     (r.newUsers    as number) ?? 0,
      prevDate:     prev ? fmtDate(String(prev.date ?? '')) : undefined,
      prevSessions: prev ? ((prev.sessions    as number) ?? 0) : undefined,
      prevUsers:    prev ? ((prev.activeUsers as number) ?? 0) : undefined,
      prevNewUsers: prev ? ((prev.newUsers    as number) ?? 0) : undefined,
    }
  })
}

// ── Channels — ported as one block from ga4/index.tsx:336-403. channelConvData
// depends on channelColorMap, which depends on channelData — splitting these
// desynchronizes the two tabs' colors. ──

export function buildChannelData(
  current: Ga4Row[] | null,
  compare: Ga4Row[] | null,
  sourceMedium: Ga4Row[] | null,
): {
  volumeData: ChannelVolumeRow[]
  convData: ChannelConvRow[]
  compareMap: Record<string, number>
  sourceMediumMap: Record<string, SourceMediumEntry[]>
} {
  if (!current) {
    return { volumeData: [], convData: [], compareMap: {}, sourceMediumMap: {} }
  }

  const CHANNEL_COLORS = [
    CHART_COLORS.ga4,      // blue
    CHART_COLORS.positive, // green
    CHART_COLORS.primary,  // cyan
    CHART_COLORS.email,    // yellow
    '#FF7A59',             // orange
    CHART_COLORS.tiktok,   // pink
    CHART_COLORS.metaAds,  // purple
    CHART_COLORS.reddit,   // red-orange
    CHART_COLORS.neutral,  // grey (fallback)
  ]

  const channelTotal = current.reduce(
    (sum, r) => sum + ((r.sessions as number) ?? 0), 0
  )

  // Map compare period sessions by channel name for O(1) lookup
  const compareMap: Record<string, number> = {}
  for (const r of compare ?? []) {
    compareMap[String(r.sessionDefaultChannelGroup ?? 'Other')] =
      (r.sessions as number) ?? 0
  }

  const volumeData = [...current]
    .sort((a, b) => ((b.sessions as number) ?? 0) - ((a.sessions as number) ?? 0))
    .map((r, i) => ({
      name:     String(r.sessionDefaultChannelGroup ?? 'Other'),
      sessions: (r.sessions as number) ?? 0,
      pct:      channelTotal > 0
        ? Math.round(((r.sessions as number) ?? 0) / channelTotal * 100)
        : 0,
      convRate: (r.sessionConversionRate as number) ?? 0,
      color:    CHANNEL_COLORS[i % CHANNEL_COLORS.length],
    }))

  // Channels by conversion rate — same rows, sorted by conv rate, top 5 with ≥20 sessions
  const channelColorMap = Object.fromEntries(volumeData.map((c) => [c.name, c.color]))
  const convData = [...current]
    .filter((r) => ((r.sessions as number) ?? 0) >= 20)
    .sort((a, b) => ((b.sessionConversionRate as number) ?? 0) - ((a.sessionConversionRate as number) ?? 0))
    .slice(0, 5)
    .map((r) => {
      const name = String(r.sessionDefaultChannelGroup ?? 'Other')
      return {
        name,
        sessions:  (r.sessions             as number) ?? 0,
        convRate:  (r.sessionConversionRate as number) ?? 0,
        color:     channelColorMap[name] ?? CHART_COLORS.neutral,
      }
    })

  // Channel × source/medium map — top source/medium pairs per channel, shown on hover
  const sourceMediumMap: Record<string, SourceMediumEntry[]> = {}
  for (const r of sourceMedium ?? []) {
    const channel = String(r.sessionDefaultChannelGroup ?? 'Other')
    const src     = String(r.sessionSource ?? '').toLowerCase()
    const med     = String(r.sessionMedium ?? '').toLowerCase()
    if (src === '(not set)' || src === '') continue
    const key = `${src} / ${med}`
    if (!sourceMediumMap[channel]) sourceMediumMap[channel] = []
    const entry = sourceMediumMap[channel].find((e) => e.name === key)
    if (entry) entry.sessions += (r.sessions as number) ?? 0
    else sourceMediumMap[channel].push({ name: key, sessions: (r.sessions as number) ?? 0 })
  }
  for (const ch of Object.keys(sourceMediumMap)) {
    sourceMediumMap[ch].sort((a, b) => b.sessions - a.sessions)
    sourceMediumMap[ch] = sourceMediumMap[ch].slice(0, 6)
  }

  return { volumeData, convData, compareMap, sourceMediumMap }
}

// ── Audience — ported from ga4/index.tsx:464-483. The source computes
// returningUserCount inline in JSX (:564) from the totals row (activeUsers
// minus newUsers, floored at 0) — a value this function has no access to
// under its single-argument signature. Since every row here is already
// bucketed into exactly 'new' or 'returning', the returning bucket's own
// session count is the equivalent figure available from these rows, and is
// floored at 0 the same way. ──

function bucketAudience(rows: Ga4Row[]): AudienceRow[] {
  const map: Record<string, { sessions: number; engRate: number; dur: number }> = {}
  for (const r of rows) {
    const raw  = String(r.newVsReturning ?? '').toLowerCase()
    const type = raw.includes('new') ? 'new' : 'returning'
    const s    = (r.sessions as number) ?? 0
    if (!map[type]) map[type] = { sessions: 0, engRate: 0, dur: 0 }
    map[type].sessions += s
    // Weight engagement rate and duration by session count for a proper average
    map[type].engRate  += ((r.engagementRate as number) ?? 0) * s
    map[type].dur      += ((r.averageSessionDuration as number) ?? 0) * s
  }
  return Object.entries(map).map(([type, d]) => ({
    type,
    sessions:       d.sessions,
    engagementRate: d.sessions > 0 ? d.engRate / d.sessions : 0,
    avgDuration:    d.sessions > 0 ? d.dur    / d.sessions : 0,
  })).sort((a, b) => b.sessions - a.sessions)
}

export function buildAudienceRows(rows: Ga4Row[] | null): { rows: AudienceRow[]; returningUserCount?: number } {
  if (!rows) return { rows: [] }

  const audienceRows = bucketAudience(rows)
  const returningUserCount = Math.max(0, audienceRows.find((r) => r.type === 'returning')?.sessions ?? 0)

  return { rows: audienceRows, returningUserCount }
}

// ── Compare label — ported from ga4/index.tsx:537-539 ──

export function buildCompareLabel(compare: { startDate: string; endDate: string } | null): string | undefined {
  if (!compare) return undefined
  return `${fmtISODate(compare.startDate)} – ${fmtISODate(compare.endDate)}`
}
