/** The plain mean of the values that exist (nulls skipped), or null when none does. Competitor averages use it, unweighted. */
export function mean(values: readonly (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null)
  return v.length === 0 ? null : v.reduce((s, x) => s + x, 0) / v.length
}
