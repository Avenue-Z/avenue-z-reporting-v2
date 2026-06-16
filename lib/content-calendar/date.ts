// lib/content-calendar/date.ts -- pure, server-or-client safe date helpers
//
// Content calendar sheets store publish dates in inconsistent forms: ISO
// (2026-03-03), US M/D/YYYY (3/3/2026), or bare M/D (3/3) with the year living
// in a sibling "month context" column ("March 2026"). These helpers normalize
// all of those to ISO YYYY-MM-DD so downstream timing math (§C/§D) has a real
// date to anchor on. Returns null for placeholders / unparseable values.

const PLACEHOLDERS = new Set(['', 'tbd', 'pending', 'n/a', 'na', '-', 'placeholder'])

/** Extract a 4-digit year from a month-context cell (e.g. "March 2026" → 2026). */
export function parseYearHint(cell: string | undefined): number | null {
  if (!cell) return null
  const m = cell.match(/\b(19|20)\d{2}\b/)
  return m ? Number(m[0]) : null
}

/** Build ISO YYYY-MM-DD from numeric parts, returning null if it isn't a real date. */
function toIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(Date.UTC(year, month - 1, day))
  // Reject overflow (e.g. Feb 30 rolls into March).
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null
  }
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

/**
 * Parse a calendar date cell to ISO YYYY-MM-DD, or null.
 * - ISO (with optional time) passes through.
 * - M/D/YYYY and M/D/YY are reordered (US month-first); 2-digit years → 2000+.
 * - Bare M/D uses `yearHint` when given; otherwise the nearest non-future year
 *   relative to `today` (a Dec date seen in June belongs to last year).
 */
export function parseCalendarDate(
  raw: string | undefined,
  opts: { yearHint?: number | null; today?: Date } = {},
): string | null {
  if (raw == null) return null
  const s = raw.trim()
  if (PLACEHOLDERS.has(s.toLowerCase())) return null

  // ISO YYYY-MM-DD (optionally followed by time)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return toIso(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  // M/D, M/D/YY, M/D/YYYY (US month-first)
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/)
  if (slash) {
    const month = Number(slash[1])
    const day = Number(slash[2])
    if (slash[3] != null) {
      const y = Number(slash[3])
      const year = slash[3].length === 2 ? 2000 + y : y
      return toIso(year, month, day)
    }
    // No year in the cell.
    if (opts.yearHint != null) return toIso(opts.yearHint, month, day)
    const today = opts.today ?? new Date()
    const y0 = today.getUTCFullYear()
    const candidate = toIso(y0, month, day)
    if (!candidate) return null
    const todayIso = today.toISOString().slice(0, 10)
    return candidate <= todayIso ? candidate : toIso(y0 - 1, month, day)
  }

  return null
}
