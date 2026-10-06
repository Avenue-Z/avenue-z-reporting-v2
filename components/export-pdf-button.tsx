'use client'

import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { Download } from 'lucide-react'

/** The view a server export renders (Organic Social, app/api/export/pdf). Never a role or a client
 *  identity: the route takes those from the session. */
export interface ServerExport {
  clientSlug: string
  subsection: string | null
  dateRange: string
  compareRange: string | null
}

interface ExportPdfButtonProps {
  clientName: string
  pageTitle: string
  /** The served range, resolved server-side (lib/export-period.ts), e.g. "Sep 1 – Sep 30, 2026";
   *  null when it couldn't be read. */
  periodLabel: string | null
  /** Set on Organic Social: the PDF is rendered on the server from the export page (spec
   *  2026-10-06-organic-social-pdf-export-v2) instead of the browser printing this page. */
  serverExport?: ServerExport
}

const ERRORS: Record<string, string> = {
  'still-loading': 'This report is still loading. Try again in a moment.',
  forbidden: "You don't have access to export this page.",
}
const FAILED = "The PDF couldn't be created. Try again."

/** The name the server gave the file: the UTF-8 `filename*`, else the ASCII `filename`. */
function filenameFrom(disposition: string | null): string {
  const star = disposition?.match(/filename\*=UTF-8''([^;]+)/i)
  if (star) return decodeURIComponent(star[1])
  return disposition?.match(/filename="([^"]+)"/i)?.[1] ?? 'export.pdf'
}

/**
 * Export is the browser's print-to-PDF. On `beforeprint` (the button or Cmd+P) it stamps the
 * export time and period onto the page, and sets document.title, which browsers use as the
 * default PDF filename, so a saved export says whose page it is and on what day. With
 * `serverExport` the button asks the server for the PDF instead and downloads it.
 */
export function ExportPdfButton({ clientName, pageTitle, periodLabel, serverExport }: ExportPdfButtonProps) {
  const stampRef = useRef<HTMLParagraphElement>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  async function exportOnServer(view: ServerExport) {
    setPending(true)
    setError(null)
    try {
      const res = await fetch('/api/export/pdf', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...view, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        setError(ERRORS[body?.error ?? ''] ?? FAILED)
        return
      }
      const url = URL.createObjectURL(await res.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = filenameFrom(res.headers.get('content-disposition'))
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError(FAILED)
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <p ref={stampRef} data-testid="export-stamp" className="hidden text-xs text-text-muted print:block" />
      <button
        onClick={() => (serverExport ? exportOnServer(serverExport) : window.print())}
        disabled={pending}
        className="no-print inline-flex items-center gap-2 rounded-full bg-white text-black px-4 py-2 text-sm font-bold transition-opacity hover:opacity-80 disabled:cursor-wait disabled:opacity-60"
      >
        <Download className="h-4 w-4" />
        {pending ? 'Preparing PDF…' : 'Export PDF'}
      </button>
      {error && <span role="alert" className="no-print text-xs text-red-400">{error}</span>}
    </>
  )
}
