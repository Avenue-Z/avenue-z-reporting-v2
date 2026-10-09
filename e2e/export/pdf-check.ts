// Reads a PDF's words with their page and position (poppler's `pdftotext -bbox-layout`), for the export
// acceptance checks in ./acceptance.ts. Local only: needs poppler (`brew install poppler`).
import { execFileSync } from 'node:child_process'

export interface Word { text: string; page: number; xMin: number; yMin: number; xMax: number; yMax: number }
export interface PdfText { pages: { width: number; height: number }[]; words: Word[] }

const num = (s: string, attr: string) => Number(new RegExp(`${attr}="([\\d.]+)"`).exec(s)?.[1] ?? NaN)
const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')

export function readPdf(file: string): PdfText {
  const xml = execFileSync('pdftotext', ['-bbox-layout', file, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
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

/** What a staff and a client export must print the same, page by page: the text in geometric reading order, not in
 *  pdftotext's extraction order, which differs between two renders of the same layout (a wrapped table header's lines
 *  interleave by height, not by cell). Words group into lines by height (within 2 pt: sub-pixel placement moves them
 *  0.07 pt), lines read top to bottom and words left to right, joined without spaces (letter-spaced titles split into
 *  words differently: "GROW T H" / "GROW TH"). Each page records where it starts, so a moved page break is a difference.
 *  The stamp's time is dropped: the two exports run a minute apart. */
export function printedContent(pdf: PdfText): string[] {
  return pdf.pages.map((_, i) => {
    const words = pdf.words.filter((w) => w.page === i + 1).sort((a, b) => a.yMin - b.yMin || a.xMin - b.xMin)
    const lines: Word[][] = []
    for (const w of words) {
      const line = lines.at(-1)
      if (line && w.yMin - line[0].yMin < 2) line.push(w)
      else lines.push([w])
    }
    const text = lines.map((l) => l.sort((a, b) => a.xMin - b.xMin).map((w) => w.text).join('')).join('\n')
      .replace(/(Exported.*?)\d{1,2}:\d{2}(AM|PM)/, '$1$2')
    return `${words[0]?.yMin.toFixed(0) ?? ''}|${text}`
  })
}
