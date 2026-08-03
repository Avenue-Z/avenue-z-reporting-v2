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
 *  keeps the sub-1% band legible while giving clean whole numbers everywhere else. */
export function pctCompact(n: number): string {
  return Math.abs(n) < 1 ? n.toFixed(1) + '%' : Math.round(n) + '%'
}
