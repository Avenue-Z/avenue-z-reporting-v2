// The hub's search text rule, client-safe (no store or db import): the hub box and the server both clean the text with this
// one function, so what Ryan typed and what the page was asked for can't drift.
export const MAX_SEARCH = 100
/** The first value if repeated, control characters and runs of whitespace collapsed, capped; empty is none. */
export function cleanSearch(q: unknown): string | null {
  const raw = Array.isArray(q) ? q[0] : q
  if (typeof raw !== 'string') return null
  const s = raw.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_SEARCH)
  return s || null
}
