import type { PartImpl } from '@/lib/report-sections/types'
import { BrandAbsentEditorialDomainsTable } from '../../pr-influence-tables'
import type { PrInfluenceCtx } from '../ctx'

export const brandAbsentEditorialV1: PartImpl<PrInfluenceCtx> = {
  id: 'brand-absent-editorial', version: 1, published: true, defaultLabel: 'Top Editorial Opportunities',
  render: (ctx) => (
    <BrandAbsentEditorialDomainsTable rows={ctx.brandAbsentTableRows} hasEditorialDomains={ctx.hasEditorialDomains} />
  ),
}
