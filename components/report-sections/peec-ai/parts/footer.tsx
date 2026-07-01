import type { PartImpl } from '@/lib/report-sections/types'
import type { PeecCtx } from '../ctx'

export const footerV1: PartImpl<PeecCtx> = {
  id: 'footer',
  version: 1,
  published: true,
  defaultLabel: 'Data Source',
  render: (ctx) => {
    const { label } = ctx
    return <p className="text-xs text-text-muted">{`Live data from ${label}`}</p>
  },
}
