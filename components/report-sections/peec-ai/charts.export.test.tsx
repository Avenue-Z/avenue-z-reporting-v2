import { expect, test, vi } from 'vitest'
import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'

// Records each Line, Bar and Scatter's props, then renders the real one (recorders keep the real displayName so
// Recharts finds them by type), and gives ResponsiveContainer a size jsdom can't measure.
const { seen } = vi.hoisted(() => ({ seen: [] as { kind: string; props: Record<string, unknown> }[] }))
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  const { cloneElement } = await import('react')
  const rec = (kind: 'Line' | 'Bar' | 'Scatter') => Object.assign(
    (p: Record<string, unknown>) => { seen.push({ kind, props: p }); const C = actual[kind] as unknown as (q: Record<string, unknown>) => ReactElement; return <C {...p} /> },
    { displayName: actual[kind].displayName },
  )
  return {
    ...actual, Line: rec('Line'), Bar: rec('Bar'), Scatter: rec('Scatter'),
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) => cloneElement(children, { width: 800, height: 400 }),
  }
})

import { TooltipProvider } from '@/components/ui/tooltip'
import { ExportModeProvider } from '@/components/export/export-mode'
import { VisibilityChart } from './visibility-chart'
import SlopeChart from './slope-chart'
import BotVsHumanScatter from './bot-vs-human-scatter'
import { PromptClusterOpportunityMatrix } from './pr-influence-tables'

const inExport = (ui: ReactElement) => render(<TooltipProvider><ExportModeProvider>{ui}</ExportModeProvider></TooltipProvider>)
const DAYS = Array.from({ length: 21 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, visibility: 10 + i }))
const SLOPE = {
  aiReferralByPath: new Map<string, [number, number]>([['/a', [10, 30]], ['/b', [40, 12]]]),
  organicByPath: new Map<string, [number, number]>(),
  citationShareByUrlKey: new Map<string, { prior: number; current: number; url: string }>(),
}
const SCATTER = { points: [{ path: '/a', bots: 5, humans: 9, quadrant: 'high-bot-high-human' as const }, { path: '/b', bots: 1, humans: 2, quadrant: 'low-bot-low-human' as const }], medianBot: 3, medianHuman: 5 }
const CLUSTERS = [{ cluster: 'Pricing', count: 4, editorialCitationDensity: 12.5, brandCitationRate: 0, brandMentionRate: 0, competitorPresence: 0, opportunityScore: 1 }]

test('the visibility chart is one dark block at its default granularity, with its toggle buttons hidden', () => {
  const { container } = inExport(<VisibilityChart data={DAYS} competitorData={[]} brandName="Brand" />)
  const card = container.firstElementChild!
  expect(card.hasAttribute('data-export-block') && card.hasAttribute('data-export-chart')).toBe(true)
  expect(container.querySelector('[data-export-hide]')?.querySelectorAll('button')).toHaveLength(4)
  expect(container.textContent).toContain('Brand · weekly')
})

test('the slope chart prints its default metric as a label, not buttons, and its lines draw complete', () => {
  seen.length = 0
  inExport(<SlopeChart input={SLOPE} compareActive />)
  expect(screen.queryAllByRole('button')).toHaveLength(0)
  expect(screen.getByText('AI Referral Traffic')).toBeTruthy()
  const lines = seen.filter((s) => s.kind === 'Line')
  expect(lines.length).toBeGreaterThan(0)
  expect(lines.every((s) => s.props.isAnimationActive === false)).toBe(true)
})

test('the scatter and the prompt-cluster bars draw complete; the cluster card is one dark block', () => {
  seen.length = 0
  inExport(<BotVsHumanScatter data={SCATTER} clientDomain="example.com" />)
  const { container } = inExport(<PromptClusterOpportunityMatrix rows={CLUSTERS} />)
  expect(seen.some((s) => s.kind === 'Scatter') && seen.some((s) => s.kind === 'Bar')).toBe(true)
  expect(seen.filter((s) => s.kind === 'Scatter' || s.kind === 'Bar').every((s) => s.props.isAnimationActive === false)).toBe(true)
  const card = container.firstElementChild!
  expect(card.hasAttribute('data-export-block') && card.hasAttribute('data-export-chart')).toBe(true)
})

test('outside the export the slope chart keeps its toggle buttons and animates', () => {
  seen.length = 0
  render(<TooltipProvider><SlopeChart input={SLOPE} compareActive /></TooltipProvider>)
  expect(screen.getAllByRole('button')).toHaveLength(3)
  expect(seen.filter((s) => s.kind === 'Line').every((s) => !('isAnimationActive' in s.props))).toBe(true)
})
