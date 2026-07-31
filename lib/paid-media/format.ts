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
