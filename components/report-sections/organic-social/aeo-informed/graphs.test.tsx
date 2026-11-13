import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CHART_COLORS } from '@/lib/constants'
import { CHANNEL_COLOR } from '@/components/report-sections/organic-social/trends'
import type { GraphPoint } from '@/lib/organic-social/aeo-informed'
import { AeoGraphs, graphSpecs, formatGraphValue, chartRows } from './graphs'
import { NO_SOURCE_DATA } from './copy'

const pts = (graphId: GraphPoint['graphId'], values: (number | null)[], unit: GraphPoint['unit'] = 'citations'): GraphPoint[] =>
  values.map((value, i) => ({ graphId, series: 'Example', weekStart: `2026-10-${String(1 + 7 * i).padStart(2, '0')}`, weekEnd: `2026-10-${String(7 + 7 * i).padStart(2, '0')}`, value, unit, partial: i === values.length - 1 }))

describe('graphSpecs (spec section 3: each graph its own Avenue Z color, continuous with the rest of the dashboard)', () => {
  it('Instagram as the fourth graph: the outline\'s titles in order, four distinct colors read from the constants', () => {
    const s = graphSpecs('instagram')
    expect(s.map((g) => g.id)).toEqual(['used_as_source_all', 'citations_all', 'citations_linkedin', 'citations_instagram'])
    expect(s.map((g) => g.title)).toEqual([
      'Used as a source on Reddit, YouTube, Instagram, TikTok, and LinkedIn',
      'Citations on LinkedIn, TikTok, Reddit, YouTube, and Instagram',
      'Citations on LinkedIn',
      'Citations on Instagram',
    ])
    expect(s.map((g) => g.color)).toEqual(['var(--color-brand-green)', CHART_COLORS.blended, CHANNEL_COLOR.LinkedIn, CHANNEL_COLOR.Instagram])
    expect(new Set(s.map((g) => g.color)).size).toBe(4)
    expect(s.map((g) => g.unit)).toEqual(['percent', 'citations', 'citations', 'citations'])
  })
  it('TikTok as the fourth graph draws in TikTok\'s color, titled Citations on TikTok', () => {
    const s = graphSpecs('tiktok')
    expect(s[3]).toMatchObject({ id: 'citations_tiktok', title: 'Citations on TikTok', color: CHANNEL_COLOR.TikTok })
    expect(new Set(s.map((g) => g.color)).size).toBe(4)
  })
})

describe('values', () => {
  it('a percent graph shows whole percents; a citations graph whole numbers with separators', () => {
    expect(formatGraphValue('percent', 0.1234)).toBe('12%')
    expect(formatGraphValue('percent', 0.004)).toBe('0.4%')
    expect(formatGraphValue('citations', 1234)).toBe('1,234')
  })
  it('chart rows are one per week, labelled by the week\'s first day, with the partial week flagged', () => {
    expect(chartRows(pts('citations_linkedin', [3, null, 5]))).toEqual([
      { week: '2026-10-01', value: 3, partial: false },
      { week: '2026-10-08', value: null, partial: false },
      { week: '2026-10-15', value: 5, partial: true },
    ])
  })
})

describe('AeoGraphs', () => {
  const all = [
    ...pts('used_as_source_all', [0.1, 0.2], 'percent'), ...pts('citations_all', [4, 6]), ...pts('citations_linkedin', [1, 2]), ...pts('citations_instagram', [null, null]),
  ]
  it('shows the four titles, and the outline\'s "No source data" for a graph with no own source', () => {
    render(<AeoGraphs graphs={all} fourthGraph="instagram" />)
    for (const t of graphSpecs('instagram').map((g) => g.title)) expect(screen.getByRole('heading', { name: t })).toBeTruthy()
    expect(screen.getAllByText(NO_SOURCE_DATA)).toHaveLength(1)
  })
  it('a graph with no points at all is also "No source data"', () => {
    render(<AeoGraphs graphs={all.filter((p) => p.graphId !== 'citations_linkedin')} fourthGraph="instagram" />)
    expect(screen.getAllByText(NO_SOURCE_DATA)).toHaveLength(2)
  })
})
