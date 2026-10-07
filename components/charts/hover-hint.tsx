import { useId } from 'react'

/** The "?" badge beside a tile title or a section heading, with its text in a hover box. One component for both
 *  (KpiCard renders it), so a fix lands once. Pure CSS: it works on every route, the two Organic Social deep links
 *  included, which have no TooltipProvider (a Radix tooltip there throws). Tailwind 4 compiles `hover:` inside
 *  `@media (hover: hover)`, so the badge also takes focus and focus reveals the text: a tap on a phone or iPad focuses
 *  it, and a keyboard reaches it. All spans, so it is valid inside a heading. `data-export-hide` lets the PDF export
 *  drop it (the attribute does nothing outside the export theme). The text box is not laid out until it opens (an
 *  invisible box still took layout space and pushed a phone page wider) and is never wider than the screen. The badge
 *  is described by the box (aria-describedby, role="tooltip"): a directly referenced node counts toward the accessible
 *  description even while hidden, so a screen reader announces the definition, not just "?". */
export function HoverHint({ text }: { text: string }) {
  // useId is available to Server Components (react-server build) as well as client ones, and KpiCard renders in both.
  const id = useId()
  return (
    <span className="group relative inline-flex flex-shrink-0 align-middle" data-export-hide="">
      <span
        tabIndex={0}
        aria-describedby={id}
        className="flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold normal-case leading-none tracking-normal text-text-muted outline-none focus-visible:ring-1 focus-visible:ring-white/40"
      >
        ?
      </span>
      <span id={id} role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 w-56 -translate-x-1/2 rounded-md border border-white/[0.08] bg-bg-surface px-3 py-2 text-xs font-normal normal-case leading-relaxed tracking-normal text-text-muted hidden max-w-[calc(100vw-2rem)] shadow-xl group-hover:block group-focus-within:block">
        {text}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-white/[0.08]" />
      </span>
    </span>
  )
}
