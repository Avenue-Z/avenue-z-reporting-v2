import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock the rollup lib so its real module (which imports the per-channel fetchers
// → lib/db → next-auth) never loads under jsdom.
vi.mock('@/lib/paid-media/overview', () => ({ getPaidMediaOverview: vi.fn() }))
// Mock the trend lib for the same reason (it imports the channel bases → next-auth).
vi.mock('@/lib/paid-media/trend', () => ({ getPaidMediaTrend: vi.fn() }))
// Mock the trend CHART component so Recharts doesn't load.
vi.mock('./trend', () => ({ PaidMediaTrendChart: () => <div data-testid="trend" /> }))

import { PaidMediaOverviewReport } from './index'
import { getPaidMediaOverview } from '@/lib/paid-media/overview'
import { getPaidMediaTrend } from '@/lib/paid-media/trend'
import type { Mock } from 'vitest'

const mock = getPaidMediaOverview as Mock
;(getPaidMediaTrend as Mock).mockResolvedValue({ channels: [], points: [] })

describe('PaidMediaOverviewReport', () => {
  test('top line is Spend + Clicks only (no blended Leads/CPL); per-channel Leads shown, Meta blank', async () => {
    mock.mockResolvedValue({
      channels: [
        { key: 'paid-search', label: 'Paid Search', configured: true, spend: 1000, clicks: 200, leads: 12, ok: true, spendDelta: 25, clicksDelta: 10, leadsDelta: 5 },
        { key: 'meta', label: 'Meta Advertising', configured: true, spend: 500, clicks: 80, leads: null, ok: true, spendDelta: -8, clicksDelta: 4 },
        { key: 'linkedin', label: 'LinkedIn Advertising', configured: true, spend: null, clicks: null, leads: null, ok: false },
      ],
      blendedSpend: null, // a configured channel (LinkedIn) failed → blend blanks
      blendedClicks: null,
      blendedSpendDelta: undefined,
      blendedClicksDelta: undefined,
    })

    const ui = await PaidMediaOverviewReport({ clientSlug: 'acme', dateRange: 'last_30_days' })
    render(ui)

    // Per-channel breakdown shows the channels that reported, in cents.
    expect(screen.getByText('$1,000.00')).toBeInTheDocument()
    expect(screen.getByText('$500.00')).toBeInTheDocument()

    // Per-channel Leads column: Paid Search reports its leads; Meta shows '—'
    // (lead data gap), not 0.
    expect(screen.getByText('12')).toBeInTheDocument()

    // The caption states the blend covers every channel the client runs.
    expect(screen.getByText(/cover every paid channel this client runs/i)).toBeInTheDocument()

    // Blended Leads / Cost per Lead were scrapped — no such tile on the top line.
    expect(screen.queryByText('Cost per Lead')).not.toBeInTheDocument()

    // Blended Spend + Clicks tiles blank (a configured channel failed), Meta's leads cell
    // blank, and the whole LinkedIn row blank → several '—' placeholders.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(5)

    // "Leads" still appears — but only as a per-channel breakdown card title now.
    expect(screen.getAllByText('Leads').length).toBeGreaterThanOrEqual(1)

    // By-channel is per-channel card sections, not a table.
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    // Each channel renders as a heading section.
    expect(screen.getByRole('heading', { name: 'Paid Search' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Meta Advertising' })).toBeInTheDocument()
    // The trend chart is mounted between the tiles and the by-channel sections.
    expect(screen.getByTestId('trend')).toBeInTheDocument()

    // Per-channel delta renders (Paid Search Spend +25%).
    expect(screen.getByText(/25\.0% vs prior period/i)).toBeInTheDocument()
    // A blended tile with an undefined delta shows the greyed placeholder.
    expect(screen.getAllByText(/^— vs prior period$/i).length).toBeGreaterThanOrEqual(1)
  })
})
