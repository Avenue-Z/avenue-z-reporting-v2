import type { PartImpl } from '@/lib/report-sections/types'
import { TopEditorialDomainsTable, PromptClusterOpportunityMatrix } from '../../pr-influence-tables'
import type { PrInfluenceCtx } from '../ctx'

export const editorialAndClustersV1: PartImpl<PrInfluenceCtx> = {
  id: 'editorial-and-clusters', version: 1, published: true, defaultLabel: 'Editorial Domains and Prompt Clusters',
  render: (ctx) => (
    <div className="grid gap-6 lg:grid-cols-2">
      <TopEditorialDomainsTable rows={ctx.topEditorialRows} />
      <PromptClusterOpportunityMatrix rows={ctx.opportunityTableRows} />
    </div>
  ),
}
