export function usd(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US')
}

export function num(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

export function pct(n: number): string {
  return n.toFixed(1) + '%'
}

/** Percent for rate KPIs (engagement rate, effectiveness): whole number at/above 1%
 *  (3.5% -> "3%"), one decimal below 1% (0.4% -> "0.4%"). Sub-1% rates are common in
 *  social, so plain whole-number rounding would collapse real values to "0%" — this
 *  keeps the sub-1% band legible while giving clean whole numbers everywhere else.
 *  Rounds half away from zero, so it stays sign-symmetric (-3.5% -> "-4%") for the
 *  signed inputs a shared helper may see (e.g. a delta). */
export function pctCompact(n: number): string {
  if (Math.abs(n) < 1) return n.toFixed(1) + '%'
  return Math.sign(n) * Math.round(Math.abs(n)) + '%'
}
