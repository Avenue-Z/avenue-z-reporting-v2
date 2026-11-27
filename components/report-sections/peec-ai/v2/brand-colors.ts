import { CHART_COLORS } from '@/lib/constants'

export const BRAND_PALETTE = [
  '#6034FF', '#FFFC60', '#FF8A3D', '#39A0FF', '#FF6B8A', '#96BF48',
  '#C084FC', '#F59E0B', '#2DD4BF', '#F472B6', '#A3A3A3', '#84CC16',
] as const

/** The one color for a brand the roster lacks (drawn grey rather than not at all). Not a palette slot. */
export const FALLBACK_COLOR = '#6B7280'

/**
 * Colors for a brand roster. "You" gets the primary cyan; every other brand takes a palette slot
 * by its position in name order. It depends only on the roster, never on rank, so colors do not
 * shuffle between periods. A Map, since brand names are vendor data (a brand named `constructor`
 * must not read an Object property); look a name up with `.get(name) ?? FALLBACK_COLOR`.
 */
export function brandColors(roster: readonly string[], you: string | null): Map<string, string> {
  const colors = new Map<string, string>()
  if (you !== null && roster.includes(you)) colors.set(you, CHART_COLORS.primary)
  const others = roster
    .filter((name) => name !== you)
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
  others.forEach((name, i) => {
    colors.set(name, BRAND_PALETTE[i % BRAND_PALETTE.length])
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
