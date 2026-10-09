import { expect, test } from 'vitest'
import { parseBbox, printedContent, printedDifference, type PdfText, type Word } from './pdf-check'

// A word at (x, y); width from its length, so neighbours on a line don't overlap.
const w = (text: string, x: number, y: number, page = 1): Word => ({ text, page, xMin: x, yMin: y, xMax: x + text.length * 5, yMax: y + 9 })
const pdf = (...words: Word[]): PdfText => ({ pages: [{ width: 792, height: 612 }, { width: 792, height: 612 }], words })
const same = (a: PdfText, b: PdfText) => printedDifference(a, b) === null

// A table whose wrapped header cells pdftotext reads in a different order on two renders of the same layout (seen on
// AEO Technical Audit, PDF export PR 4 acceptance): the cells' lines interleave by height, not by cell.
const stamp = (time: string, page = 1) => [w('Exported', 500, 40, page), w('Oct', 545, 40, page), w('9,', 565, 40, page), w('2026,', 580, 40, page), w(time, 610, 40, page), w('PM', 640, 40, page), w('EDT', 655, 40, page)]
const header = [w('URL', 40, 100), w('REDIRECTED', 300, 104), w('LOW-VALUE', 400, 100), w('ENDPOINT', 400, 110)]
const rows = [w('/robots.txt', 40, 130), w('206', 300, 130), w('/', 40, 145), w('186', 300, 145)]

test('two renders of the same layout compare equal, whatever order pdftotext reads them in', () => {
  expect(same(pdf(...stamp('12:12'), ...[...header].reverse(), ...rows), pdf(...stamp('12:12'), ...header, ...rows))).toBe(true)
})

test('a letter-spaced title split into words differently compares equal', () => {
  expect(same(pdf(w('TECHNI', 40, 60), w('CAL', 70, 60)), pdf(w('TECHNICAL', 40, 60)))).toBe(true)
})

test("sub-pixel jitter in a word's height keeps it on its line", () => {
  expect(same(pdf(w('A', 40, 60), w('B', 60, 60.07)), pdf(w('A', 40, 60.07), w('B', 60, 60)))).toBe(true)
})

// Thomas, #356 pdf-check.ts:67: the page start rounded to a whole point, so 60.46 vs 60.53 (the 0.07 pt jitter this check
// exists to absorb) read "60" vs "61". Starts now match within the line tolerance.
test('sub-pixel jitter in where a page starts is not a difference, even across a half point', () => {
  expect(same(pdf(w('Title', 40, 60.46, 2)), pdf(w('Title', 40, 60.53, 2)))).toBe(true)
})

test('the export time on page 1 is not compared; the rest of the stamp is', () => {
  expect(same(pdf(...stamp('12:12')), pdf(...stamp('12:13')))).toBe(true)
  expect(same(pdf(...stamp('12:12')), pdf(...stamp('12:12').map((s) => (s.text === 'Oct' ? { ...s, text: 'Nov' } : s))))).toBe(false)
})

// Thomas, #356 pdf-check.ts:66: the strip ran on every page, so a body line like "Exported at 3:15 PM" compared equal to
// "3:16 PM" on page 5. Only page 1's stamp is stripped.
test('a time on any later page is compared', () => {
  expect(same(pdf(...stamp('12:12', 2)), pdf(...stamp('12:13', 2)))).toBe(false)
})

test('a changed number is a difference, named by page and line', () => {
  const changed = rows.map((r) => (r.text === '206' ? { ...r, text: '207' } : r))
  expect(printedDifference(pdf(...header, ...rows), pdf(...header, ...changed))).toBe('page 1, line 4: "/robots.txt206" vs "/robots.txt207"')
})

test('an extra word is a difference', () => {
  expect(same(pdf(...header, ...rows, w('Draft', 40, 160)), pdf(...header, ...rows))).toBe(false)
})

test('two rows in a different order are a difference', () => {
  const swapped = rows.map((r) => ({ ...r, yMin: r.yMin === 130 ? 145 : 130 }))
  expect(same(pdf(...swapped), pdf(...rows))).toBe(false)
})

test('a page that starts lower is a difference, and the message says where', () => {
  expect(printedDifference(pdf(w('Title', 40, 60, 2)), pdf(w('Title', 40, 80, 2)))).toBe('page 2 starts at 60.0 vs 80.0 pt')
})

// Thomas, #356 pdf-check.ts:62: the grouping wasn't pinned; a 10 pt or 1000 pt tolerance, or anchoring on the line's last
// word, all passed. These fail on each.
test('a word that moved to the next line is a difference', () => {
  expect(same(pdf(w('A', 40, 60), w('B', 60, 60), w('C', 40, 72)), pdf(w('A', 40, 60), w('B', 60, 72), w('C', 40, 72)))).toBe(false)
})

test('words more than 2 pt apart in height are separate lines', () => {
  expect(printedContent(pdf(w('A', 40, 60), w('B', 60, 62.5)))[0].lines).toEqual(['A', 'B'])
})

test("a line is anchored on its first word, so heights can't chain: 0, 1.9 and 3.8 make two lines", () => {
  expect(printedContent(pdf(w('A', 40, 0), w('B', 60, 1.9), w('C', 80, 3.8)))[0].lines).toEqual(['AB', 'C'])
})

// Thomas, #356 (pre-existing): coordinates parsed with [\d.]+, so a negative one became NaN and outsideBox passed it.
test('a negative coordinate parses as a number', () => {
  const xml = '<doc><page width="792.000000" height="612.000000"><word xMin="-1.500000" yMin="10.000000" xMax="20.000000" yMax="19.000000">x</word></page></doc>'
  expect(parseBbox(xml).words[0]).toMatchObject({ xMin: -1.5, yMin: 10, page: 1 })
})

// pdftotext writes an apostrophe as &apos;; undecoded, every acceptance check for "Couldn't load…" silently never matched
// (found running the #352/#354 review fixes' acceptance).
test('an apostrophe and the other XML entities decode', () => {
  const xml = '<page width="792" height="612"><word xMin="1" yMin="1" xMax="2" yMax="2">Couldn&apos;t</word><word xMin="3" yMin="1" xMax="4" yMax="2">&lt;a&gt;&amp;&quot;&#39;</word></page>'
  expect(parseBbox(xml).words.map((w) => w.text)).toEqual(["Couldn't", '<a>&"\''])
})
