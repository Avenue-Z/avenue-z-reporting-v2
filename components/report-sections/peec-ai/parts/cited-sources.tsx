import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import type { PeecCtx } from '../ctx'
import type { AeoProvider } from '../provider-tabs'
import { parseDateRange, deriveCompareRange } from '@/lib/ga4/client'
import { emptyCitedUrls, windowTooLong, type IsoWindow } from '@/lib/aeo/cited-urls'
import { getPeecCitedUrls } from '@/lib/peec/cited-urls'
import { getProfoundCitedUrls } from '@/lib/profound/cited-urls'
import { fetchCompareMode, type AeoCompare } from '../v2/compare'
import { CitedSourcesTable } from '../v2/cited-sources-table'
import { ReportErrorBoundary } from '@/components/report-sections/error-boundary'

const TITLE = 'Cited Sources'
const CARD = 'rounded-xl border border-white/[0.06] bg-bg-surface p-6'

/** The picked window and (unless compare is off) the one the deltas compare against. */
export function citedSourcesWindows(
  dateRange: string | undefined,
  compare: AeoCompare,
): { current: IsoWindow; prior: IsoWindow | null; tooLong: boolean } {
  const range = dateRange ?? 'last_30_days'
  const current = parseDateRange(range)
  const prior = compare === 'none' ? null : deriveCompareRange(range, fetchCompareMode(compare))
  return { current, prior, tooLong: windowTooLong(current) || (prior !== null && windowTooLong(prior)) }
}

export async function CitedSourcesSection({
  provider,
  clientSlug,
  dateRange,
  compare,
  showDeltas,
  modelActive,
}: {
  provider: AeoProvider
  clientSlug: string | undefined
  dateRange: string | undefined
  compare: AeoCompare
  showDeltas: boolean
  modelActive: boolean
}) {
  if (!clientSlug) return null
  const { current, prior, tooLong } = citedSourcesWindows(dateRange, compare)
  const data = tooLong
    ? emptyCitedUrls(provider, { tooLong: true })
    : provider === 'profound'
      ? await getProfoundCitedUrls(clientSlug, current, prior)
      : await getPeecCitedUrls(clientSlug, current, prior)
  return <CitedSourcesTable data={data} showDeltas={showDeltas} modelActive={modelActive} />
}

export const citedSourcesV1: PartImpl<PeecCtx> = {
  id: 'cited-sources',
  version: 1,
  published: true,
  defaultLabel: TITLE,
  render: (ctx) => (
    <div className={CARD}>
      <Suspense
        fallback={
          // "Still loading" to the PDF export's readiness check (lib/export/readiness.ts).
          <div className="space-y-2" data-export-pending="">
            <div className="h-4 w-full animate-pulse rounded bg-white/[0.06]" />
            <div className="h-4 w-[92%] animate-pulse rounded bg-white/[0.06]" />
            <div className="h-4 w-[84%] animate-pulse rounded bg-white/[0.06]" />
          </div>
        }
      >
        {/* A failure blanks only this card; the rest of the Overview still renders. */}
        <ReportErrorBoundary sectionName={TITLE}>
          <CitedSourcesSection
            provider={ctx.provider}
            clientSlug={ctx.clientSlug}
            dateRange={ctx.dateRange}
            compare={ctx.compare}
            showDeltas={ctx.showDeltas}
            modelActive={ctx.modelActive}
          />
        </ReportErrorBoundary>
      </Suspense>
    </div>
  ),
}
