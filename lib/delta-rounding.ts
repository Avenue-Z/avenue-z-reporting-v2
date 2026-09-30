/** A percent change as the nearest whole number, for the outline tiles (Jasmine, 2026-09-29: 6.3%
 *  shows 6%, 6.57% shows 7%). The size is rounded half up, then the sign goes back, so a drop rounds
 *  like a rise. Only float noise is removed first (six decimals), never the one-decimal display: 6.45
 *  is 6, not 7. Zero is always plain 0, so the card shows no arrow. */
export function roundDelta(delta: number): number {
  const size = Math.round(Math.abs(delta) * 1e6) / 1e6
  const whole = Math.round(size)
  if (whole === 0) return 0
  return delta < 0 ? -whole : whole
}
