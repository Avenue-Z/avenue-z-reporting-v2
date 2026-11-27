import { parseDateRange, deriveCompareRange } from '@/lib/ga4/client'

export type AeoCompare = 'previous_period' | 'previous_year' | 'none'

export function parseAeoCompare(raw: string | null | undefined): AeoCompare {
  return raw === 'previous_year' || raw === 'none' ? raw : 'previous_period'
}

/** `none` still fetches the prior window in slice 1; the UI hides every delta. */
export function fetchCompareMode(c: AeoCompare): 'previous_period' | 'previous_year' {
  return c === 'previous_year' ? 'previous_year' : 'previous_period'
}

export function parseShowDeltas(raw: string | null | undefined, c: AeoCompare): boolean {
  if (c === 'none') return false
  return raw !== 'off'
}

export function compareSuffix(c: AeoCompare): string {
  if (c === 'previous_period') return 'vs previous period'
  if (c === 'previous_year') return 'vs same period last year'
  return ''
}

/** v1 layouts ignore the URL params entirely so their cache keys and markup stay unchanged. */
export function overviewCompare(
  isV2: boolean,
  compareRange: string | null | undefined,
  deltas: string | null | undefined,
): { compare: AeoCompare; showDeltas: boolean; fetchMode: 'previous_period' | 'previous_year' } {
  if (!isV2) return { compare: 'previous_period', showDeltas: true, fetchMode: 'previous_period' }
  const compare = parseAeoCompare(compareRange)
  return { compare, showDeltas: parseShowDeltas(deltas, compare), fetchMode: fetchCompareMode(compare) }
}

type DateWindow = { start: string; end: string }

/**
 * The selected period and its comparison window as dates, for the trend chart's shading. The comparison is the same
 * window the v2 fetchers compare against (`deriveCompareRange` with `fetchCompareMode`); `null` when the page compares
 * against nothing.
 */
export function periodWindows(dateRange: string, compare: AeoCompare): { period: DateWindow; comparePeriod: DateWindow | null } {
  const main = parseDateRange(dateRange)
  const prior = compare === 'none' ? null : deriveCompareRange(dateRange, fetchCompareMode(compare))
  return {
    period: { start: main.startDate, end: main.endDate },
    comparePeriod: prior ? { start: prior.startDate, end: prior.endDate } : null,
  }
}
