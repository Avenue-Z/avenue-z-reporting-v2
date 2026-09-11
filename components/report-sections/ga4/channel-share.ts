/**
 * The denominator for a channel's share of total traffic.
 *
 * `rows` comes from the channel query, which is capped at its `limit`, so
 * summing only those rows computes share-of-top-N rather than share of total
 * traffic whenever sessions exist outside the returned set. Prefer the true
 * period total from the page's undimensioned totals query, falling back to the
 * row sum when that is absent or zero (e.g. the totals query itself failed),
 * which reproduces the old behavior rather than dividing by zero.
 *
 * Mirrors the rule in the Overview's reshape.ts so both pages report the same
 * share for the same client and window.
 */
export function channelShareDenominator(
  rows: { sessions?: unknown }[],
  trueTotal?: number | null,
): number {
  if (trueTotal != null && trueTotal > 0) return trueTotal
  return rows.reduce((sum, r) => sum + ((r.sessions as number) ?? 0), 0)
}
