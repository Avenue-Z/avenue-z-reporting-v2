import { expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ExportModeProvider } from '@/components/export/export-mode'
import type { ProfoundSentiment } from '@/lib/profound/sentiment'
import { SentimentInsights } from './sentiment-insights'
import { SentimentSkeleton } from './sentiment-insights-section'
import { SynopsisSkeleton } from './synopsis-skeleton'

const THEMES = Array.from({ length: 12 }, (_, i) => ({ title: `Theme ${i + 1}`, count: 12 - i, urls: [] as string[] }))
const DATA: ProfoundSentiment = { occurrences: 40, positivePct: 70, positivePctDelta: null, positiveThemes: THEMES, negativeThemes: THEMES.slice(0, 3) }

// Spec 2026-10-08 §6 and PR 2 plan deviation 2: every collapsed theme prints, with no scroll area to cut a row.
test('sentiment prints every collapsed theme with no scroll cap, each column a block, the header kept with them', () => {
  const { container } = render(<TooltipProvider><ExportModeProvider><SentimentInsights data={DATA} /></ExportModeProvider></TooltipProvider>)
  expect(container.querySelector('header[data-export-keep-with-next]')).not.toBeNull()
  expect(container.querySelectorAll('[data-export-block]').length).toBeGreaterThanOrEqual(2)
  expect(container.querySelector('.max-h-\\[400px\\]')).toBeNull()
  expect(container.textContent).toContain('Theme 12')
})

test('the sentiment and synopsis skeletons say "still loading" to the export', () => {
  expect(render(<SentimentSkeleton />).container.querySelector('[data-export-pending]')).not.toBeNull()
  expect(render(<SynopsisSkeleton />).container.querySelector('[data-export-pending]')).not.toBeNull()
})

test('outside the export the theme list keeps its scroll cap', () => {
  const { container } = render(<TooltipProvider><SentimentInsights data={DATA} /></TooltipProvider>)
  expect(container.querySelector('.max-h-\\[400px\\]')).not.toBeNull()
})
