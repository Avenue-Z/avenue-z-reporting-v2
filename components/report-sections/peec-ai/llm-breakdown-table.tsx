import type { LLMBreakdown } from '@/lib/peec/client'

const MODEL_COLORS: Record<string, string> = {
  ChatGPT:   '#10A37F',
  Perplexity: '#26C7C8',
  Gemini:    '#4285F4',
  Claude:    '#CC785C',
  Copilot:   '#0078D4',
  Google:    '#34A853',
}

function ColHeader({ label, tooltip, anchorRight = false }: { label: string; tooltip: string; anchorRight?: boolean }) {
  return (
    <th className="px-5 py-2.5 text-[10px] font-extrabold uppercase tracking-widest text-text-muted text-right">
      <span className="inline-flex items-center gap-1 justify-end">
        {label}
        <span className="group relative flex-shrink-0">
          <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">?</span>
          <span className={`pointer-events-none absolute bottom-full z-10 mb-2 w-52 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 ${anchorRight ? 'right-0' : 'left-1/2 -translate-x-1/2'}`}>
            {tooltip}
            <span className={`absolute top-full border-4 border-transparent border-t-white/[0.08] ${anchorRight ? 'right-2' : 'left-1/2 -translate-x-1/2'}`} />
          </span>
        </span>
      </span>
    </th>
  )
}

function VisibilityBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="tabular-nums text-white text-sm">{value.toFixed(1)}%</span>
    </div>
  )
}

export function LLMBreakdownTable({ breakdown }: { breakdown: LLMBreakdown[] }) {
  if (breakdown.length === 0) return null

  const maxVisibility = Math.max(...breakdown.map((b) => b.visibility), 1)
  const hasOwnDomain = breakdown.some((b) => b.ownDomainRetrieved > 0)

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface">
      <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-1.5">
        <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Performance by AI Model</p>
        <span className="group relative flex-shrink-0">
          <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">?</span>
          <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-64 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
            Brand visibility and domain citation metrics broken down by AI model, YTD. Data sourced from Peec.AI.
            <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
          </span>
        </span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.04]">
            <th className="px-5 py-2.5 text-[10px] font-extrabold uppercase tracking-widest text-text-muted text-left">AI Model</th>
            <th className="px-5 py-2.5 text-[10px] font-extrabold uppercase tracking-widest text-text-muted text-left">
              <span className="inline-flex items-center gap-1">
                Visibility
                <span className="group relative flex-shrink-0">
                  <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted">?</span>
                  <span className="pointer-events-none absolute bottom-full left-0 z-10 mb-2 w-52 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
                    % of AI responses on this model that mention your brand.
                    <span className="absolute left-4 top-full border-4 border-transparent border-t-white/[0.08]" />
                  </span>
                </span>
              </span>
            </th>
            <ColHeader label="SOV"      tooltip="Your brand's share of all brand mentions on this AI model." />
            <ColHeader label="Position" tooltip="Avg rank when your brand appears in responses on this model. Lower is better." />
            {hasOwnDomain && (
              <ColHeader label="Domain Retrieved" tooltip="% of queries on this model that retrieved your owned domain as a source." anchorRight />
            )}
          </tr>
        </thead>
        <tbody>
          {breakdown.map((b) => {
            const color = MODEL_COLORS[b.model] ?? '#8A8A8A'
            return (
              <tr key={b.model} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                <td className="px-5 py-3">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-sm font-semibold text-white">{b.model}</span>
                  </span>
                </td>
                <td className="px-5 py-3">
                  <VisibilityBar value={b.visibility} max={maxVisibility} color={color} />
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-white">
                  {b.sov > 0 ? `${b.sov.toFixed(1)}%` : <span className="text-text-muted">—</span>}
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-white">
                  {b.position > 0 ? `#${b.position.toFixed(1)}` : <span className="text-text-muted">—</span>}
                </td>
                {hasOwnDomain && (
                  <td className="px-5 py-3 text-right tabular-nums text-white">
                    {b.ownDomainRetrieved > 0 ? `${b.ownDomainRetrieved.toFixed(1)}%` : <span className="text-text-muted">—</span>}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
