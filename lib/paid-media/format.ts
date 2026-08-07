/**
 * Paid Media money formatter — always cents, so the same figure never appears at
 * two precisions within Paid Media (Decisions doc item 11, comment [ae]: "Make
 * them all with cents so it's exact").
 *
 * Scope is Paid Media ONLY. Do not replace the shared `usd()` in
 * `lib/supermetrics/format.ts` — other tabs depend on its whole-dollar output.
 */
export function money(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Sentinel for an undefined value (em dash, U+2014). */
export const DASH = '—'

/**
 * Cost per lead in Paid Media cents, or DASH when there are no leads. A 0-lead
 * denominator makes the ratio undefined; rendering it as $0.00 wrongly implies
 * leads were free, so we show '—' instead.
 */
export function costPerLead(cost: number, leads: number): string {
  return leads > 0 ? money(cost / leads) : DASH
}
