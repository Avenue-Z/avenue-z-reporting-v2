/** What the Export PDF button asks for. Role and client identity are never here: the route takes them
 *  from the session (app/api/export/pdf/route.ts). Every field is validated strictly, because the
 *  slug and ranges go into the URL the server's own browser opens. */
export interface ExportRequest {
  clientSlug: string
  subsection: string | null
  dateRange: string
  compareRange: string | null
  /** The requester's IANA timezone, for the stamp and the filename date. */
  tz: string
}

const SLUG = /^[a-z0-9-]{1,64}$/
const RANGE = /^[A-Za-z0-9_:,-]{1,64}$/

/** `tz` if it is an IANA timezone this runtime knows, else UTC. */
export function safeTimeZone(tz: unknown): string {
  if (typeof tz !== 'string' || tz.length > 64) return 'UTC'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return tz
  } catch {
    return 'UTC'
  }
}

export function parseExportRequest(body: unknown): ExportRequest | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (typeof b.clientSlug !== 'string' || !SLUG.test(b.clientSlug)) return null
  if (b.subsection != null && (typeof b.subsection !== 'string' || !SLUG.test(b.subsection))) return null
  if (typeof b.dateRange !== 'string' || !RANGE.test(b.dateRange)) return null
  if (b.compareRange != null && (typeof b.compareRange !== 'string' || !RANGE.test(b.compareRange))) return null
  return {
    clientSlug: b.clientSlug,
    subsection: (b.subsection as string | null | undefined) ?? null,
    dateRange: b.dateRange,
    compareRange: (b.compareRange as string | null | undefined) ?? null,
    tz: safeTimeZone(b.tz),
  }
}

/** The export page the server's browser opens for this request (app/export/[clientSlug]/organic-social). */
export function exportPagePath(r: ExportRequest): string {
  const sp = new URLSearchParams()
  sp.set('dateRange', r.dateRange)
  if (r.compareRange) sp.set('compareRange', r.compareRange)
  if (r.subsection) sp.set('subsection', r.subsection)
  sp.set('tz', r.tz)
  return `/export/${r.clientSlug}/organic-social?${sp.toString()}`
}
