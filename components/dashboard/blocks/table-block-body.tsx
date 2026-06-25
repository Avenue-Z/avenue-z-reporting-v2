import { DataTable } from '@/components/charts/data-table'
import { BlockBodyError } from '../metric-block-states'
import { toTableInput } from '@/lib/dashboard/table'
import type { GroupedResult, PersistedBlock } from '@/lib/dashboard/types'

/** Async body — awaits the GroupedResult promise; renders <DataTable> or error.
 *  Matches BarBlockBody's pattern: empty rows → 'no-data' error card. */
export async function TableBlockBody({
  block, groupedPromise, slug,
}: {
  block: PersistedBlock
  groupedPromise: Promise<GroupedResult>
  slug: string
}) {
  const r = await groupedPromise
  if (!r.ok) return <BlockBodyError name={block.name} error={r.error} slug={slug} />
  if (r.rows.length === 0) return <BlockBodyError name={block.name} error="no-data" slug={slug} />

  const t = toTableInput(r)
  return (
    <div className="rounded-lg border border-white/[0.08] bg-bg-surface px-6 py-5 h-full flex flex-col">
      <p className="text-xs font-extrabold uppercase tracking-widest text-text-muted">{block.name}</p>
      <div className="mt-3 flex-1 min-h-0 overflow-auto">
        <DataTable columns={t.columns} rows={t.rows} defaultSort={t.defaultSort} />
      </div>
    </div>
  )
}
