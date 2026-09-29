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
