import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'

const css = readFileSync(join(__dirname, 'export-theme.css'), 'utf8')

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

// Final review of PR 2: a live scroll box printed in the PDF cut its last row and hid the rest; one-line ellipses hid the
// full text, whose title= hover is lost on paper.
test('marked scroll boxes print in full and truncated text wraps in tables and marked lists', () => {
  expect(css).toContain('.export-theme [data-export-scroll] { max-height: none; overflow: visible; }')
  expect(css).toContain('.export-theme [data-export-wrap] .truncate { white-space: normal; overflow: visible; text-overflow: clip; max-width: none; }')
})

// Spec 2026-10-13 §3: the PDF prints dark like the live page, so nothing re-colours for white paper; the layout rules stay.
test('the theme re-colours nothing: no text, surface, border, inline-colour or chart-panel overrides', () => {
  expect(css).not.toMatch(/--color-white|background:\s*#fff|\.bg-bg-surface|\.text-text-muted|\.border-white|\[style[\^*$]=|data-export-chart|data-export-bars|color:\s*#(111|15803d|b91c1c)/i)
})

test('the layout rules, fonts and hiding stay', () => {
  for (const rule of ['.export-theme [data-export-block]', '.export-theme [data-export-keep-with-next]', '.export-theme [data-export-row] { break-inside: avoid; }',
    '.export-theme [data-export-table] thead { break-inside: avoid; }', '.export-theme [data-export-scroll]', '.export-theme [data-export-wrap] .truncate',
    '.export-theme [data-export-hide]', '.export-theme .no-print', "--font-sans: 'Nunito Sans', 'Noto Sans Math', 'Noto Color Emoji', sans-serif;"]) {
    expect(css).toContain(rule)
  }
})
