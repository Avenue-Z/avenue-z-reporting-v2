/** The brands the visibility bar chart shows, the same objects in the chart's order (highest visibility first): the
 *  first 20 in rank order, sorted by visibility, the top 10, and the brand in place of the tenth when it is not among
 *  them (v1.1 §9). The bar chart and the competitor domain gaps both use it, so the gaps only name competitors the
 *  chart shows (round 3 QA, spec 2026-10-22 F1). No imports: charts.ts and metrics.ts both depend on it. */
export function chartedBrands<T extends { visibilityPct: number; isOwn?: boolean }>(brands: readonly T[]): T[] {
  let top10 = [...brands.slice(0, 20)].sort((a, b) => b.visibilityPct - a.visibilityPct).slice(0, 10)
  const own = brands.find((b) => b.isOwn)
  if (own && !top10.includes(own)) top10 = [...top10.slice(0, 9), own]
  return top10
}
