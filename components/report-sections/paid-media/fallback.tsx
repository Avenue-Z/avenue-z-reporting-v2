// A Paid Media part that failed or timed out (Paid Search, Meta and LinkedIn). In the PDF export the date-range advice is
// hidden: a reader of the PDF can't change the range.
export function PaidMediaFallback({ kind }: { kind: 'timeout' | 'error' }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface p-6 text-sm text-text-muted">
      {kind === 'timeout'
        ? <>Taking longer than usual<span data-export-hide=""> — try a shorter date range</span>.</>
        : "Couldn't load this section."}
    </div>
  )
}
