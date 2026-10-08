import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

const css = readFileSync(join(__dirname, 'export-theme.css'), 'utf8')

// Paul, #334 round 4: KPI Check-In's cards are dark chart panels in the PDF. Their date pill's outline
// (border-white/[0.08]) is remapped to black 10% for white paper (the Borders block), which vanishes on the dark panel; this
// rule keeps the live outline there. jsdom cannot compute it, so the rule itself is pinned.
test('inside a dark chart panel, an 8% white border keeps its live colour', () => {
  expect(css).toContain('.export-theme [data-export-chart] .border-white\\/\\[0\\.08\\] { border-color: rgb(255 255 255 / 0.08); }')
})

// PDF export PR 2 (AEO): long tables split only between rows; nothing scrolls sideways off the page.
test('table rows never split, cells wrap, and the "Showing" line stays with its table', () => {
  expect(css).toContain('.export-theme [data-export-row] { break-inside: avoid; }')
  expect(css).toContain('.export-theme [data-export-table] td { white-space: normal; overflow-wrap: break-word; }')
  expect(css).toContain('.export-theme [data-export-table-more] { break-before: avoid; }')
  // Without it Chromium prints the header row only on the first page (e2e/export/acceptance.mts, the long-table fixture).
  expect(css).toContain('.export-theme [data-export-table] thead { break-inside: avoid; }')
})

// PDF export PR 2: Technical Audit's font-mono text resolved to Menlo, a system font the server's Chromium lacks; the
// export's monospace is a web font the page loads, like its sans fallbacks (#339).
test('monospace text uses a web font the export page loads, never a system font', () => {
  expect(css).toContain("--font-mono: 'Noto Sans Mono', 'Noto Sans Math', 'Noto Color Emoji', monospace;")
})

// PDF export PR 2: AEO card titles carry a description; without this the title ended a page and its description began
// the next (e2e/export/acceptance.mts, the kept title block fixture).
test('a kept title block never splits inside', () => {
  expect(css).toMatch(/\[data-export-keep-with-next\] \{\s*break-after: avoid;[^}]*break-inside: avoid;/)
})

// PDF export PR 2: AEO's bright text colours (green and red deltas, the client's own cyan row, yellow badges) are unreadable
// on white paper; they are darkened outside dark chart panels, for classes and for inline styles as the server renders them.
test('bright brand text colours are darkened on paper, and only off the dark chart panels', () => {
  expect(css).toContain('.export-theme :not([data-export-chart] *).text-\\[\\#60FF80\\] { color: #15803d; }')
  // An inline style beats any stylesheet rule that isn't !important (found on Technical Audit's stat values).
  expect(css).toContain(':not([data-export-chart] *)[style*="color:#60FF80" i]:not([style*="background-color:#60FF80" i]) { color: #15803d !important; }')
  expect(css).toContain('.export-theme :not([data-export-chart] *).text-\\[\\#60FDFF\\] { color: #0e7490; }')
})
