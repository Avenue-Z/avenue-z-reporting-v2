// components/dashboard/blocks/table-block-body.tsx
import { DataTable } from '@/components/charts/data-table'
import { ChartCard } from '@/components/charts/chart-card'
import { BlockBodyError } from '../metric-block-states'
import { EditableText } from '../editable-text'
import { toTableInput } from '@/lib/dashboard/table'
import type { GroupedResult, LabelOverrides, PersistedBlock } from '@/lib/dashboard/types'

/** Async body — awaits the GroupedResult promise; renders <DataTable> or error.
 *  Matches BarBlockBody's pattern: empty rows → 'no-data' error card. */
export async function TableBlockBody({
  block, groupedPromise, slug, canEdit, labelOverrides,
}: {
  block: PersistedBlock
  groupedPromise: Promise<GroupedResult>
  slug: string
  canEdit: boolean
  labelOverrides?: LabelOverrides
}) {
  const r = await groupedPromise
  if (!r.ok) return <BlockBodyError name={block.name} error={r.error} slug={slug} />
  if (r.rows.length === 0) return <BlockBodyError name={block.name} error="no-data" slug={slug} />

  const t = toTableInput(r, labelOverrides)
  return (
    <ChartCard
      title={<EditableText value={block.name} slug={slug} target={{ kind: 'blockText', blockId: block.id, field: 'name' }} canEdit={canEdit} as="span" />}
      fill
      bodyClassName="overflow-auto"
    >
      <DataTable columns={t.columns} rows={t.rows} defaultSort={t.defaultSort} bare slug={slug} canEdit={canEdit} />
    </ChartCard>
  )
}
