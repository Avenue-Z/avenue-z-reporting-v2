/**
 * Demand Overview report.
 *
 * Parent is a thin shell that renders the page title + four async sections,
 * each wrapped in its own <Suspense>. Each section fetches the data it needs
 * independently — `cached()` from lib/cache.ts dedupes per-render so shared
 * fetches (Peec, GA4 main) aren't multi-hit.
 *
 * The split lets faster sections (GA4-only) appear immediately while slower
 * sections (HubSpot-backed) stream in. Replaces the previous monolithic
 * version where a single Suspense boundary made the whole report wait for
 * the slowest fetch (HubSpot pipeline deals).
 */
import { Suspense } from 'react'
import { DemandJourneySection }      from './demand-journey-section'
import { ContentFunnelSection }      from './content-funnel-section'
import { ContentMatrixSection }      from './content-matrix-section'
import { CitationBreakdownSection }  from './citation-breakdown-section'
import {
  DemandJourneySkeleton,
  ContentFunnelSkeleton,
  ContentMatrixSkeleton,
  CitationBreakdownSkeleton,
} from './_skeletons'

interface DemandOverviewProps {
  clientSlug: string
}

export function DemandOverviewReport({ clientSlug }: DemandOverviewProps) {
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-bold uppercase tracking-widest text-text-muted">
          Avenue Z
        </p>
        <h1 className="text-4xl font-extrabold uppercase text-white">
          Demand{' '}
          <span className="gradient-text-reputation">Overview</span>
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          AEO · Web Analytics · Inbound · Pipeline — rolled up in one view.
        </p>
      </div>

      <Suspense fallback={<DemandJourneySkeleton />}>
        <DemandJourneySection clientSlug={clientSlug} />
      </Suspense>

      {/* Content Impact section */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
          Content Impact
        </p>
        <h2 className="text-2xl font-extrabold text-white">From AI Mention to Qualified Contact</h2>
        <p className="mt-1 text-sm text-text-muted">
          How content drives AI visibility, organic traffic, and inbound pipeline.
        </p>
      </div>

      <Suspense fallback={<ContentFunnelSkeleton />}>
        <ContentFunnelSection clientSlug={clientSlug} />
      </Suspense>

      <Suspense fallback={<ContentMatrixSkeleton />}>
        <ContentMatrixSection clientSlug={clientSlug} />
      </Suspense>

      <Suspense fallback={<CitationBreakdownSkeleton />}>
        <CitationBreakdownSection clientSlug={clientSlug} />
      </Suspense>
    </div>
  )
}
