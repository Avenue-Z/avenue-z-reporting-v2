export type DeltaUnit = 'pts' | 'pct' | 'places'

const NO_VALUE = '–'

function signedOneDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10
  const text = Math.abs(rounded).toFixed(1)
  if (rounded > 0) return `+${text}`
  if (rounded < 0) return `-${text}`
  return text
}

/** Rounds the way `formatDelta` displays: one decimal for pts/pct, whole numbers for places. */
export function roundForUnit(value: number, unit: DeltaUnit): number {
  return unit === 'places' ? Math.sign(value) * Math.round(Math.abs(value)) : Math.round(value * 10) / 10
}

/**
 * Formats a delta for display. `pts` and `pct` print one signed decimal; `places` prints whole
 * rank places. Places sign rule: a positive value means the client moved up (better), a negative
 * value means it moved down, so callers compute rank deltas as prior − current. A value that
 * rounds to 0 prints `0 places` with no arrow.
 */
export function formatDelta(
  value: number | null | undefined,
  unit: DeltaUnit,
  opts?: { isNew?: boolean },
): string {
  if (opts?.isNew) return 'New'
  if (value == null || !Number.isFinite(value)) return NO_VALUE
  if (unit === 'pts') return `${signedOneDecimal(value)} pts`
  if (unit === 'pct') return `${signedOneDecimal(value)}%`
  const rounded = roundForUnit(value, 'places')
  const n = Math.abs(rounded)
  if (rounded > 0) return `↑ ${n} ${n === 1 ? 'place' : 'places'}`
  if (rounded < 0) return `↓ ${n} ${n === 1 ? 'place' : 'places'}`
  return '0 places'
}

/**
 * Tone for a delta. Pass `unit` so the tone is decided from the same rounded value `formatDelta`
 * prints (a delta that displays as 0.0 pts or 0 places is neutral). Places sign rule: a positive
 * value means the client moved up (better), so rank deltas computed as prior − current use
 * `betterWhen: 'higher'`.
 */
export function deltaTone(
  value: number | null | undefined,
  betterWhen: 'higher' | 'lower',
  unit?: DeltaUnit,
): 'good' | 'bad' | 'neutral' {
  if (value == null || !Number.isFinite(value)) return 'neutral'
  const v = unit ? roundForUnit(value, unit) : value
  if (v === 0) return 'neutral'
  const up = v > 0
  return up === (betterWhen === 'higher') ? 'good' : 'bad'
}

export function pctChange(now: number, prior: number | null | undefined): number | null {
  if (prior == null || prior === 0) return null
  return ((now - prior) / prior) * 100
}
