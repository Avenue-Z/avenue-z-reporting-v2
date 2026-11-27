/** Section 04's topic matrix mode lives in the URL so the PDF export draws the same columns. */
export const MATRIX_PARAM = 'aeoMatrix'

/** Competitors mode shows the client plus this many competitor columns. */
export const MATRIX_DEFAULT_COMPETITORS = 7

export type MatrixMode = 'competitors' | 'all' | 'platforms'

/** Reads `aeoMatrix`: only `all` and `platforms` are recognised (case-sensitive); anything else is the default. */
export function parseMatrixMode(raw: string | null | undefined): MatrixMode {
  return raw === 'all' || raw === 'platforms' ? raw : 'competitors'
}

/** The param value for a mode; `null` means delete the param (the default). */
export function serializeMatrixMode(m: MatrixMode): string | null {
  return m === 'competitors' ? null : m
}
