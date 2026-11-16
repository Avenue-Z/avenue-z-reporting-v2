// Measures downloaded export PDFs against the acceptance run's own page checks, for PDFs the run can't produce itself (a
// Vercel preview, where the server's Chromium differs from local Chrome). Usage: npx tsx e2e/export/measure.mts <pdf>...
// Local only: needs poppler. Exits 1 if any PDF fails.
import { lightCorners, readPdf } from './pdf-check'

let failed = 0
for (const file of process.argv.slice(2)) {
  const pdf = readPdf(file)
  const letter = pdf.pages.every((p) => Math.round(p.width) === 792 && Math.round(p.height) === 612)
  const light = lightCorners(file)
  const stamp = pdf.words.find((w) => w.page === 1 && w.text === 'Exported')
  const stampEnd = stamp ? Math.max(...pdf.words.filter((w) => w.page === 1 && Math.abs(w.yMin - stamp.yMin) < 2).map((w) => w.xMax)) : 0
  const ok = letter && light.length === 0 && stampEnd > 757
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${file.split('/').pop()}: ${pdf.pages.length} pages, ${letter ? 'all Letter landscape' : 'NOT all Letter landscape'}, ` +
    `${light.length ? `light corners on pages ${light.join(', ')}` : 'every page dark to its edges'}, stamp ends at ${stampEnd.toFixed(1)} pt (full width > 757)`)
}
process.exit(failed ? 1 : 0)
