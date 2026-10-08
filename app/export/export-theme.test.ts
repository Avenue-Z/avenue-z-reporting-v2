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
  expect(css).toContain('.export-theme [data-export-table] td { white-space: normal; overflow-wrap: anywhere; }')
  expect(css).toContain('.export-theme [data-export-table-more] { break-before: avoid; }')
  // Without it Chromium prints the header row only on the first page (e2e/export/acceptance.mts, the long-table fixture).
  expect(css).toContain('.export-theme [data-export-table] thead { break-inside: avoid; }')
})
