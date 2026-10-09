"use client"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useExportMode } from "@/components/export/export-mode"

export function InfoTooltip({ text, className }: { text: string; className?: string }) {
  // A hover-only hint does nothing in the PDF export (spec 2026-10-08-pdf-export-all-reports-design §5).
  if (useExportMode()) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex h-3.5 w-3.5 cursor-default items-center justify-center rounded-full border border-white/20 text-[9px] font-bold leading-none text-text-muted flex-shrink-0${className ? ` ${className}` : ""}`}
        >
          ?
        </span>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  )
}
