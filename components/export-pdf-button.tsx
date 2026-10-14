'use client'

import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import { Download } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { bulkFilename, bulkRequest, runBulkExport, type BulkRanges, type PageResult } from '@/lib/export/bulk'
import type { ExportPage } from '@/lib/export/pages'
import type { ServerExportSection } from '@/lib/export/sections'

/** The view a server export renders (app/api/export/pdf). Never a role or a client identity: the route takes
 *  those from the session. */
export interface ServerExport {
  clientSlug: string
  section: ServerExportSection
  subsection: string | null
  dateRange: string
  compareRange: string | null
  /** AEO's `?models=` filter, or null. */
  models: string | null
}

interface ExportPdfButtonProps {
  clientName: string
  pageTitle: string
  /** The served range, resolved server-side (lib/export-period.ts), e.g. "Sep 1 – Sep 30, 2026";
   *  null when it couldn't be read. */
  periodLabel: string | null
  /** Set on sections switched on for the server export (lib/export/sections.ts): the PDF is rendered on the server from the export page (spec
   *  2026-10-06-organic-social-pdf-export-v2) instead of the browser printing this page. */
  serverExport?: ServerExport
  /** The client's exportable pages (lib/export/pages.ts) and this page's ranges: Export PDF opens a picker and the
   *  selected pages download as one PDF (spec 2026-10-14-bulk-pdf-export-design). With no pages, it is ignored. */
  bulk?: BulkExport
}

export interface BulkExport extends BulkRanges {
  pages: ExportPage[]
  /** This page's key, pre-selected; null on a page the server doesn't export. */
  currentKey: string | null
}

const ERRORS: Record<string, string> = {
  'still-loading': 'This report is still loading. Try again in a moment.',
  forbidden: "You don't have access to export this page.",
  'too-large': 'This page is too large to export as one PDF.',
}
const FAILED = "The PDF couldn't be created. Try again."
const COMBINE_FAILED = "The PDF couldn't be combined. Try again."
const NOT_EXPORTED = 'Not exported: the export was cancelled.'
/** Just past the route's own 60 s ceiling: a slow render still wins, a connection that died silently gives up. */
const REQUEST_TIMEOUT_MS = 70_000

/** The name the server gave the file: the UTF-8 `filename*`, else the ASCII `filename`. */
function filenameFrom(disposition: string | null): string {
  const star = disposition?.match(/filename\*=UTF-8''([^;]+)/i)
  // A malformed escape must not turn a finished PDF into a reported failure: fall back to the ASCII name.
  if (star) { try { return decodeURIComponent(star[1]) } catch { /* the ASCII name below */ } }
  return disposition?.match(/filename="([^"]+)"/i)?.[1] ?? 'export.pdf'
}

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/** One page's PDF from the route, or why not. Throws only when `signal` cancels it. */
async function requestPdf(view: ServerExport, signal?: AbortSignal): Promise<PageResult> {
  const abort = new AbortController()
  const cancel = () => abort.abort()
  signal?.addEventListener('abort', cancel)
  const giveUp = setTimeout(cancel, REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch('/api/export/pdf', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...view, tz: timeZone() }),
      signal: abort.signal,
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: string } | null
      return { ok: false, error: ERRORS[body?.error ?? ''] ?? FAILED }
    }
    return { ok: true, pdf: await res.arrayBuffer(), filename: filenameFrom(res.headers.get('content-disposition')) }
  } catch (e) {
    if (signal?.aborted) throw e
    return { ok: false, error: FAILED }
  } finally {
    clearTimeout(giveUp)
    signal?.removeEventListener('abort', cancel)
  }
}

