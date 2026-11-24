// Test data only: the rule in section 3 of docs/superpowers/specs/2026-11-24-os-design-past-months.md, one row per
// line of its table and edge. Every surface's tests (the rule, the body, both boxes, the AEO tab) run these same rows,
// so the surfaces cannot disagree. Every month is one the surface tests can serve on their clock (2026-11-24, firstMonth
// 2026-08: staff 2026-08 to 2026-11, a client 2026-08 to 2026-10); `month: null` is a client without reportingMonths.
// `designFrom` omitted means the key is absent.

export type DesignFromRow = { name: string; designFrom?: unknown; month: string | null; kit: boolean }

const malformed: unknown[] = [null, '2026-13', '2026-1', 202611, '2026-11-01', ' 2026-11']

export const DESIGN_FROM_ROWS: DesignFromRow[] = [
  { name: 'absent, October: old', month: '2026-10', kit: false },
  { name: 'absent, November: old', month: '2026-11', kit: false },
  { name: 'absent, no month: old', month: null, kit: false },
  ...malformed.map((designFrom) => ({ name: `malformed ${JSON.stringify(designFrom)}, October: old`, designFrom, month: '2026-10', kit: false })),
  { name: 'malformed "2026-13", no month: old', designFrom: '2026-13', month: null, kit: false },
  { name: 'valid 2026-11, October (before it): old', designFrom: '2026-11', month: '2026-10', kit: false },
  { name: 'valid 2026-11, November (the month itself): kit', designFrom: '2026-11', month: '2026-11', kit: true },
  { name: 'valid 2026-11, no month: old', designFrom: '2026-11', month: null, kit: false },
  { name: 'valid 2026-09, October (after it): kit', designFrom: '2026-09', month: '2026-10', kit: true },
  { name: 'valid 2027-01, November (later than every open month): old', designFrom: '2027-01', month: '2026-11', kit: false },
]

/** A client row for a test: `dashSocialConfig` holds `brandId`, the row's `designFrom` key when present, and `extra`. */
export function rowConfig(row: DesignFromRow, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { brandId: 1, ...('designFrom' in row ? { designFrom: row.designFrom } : {}), ...extra }
}
