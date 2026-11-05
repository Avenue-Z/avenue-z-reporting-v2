/** A safe label for an error: its string code, else its name, walking .cause (at most 5 deep). Never the message (a Drizzle message carries the SQL params). */
export function errorLabel(e: unknown): string {
  let cur: unknown = e
  for (let i = 0; i < 5 && cur && typeof cur === 'object'; i++) {
    const { code, cause } = cur as { code?: unknown; cause?: unknown }
    if (typeof code === 'string') return code
    cur = cause
  }
  return e instanceof Error ? e.name : 'error'
}
