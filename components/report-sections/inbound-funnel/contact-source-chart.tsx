'use client'

import type { ContactSourceBreakdown } from '@/lib/hubspot/client'

function InlineTooltip({ text }: { text: string }) {
  return (
    <div className="group relative flex-shrink-0">
      <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">
        ?
      </span>
      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-64 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-xs leading-relaxed text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
        {text}
        <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
      </div>
    </div>
  )
}

const SOURCE_LABELS: Record<string, string> = {
  ORGANIC_SEARCH:   'Organic Search',
  PAID_SEARCH:      'Paid Search',
  SOCIAL_MEDIA:     'Social Media',
  PAID_SOCIAL:      'Paid Social',
  EMAIL_MARKETING:  'Email Marketing',
  REFERRALS:        'Referrals',
  DIRECT_TRAFFIC:   'Direct Traffic',
  OTHER_CAMPAIGNS:  'Other Campaigns',
  CONTENT:          'Content',
  Unknown:          'Unknown',
}

const ICP_COLOR          = '#60FF80'
const MCP_COLOR          = '#60FDFF'
const UNIDENTIFIED_COLOR = 'rgba(255,255,255,0.12)'

interface ContactSourceChartProps {
  data: ContactSourceBreakdown
}

export function ContactSourceChart({ data }: ContactSourceChartProps) {
  const maxTotal = Math.max(...data.map((d) => d.icp + d.mcp + d.unidentified), 1)

  if (data.length === 0) return null

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-white">Inbound Contacts by Source</h3>
          <InlineTooltip text="Breakdown of 2026 inbound contacts by original traffic source. ICP, MCP, and unidentified contacts shown per channel." />
        </div>
        {/* Legend */}
        <div className="flex items-center gap-5">
          {[
            { label: 'ICP',            color: ICP_COLOR          },
            { label: 'MCP',            color: MCP_COLOR          },
            { label: 'Not Identified', color: UNIDENTIFIED_COLOR },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
              <span className="text-xs text-text-muted">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bars */}
      <div className="space-y-3">
        {data.map((item) => {
          const total = item.icp + item.mcp + item.unidentified
          const barPct = (total / maxTotal) * 100
          const icpPct = total > 0 ? (item.icp / total) * 100 : 0
          const mcpPct = total > 0 ? (item.mcp / total) * 100 : 0
          const unidPct = total > 0 ? (item.unidentified / total) * 100 : 0
          const label = SOURCE_LABELS[item.source] ?? item.source

          return (
            <div key={item.source} className="flex items-center gap-3">
              <div className="w-36 shrink-0 truncate text-right text-xs text-text-muted">
                {label}
              </div>

              {/* Stacked bar */}
              <div className="relative h-6 flex-1 overflow-hidden rounded-sm bg-white/[0.04]">
                <div
                  className="absolute inset-y-0 left-0 flex h-full overflow-hidden rounded-sm"
                  style={{ width: `${barPct}%` }}
                >
                  {icpPct > 0 && (
                    <div style={{ width: `${icpPct}%`, backgroundColor: ICP_COLOR }} title={`ICP: ${item.icp}`} />
                  )}
                  {mcpPct > 0 && (
                    <div style={{ width: `${mcpPct}%`, backgroundColor: MCP_COLOR }} title={`MCP: ${item.mcp}`} />
                  )}
                  {unidPct > 0 && (
                    <div style={{ width: `${unidPct}%`, backgroundColor: UNIDENTIFIED_COLOR }} title={`Not Identified: ${item.unidentified}`} />
                  )}
                </div>
              </div>

              {/* Counts */}
              <div className="w-40 shrink-0 text-xs">
                <span className="tabular-nums text-white">{total.toLocaleString()}</span>
                <span className="ml-2 text-text-muted">
                  {item.icp > 0 && <span style={{ color: ICP_COLOR }}>{item.icp} ICP </span>}
                  {item.mcp > 0 && <span style={{ color: MCP_COLOR }}>{item.mcp} MCP </span>}
                  {item.unidentified > 0 && <span className="text-text-muted">{item.unidentified} —</span>}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
