import type { PartImpl } from '@/lib/report-sections/types'
import type { PeecCtx } from '../ctx'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { cn } from '@/lib/utils'

function KpiCard({
  title, value, delta, tooltip, subtitle, invertDelta = false,
}: {
  title: string
  value: string | number
  delta?: number
  tooltip?: string
  subtitle?: string
  invertDelta?: boolean
}) {
  const positive = invertDelta ? (delta ?? 0) <= 0 : (delta ?? 0) >= 0
  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-surface px-6 py-5">
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">{title}</p>
        {tooltip && (
          <InfoTooltip text={tooltip} />
        )}
      </div>
      <p className="mt-2 text-3xl font-extrabold tabular-nums text-white">{value}</p>
      {delta !== undefined && (
        <p className={cn('mt-1 text-sm font-bold', positive ? 'text-[#60FF80]' : 'text-[#FF4444]')}>
          {(invertDelta ? delta <= 0 : delta >= 0) ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}% vs previous period
        </p>
      )}
      {subtitle && (
        <p className="mt-1.5 text-xs text-text-muted">{subtitle}</p>
      )}
    </div>
  )
}

export const kpiCardsV1: PartImpl<PeecCtx> = {
  id: 'kpi-cards',
  version: 1,
  published: true,
  defaultLabel: 'Snapshot KPIs',
  render: (ctx, resolved) => {
    const {
      you, modelActive, visFiltered, data, citationShareValue, citationShareDeltaShown,
      citShareNumer, citShareDenom, aiTraffic, aiTrafficDelta, DEF, label,
    } = ctx
    if (!you) return null
    return (
      <div>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-text-muted">{resolved.label}</h3>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {[
            {
              title: 'Visibility',
              value: modelActive ? (visFiltered != null ? `${visFiltered.toFixed(1)}%` : '--') : `${you.visibility.toFixed(1)}%`,
              delta: modelActive ? undefined : you.visibilityDelta,
              subtitle: `Competitor avg · ${data.competitorAverages.visibility.toFixed(1)}%`,
              tooltip: `${DEF.visibility.text} (${label}.) Shown for the selected date range vs. the previous period. Competitor avg is the mean across all tracked brands for that range.`,
            },
            {
              title: 'Citation Share',
              value: citationShareValue != null ? `${citationShareValue.toFixed(1)}%` : '--',
              delta: citationShareDeltaShown,
              subtitle: modelActive
                ? (citShareDenom > 0
                    ? `${citShareNumer.toLocaleString()} of ${citShareDenom.toLocaleString()} citations`
                    : 'No per-model data')
                : `${data.yourBrandCitations.toLocaleString()} of ${data.totalCitations.toLocaleString()} citations`,
              tooltip: `Share of total tracked-domain citations attributed to your brand's own domain in the selected date range vs. the previous period. Sourced from ${label}.`,
            },
            {
              title: 'AI Referral Traffic',
              value: aiTraffic.available ? aiTraffic.sessions.toLocaleString() : '--',
              delta: modelActive ? undefined : aiTrafficDelta,
              subtitle: aiTraffic.available
                ? (modelActive ? 'GA4 sessions from selected AI sources' : 'GA4 sessions from AI sources')
                : 'GA4 not configured',
              tooltip: 'Sessions from AI referrers (ChatGPT, Perplexity, Gemini, etc.) tracked in GA4. Selected date range vs. the previous period.',
            },
          ].map(({ title, value, delta, tooltip, subtitle }) => (
            <KpiCard key={title} title={title} value={value} delta={delta} tooltip={tooltip} subtitle={subtitle} />
          ))}
        </div>
      </div>
    )
  },
}
