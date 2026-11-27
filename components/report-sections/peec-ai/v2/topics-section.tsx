import { getTopicsPromptsV2 } from '@/lib/aeo/v2/topics-prompts'
import { getVisibilityV2 } from '@/lib/aeo/v2/visibility'
import { MODEL_DISPLAY_LABELS } from '@/lib/peec/models'
import type { PeecCtx } from '../ctx'
import { FALLBACK_COLOR, brandColors } from './brand-colors'
import { compareSuffix, fetchCompareMode } from './compare'
import { PromptPerformanceTable } from './prompt-performance-table'
import { TopicMatrix } from './topic-matrix'
import { promptPerformanceRows, topicMatrix } from './topics'

/**
 * Section 04's visibility by topic matrix, fetched server-side. The topic figures and the brand table's order come from
 * two cached calls on the same comparison window; the model filter is applied (only the selected models are summed).
 * Columns are the client first, then competitors in the brand table's visibility order, keeping only brands the topic
 * data has.
 */
export async function TopicMatrixSection({
  ctx,
}: {
  ctx: Pick<PeecCtx, 'provider' | 'clientSlug' | 'dateRange' | 'compare' | 'showDeltas' | 'models'>
}) {
  if (!ctx.clientSlug) return null
  const range = ctx.dateRange ?? 'last_30_days'
  const mode = fetchCompareMode(ctx.compare)
  const [data, v] = await Promise.all([
    getTopicsPromptsV2(ctx.provider, ctx.clientSlug, range, mode),
    getVisibilityV2(ctx.provider, ctx.clientSlug, range, mode),
  ])
  const m = topicMatrix(data, ctx.models)
  if (m.topics.length === 0) return null

  const you = data.you
  const colors = brandColors(v.roster, you)
  const inMatrix = new Set(Object.values(m.byBrand).flatMap((row) => Object.keys(row)))
  const order = [...(you !== null ? [you] : []), ...v.brands.map((b) => b.name).filter((name) => name !== you)]
  const brandCols = order
    .filter((name) => inMatrix.has(name))
    .map((name) => ({ name, color: colors[name] ?? FALLBACK_COLOR, isYou: name === you }))

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface" data-export-block="">
      <div className="border-b border-white/[0.06] px-5 py-4">
        <p className="text-xs font-bold uppercase tracking-widest text-text-muted">Where does the brand show up by topic?</p>
      </div>
      <div className="p-5">
        <TopicMatrix
          topics={m.topics}
          brandCols={brandCols}
          byBrand={m.byBrand}
          modelCols={m.modelsPresent.map((model) => ({ model, label: MODEL_DISPLAY_LABELS[model] }))}
          byModel={m.byModel}
          showDeltas={ctx.showDeltas}
          compareLabel={compareSuffix(ctx.compare)}
        />
      </div>
    </div>
  )
}

/** Section 05's Prompt Performance table, fetched server-side on the same comparison window; the model filter is applied
 *  (only the selected models are summed). */
export async function PromptPerformanceSection({
  ctx,
}: {
  ctx: Pick<PeecCtx, 'provider' | 'clientSlug' | 'dateRange' | 'compare' | 'showDeltas' | 'models'>
}) {
  if (!ctx.clientSlug) return null
  const data = await getTopicsPromptsV2(ctx.provider, ctx.clientSlug, ctx.dateRange ?? 'last_30_days', fetchCompareMode(ctx.compare))
  const rows = promptPerformanceRows(data.prompts, ctx.models)
  if (rows.length === 0) return null
  return <PromptPerformanceTable rows={rows} showDeltas={ctx.showDeltas} />
}