function download(pdf: ArrayBuffer | Uint8Array, filename: string) {
  const url = URL.createObjectURL(new Blob([pdf as BlobPart], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  // Attached for the click: some browsers (older Firefox) do not download from a detached link.
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoked later, not at once: some browsers start the download after click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * Export is the browser's print-to-PDF. On `beforeprint` (the button or Cmd+P) it stamps the
 * export time and period onto the page, and sets document.title, which browsers use as the
 * default PDF filename, so a saved export says whose page it is and on what day. With
 * `serverExport` the button asks the server for the PDF instead and downloads it.
 */
export function ExportPdfButton({ clientName, pageTitle, periodLabel, serverExport, bulk }: ExportPdfButtonProps) {
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
      const result = await requestPdf(view)
      if (result.ok) download(result.pdf, result.filename)
      else setError(result.error)
    } catch {
      setError(FAILED)
    } finally {
      setPending(false)
    }
  }

  const stamp = <p ref={stampRef} data-testid="export-stamp" className="hidden text-xs text-text-muted print:block" />
  const label = (busy: boolean) => (
    <>
      <Download className="h-4 w-4" />
      {busy ? 'Preparing PDF…' : 'Export PDF'}
    </>
  )
  const buttonClass = 'no-print inline-flex items-center gap-2 rounded-full bg-white text-black px-4 py-2 text-sm font-bold transition-opacity hover:opacity-80 disabled:cursor-wait disabled:opacity-60'

  // A page missing from the list (staff on a report the client hides from its portal) keeps its single-page export.
  if (bulk && bulk.pages.length > 0 && (bulk.currentKey === null || bulk.pages.some((p) => p.key === bulk.currentKey))) {
    return (
      <>
        {stamp}
        <BulkPicker clientName={clientName} bulk={bulk} trigger={(busy) => <button className={buttonClass}>{label(busy)}</button>} />
      </>
    )
  }

  return (
    <>
      {stamp}
      <button
        onClick={() => (serverExport ? exportOnServer(serverExport) : window.print())}
        disabled={pending}
        className={buttonClass}
      >
        {label(pending)}
      </button>
      {error && <span role="alert" className="no-print text-xs text-red-400">{error}</span>}
    </>
  )
}

/** "Paid Media – Overview"; a one-page report is just its name. */
const pageName = (p: ExportPage) => (p.label === p.reportTitle ? p.label : `${p.reportTitle} – ${p.label}`)

function Check({ label, name, checked, indeterminate = false, disabled, onChange, pageKey }: {
  label: string; name?: string; checked: boolean; indeterminate?: boolean; disabled: boolean; onChange: () => void; pageKey?: string
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-sm text-white hover:bg-white/[0.04]">
      <input
        type="checkbox"
        // A DOM-only property: part of a group is selected.
        ref={(el) => { if (el) el.indeterminate = indeterminate && !checked }}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        data-page-key={pageKey}
        aria-label={name}
        className="h-4 w-4 shrink-0 cursor-pointer accent-brand-cyan"
      />
      {label}
    </label>
  )
}

/**
 * The bulk export picker (spec 2026-10-14-bulk-pdf-export-design B1-B8): the client's pages grouped by report, the
 * current page pre-selected. The selected pages are exported one request at a time, in list order, and download as one
 * PDF; a single page downloads exactly as the single-page export does. Failures are listed for a retry or a partial
 * download; Cancel aborts the request in flight.
 */
function BulkPicker({ clientName, bulk, trigger }: { clientName: string; bulk: BulkExport; trigger: (busy: boolean) => React.ReactNode }) {
  const initial = () => new Set(bulk.currentKey ? [bulk.currentKey] : [])
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(initial)
  // Exporting, then combining: the whole run, during which nothing else can start and Cancel is the way out.
  const [progress, setProgress] = useState<string | null>(null)
  // Per page, for the selection last exported. Failed ones are offered for a retry; cleared once downloaded.
  const [results, setResults] = useState<Map<string, PageResult> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // The ranges the run started with: a retry keeps them even if the page has moved on since.
  const rangesRef = useRef<BulkRanges>(bulk)
  const running = progress !== null

  // Leaving the page cancels an export in flight.
  useEffect(() => () => abortRef.current?.abort(), [])

  const chosen = bulk.pages.filter((p) => selected.has(p.key))
  // After a run that didn't download: why each page of the selection has no PDF (failed, or never exported because
  // the run was cancelled), or null for the pages that exported.
  const reason = (p: ExportPage) => {
    if (!results) return null
    const r = results.get(p.key)
    return !r ? NOT_EXPORTED : r.ok ? null : r.error
  }
  const failed = chosen.filter((p) => reason(p) !== null)
  const groups = bulk.pages.reduce<{ title: string; pages: ExportPage[] }[]>((acc, p) => {
    const last = acc[acc.length - 1]
    if (last?.title === p.reportTitle) last.pages.push(p)
    else acc.push({ title: p.reportTitle, pages: [p] })
    return acc
  }, [])

  function onOpenChange(next: boolean) {
    if (running) return // Cancel is the way out of a running export.
    if (next) {
      setSelected(initial())
      setResults(null)
      setError(null)
    }
    setOpen(next)
  }

  const toggle = (keys: string[], on: boolean) => {
    setSelected((cur) => {
      const s = new Set(cur)
      for (const k of keys) { if (on) s.add(k); else s.delete(k) }
      return s
    })
    setResults(null)
    setError(null)
  }

  /**
   * Exports `pages` (all of the selection, or the pages without a PDF again on a retry, merged into `prior`), then
   * downloads the pages that exported, in list order, if all did or `downloadNow`: one as the server named it, several
   * combined. Cancel stops either step and nothing downloads; the pages already exported stay, offered as after a failure.
   */
  async function run(pages: ExportPage[], prior: Map<string, PageResult>, downloadNow = false) {
    const abort = new AbortController()
    abortRef.current = abort
    if (prior.size === 0) rangesRef.current = bulk
    const ranges = rangesRef.current
    setError(null)
    let done = prior
    try {
      if (pages.length > 0) {
        const { results: out, cancelled } = await runBulkExport(pages, (p, signal) => requestPdf(bulkRequest(p, ranges), signal), {
          signal: abort.signal,
          onProgress: (i, p) => setProgress(`Exporting ${i + 1} of ${pages.length}: ${pageName(p)}`),
        })
        done = new Map(prior)
        for (const { page, result } of out) done.set(page.key, result)
        if (cancelled) {
          setResults(done.size > 0 ? done : null)
          return
        }
      }
      setResults(done)
      if (!downloadNow && chosen.some((p) => !done.get(p.key)?.ok)) return
      const parts = chosen.flatMap((p) => { const r = done.get(p.key); return r?.ok ? [r] : [] })
      if (parts.length === 1) {
        download(parts[0].pdf, parts[0].filename)
      } else {
        setProgress(`Combining ${parts.length} pages…`)
        let merged: Uint8Array
        try {
          const { mergePdfs } = await import('@/lib/export/merge-pdfs')
          merged = await mergePdfs(parts.map((r) => r.pdf))
        } catch {
          setResults(null)
          setError(COMBINE_FAILED)
          return
        }
        if (abort.signal.aborted) return
        download(merged, bulkFilename(clientName, parts.length, new Date(), timeZone()))
      }
      // Downloaded: the parts aren't needed any more.
      setResults(null)
      setOpen(false)
    } catch {
      // requestPdf throws only on a cancel, which runBulkExport returns as `cancelled`; anything else here (the
      // download, a bug) must not end the run silently (Thomas, #386).
      setResults(done.size > 0 ? done : null)
      if (!abort.signal.aborted) setError(FAILED)
    } finally {
      setProgress(null)
      if (abortRef.current === abort) abortRef.current = null
    }
  }

  const all = chosen.length === bulk.pages.length
  const okCount = chosen.length - failed.length

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger(running)}</PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="no-print w-72 border-white/[0.08] bg-bg-surface p-2 text-white shadow-xl">
        <p className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase tracking-widest text-text-muted">Pages to export</p>
        <div className="max-h-[60vh] space-y-px overflow-y-auto">
          <Check
            label="All pages"
            checked={all}
            indeterminate={chosen.length > 0}
            disabled={running}
            onChange={() => toggle(bulk.pages.map((p) => p.key), !all)}
          />
          {groups.map((g) => {
            if (g.pages.length === 1) {
              const p = g.pages[0]
              return <Check key={p.key} label={g.title} pageKey={p.key} checked={selected.has(p.key)} disabled={running} onChange={() => toggle([p.key], !selected.has(p.key))} />
            }
            const keys = g.pages.map((p) => p.key)
            const on = keys.filter((k) => selected.has(k)).length
            return (
              <div key={g.title} role="group" aria-label={g.title}>
                <Check label={g.title} checked={on === keys.length} indeterminate={on > 0} disabled={running} onChange={() => toggle(keys, on !== keys.length)} />
                <div className="ml-4">
                  {g.pages.map((p) => (
                    <Check key={p.key} label={p.label} name={pageName(p)} pageKey={p.key} checked={selected.has(p.key)} disabled={running} onChange={() => toggle([p.key], !selected.has(p.key))} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-2 space-y-2 border-t border-white/[0.06] px-2 pt-2">
          {/* Mounted while the popover is open, so a screen reader announces the first message too. */}
          <div className="flex items-center justify-between gap-2" aria-live="polite">
            {running && (
              <>
                <p className="text-xs text-text-muted">{progress}</p>
                <button type="button" onClick={() => abortRef.current?.abort()} className="text-xs font-semibold text-white underline-offset-2 hover:underline">
                  Cancel
                </button>
              </>
            )}
          </div>
          {!running && error && <p role="alert" className="text-xs text-red-400">{error}</p>}
          {running ? null : failed.length > 0 ? (
            <>
              <ul role="alert" className="space-y-1 text-xs text-red-400">
                {failed.map((p) => <li key={p.key}>{pageName(p)}: {reason(p)}</li>)}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => run(failed, results!)} className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-black hover:opacity-80">
                  Try again
                </button>
                {okCount > 0 && (
                  <button type="button" onClick={() => run([], results!, true)} className="rounded-full border border-white/[0.16] px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/[0.06]">
                    Download the {okCount} that worked
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={chosen.length === 0}
                onClick={() => run(chosen, new Map())}
                className="w-full rounded-full bg-white px-4 py-2 text-sm font-bold text-black transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Export {chosen.length} {chosen.length === 1 ? 'page' : 'pages'}
              </button>
            </>
          )}
          {bulk.currentKey === null && !running && (
            <button type="button" onClick={() => { setOpen(false); window.print() }} className="w-full text-center text-xs text-text-muted underline-offset-2 hover:text-white hover:underline">
              Print this page
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
