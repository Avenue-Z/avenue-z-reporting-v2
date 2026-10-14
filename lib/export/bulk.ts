// Bulk export (spec 2026-10-14-bulk-pdf-export-design): the selected pages are exported one request at a time through
// the single-page route (B6), and the browser merges them (lib/export/merge-pdfs.ts). Pure: the request itself is
// passed in, so this runs the same in a test as in the Export PDF button.
import { carriesRange } from '@/lib/organic-social/section-range'
import { exportFilename } from './filename'
import type { ExportPage } from './pages'
import type { ExportRequest } from './request'

/** One page's request body, before the button adds the requester's timezone. */
export type PageRequest = Omit<ExportRequest, 'tz'>

/** The current page's raw ranges (the URL's), which the pages in the export take as the sidebar carries them (B5). */
export interface BulkRanges {
  clientSlug: string
  dateRange: string
  compareRange: string | null
  /** AEO's `?models=` filter, or null. */
  models: string | null
  /** The section the export is started from. */
  fromSection: string
  /** The client has locked Organic Social months (hasReportingMonths): the range doesn't cross into or out of it. */
  lockedMonths: boolean
}

export type PageResult = { ok: true; pdf: ArrayBuffer; filename: string } | { ok: false; error: string }

/** B5: the current page's ranges where the sidebar would carry them (carriesRange), else the page's default; the
 *  Executive Overview's fixed window (#354); only AEO takes `models`. */
export function bulkRequest(page: ExportPage, r: BulkRanges): PageRequest {
  const fixed = page.section === 'executive-overview' || !carriesRange(r.lockedMonths, r.fromSection === 'organic-social', page.section)
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

/**
 * Exports `pages` one at a time, in order (B6), calling `onProgress` before each. A page that fails is kept as
 * `{ ok: false }` and the run carries on (B7). A cancelled `signal` stops the run before the next page and returns
 * `cancelled` with the pages already finished (Thomas, #386), so the person can still download them; a page cancelled
 * mid-request is left out. Any other error rejects.
 */
export async function runBulkExport<P>(
  pages: readonly P[],
  exportOne: (page: P, signal?: AbortSignal) => Promise<PageResult>,
  { onProgress, signal }: { onProgress?: (index: number, page: P) => void; signal?: AbortSignal },
): Promise<{ results: { page: P; result: PageResult }[]; cancelled: boolean }> {
  const results: { page: P; result: PageResult }[] = []
  for (const [i, page] of pages.entries()) {
    if (signal?.aborted) return { results, cancelled: true }
    onProgress?.(i, page)
    try {
      results.push({ page, result: await exportOne(page, signal) })
    } catch (e) {
      if (signal?.aborted) return { results, cancelled: true }
      throw e
    }
  }
  return { results, cancelled: !!signal?.aborted }
}
