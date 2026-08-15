'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

export interface AudienceRow {
  type: string        // 'new' | 'returning'
  sessions: number
  engagementRate: number
  avgDuration: number // seconds
}

export interface NewReturningProps {
  rows: AudienceRow[]
  compareRows?: AudienceRow[]
  returningUserCount?: number
}

const TYPE_COLORS: Record<string, string> = {
  new:       '#FF7A59',
  returning: '#22D3EE',
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
      style={{ color: positive ? '#60FF80' : '#FF4444' }}
    >
      {positive ? '↑' : '↓'} {Math.abs(value).toFixed(1)}%
    </span>
  )
}

export function NewReturning({ rows, compareRows, returningUserCount }: NewReturningProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const total = rows.reduce((s, r) => s + r.sessions, 0) || 1

  const newRow       = rows.find((r) => r.type === 'new')
  const returningRow = rows.find((r) => r.type === 'returning')

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

      {/* Split bar */}
      <div className="mb-4 mt-3 flex h-1.5 overflow-hidden rounded-full">
        {rows
          .slice()
          .sort((a, b) => b.sessions - a.sessions)
          .map((r, i) => {
            const color = TYPE_COLORS[r.type] ?? '#8A8A8A'
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

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        {[newRow, returningRow].map((r) => {
          if (!r) return null
          const color    = TYPE_COLORS[r.type] ?? '#8A8A8A'
          const label    = TYPE_LABELS[r.type] ?? r.type
          const share    = Math.round((r.sessions / total) * 100)
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
