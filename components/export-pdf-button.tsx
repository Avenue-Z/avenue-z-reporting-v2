'use client'

import { useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { Download } from 'lucide-react'

interface ExportPdfButtonProps {
  clientName: string
  pageTitle: string
  /** The served range, resolved server-side (lib/export-period.ts), e.g. "Sep 1 – Sep 30, 2026";
   *  null when it couldn't be read. */
  periodLabel: string | null
}

/**
 * Export is the browser's print-to-PDF. On `beforeprint` (the button or Cmd+P) it stamps the
 * export time and period onto the page, and sets document.title, which browsers use as the
 * default PDF filename, so a saved export says whose page it is and on what day.
 */
export function ExportPdfButton({ clientName, pageTitle, periodLabel }: ExportPdfButtonProps) {
  const stampRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    // Set synchronously in the event, not through React state: the print layout is taken
    // right after beforeprint, before a state update would commit.
    let savedTitle: string | null = null
    const before = () => {
      const now = new Date()
      if (stampRef.current) {
        const exported = `Exported ${format(now, 'MMM d, yyyy, h:mm a')}`
        stampRef.current.textContent = periodLabel ? `${exported} · Reporting period ${periodLabel}` : exported
      }
      // A second beforeprint without an afterprint must not save our own title as the original.
      savedTitle ??= document.title
      document.title = `${clientName} – ${pageTitle} – ${format(now, 'yyyy-MM-dd')}`
    }
    const after = () => {
      if (savedTitle !== null) document.title = savedTitle
      savedTitle = null
    }
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
      after()
    }
  }, [clientName, pageTitle, periodLabel])

  return (
    <>
      <p ref={stampRef} data-testid="export-stamp" className="hidden text-xs text-text-muted print:block" />
      <button
        onClick={() => window.print()}
        className="no-print inline-flex items-center gap-2 rounded-full bg-white text-black px-4 py-2 text-sm font-bold transition-opacity hover:opacity-80"
      >
        <Download className="h-4 w-4" />
        Export PDF
      </button>
    </>
  )
}
