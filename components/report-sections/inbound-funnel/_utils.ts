/**
 * Shared helpers for inbound-funnel sections.
 */

export function rangeDelta(current: number, prior: number | null | undefined): number | undefined {
  if (prior == null || prior === 0) return undefined
  return ((current - prior) / prior) * 100
}

export function fmtISODate(d: string): string {
  if (!d) return d
  const [year, month, day] = d.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}
