/**
 * Shopify OAuth (authorization_code grant) helpers — pure logic, server-side.
 * Ported from begin-health-dashboard's WebApp.gs. Used by the one-time install
 * bootstrap (app/api/shopify/{install,callback}) to mint an offline `shpat_`
 * Admin API token for a custom-distribution app.
 */
import crypto from 'node:crypto'

const SHOP_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/

/** Guard against open-redirect / SSRF: only real *.myshopify.com shop domains. */
export function isValidShop(shop: string): boolean {
  return SHOP_RE.test(shop)
}

/** Build Shopify's /admin/oauth/authorize URL (offline token — no per-user grant). */
export function buildInstallUrl(p: {
  shop: string
  clientId: string
  scopes: string
  redirectUri: string
  state: string
}): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    scope: p.scopes,
    redirect_uri: p.redirectUri,
    state: p.state,
  })
  return `https://${p.shop}/admin/oauth/authorize?${q.toString()}`
}

/**
 * Verify Shopify's callback HMAC: drop `hmac`, sort remaining params, join as
 * `key=value` with `&`, HMAC-SHA256 with the app secret, timing-safe compare.
 */
export function verifyHmac(params: Record<string, string>, secret: string): boolean {
  const { hmac, ...rest } = params
  if (!hmac) return false
  const message = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join('&')
  const digest = crypto.createHmac('sha256', secret).update(message).digest('hex')
  const a = Buffer.from(digest, 'utf8')
  const b = Buffer.from(hmac, 'utf8')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export interface TokenResult {
  access_token: string
  scope: string
}

/** Exchange the authorization code for an offline access token. */
export async function exchangeCodeForToken(p: {
  shop: string
  clientId: string
  clientSecret: string
  code: string
  fetchImpl?: typeof fetch
}): Promise<TokenResult> {
  const fetchImpl = p.fetchImpl ?? fetch
  const res = await fetchImpl(`https://${p.shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: p.clientId, client_secret: p.clientSecret, code: p.code }),
  })
  if (!res.ok) {
    throw new Error(`Shopify token exchange failed: HTTP ${res.status} ${(await res.text()).slice(0, 500)}`)
  }
  const json = (await res.json()) as Partial<TokenResult>
  if (!json.access_token) throw new Error(`No access_token in response: ${JSON.stringify(json)}`)
  return { access_token: json.access_token, scope: json.scope ?? '' }
}
