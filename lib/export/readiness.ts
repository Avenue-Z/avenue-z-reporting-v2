/** Whether the export page has finished loading, so the PDF can be taken. Pure over the DOM so it
 *  is testable; the export page's ExportReadyReporter (components/export/export-mode.tsx) calls it.
 *  - a loading placeholder (any Suspense fallback carries `data-export-pending`) means a part is
 *    still waiting on its data;
 *  - an unfinished `<img>` would print blank;
 *  - a Recharts container with no surface has not measured its width and drawn yet. */
export function isDocumentReady(doc: Document): boolean {
  if (doc.querySelector('[data-export-pending]')) return false
  for (const img of Array.from(doc.images)) if (!img.complete) return false
  for (const rc of Array.from(doc.querySelectorAll('.recharts-responsive-container'))) {
    if (!rc.querySelector('.recharts-surface')) return false
  }
  return true
}
