import { expect, test } from 'vitest'
import { printedContent, type PdfText, type Word } from './pdf-check'

// A word at (x, y) on page 1; width from its length, so neighbours on a line don't overlap.
const w = (text: string, x: number, y: number, page = 1): Word => ({ text, page, xMin: x, yMin: y, xMax: x + text.length * 5, yMax: y + 9 })
const pdf = (...words: Word[]): PdfText => ({ pages: [{ width: 792, height: 612 }, { width: 792, height: 612 }], words })

// A table whose wrapped header cells pdftotext reads in a different order on two renders of the same layout (seen on
// AEO Technical Audit, PDF export PR 4 acceptance): the cells' lines interleave by height, not by cell.
const stamp = (time: string) => [w('Exported', 500, 40), w('Oct', 545, 40), w('9,', 565, 40), w('2026,', 580, 40), w(time, 610, 40), w('PM', 640, 40), w('EDT', 655, 40)]
const header = [w('URL', 40, 100), w('REDIRECTED', 300, 104), w('LOW-VALUE', 400, 100), w('ENDPOINT', 400, 110)]
const rows = [w('/robots.txt', 40, 130), w('206', 300, 130), w('/', 40, 145), w('186', 300, 145)]

test('two renders of the same layout compare equal, whatever order pdftotext reads them in', () => {
  const a = pdf(...stamp('12:12'), ...header, ...rows)
  const b = pdf(...stamp('12:12'), ...[...header].reverse(), ...rows)
  expect(printedContent(b)).toEqual(printedContent(a))
})

test('a letter-spaced title split into words differently compares equal', () => {
  expect(printedContent(pdf(w('TECHNI', 40, 60), w('CAL', 70, 60)))).toEqual(printedContent(pdf(w('TECHNICAL', 40, 60))))
})

test('sub-pixel jitter in a word\'s height keeps it on its line', () => {
  expect(printedContent(pdf(w('A', 40, 60), w('B', 60, 60.07)))).toEqual(printedContent(pdf(w('A', 40, 60.07), w('B', 60, 60))))
})

test('the export time is not compared; the rest of the stamp is', () => {
  expect(printedContent(pdf(...stamp('12:12')))).toEqual(printedContent(pdf(...stamp('12:13'))))
  expect(printedContent(pdf(...stamp('12:12')))).not.toEqual(printedContent(pdf(...stamp('12:12').map((s) => s.text === 'Oct' ? { ...s, text: 'Nov' } : s))))
})

test('a changed number is a difference', () => {
  const changed = rows.map((r) => (r.text === '206' ? { ...r, text: '207' } : r))
  expect(printedContent(pdf(...header, ...changed))).not.toEqual(printedContent(pdf(...header, ...rows)))
})

test('an extra word is a difference', () => {
  expect(printedContent(pdf(...header, ...rows, w('Draft', 40, 160)))).not.toEqual(printedContent(pdf(...header, ...rows)))
})

test('two rows in a different order are a difference', () => {
  const swapped = rows.map((r) => ({ ...r, yMin: r.yMin === 130 ? 145 : 130 }))
  expect(printedContent(pdf(...swapped))).not.toEqual(printedContent(pdf(...rows)))
})

test('a page that starts lower is a difference', () => {
  expect(printedContent(pdf(w('Title', 40, 60, 2)))).not.toEqual(printedContent(pdf(w('Title', 40, 80, 2))))
})
