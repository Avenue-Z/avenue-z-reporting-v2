import { expect, test } from 'vitest'
import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ExportModeProvider } from '@/components/export/export-mode'
import type { ProfoundSentiment } from '@/lib/profound/sentiment'
import { TopEditorialDomainsTable } from './pr-influence-tables'
import { WinnersLosersCards } from './winners-losers-cards'
import { SentimentInsights } from './sentiment-insights'

// Final review of PR 2: a live scroll box (max-h + overflow-y-auto) printed in the PDF cuts its last visible row at the
// box edge and silently drops the rest (spec 2026-10-08 §2 "nothing cut off", §5 "scroll containers become visible").
const inExport = (ui: ReactElement) => render(<TooltipProvider><ExportModeProvider>{ui}</ExportModeProvider></TooltipProvider>)
// A scroll box must be marked for the export theme, which lifts its height cap (app/export/export-theme.css; jsdom applies no
// CSS, so the theme rule itself is pinned in export-theme.test.ts).
const unmarkedScrollBox = (c: HTMLElement) => [...c.querySelectorAll('.overflow-y-auto, [class*="max-h-"]')].find((el) => !el.hasAttribute('data-export-scroll'))

test('Top Editorial Domains prints every row, with no scroll box around its table', () => {
  const rows = Array.from({ length: 15 }, (_, i) => ({ domain: `site${i + 1}.com`, citationCount: 15 - i, citationCountDelta: null, promptCoverage: null, avgCitations: null, hasPR: false }))
  const { container } = inExport(<TopEditorialDomainsTable rows={rows} />)
  expect(unmarkedScrollBox(container)).toBeUndefined()
  expect(container.querySelector('[data-export-scroll] [data-export-table]')).not.toBeNull()
  expect(container.querySelectorAll('tbody tr')).toHaveLength(15)
})

test('Winners and Losers print every prompt, whole, each row unbreakable, with the full prompt text able to wrap', () => {
  const rows = Array.from({ length: 20 }, (_, i) => ({ text: `A long prompt number ${i + 1} that would be truncated on the live card`, rank: i + 1, delta: 3 }))
  const { container } = inExport(<WinnersLosersCards winners={rows} losers={rows} />)
  expect(unmarkedScrollBox(container)).toBeUndefined()
  expect(container.querySelectorAll('[data-export-row]')).toHaveLength(40)
  expect(container.querySelector('[data-export-wrap]')).not.toBeNull()
  expect(container.textContent).toContain('A long prompt number 20')
})

test('sentiment themes print as plain rows, each unbreakable, with no buttons and no "Click a theme" hint', () => {
  const themes = Array.from({ length: 16 }, (_, i) => ({ title: `Theme ${i + 1}`, count: 16 - i, urls: [] as string[] }))
  const data: ProfoundSentiment = { occurrences: 40, positivePct: 70, positivePctDelta: null, positiveThemes: themes, negativeThemes: themes.slice(0, 4) }
  const { container } = inExport(<SentimentInsights data={data} />)
  expect(screen.queryAllByRole('button')).toHaveLength(0)
  expect(container.textContent).not.toMatch(/Click a theme/)
  expect(container.querySelectorAll('[data-export-row]')).toHaveLength(20)
})

test('outside the export the scroll boxes, buttons and hints are unchanged', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ text: `Prompt ${i}`, rank: i + 1, delta: 1 }))
  const live = render(<TooltipProvider><WinnersLosersCards winners={rows} losers={rows} /></TooltipProvider>).container
  expect(live.querySelector('.max-h-\\[400px\\].overflow-y-auto')).not.toBeNull()
})
