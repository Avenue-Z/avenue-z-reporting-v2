// lib/organic-social/social-listening/format.ts
// Number text for the Social Listening tab. Pure, safe in server and client components.

/** 12,345 */
export function num(n: number): string {
  return n.toLocaleString('en-US')
}

/** 1.2M, 34.5K, 999: for reach and engagement, with the exact number beside it. */
export function short(n: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

/** 61.7% (one decimal, as pct gives it) */
export function pctText(n: number): string {
  return `${n.toFixed(1).replace(/\.0$/, '')}%`
}

/** A percentage points change with its sign: +1.2 pts, -3 pts, 0 pts. */
export function pointsText(n: number): string {
  const size = Math.abs(n).toFixed(1).replace(/\.0$/, '')
  return n > 0 ? `+${size} pts` : n < 0 ? `-${size} pts` : '0 pts'
}

/** A percent change as the tiles show it (whole from 1%, one decimal under), with its sign. */
export function changeText(n: number, round: (x: number) => number): string {
  const shown = round(n)
  const size = Math.abs(shown).toFixed(shown === 0 || Math.abs(shown) >= 1 ? 0 : 1)
  return shown > 0 ? `+${size}%` : shown < 0 ? `-${size}%` : '0%'
}
