import { BlockChrome } from '../block-chrome'
import { HeaderBlockBody } from './header-block-body'
import type { DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'

/** Static section header block. Renders synchronously — no Suspense, no resolver. */
export function HeaderBlock({
  block, canEdit, slug, config, activeDefault,
}: {
  block: PersistedBlock
  canEdit: boolean
  slug: string
  config: DashboardConfig
  activeDefault: { dateRange: string; compareRange: string | null }
}) {
  return (
    <BlockChrome block={block} canEdit={canEdit} slug={slug} config={config} activeDefault={activeDefault}>
      <HeaderBlockBody name={block.name} level={block.headerLevel} />
    </BlockChrome>
  )
}
