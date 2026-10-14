// Bulk export (spec 2026-10-14-bulk-pdf-export-design): the selected pages are exported one request at a time through
// the single-page route (B6), and the browser merges them (lib/export/merge-pdfs.ts). Pure: the request itself is
// passed in, so this runs the same in a test as in the Export PDF button.
import { exportFilename } from './filename'
import type { ExportPage } from './pages'
import type { ExportRequest } from './request'

/** One page's request body, before the button adds the requester's timezone. */
export type PageRequest = Omit<ExportRequest, 'tz'>

/** The current page's raw ranges (the URL's), which every page in the export takes (B5). */
export interface BulkRanges {
  clientSlug: string
  dateRange: string
  compareRange: string | null
  /** AEO's `?models=` filter, or null. */
  models: string | null
}

export type PageResult = { ok: true; pdf: ArrayBuffer; filename: string } | { ok: false; error: string }

/** B5: the current page's ranges, except the Executive Overview's fixed window (#354); only AEO takes `models`. */
export function bulkRequest(page: ExportPage, r: BulkRanges): PageRequest {
  const fixed = page.section === 'executive-overview'
  return {
    clientSlug: r.clientSlug,
    section: page.section,
    subsection: page.subsection,
    dateRange: fixed ? 'last_30_days' : r.dateRange,
    compareRange: fixed ? null : r.compareRange,
    models: page.section === 'peec-ai' ? r.models : null,
  }
}

/** B4: `Renaissance – Report (3 pages) – 2026-10-14.pdf`, dated in the requester's timezone. */
export function bulkFilename(clientName: string, pages: number, now: Date, tz: string): string {
  return exportFilename(clientName, `Report (${pages} pages)`, now, tz)
}

const aborted = () => new DOMException('The export was cancelled.', 'AbortError')

/**
 * Exports `pages` one at a time, in order (B6), calling `onProgress` before each. A page that fails is kept as
 * `{ ok: false }` and the run carries on (B7). A cancelled `signal` stops the run before the next page and rejects
 * with an AbortError, so nothing is downloaded.
 */
export async function runBulkExport<P>(
  pages: readonly P[],
  exportOne: (page: P, signal?: AbortSignal) => Promise<PageResult>,
  { onProgress, signal }: { onProgress?: (index: number, page: P) => void; signal?: AbortSignal },
): Promise<{ page: P; result: PageResult }[]> {
  const results: { page: P; result: PageResult }[] = []
  for (const [i, page] of pages.entries()) {
    if (signal?.aborted) throw aborted()
    onProgress?.(i, page)
    const result = await exportOne(page, signal)
    results.push({ page, result })
  }
  if (signal?.aborted) throw aborted()
  return results
}
