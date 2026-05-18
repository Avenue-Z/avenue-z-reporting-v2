'use client'

function InlineTooltip({ text }: { text: string }) {
  return (
    <div className="group relative flex-shrink-0">
      <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">
        ?
      </span>
      <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-72 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-xs leading-relaxed text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
        {text}
        <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
      </div>
    </div>
  )
}

interface LeadQualityMixProps {
  icp:          number
  mcp:          number
  unidentified: number
}

export function LeadQualityMix({ icp, mcp, unidentified }: LeadQualityMixProps) {
  const total    = icp + mcp + unidentified
  const icpPct   = total > 0 ? (icp  / total) * 100 : 0
  const mcpPct   = total > 0 ? (mcp  / total) * 100 : 0
  const unidPct  = total > 0 ? (unidentified / total) * 100 : 0

  const segments = [
    { label: 'ICP',            value: icp,          pct: icpPct,  color: '#60FF80',              bg: 'bg-[#60FF80]'              },
    { label: 'MCP',            value: mcp,          pct: mcpPct,  color: '#60FDFF',              bg: 'bg-[#60FDFF]'              },
    { label: 'Unidentified',   value: unidentified, pct: unidPct, color: 'rgba(255,255,255,0.15)', bg: 'bg-white/[0.15]'          },
  ]

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-white">Lead Profile Mix</h3>
          <InlineTooltip text="Profile breakdown of online contacts in the selected period. ICP Rate = ICP ÷ Total Online contacts — a rising rate signals improving targeting efficiency regardless of volume." />
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold tabular-nums" style={{ color: '#60FF80' }}>
            {icpPct.toFixed(1)}%
          </p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">ICP Rate</p>
        </div>
      </div>

      {/* Stacked bar */}
      <div className="mb-5 flex h-4 w-full overflow-hidden rounded-full">
        {segments.map((seg) =>
          seg.pct > 0 ? (
            <div
              key={seg.label}
              className="h-full transition-all duration-300"
              style={{ width: `${seg.pct}%`, backgroundColor: seg.color }}
              title={`${seg.label}: ${seg.value.toLocaleString()} (${seg.pct.toFixed(1)}%)`}
            />
          ) : null
        )}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-3 gap-4">
        {segments.map((seg) => (
          <div key={seg.label} className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: seg.color }} />
              <span className="text-[11px] font-semibold text-text-muted">{seg.label}</span>
            </div>
            <p className="text-xl font-extrabold tabular-nums text-white">{seg.value.toLocaleString()}</p>
            <p className="text-[11px] text-text-muted">{seg.pct.toFixed(1)}%</p>
          </div>
        ))}
      </div>
    </div>
  )
}
