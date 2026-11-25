// The Postgres SQLSTATE of a failed query, never its message (a message can carry values). Drizzle wraps the driver's
// error, so the code can sit on a `cause` a level or two down; the walk stops after four levels, so a cause chain that
// loops still ends. Pure: the page's read (store.ts) and the section's log line (section.tsx) both use it.

/** undefined_table: the query named a table this database does not have (a migration not applied yet). */
export const UNDEFINED_TABLE = '42P01'

export function sqlState(e: unknown): string {
  let cur: unknown = e
  for (let i = 0; i < 4 && typeof cur === 'object' && cur !== null; i++) {
    const code = (cur as { code?: unknown }).code
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code
    cur = (cur as { cause?: unknown }).cause
  }
  return 'none'
}
