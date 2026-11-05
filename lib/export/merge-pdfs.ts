// Spec 2026-10-14-bulk-pdf-export-design B3: the exported pages become one file in the browser, so the combined PDF
// never passes through the route's response limit. copyPages keeps each page as printed, links included.
import { PDFDocument } from 'pdf-lib'

/** Every page of every part, in the order the parts are given. Rejects if a part is not a PDF. */
export async function mergePdfs(parts: readonly ArrayBuffer[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create()
  for (const part of parts) {
    const doc = await PDFDocument.load(part)
    for (const page of await merged.copyPages(doc, doc.getPageIndices())) merged.addPage(page)
  }
  return merged.save()
}
