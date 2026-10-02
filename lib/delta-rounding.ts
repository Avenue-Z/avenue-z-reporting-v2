/** A percent change as the outline clients' tiles show it. From 1% it is the nearest whole number (Jasmine,
 *  2026-09-29: 6.3% shows 6%, 6.57% shows 7%); under 1% it keeps one decimal (Thomas, 2026-10-01, after Paul's
 *  review of #285), so a small real move on a large account (120,000 to 119,500 followers, -0.42%) shows 0.4%
 *  rather than a flat 0%. The size is rounded half up, then the sign goes back, so a drop rounds like a rise.
 *  Only float noise is removed first (nine decimals, far wider than the noise of a division and far narrower
 *  than any real change, so 6.4999999675% on a 200 million prior still shows 6), never the one-decimal
 *  display: 6.45 is 6, not 7. A size that rounds to 1.0 at one decimal (0.95 and up) is shown whole, as 1.
 *  Zero is always plain 0, so the card shows no arrow. */
export function roundDelta(delta: number): number {
  const size = Math.round(Math.abs(delta) * 1e9) / 1e9
  // Tenths of a percent, snapped the same way, so a true half such as 0.35 (stored as 0.3499...) rounds up.
  const tenths = Math.round(Math.round(size * 10 * 1e9) / 1e9)
  const shown = tenths < 10 ? tenths / 10 : Math.round(size)
  if (shown === 0) return 0
  return delta < 0 ? -shown : shown
}
