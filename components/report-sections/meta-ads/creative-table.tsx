import { creativeGrandTotals } from '@/lib/meta/creative'
import type { CampaignNode } from '@/lib/meta/types'
import { CreativeTableClient } from './creative-table-client'

export function CreativeTable({ campaigns }: { campaigns: CampaignNode[] }) {
  const totals = creativeGrandTotals(campaigns)
  return <CreativeTableClient campaigns={campaigns} totals={totals} />
}
