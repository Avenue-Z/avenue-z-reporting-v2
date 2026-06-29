import type { GroupedRow, SeriesPoint } from './types'

/** Outer-join current vs prior rows by dim string. Current-order preserved;
 *  prior-only dims appended at the end with value: undefined. `prevValue` is
 *  ABSENT (key not present) when there's no prior match — not present-undefined. */
export function joinGrouped(
  current: { dim: string; value: number }[],
  prior: { dim: string; value: number }[] | null,
  dimColumn: string,
): GroupedRow[] {
  const out: GroupedRow[] = []
  const priorByDim = new Map<string, number>()
  if (prior) for (const p of prior) priorByDim.set(p.dim, p.value)
  const seen = new Set<string>()

  for (const c of current) {
    seen.add(c.dim)
    const row: GroupedRow = { dim: { [dimColumn]: c.dim }, value: c.value }
    const pv = priorByDim.get(c.dim)
    if (pv !== undefined) row.prevValue = pv
    out.push(row)
  }
  if (prior) {
    for (const p of prior) {
      if (seen.has(p.dim)) continue
      out.push({ dim: { [dimColumn]: p.dim }, value: undefined, prevValue: p.value })
    }
  }
  return out
}

/** Inner-align two time-bucket series by INDEX (not by absolute date).
 *  `current[i].prevValue = prior[i]?.value`. Length = current.length. */
export function alignSeries(
  current: { bucket: string; value: number }[],
  prior: { bucket: string; value: number }[] | null,
): SeriesPoint[] {
  return current.map((c, i) => {
    const pt: SeriesPoint = { bucket: c.bucket, value: c.value }
    const pv = prior?.[i]?.value
    if (pv !== undefined) pt.prevValue = pv
    return pt
  })
}
