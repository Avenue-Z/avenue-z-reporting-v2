export type DeltaUnit = 'pts' | 'pct' | 'places'

const NO_VALUE = '–'

function signedOneDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10
  const text = Math.abs(rounded).toFixed(1)
  if (rounded > 0) return `+${text}`
  if (rounded < 0) return `-${text}`
  return text
}

export function formatDelta(
  value: number | null | undefined,
  unit: DeltaUnit,
  opts?: { isNew?: boolean },
): string {
  if (opts?.isNew) return 'New'
  if (value == null || !Number.isFinite(value)) return NO_VALUE
  if (unit === 'pts') return `${signedOneDecimal(value)} pts`
  if (unit === 'pct') return `${signedOneDecimal(value)}%`
  const n = Math.round(Math.abs(value))
  if (value > 0) return `↑ ${n} ${n === 1 ? 'place' : 'places'}`
  if (value < 0) return `↓ ${n} ${n === 1 ? 'place' : 'places'}`
  return '0 places'
}

export function deltaTone(
  value: number | null | undefined,
  betterWhen: 'higher' | 'lower',
): 'good' | 'bad' | 'neutral' {
  if (value == null || !Number.isFinite(value) || value === 0) return 'neutral'
  const up = value > 0
  return up === (betterWhen === 'higher') ? 'good' : 'bad'
}

export function pctChange(now: number, prior: number | null | undefined): number | null {
  if (prior == null || prior === 0) return null
  return ((now - prior) / prior) * 100
}
