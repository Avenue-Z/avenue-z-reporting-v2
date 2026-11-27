import { cn } from '@/lib/utils'
import { compareSuffix, type AeoCompare } from './compare'
import { deltaTone, formatDelta } from './delta'
import type { KpiTileModel } from './kpi-values'

const TONE = { good: 'text-[#60FF80]', bad: 'text-[#FF4444]', neutral: 'text-text-muted' } as const

export function KpiTile({ tile, showDeltas, compare }: { tile: KpiTileModel; showDeltas: boolean; compare: AeoCompare }) {
  const dimmed = tile.state !== 'ok'
  const text = formatDelta(tile.delta, tile.unit)
  return (
    <div
      className={cn('rounded-lg border border-white/[0.08] bg-bg-surface px-6 py-5', dimmed && 'opacity-50')}
      data-export-block=""
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-widest text-text-muted">
          {tile.label}
        </p>
        <span className="rounded-full border border-white/[0.12] px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-text-muted">
          {tile.badge}
        </span>
      </div>
      <p className="mt-2 break-words text-2xl font-extrabold tabular-nums text-white xl:text-3xl">{tile.value}</p>
      {showDeltas && (
        <p
          className={cn('mt-1 text-sm font-bold', TONE[deltaTone(tile.delta, 'higher', tile.unit)])}
          title={text === '–' ? 'No comparison data' : undefined}
        >
          {`${text} ${compareSuffix(compare)}`.trim()}
        </p>
      )}
      <p className="mt-1.5 line-clamp-2 break-words text-xs text-text-muted" title={tile.footer}>{tile.footer}</p>
    </div>
  )
}
