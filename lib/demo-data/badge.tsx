/**
 * Subtle "sample data" badge rendered above any section showing demo
 * data instead of a client's real data. Visible enough that a careful
 * viewer notices, but small enough not to dominate a screenshot.
 */
export function SampleDataBadge({ note }: { note?: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-text-muted">
      <span className="h-1.5 w-1.5 rounded-full bg-[#FFD060]" />
      Sample data
      {note && <span className="font-normal lowercase tracking-normal text-text-muted/80">· {note}</span>}
    </div>
  )
}
