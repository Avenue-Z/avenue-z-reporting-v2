import { creativeGrandTotals } from '@/lib/linkedin/creative'
import type { LinkedInCampaignGroupNode } from '@/lib/linkedin/types'
import { CreativeTableClient } from './creative-table-client'

export function LinkedInCreativeTable({ groups }: { groups: LinkedInCampaignGroupNode[] }) {
  const totals = creativeGrandTotals(groups)
  return <CreativeTableClient groups={groups} totals={totals} />
}
