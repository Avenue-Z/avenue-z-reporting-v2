'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { CHART_COLORS } from '@/lib/constants'
import { NoData, LoadFailed } from './no-data'

export interface AudienceRow {
  type: string        // 'new' | 'returning'
  sessions: number
  engagementRate: number
  avgDuration: number // seconds
}

export interface NewReturningProps {
  rows: AudienceRow[]
  compareRows?: AudienceRow[]
  /** True when the primary (current-period) GA4 query REJECTED, as opposed to
   *  succeeding with zero rows. Selects the "couldn't load" empty state
   *  instead of NoData so an outage never reads as a claim the period itself
   *  had no traffic. */
  failed?: boolean
}

// Routed through CHART_COLORS (CLAUDE.md) instead of inlined hex. 'new' reuses the
// hubspot token, which is the same orange already used for "New Users" in the
// sessions trend chart above this card on the page. 'returning' was previously an
// inlined '#22D3EE' that matched no CHART_COLORS token and read as a near-duplicate
// of CHART_COLORS.primary ('#60FDFF', this page's "Active Users" cyan): cyan then
// meant three different things on one page. metaAds' purple is a distinct hue from
// every other fixed color on this page (cyan, blue, green, red, orange) and isn't
// reused elsewhere in this component or in stages.ts, so it was picked over adding
// a new token.
const TYPE_COLORS: Record<string, string> = {
  new:       CHART_COLORS.hubspot,
  returning: CHART_COLORS.metaAds,
}

const TYPE_LABELS: Record<string, string> = {
  new:       'New Visitors',
  returning: 'Returning',
}

function fmtPct(n: number)  { return `${(n * 100).toFixed(1)}%` }
function fmtDur(s: number)  {
  const m = Math.floor(s / 60)
  const r = Math.round(s % 60)
  return `${m}m ${String(r).padStart(2, '0')}s`
}

function delta(current: number, prior: number | undefined): number | null {
  if (prior == null || prior === 0) return null
  return ((current - prior) / prior) * 100
}

function DeltaBadge({ value }: { value: number | null }) {
  if (value === null) return null
  const positive = value >= 0
  return (
    <span
      className="ml-1.5 text-[11px] font-bold"
      style={{ color: positive ? CHART_COLORS.positive : CHART_COLORS.negative }}
    >
      {positive ? '↑' : '↓'} {Math.abs(value).toFixed(1)}%
    </span>
  )
}

export function NewReturning({ rows, compareRows, failed }: NewReturningProps) {
  const [hovered, setHovered] = useState<string | null>(null)

  // An empty array here means either a query that succeeded with zero rows or
  // one that REJECTED (see index.tsx / reshape.ts, both collapse to []).
  // `failed` disambiguates which empty state is honest: chart chrome around
  // nothing either way, but the copy must not claim the period was empty
  // when the real story is an outage.
  if (rows.length === 0) {
    return failed ? <LoadFailed /> : <NoData />
  }

  const total = rows.reduce((s, r) => s + r.sessions, 0) || 1

  const newRow       = rows.find((r) => r.type === 'new')
  const returningRow = rows.find((r) => r.type === 'returning')

  // Fixed order (not sorted by sessions) so the split bar and the stat cards below
  // always read in the same left-to-right order. An established site with
  // returning > new used to sort the bar returning-first while the cards stayed
  // new-first, so the bar read one order and the cards read the other.
  const orderedRows: AudienceRow[] = [newRow, returningRow].filter((r): r is AudienceRow => !!r)

  // The first segment's share is rounded independently; the second is derived as
  // the remainder so the two always sum to 100 (two independent Math.round calls
  // could each round up, e.g. 33.5% and 66.5% rendering as 34% and 67%).
  const firstShare = orderedRows.length > 0 ? Math.round((orderedRows[0].sessions / total) * 100) : 0

  // Build compare lookup
  const compareMap = new Map((compareRows ?? []).map((r) => [r.type, r]))

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface px-6 py-5">
      <div className="mb-0.5 flex items-center gap-2">
        <h3 className="text-lg font-bold text-white">New vs. Returning</h3>
        <div className="group relative flex-shrink-0">
          <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">?</span>
          <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-64 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-xs leading-relaxed text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
            Audience loyalty split. Returning visitors typically engage longer and convert at higher rates — a growing returning base signals the site is building an audience, not just buying traffic.
            <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
          </div>
        </div>
      </div>
      <p className="mb-1 text-xs text-text-muted">Sessions by visitor type</p>

      {/* Split bar: uses orderedRows (fixed new/returning order), not sorted by
          sessions, so the segment order always matches the stat cards below. */}
      <div className="mb-4 mt-3 flex h-1.5 overflow-hidden rounded-full">
        {orderedRows.map((r, i) => {
          const color = TYPE_COLORS[r.type] ?? CHART_COLORS.neutral
          return (
            <div
              key={r.type}
              className={cn('transition-all duration-500', i > 0 ? 'ml-0.5' : '')}
              style={{
                width:           `${(r.sessions / total) * 100}%`,
                backgroundColor: color,
                borderRadius:    i === 0 ? '9999px 0 0 9999px' : '0 9999px 9999px 0',
                opacity:         hovered === null || hovered === r.type ? 0.85 : 0.2,
              }}
            />
          )
        })}
      </div>

      {/* Stat cards: same orderedRows so the cards always match the bar's left-to-right order.
          share is firstShare for the first card and the remainder for the second, so the two
          always sum to 100 instead of each independently rounding. */}
      <div className="grid grid-cols-2 gap-3">
        {orderedRows.map((r, i) => {
          const color    = TYPE_COLORS[r.type] ?? CHART_COLORS.neutral
          const label    = TYPE_LABELS[r.type] ?? r.type
          const share    = i === 0 ? firstShare : 100 - firstShare
          const isHov    = hovered === r.type
          const isDimmed = hovered !== null && !isHov
          const prior    = compareMap.get(r.type)

          const sessionsDelta    = delta(r.sessions, prior?.sessions)
          const engagementDelta  = prior
            ? delta(r.engagementRate, prior.engagementRate)
            : null

          return (
            <div
              key={r.type}
              className={cn(
                'relative overflow-hidden rounded-lg border px-4 py-3 transition-all duration-200',
                isHov    ? 'border-white/[0.15]' : 'border-white/[0.06]',
                isDimmed ? 'opacity-30'           : 'opacity-100'
              )}
              onMouseEnter={() => setHovered(r.type)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Color accent fill */}
              <div
                className="pointer-events-none absolute inset-0 rounded-lg"
                style={{ backgroundColor: color, opacity: isHov ? 0.08 : 0.04 }}
              />
              <div className="relative">
                <div className="mb-2 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-xs font-bold uppercase tracking-wider text-text-muted">{label}</span>
                </div>
                <div className="flex items-baseline gap-1">
                  <p className="tabular-nums text-2xl font-extrabold text-white">
                    {r.sessions.toLocaleString()}
                  </p>
                  <DeltaBadge value={sessionsDelta} />
                </div>
                <p className="mb-3 text-xs text-text-muted">{share}% of sessions</p>
                <div className="space-y-1 border-t border-white/[0.06] pt-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-muted">Engagement</span>
                    <span className="font-semibold text-white/80">
                      {fmtPct(r.engagementRate)}
                      <DeltaBadge value={engagementDelta} />
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-text-muted">Avg Duration</span>
                    <span className="font-semibold text-white/80">{fmtDur(r.avgDuration)}</span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
