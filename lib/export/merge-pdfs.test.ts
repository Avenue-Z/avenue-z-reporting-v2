import { expect, test } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { mergePdfs } from './merge-pdfs'

/** A PDF whose pages are sized [w, h], so a merged page shows which part and page it came from. */
async function pdf(sizes: [number, number][]): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create()
  for (const size of sizes) doc.addPage(size)
  const bytes = await doc.save()
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

// Spec 2026-10-14 B3: one file, every page of every part, in the order the parts are given.
test('the parts merge into one PDF, every page in order', async () => {
  const parts = [await pdf([[100, 101], [100, 102]]), await pdf([[200, 201]]), await pdf([[300, 301], [300, 302], [300, 303]])]
  const merged = await PDFDocument.load(await mergePdfs(parts))
  expect(merged.getPages().map((p) => [p.getWidth(), p.getHeight()])).toEqual([
    [100, 101], [100, 102], [200, 201], [300, 301], [300, 302], [300, 303],
  ])
})

test('a part that is not a PDF rejects', async () => {
  await expect(mergePdfs([await pdf([[100, 100]]), new TextEncoder().encode('not a pdf').buffer as ArrayBuffer])).rejects.toThrow()
})
