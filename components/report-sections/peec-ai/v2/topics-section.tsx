import { getTopicsPromptsV2 } from '@/lib/aeo/v2/topics-prompts'
import { getVisibilityV2 } from '@/lib/aeo/v2/visibility'
import { MODEL_DISPLAY_LABELS } from '@/lib/peec/models'
import type { PeecCtx } from '../ctx'
import { FALLBACK_COLOR, brandColors } from './brand-colors'
import { compareSuffix, fetchCompareMode } from './compare'
import { PromptPerformanceTable } from './prompt-performance-table'
import { TopicMatrix } from './topic-matrix'
import { promptPerformanceRows, topicMatrix } from './topics'

const MATRIX_TITLE = 'Where does the brand show up by topic?'
const PROMPTS_TITLE = 'How is the brand ranking on each tracked prompt?'

/** A section 04 card with nothing to draw: its title and one muted line, so the section never shows a header over nothing. */
function EmptyCard({ title, line }: { title: string; line: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface" data-export-block="">
      <div className="border-b border-white/[0.06] px-5 py-4">
        <p className="text-xs font-bold uppercase tracking-widest text-text-muted">{title}</p>
      </div>
      <p className="px-5 py-4 text-sm text-text-muted">{line}</p>
    </div>
  )
}

/**
 * Section 04's visibility by topic matrix, fetched server-side. The topic figures and the brand table's order come from
 * two cached calls on the same comparison window; the model filter is applied (only the selected models are summed).
 * The client is the brand table's (one client across chart, table and matrix). Columns are the client first, then
 * competitors in the brand table's visibility order, then any brand the topic data has that the table lacks, by name.
 * The title keeps with the grid; the grid marks its own unbreakable blocks (several when every brand prints).
 */
export async function TopicMatrixSection({
  ctx,
}: {
  ctx: Pick<PeecCtx, 'provider' | 'clientSlug' | 'dateRange' | 'compare' | 'showDeltas' | 'models'>
}) {
  const empty = <EmptyCard title={MATRIX_TITLE} line="No topic data for this period." />
  if (!ctx.clientSlug) return empty
  const range = ctx.dateRange ?? 'last_30_days'
  const mode = fetchCompareMode(ctx.compare)
  const [data, v] = await Promise.all([
    getTopicsPromptsV2(ctx.provider, ctx.clientSlug, range, mode),
    getVisibilityV2(ctx.provider, ctx.clientSlug, range, mode),
  ])
  const you = v.brands.find((b) => b.isYou)?.name ?? data.you
  const m = topicMatrix(data, ctx.models, you)
  if (you === null || m.topics.length === 0) return empty

  const colors = brandColors(v.roster, you)
  const inMatrix = new Set<string>()
  for (const row of m.byBrand.values()) for (const name of row.keys()) inMatrix.add(name)
  const ranked = v.brands.map((b) => b.name).filter((name) => name !== you)
  const listed = new Set([you, ...ranked])
  const unlisted = Array.from(inMatrix).filter((name) => !listed.has(name)).sort((a, b) => a.localeCompare(b))
  const brandCols = [you, ...ranked, ...unlisted]
    .filter((name) => inMatrix.has(name))
    .map((name) => ({ name, color: colors.get(name) ?? FALLBACK_COLOR, isYou: name === you }))

  return (
    <div className="rounded-lg border border-white/[0.06] bg-bg-surface">
      <div className="border-b border-white/[0.06] px-5 py-4" data-export-keep-with-next="">
        <p className="text-xs font-bold uppercase tracking-widest text-text-muted">{MATRIX_TITLE}</p>
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

/** Section 04's Prompt Performance table, fetched server-side on the same comparison window; the model filter is applied
 *  (only the selected models are summed). */
export async function PromptPerformanceSection({
  ctx,
}: {
  ctx: Pick<PeecCtx, 'provider' | 'clientSlug' | 'dateRange' | 'compare' | 'showDeltas' | 'models'>
}) {
  const empty = <EmptyCard title={PROMPTS_TITLE} line="No prompt data for this period." />
  if (!ctx.clientSlug) return empty
  const data = await getTopicsPromptsV2(ctx.provider, ctx.clientSlug, ctx.dateRange ?? 'last_30_days', fetchCompareMode(ctx.compare))
  const rows = promptPerformanceRows(data.prompts, ctx.models)
  if (rows.length === 0) return empty
  return <PromptPerformanceTable rows={rows} showDeltas={ctx.showDeltas} />
}
