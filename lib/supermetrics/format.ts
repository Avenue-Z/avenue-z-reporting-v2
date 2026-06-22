export function usd(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US')
}

export function num(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

export function pct(n: number): string {
  return n.toFixed(1) + '%'
}
