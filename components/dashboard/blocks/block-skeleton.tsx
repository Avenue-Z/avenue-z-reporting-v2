/** Placeholder shown in a grid cell for an optimistically-added block until its
 *  server-rendered island arrives. Fills the cell; the grid sizes it. */
export function BlockSkeleton() {
  return (
    <div className="h-full min-h-[60px] animate-pulse rounded-lg border border-white/[0.06] bg-bg-surface" />
  )
}
