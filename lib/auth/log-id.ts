/** A short, stable, non-personal id for access logs, so two people at one client can be told apart
 *  without the email ever being written: the first 4 bytes of HMAC-SHA-256(secret, lowercased email)
 *  as hex. Keyed with the app's own AUTH_SECRET, so someone holding the logs and a list of candidate
 *  emails still cannot reverse it. With no secret it says "unkeyed" rather than write an unkeyed hash. */
export async function logId(email: string | null | undefined, secret: string | undefined = process.env.AUTH_SECRET): Promise<string> {
  if (!email) return 'none'
  if (!secret) return 'unkeyed'
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(email.toLowerCase()))
  return [...new Uint8Array(mac).slice(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** How much of a caller-controlled value (a path or a slug) a refusal line keeps. */
const VALUE_MAX = 120

/** The one "[access] ..." line every refusal logs: the event, then the caller-controlled value if there is one,
 *  then role, client and the keyed id. The value is capped at VALUE_MAX characters and written as a JSON string,
 *  with the two line separators JSON leaves alone escaped too, so nothing in a URL can start a new log line. */
export async function refusalLine(
  event: string,
  who: { role?: string | null; clientSlug?: string | null; email?: string | null } | undefined,
  value?: [name: string, raw: string],
): Promise<string> {
  const shown = value
    ? ` ${value[0]}=${JSON.stringify(value[1].slice(0, VALUE_MAX)).replace(/[\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16)}`)}`
    : ''
  return `[access] ${event}${shown} role=${who?.role ?? 'none'} client=${who?.clientSlug ?? 'none'} who=${await logId(who?.email)}`
}
