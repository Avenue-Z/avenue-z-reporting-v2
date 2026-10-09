import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExportModeProvider } from '@/components/export/export-mode'
import { CreativeTable } from './creative-table'
import type { CampaignNode } from '@/lib/meta/types'

const metrics = { spend: 45, impressions: 6000, reach: 4500, frequency: 1.3, linkClicks: 130, ctr: 2.2, cpc: 0.35, lpv: 200, costPerLpv: 0.3, engagements: 180, shareOfSpend: 50 }
const campaigns: CampaignNode[] = ['Traffic', 'Leads'].map((name) => ({
  name, ...metrics,
  adSets: [{ name: `${name} set`, ...metrics, ads: [{ ...metrics, ad: `${name} ad`, campaign: name, adSet: `${name} set`, status: 'ACTIVE' }] }],
}))

// PDF export (spec 2026-10-08 §7, PR 3 plan deviation 3): campaigns collapsed as on first load; no sort or hint controls.
test('the export prints top-level campaigns and the total, marked, with no arrows, chevrons or hints', () => {
  const { container } = render(<ExportModeProvider><CreativeTable campaigns={campaigns} /></ExportModeProvider>)
  expect(container.querySelector('[data-export-table]')).not.toBeNull()
  expect(container.querySelectorAll('tbody tr[data-export-row]')).toHaveLength(3)
  expect(container.textContent).not.toMatch(/[▸▾↓↑?]/)
  expect(screen.queryByText('Traffic set')).toBeNull()
  expect(container.querySelector('th[class*="cursor-pointer"]')).toBeNull()
})
