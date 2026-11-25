// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ViewMetrics } from '@/lib/technical-audit/kpis'

// The ⓘ is hover-only on the page; render its text so the source path can be read.
vi.mock('@/components/ui/info-tooltip', () => ({ InfoTooltip: ({ text }: { text: string }) => <span data-testid="info">{text}</span> }))

import { gaugeBand, HealthTiles } from './health-tiles'

afterEach(cleanup)

const EMPTY: ViewMetrics = {
  sfIssueTypesIssue: null, sfIssueTypesWarning: null, sfIssueTypesOpportunity: null, sfUrlsIssue: null, sfUrlsWarning: null,
  sfUrlsOpportunity: null, ahrefsHealthScore: null, gscIndexed: null, gscNotIndexed: null, cwvMobilePoor: null, cwvMobileNi: null,
  cwvMobileGood: null, cwvDesktopPoor: null, cwvDesktopNi: null, cwvDesktopGood: null,
}
const REASONS = { sf: 'Issues Overview not in this crawl’s export', ahrefs: 'Ahrefs API returned 403' }

describe('HealthTiles', () => {
  test('gauge bands: red below 50, amber 50 to 79, green from 80', () => {
    expect(gaugeBand(49)).toBe('red')
    expect(gaugeBand(50)).toBe('amber')
    expect(gaugeBand(79)).toBe('amber')
    expect(gaugeBand(80)).toBe('green')
  })

  test('each tile’s ⓘ starts with its source path', () => {
    render(<HealthTiles metrics={EMPTY} prevMetrics={null} previousDate={null} viewer="client" reasons={{}} />)
    const infos = screen.getAllByTestId('info').map((e) => e.textContent ?? '')
    const paths = [
      'Ahrefs Site Audit > Overview > Health Score',
      'Screaming Frog > Issues tab',
      'GSC > Indexing > Pages',
      'GSC > Experience > Core Web Vitals',
    ]
    expect(infos).toHaveLength(4)
    paths.forEach((p, i) => expect(infos[i].startsWith(p)).toBe(true))
  })

  test('an empty Ahrefs or SF tile shows the run’s reason to the team, not to a client', () => {
    render(<HealthTiles metrics={EMPTY} prevMetrics={null} previousDate={null} viewer="team" reasons={REASONS} />)
    expect(screen.getAllByText('No data for this snapshot')).toHaveLength(2)
    expect(screen.getByText(REASONS.ahrefs)).toBeTruthy()
    expect(screen.getByText(REASONS.sf)).toBeTruthy()
    cleanup()
    render(<HealthTiles metrics={EMPTY} prevMetrics={null} previousDate={null} viewer="client" reasons={REASONS} />)
    expect(screen.getAllByText('No data for this snapshot')).toHaveLength(2)
    expect(screen.queryByText(REASONS.ahrefs)).toBeNull()
    expect(screen.queryByText(REASONS.sf)).toBeNull()
  })
})
