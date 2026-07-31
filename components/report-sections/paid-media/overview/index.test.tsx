import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock the rollup lib so its real module (which imports the per-channel fetchers
// → lib/db → next-auth) never loads under jsdom.
vi.mock('@/lib/paid-media/overview', () => ({ getPaidMediaOverview: vi.fn() }))

import { PaidMediaOverviewReport } from './index'
import { getPaidMediaOverview } from '@/lib/paid-media/overview'
import type { Mock } from 'vitest'

const mock = getPaidMediaOverview as Mock

describe('PaidMediaOverviewReport', () => {
  test('missing channel blanks the blended totals; breakdown still shows present channels; Leads/CPL pending', async () => {
    mock.mockResolvedValue({
      channels: [
        { key: 'paid-search', label: 'Paid Search', spend: 1000, clicks: 200, ok: true },
        { key: 'meta', label: 'Meta Advertising', spend: 500, clicks: 80, ok: true },
        { key: 'linkedin', label: 'LinkedIn Advertising', spend: null, clicks: null, ok: false },
      ],
      blendedSpend: null,
      blendedClicks: null,
      leads: null,
      costPerLead: null,
    })

    const ui = await PaidMediaOverviewReport({ clientSlug: 'acme', dateRange: 'last_30_days' })
    render(ui)

    // Per-channel breakdown shows the two channels that reported, in cents.
    expect(screen.getByText('$1,000.00')).toBeInTheDocument()
    expect(screen.getByText('$500.00')).toBeInTheDocument()

    // Leads / Cost per lead carry a pending-HubSpot note (Blocker 1).
    expect(screen.getByText(/pending .*hubspot lead attribution/i)).toBeInTheDocument()

    // Blended Spend + Clicks are unavailable (missing channel), Leads + CPL null,
    // and the LinkedIn breakdown row is blank → several '—' placeholders.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4)
  })
})
