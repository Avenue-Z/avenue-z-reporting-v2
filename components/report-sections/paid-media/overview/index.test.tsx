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
  test('missing channel blanks the blended totals; per-channel Leads shown where available (Meta blank)', async () => {
    mock.mockResolvedValue({
      channels: [
        { key: 'paid-search', label: 'Paid Search', configured: true, spend: 1000, clicks: 200, leads: 12, ok: true },
        { key: 'meta', label: 'Meta Advertising', configured: true, spend: 500, clicks: 80, leads: null, ok: true },
        { key: 'linkedin', label: 'LinkedIn Advertising', configured: true, spend: null, clicks: null, leads: null, ok: false },
      ],
      blendedSpend: null,
      blendedClicks: null,
      blendedLeads: 20,
      blendedCostPerLead: 65,
    })

    const ui = await PaidMediaOverviewReport({ clientSlug: 'acme', dateRange: 'last_30_days' })
    render(ui)

    // Per-channel breakdown shows the channels that reported, in cents.
    expect(screen.getByText('$1,000.00')).toBeInTheDocument()
    expect(screen.getByText('$500.00')).toBeInTheDocument()

    // Per-channel Leads column: Paid Search reports its leads; Meta shows '—'
    // (lead data gap), not 0.
    expect(screen.getByText('12')).toBeInTheDocument()

    // Both captions render: the blended-availability rule (scoped to the channels
    // the client runs) and the caption text.
    expect(screen.getByText(/shown only when every channel this client runs reports/i)).toBeInTheDocument()

    // Blended Spend + Clicks tiles blank (missing channel), Meta's leads cell blank,
    // and the whole LinkedIn row blank → several '—' placeholders.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(5)

    // Top line now shows a Cost per Lead tile (unique text — the By-Channel table
    // has a "Leads" column header but no "Cost per Lead" one, so this is unambiguous).
    expect(screen.getByText('Cost per Lead')).toBeInTheDocument()
    // "Leads" appears as both a tile title and the breakdown column header → use getAllByText.
    expect(screen.getAllByText('Leads').length).toBeGreaterThanOrEqual(2)
    // The scoping caption is explicit about which channels are blended.
    expect(screen.getByText(/Paid Search and LinkedIn only/i)).toBeInTheDocument()

    // By-channel is now per-channel card sections, not a table.
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    // Each channel renders as a heading section.
    expect(screen.getByRole('heading', { name: 'Paid Search' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Meta Advertising' })).toBeInTheDocument()
    // The trend chart is mounted between the tiles and the by-channel sections.
    expect(screen.getByTestId('trend')).toBeInTheDocument()
  })

  test('blended Cost per Lead renders — when blendedCostPerLead is null', async () => {
    mock.mockResolvedValue({
      channels: [
        { key: 'paid-search', label: 'Paid Search', configured: true, spend: 1000, clicks: 200, leads: 0, ok: true },
        { key: 'meta', label: 'Meta Advertising', configured: true, spend: 500, clicks: 80, leads: null, ok: true },
        { key: 'linkedin', label: 'LinkedIn Advertising', configured: true, spend: 300, clicks: 40, leads: 0, ok: true },
      ],
      blendedSpend: 1800, blendedClicks: 320, blendedLeads: 0, blendedCostPerLead: null,
    })
    render(await PaidMediaOverviewReport({ clientSlug: 'acme', dateRange: 'last_30_days' }))
    expect(screen.getByText('Cost per Lead')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
  })
})
