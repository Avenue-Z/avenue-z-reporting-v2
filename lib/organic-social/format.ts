/** Percent display for organic-social rate KPIs (engagement rate, effectiveness).
 *  These rates are non-negative and routinely below 1%, where plain whole-number rounding
 *  would hide a real rate as "0%". So: whole number at/above 1% (3.5% -> "3%"); one decimal
 *  below 1% (0.4% -> "0.4%") to keep the sub-1% band legible.
 *
 *  Non-negative input only — deltas are formatted by KpiCard, not here.
 *
 *  A value in [0.96%, 1%) shows as "1.0%" (its true one-decimal value). That is intentional:
 *  the alternative — letting Math.round pick the regime — renders 0.6%/0.7%/0.9% as "1%",
 *  inflating the very sub-1% rates this helper exists to preserve. One decimal below 1% is
 *  the point. */
export function pctCompact(n: number): string {
  return n < 1 ? n.toFixed(1) + '%' : Math.round(n) + '%'
}
