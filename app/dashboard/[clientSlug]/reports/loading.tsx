import { SectionSkeleton } from './section-skeleton'

/**
 * Route-level loading UI. Shown while navigating *into* the reports segment
 * (a pathname change — e.g. from the client list or switching clients), where
 * the page's keyed Suspense fallback doesn't apply. Renders inside the
 * dashboard layout, so the sidebar stays put.
 */
export default function Loading() {
  return (
    <>
      {/* Header placeholder — mirrors the sticky report header's height so the
          content doesn't jump when the real page streams in. */}
      <div className="mb-8 h-10 w-64 animate-pulse rounded-lg bg-bg-surface" />
      <SectionSkeleton />
    </>
  )
}
