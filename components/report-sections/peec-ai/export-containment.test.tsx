import { expect, test } from 'vitest'
import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ExportModeProvider } from '@/components/export/export-mode'
import type { ProfoundSentiment } from '@/lib/profound/sentiment'
import { TopEditorialDomainsTable } from './pr-influence-tables'
import { WinnersLosersCards } from './winners-losers-cards'
import { SentimentInsights } from './sentiment-insights'
import { TimeToFirstCards } from './content-impact'

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

// Thomas, #350 sentiment-insights.tsx:222: the footer still told the reader to open a theme, and talked about the linked
// pages it shows; on paper themes don't open and the page lists never print.
test("the sentiment footer doesn't ask the reader to open a theme or describe the lists that don't print", () => {
  const themes = [{ title: 'Theme', count: 3, urls: ['https://a.example/x'] }]
  const data: ProfoundSentiment = { occurrences: 3, positivePct: 70, positivePctDelta: null, positiveThemes: themes, negativeThemes: [] }
  const { container } = inExport(<SentimentInsights data={data} />)
  expect(container.textContent).toContain('Everything here comes straight from Profound.')
  expect(container.textContent).not.toMatch(/Open a theme|links shown/)
})

// Thomas, #350 content-impact.tsx:1220: the Fastest and Slowest cards' URLs truncate with "…" (the full URL is a hover
// title), and the URL is the answer. In a wrap box, breaking anywhere, since a URL has no spaces to wrap at.
test('the Fastest and Slowest cards print their URLs in full, wrapping inside the card', () => {
  const url = 'https://example.com/blog/a-very-long-article-slug-that-would-be-truncated-on-the-live-card'
  const { container } = inExport(<TimeToFirstCards medFirstTraffic={3} medFirstAi={5} fastestAi={1} slowestAi={20} fastestAiUrl={url} slowestAiUrl={url} />)
  const links = [...container.querySelectorAll('a.truncate')]
  expect(links).toHaveLength(2)
  expect(links.every((a) => a.closest('[data-export-wrap]') && a.classList.contains('wrap-anywhere'))).toBe(true)
  expect((container.firstElementChild as HTMLElement).hasAttribute('data-export-block')).toBe(true)
})

test('outside the export the scroll boxes, buttons and hints are unchanged', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ text: `Prompt ${i}`, rank: i + 1, delta: 1 }))
  const live = render(<TooltipProvider><WinnersLosersCards winners={rows} losers={rows} /></TooltipProvider>).container
  expect(live.querySelector('.max-h-\\[400px\\].overflow-y-auto')).not.toBeNull()
})
