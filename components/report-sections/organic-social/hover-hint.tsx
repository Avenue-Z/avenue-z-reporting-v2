/** The "?" badge KpiCard draws beside a tile title (components/charts/kpi-card.tsx:48-58), for a section
 *  heading. Pure CSS hover, so it works on every route, the two deep links included, which have no
 *  TooltipProvider; a Radix tooltip there throws (react-context: "must be used within TooltipProvider"). */
export function HoverHint({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex flex-shrink-0 align-middle">
      <span className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold normal-case leading-none tracking-normal text-text-muted">
        ?
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 w-56 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-xs font-normal normal-case leading-relaxed tracking-normal text-text-muted opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
        {text}
      </span>
    </span>
  )
}
