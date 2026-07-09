/**
 * Formats a "days to first" speed stat (Speed Stats tiles, Content Impact
 * Section C) for display. Values are whole days, floored at 0 by
 * lib/ga4/content-derive.ts (do not change that computation here).
 */
export function formatDaysToFirst(val: number | null): string {
  if (val === null) return 'None'
  const n = Math.round(val)
  if (n === 0) return 'Same day'
  if (n === 1) return '1 day'
  return `${n} days`
}
