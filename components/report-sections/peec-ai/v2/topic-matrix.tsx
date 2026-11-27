'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { AEOModel } from '@/lib/peec/models'
import { useExportMode } from '@/components/export/export-mode'
import { formatDelta } from './delta'
import { MATRIX_DEFAULT_COMPETITORS, MATRIX_PARAM, parseMatrixMode, serializeMatrixMode, type MatrixMode } from './matrix-mode'
import type { MatrixCell } from './topics'

type BrandCol = { name: string; color: string; isYou: boolean }
type ModelCol = { model: AEOModel; label: string }
type Col = { key: string; label: string; color: string | null; isYou: boolean; cell: (topic: string) => MatrixCell | undefined }

const CLIENT_OUTLINE = 'outline outline-1 outline-[#60FDFF]'
/** Appended outside `cn`: tailwind-merge would drop the bare `outline` as a conflict of `outline-1`. */
const outlined = (className: string, isYou: boolean) => (isYou ? `${className} ${CLIENT_OUTLINE}` : className)

/** The fill grows with the value: 8% cyan at 0, 80% at 100. */
const fill = (value: number) => `rgba(96,253,255,${(0.08 + 0.72 * (value / 100)).toFixed(3)})`

function modeLine(mode: MatrixMode, brands: number): string {
  if (mode === 'all') return 'All brands'
  if (mode === 'platforms') return 'Platforms'
  return `Competitors · top ${brands} brands`
}

/**
 * Section 04's visibility by topic heatmap. Rows are topics; columns are brands (the client first, then competitors in
 * the brand table's visibility order) or, in Platforms mode, the client's visibility per model. The mode lives in the URL
 * (`aeoMatrix`, ./matrix-mode.ts) so the PDF export draws the same columns. `compareLabel` is the comparison's wording
 * (`compareSuffix`), passed in because ./compare.ts is server-only.
 */
export function TopicMatrix({
  topics,
  brandCols,
  byBrand,
  modelCols,
  byModel,
  showDeltas,
  compareLabel,
}: {
  topics: string[]
  brandCols: BrandCol[]
  byBrand: Record<string, Record<string, MatrixCell>>
  modelCols: ModelCol[]
  byModel: Record<string, Partial<Record<AEOModel, MatrixCell>>>
  showDeltas: boolean
  compareLabel: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const exporting = useExportMode()
  const mode = parseMatrixMode(searchParams.get(MATRIX_PARAM))

  const shownBrands = mode === 'all' ? brandCols : brandCols.slice(0, MATRIX_DEFAULT_COMPETITORS + 1)
  const cols: Col[] =
    mode === 'platforms'
      ? modelCols.map(({ model, label }) => ({ key: model, label, color: null, isYou: false, cell: (t) => byModel[t]?.[model] }))
      : shownBrands.map(({ name, color, isYou }) => ({ key: name, label: name, color, isYou, cell: (t) => byBrand[t]?.[name] }))

  function write(next: MatrixMode) {
    const params = new URLSearchParams(searchParams.toString())
    const value = serializeMatrixMode(next)
    if (value === null) params.delete(MATRIX_PARAM)
    else params.set(MATRIX_PARAM, value)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const tab = (label: string, active: boolean, next: MatrixMode) => (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => write(next)}
      className={cn(
        'rounded-md px-2.5 py-1 text-[11px] font-semibold transition-all',
        active ? 'bg-white text-black shadow-sm' : 'text-text-muted hover:text-white',
      )}
    >
      {label}
    </button>
  )

  const title = (c: MatrixCell) => {
    if (!showDeltas) return undefined
    return c.delta == null ? 'No comparison data' : `${formatDelta(c.delta, 'pts')} ${compareLabel}`.trim()
  }

  const table = (
    <table className="w-full border-separate border-spacing-1 text-xs">
      <thead>
        <tr>
          <th scope="col" className="px-2 py-1.5 text-left font-semibold uppercase tracking-widest text-text-muted">Topic</th>
          {cols.map((c) => (
            <th
              key={c.key}
              scope="col"
              className={outlined('whitespace-nowrap rounded px-2 py-1.5 text-center font-semibold text-white', c.isYou)}
            >
              <span className="inline-flex items-center gap-1.5">
                {c.color && (
                  <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                )}
                {c.label}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {topics.map((topic) => (
          <tr key={topic}>
            <th scope="row" className="px-2 py-1.5 text-left font-semibold text-white">{topic}</th>
            {cols.map((c) => {
              const cell = c.cell(topic)
              const dataKey = mode === 'platforms' ? { 'data-model': c.key } : { 'data-brand': c.key }
              if (!cell || cell.value == null) {
                return (
                  <td key={c.key} {...dataKey} className={outlined('rounded px-2 py-1.5 text-center text-text-muted', c.isYou)}>
                    –
                  </td>
                )
              }
              return (
                <td
                  key={c.key}
                  {...dataKey}
                  title={title(cell)}
                  style={{ backgroundColor: fill(cell.value) }}
                  className={outlined(
                    cn('rounded px-2 py-1.5 text-center tabular-nums', cell.value > 50 ? 'font-semibold text-white' : 'text-text-muted'),
                    c.isYou,
                  )}
                >
                  {cell.value.toFixed(1)}%
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <div className="flex flex-col gap-3">
      {!exporting && (
        <div className="flex flex-wrap items-center justify-between gap-3" data-export-hide="">
          <div className="flex gap-1 rounded-lg bg-white/[0.04] p-0.5">
            {tab('Competitors', mode !== 'platforms', 'competitors')}
            {tab('Platforms', mode === 'platforms', 'platforms')}
          </div>
          {mode !== 'platforms' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={mode === 'all'}
                aria-label="Show all brands"
                onClick={() => write(mode === 'all' ? 'competitors' : 'all')}
                className={`relative h-5 w-9 rounded-full transition-colors ${mode === 'all' ? 'bg-[#60FF80]' : 'bg-white/20'}`}
              >
                <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${mode === 'all' ? 'translate-x-4' : ''}`} />
              </button>
              <span className="text-xs font-semibold uppercase tracking-widest text-text-muted">Show all brands</span>
            </div>
          )}
        </div>
      )}
      {mode === 'all' ? <div className="overflow-x-auto">{table}</div> : table}
      {exporting && <p className="text-xs text-text-muted">{modeLine(mode, shownBrands.length)}</p>}
    </div>
  )
}
