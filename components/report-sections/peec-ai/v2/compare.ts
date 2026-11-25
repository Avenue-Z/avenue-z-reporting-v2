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
