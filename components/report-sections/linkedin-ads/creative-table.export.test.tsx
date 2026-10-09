import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ExportModeProvider } from '@/components/export/export-mode'
import { LinkedInCreativeTable } from './creative-table'
import type { LinkedInCampaignGroupNode, LinkedInCreativeMetrics } from '@/lib/linkedin/types'

const m: LinkedInCreativeMetrics = { spend: 500, impressions: 4000, clicks: 40, ctr: 1, cpc: 12.5, leads: 0, costPerLead: 0, leadFormOpens: 0, leadFormCompletionRate: 0, landingPageClicks: 30, shareOfSpend: 50 }
const groups: LinkedInCampaignGroupNode[] = ['Prospecting', 'Retargeting'].map((name) => ({
  name, ...m,
  campaigns: [{ name: `${name} campaign`, ...m, ads: [{ ...m, ad: `${name} ad`, campaign: `${name} campaign`, campaignGroup: name, status: 'ACTIVE' }] }],
}))

// PDF export (spec 2026-10-08 §7, PR 3 plan deviation 3): campaign groups collapsed as on first load; no sort controls.
test('the export prints top-level campaign groups and the total, marked, with no arrows or chevrons', () => {
  const { container } = render(<ExportModeProvider><LinkedInCreativeTable groups={groups} /></ExportModeProvider>)
  expect(container.querySelector('[data-export-table]')).not.toBeNull()
  expect(container.querySelectorAll('tbody tr[data-export-row]')).toHaveLength(3)
  expect(container.textContent).not.toMatch(/[▸▾↓↑]/)
  expect(screen.queryByText('Prospecting campaign')).toBeNull()
  expect(container.querySelector('th[class*="cursor-pointer"]')).toBeNull()
})
