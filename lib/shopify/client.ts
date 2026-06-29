/**
 * ShopifyQL client over the Shopify Admin GraphQL API (`shopifyqlQuery`).
 * Ported from begin-health-dashboard's Shopify.gs. Server-side only.
 *
 * A binding stores a ShopifyQL *body* (FROM…SHOW…WHERE…) without a date clause;
 * we append `SINCE <start> UNTIL <end>` per requested range and sum the first
 * column of the returned table (single aggregate value).
 */

const DEFAULT_API_VERSION = '2026-04'

/** Rejected ShopifyQL query, GraphQL error, or HTTP failure. */
export class ShopifyQlError extends Error {}

/** Append the date clause to a ShopifyQL body (body must omit SINCE/UNTIL). */
export function buildShopifyQl(body: string, startDate: string, endDate: string): string {
  return `${body} SINCE ${startDate} UNTIL ${endDate}`
}

export interface TableData {
  columns: { name?: unknown }[]
  rows: Record<string, unknown>[]
}

/** Sum the first column's values across all rows; 0 when empty/missing. */
export function sumFirstColumn(td: TableData | null | undefined): number {
  if (!td || !Array.isArray(td.columns) || !Array.isArray(td.rows)) return 0
  const first = td.columns[0]?.name
  if (typeof first !== 'string') return 0
  let total = 0
  for (const row of td.rows) {
    const n = Number(row?.[first])
    if (Number.isFinite(n)) total += n
  }
  return total
}

export interface ShopifyQlArgs {
  shop: string // e.g. bright-patches.myshopify.com
  token: string // Admin API access token (shpca_/shpat_)
  query: string // ShopifyQL body, no date clause
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
}
export interface ShopifyQlOpts {
  apiVersion?: string
  fetchImpl?: typeof fetch
  /** Max attempts on throttle (HTTP 429 / "rate limited" GraphQL error). Default 4. */
  maxAttempts?: number
  /** Base backoff in ms; doubles per retry. Default 500. */
  retryDelayMs?: number
}

/** Shopify signals throttling via HTTP 429 or a GraphQL error message. */
const THROTTLE_RE = /throttl|rate limit/i

const GQL = `query($q: String!){ shopifyqlQuery(query:$q){ parseErrors tableData { columns { name dataType } rows } } }`

/** Run one ShopifyQL query and return the raw TableData (columns + rows).
 *  Retries with exponential backoff when Shopify throttles (the Admin API is
 *  rate-limited, and a dashboard render fans out into many concurrent queries). */
export async function runShopifyQlTable(args: ShopifyQlArgs, opts: ShopifyQlOpts = {}): Promise<TableData> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const apiVersion = opts.apiVersion ?? DEFAULT_API_VERSION
  const maxAttempts = opts.maxAttempts ?? 4
  const retryDelayMs = opts.retryDelayMs ?? 500
  const url = `https://${args.shop}/admin/api/${apiVersion}/graphql.json`
  const q = buildShopifyQl(args.query, args.startDate, args.endDate)
  const body = JSON.stringify({ query: GQL, variables: { q } })

  let lastThrottle = ''
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const delay = retryDelayMs * 2 ** (attempt - 1) * (0.5 + Math.random())
      await new Promise((r) => setTimeout(r, delay))
    }
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': args.token, 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
    })
    if (res.status === 429) { lastThrottle = 'HTTP 429'; continue }
    if (!res.ok) throw new ShopifyQlError(`Shopify Admin API ${res.status}: ${(await res.text()).slice(0, 300)}`)
    const json = (await res.json()) as {
      errors?: { message?: string }[]
      data?: { shopifyqlQuery?: { parseErrors?: string[]; tableData?: TableData | null } }
    }
    if (json.errors?.length) {
      const msg = json.errors.map((e) => e.message).join('; ')
      if (THROTTLE_RE.test(msg)) { lastThrottle = msg; continue }
      throw new ShopifyQlError(`ShopifyQL GraphQL error: ${msg}`)
    }
    const result = json.data?.shopifyqlQuery
    if (!result) throw new ShopifyQlError('Empty shopifyqlQuery response')
    if (result.parseErrors?.length) throw new ShopifyQlError(`ShopifyQL parse error(s): ${result.parseErrors.join('; ')}`)
    return result.tableData ?? { columns: [], rows: [] }
  }
  throw new ShopifyQlError(`Shopify Admin API throttled after ${maxAttempts} attempts: ${lastThrottle}`)
}

/** Run one ShopifyQL query and return the summed first column. */
export async function runShopifyQl(args: ShopifyQlArgs, opts: ShopifyQlOpts = {}): Promise<number> {
  return sumFirstColumn(await runShopifyQlTable(args, opts))
}
