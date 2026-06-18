import Link from 'next/link'
import type { BlockError } from '@/lib/dashboard/types'

const CARD =
  'rounded-lg border border-white/[0.08] bg-bg-surface px-6 py-5 min-h-[140px] flex flex-col justify-between'

export function MetricBlockSkeleton({ name }: { name?: string }) {
  return (
    <div
      className={CARD}
      aria-busy="true"
      aria-label={name ? `Loading ${name}` : 'Loading metric'}
    >
      <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
      <div className="h-8 w-32 animate-pulse rounded bg-white/10" />
      <div className="h-3 w-20 animate-pulse rounded bg-white/10" />
    </div>
  )
}

const ERROR_COPY: Record<BlockError, { title: string; body: React.ReactNode }> = {
  disconnected: {
    title: 'Not connected',
    body: (
      <>
        Connect this data source on the{' '}
        <Link href="/dashboard/connections" className="underline hover:text-white">
          connections
        </Link>{' '}
        page.
      </>
    ),
  },
  'invalid-metric': {
    title: 'Metric configuration invalid',
    body: 'Re-author this block to pick a valid metric.',
  },
  'no-data': {
    title: 'No data for this range',
    body: 'Try a wider range or a different comparison.',
  },
  'rate-limited': {
    title: 'Temporarily unavailable',
    body: 'Data source is rate-limited. It should recover shortly.',
  },
  error: {
    title: 'Something went wrong',
    body: 'Refresh to try again.',
  },
}

export function MetricBlockErrorState({
  name,
  error,
}: {
  name: string
  error: BlockError
}) {
  const copy = ERROR_COPY[error]
  return (
    <div className={CARD} role="status">
      <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">
        {name}
      </p>
      <p className="mt-2 text-base font-bold text-white">{copy.title}</p>
      <p className="mt-1 text-xs text-text-muted">{copy.body}</p>
    </div>
  )
}

export function EmptyDashboardState({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-lg border border-dashed border-white/[0.08] bg-bg-surface/40 p-12 text-center">
      <p className="text-lg font-bold text-white">No blocks yet</p>
      <p className="mt-2 max-w-md text-sm text-text-muted">
        {canEdit
          ? 'Add a metric block to start building this dashboard.'
          : 'This dashboard has not been configured yet.'}
      </p>
    </div>
  )
}
