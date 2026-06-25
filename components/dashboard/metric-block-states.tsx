import Link from 'next/link'
import type { BlockError } from '@/lib/dashboard/types'
import { AddBlockButton } from './add-block/add-block-button'

const ERROR_TITLE: Record<BlockError, string> = {
  disconnected: 'Not connected',
  'invalid-metric': 'Metric configuration invalid',
  'no-data': 'No data for this range',
  'rate-limited': 'Temporarily unavailable',
  error: 'Something went wrong',
}

function errorBody(error: BlockError, slug: string): React.ReactNode {
  switch (error) {
    case 'disconnected':
      return (
        <>
          Connect this data source on the{' '}
          <Link href={`/dashboard/${slug}/auth`} className="underline hover:text-white">
            connections
          </Link>{' '}
          page.
        </>
      )
    case 'invalid-metric':
      return 'Re-author this block to pick a valid metric.'
    case 'no-data':
      return 'Try a wider range or a different comparison.'
    case 'rate-limited':
      return 'Data source is rate-limited. It should recover shortly.'
    case 'error':
      return 'Refresh to try again.'
  }
}

export function EmptyDashboardState({ canEdit, slug }: { canEdit: boolean; slug: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-lg border border-dashed border-white/[0.08] bg-bg-surface/40 p-12 text-center">
      <p className="text-lg font-bold text-white">No blocks yet</p>
      <p className="mt-2 max-w-md text-sm text-text-muted">
        {canEdit ? 'Add a metric block to start building this dashboard.' : 'This dashboard has not been configured yet.'}
      </p>
      {canEdit && <div className="mt-5"><AddBlockButton slug={slug} config={null} /></div>}
    </div>
  )
}

/** Inline value-area skeleton (sits inside the block card; name is already shown by the shell). */
export function ValueSkeleton() {
  return <div className="h-8 w-32 animate-pulse rounded bg-white/10" aria-busy="true" aria-label="Loading value" />
}

/** Inline comparison-delta skeleton. */
export function DeltaSkeleton() {
  return <div className="h-3 w-20 animate-pulse rounded bg-white/10" aria-busy="true" aria-label="Loading comparison" />
}

/** Inline value error (no card/name — the shell already renders those). */
export function BlockValueError({ error, slug }: { error: BlockError; slug: string }) {
  return (
    <div role="status">
      <p className="text-base font-bold text-white">{ERROR_TITLE[error]}</p>
      <p className="mt-1 text-xs text-text-muted">{errorBody(error, slug)}</p>
    </div>
  )
}

/** Card-sized error body for chart blocks (Bar/Line). Reuses BlockValueError's copy table. */
export function BlockBodyError({ name, error, slug }: { name: string; error: BlockError; slug: string }) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-surface px-6 py-5 h-full flex flex-col">
      <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">{name}</p>
      <div className="mt-auto"><BlockValueError error={error} slug={slug} /></div>
    </div>
  )
}
