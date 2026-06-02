/**
 * Peec AI (Answer Engine Optimization) report.
 *
 * Parent is a thin shell that renders two async sections, each wrapped
 * in its own <Suspense>. Each section fetches its own data — cached()
 * dedupes within a render so even if both sections reference the same
 * upstream (they don't here), it's a single fetch.
 *
 * Replaces the previous monolithic version where a single
 * `await Promise.allSettled([getPeecOverview, getProfoundOverview])`
 * at the top of the component meant Peec data had to wait for Profound
 * (or vice versa) before anything rendered.
 *
 * With the split: Peec section appears as soon as Peec resolves.
 * Profound section appears independently — and stays visibly empty
 * (rather than blocking the whole page) when a client has no
 * profoundCategoryId configured.
 */
import { Suspense } from 'react'
import { PeecSection } from './peec-section'
import { ProfoundSection } from './profound-section'
import { PeecSectionSkeleton, ProfoundSectionSkeleton } from './_skeletons'

interface Props {
  clientSlug?: string
}

export function PeecAIReport({ clientSlug }: Props = {}) {
  return (
    <div className="space-y-8">
      <Suspense fallback={<PeecSectionSkeleton />}>
        <PeecSection clientSlug={clientSlug} />
      </Suspense>

      <Suspense fallback={<ProfoundSectionSkeleton />}>
        <ProfoundSection clientSlug={clientSlug} />
      </Suspense>
    </div>
  )
}
