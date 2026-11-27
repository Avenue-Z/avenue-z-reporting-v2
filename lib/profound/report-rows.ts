import { profoundPost } from './client'

export type ProfoundNamedRow = {
  dims: Record<string, string | null>
  metrics: Record<string, number>
}

type RawResponse = {
  info: Record<string, unknown>
  data: { dimensions: (string | null)[]; metrics: number[] }[]
}

const NO_QUERY = '[profound] response has no info.query; cannot name its columns'

/**
 * Profound returns dimensions AND metrics in alphabetical order, not request
 * order. Name every column from the response's own info.query so a reordering
 * can never be misread.
 */
export function profoundRows(res: RawResponse): ProfoundNamedRow[] {
  const query = res.info?.query as { dimensions?: unknown; metrics?: unknown } | undefined
  const dimNames = query?.dimensions
  const metricNames = query?.metrics
  if (!Array.isArray(dimNames) || !Array.isArray(metricNames)) throw new Error(NO_QUERY)
  return (res.data ?? []).map((row) => {
    if (row.dimensions.length !== dimNames.length || row.metrics.length !== metricNames.length) {
      throw new Error(NO_QUERY)
    }
    const dims: Record<string, string | null> = {}
    dimNames.forEach((n, i) => { dims[String(n)] = row.dimensions[i] })
    const metrics: Record<string, number> = {}
    metricNames.forEach((n, i) => { metrics[String(n)] = row.metrics[i] })
    return { dims, metrics }
  })
}

const PAGE_LIMIT = 10_000

/** POST a report with offset pagination and return every row, named. */
export async function profoundPostAll(
  path: string,
  body: Record<string, unknown>,
  maxRows = 50_000,
): Promise<ProfoundNamedRow[]> {
  const out: ProfoundNamedRow[] = []
  let offset = 0
  for (;;) {
    const res = await profoundPost(path, { ...body, pagination: { limit: PAGE_LIMIT, offset } })
    const page = profoundRows(res)
    out.push(...page)
    offset += page.length
    const total = res.info?.total_rows
    if (page.length < PAGE_LIMIT) break
    if (typeof total === 'number' && offset >= total) break
    if (out.length >= maxRows) {
      console.warn(`[profound] ${path} truncated at ${maxRows} rows`)
      return out.slice(0, maxRows)
    }
  }
  return out
}

/** Citations cover every prompt type unless filtered; visibility metrics use visibility prompts only. */
export const visibilityPromptsOnly = [
  { field: 'analysis_type', operator: 'is', value: 'visibility' },
] as const
