// components/report-sections/peec-ai/period-ribbon.tsx
import type { PeriodChange } from '@/lib/aeo/types'

function Chip({ label, primary, deltaText, positive }: {
  label: string
  primary: string
  deltaText?: string
  positive?: boolean
}) {
  return (
    <div className="flex-1 min-w-[180px] rounded-lg border border-white/[0.06] bg-bg-surface px-4 py-3">
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-text-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-white" title={primary}>{primary}</p>
      {deltaText && (
        <p className={`mt-0.5 text-xs font-semibold tabular-nums ${positive ? 'text-[#60FF80]' : 'text-[#FF4444]'}`}>
          {deltaText}
        </p>
      )}
    </div>
  )
}

function fmtDelta(delta: number, suffix = 'pts'): string {
  return `${delta >= 0 ? '↑ +' : '↓ '}${Math.abs(delta).toFixed(1)} ${suffix}`
}

export function PeriodRibbon({ change }: { change: PeriodChange }) {
  const { visibilityMover, domainMover, competitorShift, promptOpportunity } = change

  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-text-muted">
        What changed this period? <span className="font-normal normal-case tracking-normal">· last 30 days vs prior 30</span>
      </p>
      <div className="flex flex-wrap gap-3">
        <Chip
          label="Biggest visibility mover"
          primary={visibilityMover?.label ?? '—'}
          deltaText={visibilityMover ? fmtDelta(visibilityMover.delta) : undefined}
          positive={(visibilityMover?.delta ?? 0) >= 0}
        />
        <Chip
          label="Biggest domain gain/loss"
          primary={domainMover?.label ?? '—'}
          deltaText={domainMover ? fmtDelta(domainMover.delta, '%') : undefined}
          positive={(domainMover?.delta ?? 0) >= 0}
        />
        <Chip
          label="Biggest prompt opportunity"
          primary={promptOpportunity?.text ?? '—'}
          deltaText={promptOpportunity ? `${promptOpportunity.visibility.toFixed(1)}% visibility` : undefined}
          positive={false}
        />
        <Chip
          label="Biggest competitor shift"
          primary={competitorShift?.label ?? '—'}
          deltaText={competitorShift ? fmtDelta(competitorShift.delta) : undefined}
          positive={false}
        />
      </div>
    </div>
  )
}
