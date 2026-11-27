import { CHART_COLORS } from '@/lib/constants'

export const BRAND_PALETTE = [
  '#6034FF', '#FFFC60', '#FF8A3D', '#39A0FF', '#FF6B8A', '#96BF48',
  '#C084FC', '#F59E0B', '#2DD4BF', '#F472B6', '#A3A3A3', '#84CC16',
] as const

/**
 * Colors for a brand roster. "You" gets the primary cyan; every other brand takes a palette slot
 * by its position in name order. It depends only on the roster, never on rank, so colors do not
 * shuffle between periods.
 */
export function brandColors(roster: readonly string[], you: string | null): Record<string, string> {
  const colors: Record<string, string> = {}
  if (you !== null && roster.includes(you)) colors[you] = CHART_COLORS.primary
  const others = roster
    .filter((name) => name !== you)
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
  others.forEach((name, i) => {
    colors[name] = BRAND_PALETTE[i % BRAND_PALETTE.length]
  })
  return colors
}

/** A stable key for a brand name: diacritics stripped, lowercase, non-alphanumeric runs become hyphens. */
export function brandKey(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
