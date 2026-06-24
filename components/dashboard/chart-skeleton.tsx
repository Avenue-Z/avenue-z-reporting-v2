/** Full-height shimmer used as the Suspense fallback for chart bodies (Bar + Line).
 *  Lives inside <BlockChrome>'s card so the block's name + chrome paint instantly. */
export function ChartSkeleton({ kind }: { kind: 'bar' | 'line' }) {
  return (
    <div
      className="h-full w-full min-h-[180px] animate-pulse rounded-lg border border-white/[0.06] bg-white/[0.04]"
      aria-busy="true"
      aria-label={`Loading ${kind} chart`}
    />
  )
}
