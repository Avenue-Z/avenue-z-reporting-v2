// The PDF's name and its stamp, both in the requester's timezone: an export taken in the evening in
// New York is dated that day, not the next UTC day.

// Intl may separate the time and AM/PM with a narrow no-break space; the stamp reads as plain text.
const plain = (s: string) => s.replace(/[\u202f\u00a0]/g, ' ')

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((p) => p.type === type)?.value ?? ''
}

/** YYYY-MM-DD of `now` in `tz`. */
export function localDay(now: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** `Renaissance – Organic Social – 2026-10-06.pdf`, without characters a filesystem rejects. */
export function exportFilename(clientName: string, pageTitle: string, now: Date, tz: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = (s: string) => s.replace(/[/\\:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim()
  return `${clean(clientName)} – ${clean(pageTitle)} – ${localDay(now, tz)}.pdf`
}

/** An attachment header any browser saves under `name`: an ASCII fallback plus the exact UTF-8 name. */
export function contentDisposition(name: string): string {
  const ascii = name.replace(/[–—]/g, '-').replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '')
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

/** `Exported Oct 6, 2026, 10:30 PM EDT · Reporting period Sep 1 – Sep 30, 2026` (period only when given). */
export function exportStamp(now: Date, tz: string, period: string | null): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
  }).formatToParts(now)
  const when = `${part(parts, 'month')} ${part(parts, 'day')}, ${part(parts, 'year')}, ${part(parts, 'hour')}:${part(parts, 'minute')} ${part(parts, 'dayPeriod')} ${part(parts, 'timeZoneName')}`
  const exported = `Exported ${plain(when)}`
  return period ? `${exported} · Reporting period ${period}` : exported
}
