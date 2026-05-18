'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { CHART_COLORS } from '@/lib/constants'
import type { TopDomain } from '@/lib/peec/client'

export interface ReferralDomain {
  domain: string
  sessions: number
}

interface CitationBreakdownProps {
  referralDomains: ReferralDomain[]
  topDomains:      TopDomain[]
}

export function CitationBreakdown({ referralDomains, topDomains }: CitationBreakdownProps) {
  const [refHovered, setRefHovered]       = useState<string | null>(null)
  const [domainHovered, setDomainHovered] = useState<string | null>(null)

  const maxRefSessions = Math.max(...referralDomains.map((r) => r.sessions), 1)
  const maxDomCit      = Math.max(...topDomains.map((d) => d.retrieved), 1)

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

      {/* ── Top Referral Domains — GA4 ── */}
      <div className="rounded-xl border border-white/[0.06] bg-bg-surface p-6">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-text-muted">
          Top Referral Domains
        </p>
        <p className="mb-4 text-xs text-text-muted">
          Domains sending the most referral sessions via GA4
        </p>

        {referralDomains.length === 0 ? (
          <p className="text-xs text-text-muted/50 italic">No referral data available</p>
        ) : (
          <div className="space-y-2">
            {referralDomains.map((ref, i) => {
              const barW     = (ref.sessions / maxRefSessions) * 100
              const isHov    = refHovered === ref.domain
              const isDimmed = refHovered !== null && !isHov

              return (
                <div
                  key={ref.domain}
                  className={cn(
                    'group flex cursor-default items-center gap-3 rounded-md px-2 py-1.5 transition-all duration-200',
                    isDimmed ? 'opacity-25' : 'opacity-100',
                    isHov    ? 'bg-white/[0.03]' : ''
                  )}
                  onMouseEnter={() => setRefHovered(ref.domain)}
                  onMouseLeave={() => setRefHovered(null)}
                >
                  {/* Rank */}
                  <span className="w-4 shrink-0 text-center text-[10px] font-bold text-text-muted/50">
                    {i + 1}
                  </span>

                  {/* Color dot */}
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: CHART_COLORS.ga4 }}
                  />

                  {/* Domain */}
                  <span className="min-w-0 flex-1 truncate text-xs text-white/80" title={ref.domain}>
                    {ref.domain}
                  </span>

                  {/* Bar */}
                  <div className="relative h-1 w-16 shrink-0 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${barW}%`, backgroundColor: CHART_COLORS.ga4, opacity: 0.8 }}
                    />
                  </div>

                  {/* Sessions */}
                  <span className="w-16 shrink-0 text-right tabular-nums text-xs font-semibold text-white">
                    {ref.sessions.toLocaleString()}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* Legend */}
        <div className="mt-4 flex items-center gap-1.5 border-t border-white/[0.06] pt-3">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: CHART_COLORS.ga4 }} />
          <span className="text-[9px] text-text-muted">Sessions · Last 30 days · GA4</span>
        </div>
      </div>

      {/* ── Top Cited Domains — AI ── */}
      {topDomains.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-bg-surface p-6">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-text-muted">
            Top Cited Domains
          </p>
          <p className="mb-4 text-xs text-text-muted">
            % of AI answers where each domain was retrieved
          </p>
          <div className="space-y-2">
            {topDomains.slice(0, 8).map((domain, i) => {
              const barW     = (domain.retrieved / maxDomCit) * 100
              const isHov    = domainHovered === domain.domain
              const isDimmed = domainHovered !== null && !isHov
              const delta    = domain.retrievedDelta

              return (
                <div
                  key={domain.domain}
                  className={cn(
                    'group flex cursor-default items-center gap-3 rounded-md px-2 py-1.5 transition-all duration-200',
                    isDimmed ? 'opacity-25' : 'opacity-100',
                    isHov    ? 'bg-white/[0.03]' : ''
                  )}
                  onMouseEnter={() => setDomainHovered(domain.domain)}
                  onMouseLeave={() => setDomainHovered(null)}
                >
                  {/* Rank */}
                  <span className="w-4 shrink-0 text-center text-[10px] font-bold text-text-muted/50">
                    {i + 1}
                  </span>

                  {/* Type dot */}
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: domain.type === 'Own'      ? CHART_COLORS.ga4 :
                                        domain.type === 'Editorial' ? CHART_COLORS.primary :
                                        CHART_COLORS.neutral,
                    }}
                  />

                  {/* Domain */}
                  <span className="min-w-0 flex-1 truncate text-xs text-white/80" title={domain.domain}>
                    {domain.domain}
                  </span>

                  {/* Bar */}
                  <div className="relative h-1 w-16 shrink-0 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width:           `${barW}%`,
                        backgroundColor: domain.type === 'Own' ? CHART_COLORS.ga4 : CHART_COLORS.primary,
                        opacity:         0.8,
                      }}
                    />
                  </div>

                  {/* Count + delta */}
                  <div className="flex w-20 shrink-0 items-center justify-end gap-1.5">
                    {isHov && delta !== 0 && (
                      <span
                        className="text-[10px] font-bold"
                        style={{ color: delta > 0 ? '#60FF80' : '#FF4444' }}
                      >
                        {delta > 0 ? '↑' : '↓'}{Math.abs(delta).toFixed(1)}%
                      </span>
                    )}
                    <span className="tabular-nums text-xs font-semibold text-white">
                      {domain.retrieved.toFixed(1)}%
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Domain type legend */}
          <div className="mt-4 flex gap-4 border-t border-white/[0.06] pt-3">
            {[
              { label: 'Own domain', color: CHART_COLORS.ga4     },
              { label: 'Editorial',  color: CHART_COLORS.primary  },
              { label: 'Other',      color: CHART_COLORS.neutral  },
            ].map((t) => (
              <div key={t.label} className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.color }} />
                <span className="text-[9px] text-text-muted">{t.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
