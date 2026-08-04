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
  test('missing channel blanks the blended totals; per-channel Leads shown where available (Meta blank)', async () => {
    mock.mockResolvedValue({
      channels: [
        { key: 'paid-search', label: 'Paid Search', configured: true, spend: 1000, clicks: 200, leads: 12, ok: true },
        { key: 'meta', label: 'Meta Advertising', configured: true, spend: 500, clicks: 80, leads: null, ok: true },
        { key: 'linkedin', label: 'LinkedIn Advertising', configured: true, spend: null, clicks: null, leads: null, ok: false },
      ],
      blendedSpend: null,
      blendedClicks: null,
    })

    const ui = await PaidMediaOverviewReport({ clientSlug: 'acme', dateRange: 'last_30_days' })
    render(ui)

    // Per-channel breakdown shows the channels that reported, in cents.
    expect(screen.getByText('$1,000.00')).toBeInTheDocument()
    expect(screen.getByText('$500.00')).toBeInTheDocument()

    // Per-channel Leads column: Paid Search reports its leads; Meta shows '—'
    // (lead data gap), not 0.
    expect(screen.getByText('12')).toBeInTheDocument()

    // No blended Cost per Lead tile on the top line (no all-channel lead source).
    expect(screen.queryByText('Cost per Lead')).not.toBeInTheDocument()

    // Both captions render: the blended-availability rule (scoped to the channels
    // the client runs) and the no-blended-leads note.
    expect(screen.getByText(/shown only when every channel this client runs reports/i)).toBeInTheDocument()
    expect(screen.getByText(/no blended leads total/i)).toBeInTheDocument()

    // Blended Spend + Clicks tiles blank (missing channel), Meta's leads cell blank,
    // and the whole LinkedIn row blank → several '—' placeholders.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(5)
  })
})
