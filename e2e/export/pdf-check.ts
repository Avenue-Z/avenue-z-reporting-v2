// Reads a PDF's words with their page and position (poppler's `pdftotext -bbox-layout`), for the export
// acceptance checks in ./acceptance.ts. Local only: needs poppler (`brew install poppler`).
import { execFileSync } from 'node:child_process'

export interface Word { text: string; page: number; xMin: number; yMin: number; xMax: number; yMax: number }
export interface PdfText { pages: { width: number; height: number }[]; words: Word[] }

// Signed: a word set past the page's top or left edge has a negative coordinate, which must not parse as NaN.
const num = (s: string, attr: string) => Number(new RegExp(`${attr}="(-?[\\d.]+)"`).exec(s)?.[1] ?? NaN)
const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')

export function readPdf(file: string): PdfText {
  return parseBbox(execFileSync('pdftotext', ['-bbox-layout', file, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))
}

/** pdftotext's -bbox-layout XML as pages and positioned words. */
export function parseBbox(xml: string): PdfText {
  const pages: PdfText['pages'] = []
  const words: Word[] = []
  for (const [i, page] of xml.split(/<page /).slice(1).entries()) {
    pages.push({ width: num(page, 'width'), height: num(page, 'height') })
    for (const m of page.matchAll(/<word ([^>]*)>([^<]*)<\/word>/g)) {
      words.push({ text: unescape(m[2]), page: i + 1, xMin: num(m[1], 'xMin'), yMin: num(m[1], 'yMin'), xMax: num(m[1], 'xMax'), yMax: num(m[1], 'yMax') })
    }
  }
  return { pages, words }
}

/** Every page a word equal to `token` appears on. */
export function pagesOf(pdf: PdfText, token: string): number[] {
  return [...new Set(pdf.words.filter((w) => w.text === token).map((w) => w.page))]
}

/** Words outside the content box: the page less `margin` points on every side (0.4in = 28.8pt). The 2pt
 *  tolerance is glyph overhang: poppler's word boxes include the font's side bearing, so text set flush at
 *  the margin reads x=27.7 (measured 2026-10-06). Content that really overflows is off by far more. */
export function outsideBox(pdf: PdfText, margin = 28.8, tolerance = 2): Word[] {
  return pdf.words.filter((w) => {
    const p = pdf.pages[w.page - 1]
    return w.xMin < margin - tolerance || w.yMin < margin - tolerance || w.xMax > p.width - margin + tolerance || w.yMax > p.height - margin + tolerance
  })
}

/** Link annotations in the file (each is a `/URI` action). */
export function countLinks(bytes: Buffer): number {
  return (bytes.toString('latin1').match(/\/URI\s*\(/g) ?? []).length
}

/** The font families embedded in a PDF (poppler's `pdffonts`), without the subset prefix ("ABCDEF+"). */
export function fontsOf(file: string): string[] {
  const out = execFileSync('pdffonts', [file], { encoding: 'utf8' })
  return [...new Set(out.split('\n').slice(2).map((l) => l.split(/\s+/)[0]?.replace(/^[A-Z]{6}\+/, '')).filter(Boolean))]
}

/** Lines group words whose tops are within this of the line's first word: sub-pixel placement moves a word about 0.07 pt
 *  between two renders, and real lines are 9 pt or more apart. Page starts match within it too. */
const LINE_TOLERANCE = 2

/** One page of what an export prints: where its first line starts, and its lines. */
export interface PrintedPage { start: number | null; lines: string[] }

/** What a staff and a client export must print the same, page by page: the text in geometric reading order, not in
 *  pdftotext's extraction order, which differs between two renders of the same layout (a wrapped table header's lines
 *  interleave by height, not by cell). Words group into lines by height, lines read top to bottom and words left to
 *  right, joined without spaces (letter-spaced titles split into words differently: "GROW T H" / "GROW TH"). Page 1's
 *  stamp loses its time: the two exports run a minute apart. */
export function printedContent(pdf: PdfText): PrintedPage[] {
  return pdf.pages.map((_, i) => {
    const words = pdf.words.filter((w) => w.page === i + 1).sort((a, b) => a.yMin - b.yMin || a.xMin - b.xMin)
    const lines: Word[][] = []
    for (const w of words) {
      const line = lines.at(-1)
      if (line && w.yMin - line[0].yMin < LINE_TOLERANCE) line.push(w)
      else lines.push([w])
    }
    const text = lines.map((l) => l.sort((a, b) => a.xMin - b.xMin).map((w) => w.text).join(''))
    return { start: words[0]?.yMin ?? null, lines: i === 0 ? text.map((t) => t.replace(/(Exported.*?)\d{1,2}:\d{2}(AM|PM)/, '$1$2')) : text }
  })
}

/** null when two exports print the same; otherwise where they first differ, for the failure message. */
export function printedDifference(a: PdfText, b: PdfText): string | null {
  const [pa, pb] = [printedContent(a), printedContent(b)]
  if (pa.length !== pb.length) return `${pa.length} pages vs ${pb.length}`
  const shown = (line: string | undefined) => (line === undefined ? '(no line)' : JSON.stringify(line.length > 120 ? `${line.slice(0, 117)}...` : line))
  for (const [i, x] of pa.entries()) {
    const y = pb[i]
    if ((x.start === null) !== (y.start === null) || (x.start !== null && y.start !== null && Math.abs(x.start - y.start) >= LINE_TOLERANCE)) {
      return `page ${i + 1} starts at ${x.start?.toFixed(1) ?? '(empty)'} vs ${y.start?.toFixed(1) ?? '(empty)'} pt`
    }
    for (let j = 0; j < Math.max(x.lines.length, y.lines.length); j++) {
      if (x.lines[j] !== y.lines[j]) return `page ${i + 1}, line ${j + 1}: ${shown(x.lines[j])} vs ${shown(y.lines[j])}`
    }
  }
  return null
}
