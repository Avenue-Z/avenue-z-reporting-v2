import { BlockChrome } from '../block-chrome'
import { NarrativeBlockBody } from './narrative-block-body'
import type { DashboardConfig, PersistedBlock } from '@/lib/dashboard/types'

/** Static narrative block. Renders synchronously — body is stored on the
 *  block config as markdown; react-markdown renders it inline. */
export function NarrativeBlock({
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
      <NarrativeBlockBody name={block.name} body={block.narrativeBody} canEdit={canEdit} slug={slug} blockId={block.id} />
    </BlockChrome>
  )
}
