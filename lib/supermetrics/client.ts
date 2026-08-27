/**
 * Supermetrics enterprise API client — server-side only.
 *
 * The /query/data/json endpoint responds synchronously for normal queries:
 *   { meta: { schedule_id, status_code: 'SUCCESS' }, data: [[header...], ...rows] }
 * For very large/queued queries it can return a schedule_id without data; we
 * then poll the same endpoint by schedule_id until the data array appears.
 *
 * Per-client API key is passed in by the caller (read from the env var named in
 * clients.smApiKeyEnvVar).
 */
import { DS_IDS } from './constants'
import { SmQueryError, SmTimeoutError, type SmQueryParams, type SmResult } from './types'

export { DS_IDS }
export * from './types'

const BASE = 'https://api.supermetrics.com/enterprise/v2'

// Per-request hang guard. A healthy SM query responds in ~3s; a broken data
// source (e.g. a disconnected Shopify connection) never responds at all, so a
// request still pending well past the healthy window is hung, not slow. Aborting
// surfaces an error instead of an indefinite spinner. The overall async-query
// budget is bounded separately by maxPolls in smQuery (~60s).
const REQUEST_TIMEOUT_MS = 15000

// Bounds the retry budget for BOTH kinds of vendor-side blip: a socket-level
// failure (see isTransientNetworkError) and an HTTP 5xx (see the branch in
// call()). The name predates the 5xx case and is kept only to avoid churning
// call sites; read it as "transient-failure retries", not "network retries".
//
// Observed live on staging (2026-08-26): a single `write ETIMEDOUT` (errno
// -110) on a cold render, and separately a `Supermetrics 500`. Before this,
// only HTTP 429 was retried and everything else propagated on the first try, so
// one blip lasting seconds killed every query in flight at once. For the
// Executive Overview that meant all four pipeline queries degrading together
// and the degraded object being cached for an hour: seconds of vendor trouble,
// an hour of dashed tiles.
//
// 2 retries = 3 total attempts. Deliberately small: see the 5xx branch for why
// the ceiling matters even when retrying cannot possibly help.
const MAX_NETWORK_RETRIES = 2
const RETRY_DELAY_MS = 500

const TRANSIENT_CODES = new Set([
  'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'EAI_AGAIN',
  'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT',
])

/**
 * Whether a thrown error is a TRANSPORT blip worth retrying — the fetch itself
 * never completed, so there is no HTTP status to reason about.
 *
 * Scope, stated precisely because the previous version of this docblock was
 * wrong and cost us an incident: HTTP statuses are NOT decided here. 429 and
 * 5xx are retried by call() directly, from the response, before anything is
 * thrown. What does reach this function is the SmQueryError raised once those
 * branches are done with a response (a 4xx, or a 5xx whose retries are spent) —
 * and it returns false for those, which is what keeps them from being retried
 * a second time through the catch.
 *
 * An AbortError is our OWN hang guard firing and is explicitly excluded:
 * retrying it would multiply the 60s Salesforce ceiling into minutes and blow
 * the function budget, which is the opposite of what that guard exists to do.
 */
function isTransientNetworkError(e: unknown): boolean {
  if (!(e instanceof Error) || e.name === 'AbortError') return false
  const code = (e as { code?: unknown }).code ?? (e.cause as { code?: unknown } | undefined)?.code
  if (typeof code === 'string' && TRANSIENT_CODES.has(code)) return true
  // Node wraps every socket-level failure as `TypeError: fetch failed` with the
  // real reason on .cause, and that cause does not always carry a code we know.
  // The wrapper shape itself is the signal.
  return e instanceof TypeError && e.message === 'fetch failed'
}

/**
 * Retry-After as milliseconds, or null when the header is absent or is not a
 * form we can act on. Capped at CAP_S so a vendor asking us to wait ten minutes
 * cannot park a request past the function budget.
 *
 * Both the delta-seconds and the HTTP-date form are accepted. The date form
 * matters here: `Number('Wed, 26 Aug 2026 16:32:44 GMT')` is NaN, and
 * `setTimeout(NaN)` fires immediately, so parsing it as a number would turn a
 * back-off request into a hot retry loop.
 */
function retryAfterMs(res: Response): number | null {
  const raw = res.headers.get('Retry-After')
  if (!raw) return null
  const CAP_S = 10
  const secs = Number(raw)
  if (Number.isFinite(secs)) return Math.min(Math.max(secs, 0), CAP_S) * 1000
  const at = Date.parse(raw)
  if (Number.isNaN(at)) return null
  return Math.min(Math.max(at - Date.now(), 0), CAP_S * 1000)
}

/**
 * Release the socket for a response we are not going to read.
 *
 * undici keeps the connection checked out until the body is consumed or
 * cancelled. Recursing (or throwing) straight off an unread response leaves it
 * pinned until GC, so a run of retries can starve the pool of the very
 * connections the retry needs.
 */
async function discardBody(res: Response): Promise<void> {
  try {
    await res.body?.cancel()
  } catch {
    // Already consumed, already errored, or no body at all. Nothing to release.
  }
}

async function call(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  attempt = 0,
  retryDelayMs = RETRY_DELAY_MS,
): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetchImpl(url, { ...init, signal: controller.signal })
    if (res.status === 429) {
      if (attempt >= 3) {
        throw new SmQueryError('Supermetrics rate limit: retries exhausted', 429)
      }
      // Header read before the body is released, so the two cannot get reordered
      // into reading a header off a cancelled response.
      const wait = retryAfterMs(res) ?? 2000
      await discardBody(res)
      await new Promise((r) => setTimeout(r, wait))
      return call(url, init, fetchImpl, timeoutMs, attempt + 1, retryDelayMs)
    }
    // A 5xx gets the same bounded retry as a socket failure. Observed live on
    // staging (2026-08-26): `Supermetrics 500` on the wide open-pipeline query
    // while the other three queries in the same fan-out succeeded. One 500
    // degraded the tiles, and because a partial degrade is still a fulfilled
    // result, the degraded object was cached over a good entry: tiles that had
    // been showing real figures reverted to dashes for the rest of the TTL.
    //
    // The justification is NOT "a 5xx is the vendor failing rather than an
    // answer about the query". This repo's own evidence refutes that: Supermetrics
    // returns a deterministic 500 for `convert_to_default_currency: true` on an
    // org without multi-currency ("Currency conversion failed…"), which is an
    // answer about the query wearing a 5xx (see OPEN_SETTINGS in
    // lib/salesforce/pipeline.ts). A stale rationale trusted at face value is
    // what produced the incident above, so this one is stated at its real
    // strength: a 5xx is AMBIGUOUS, and nothing in the response separates the
    // two cases.
    //
    // We retry because the payoff is lopsided, not because the vendor is
    // presumed innocent. Getting it wrong on a transient 500 used to cost an
    // hour of dashed client-facing tiles; getting it wrong on a deterministic
    // 500 costs 2 extra round trips and ~1.5s of back-off to reach the identical
    // error. That asymmetry is the whole argument, and it is why the retry
    // budget stays at 2 — enough to ride out a blip, too small for a permanent
    // failure to be expensive.
    //
    // 4xx stays unretried. A 400 or a 404 IS an answer about this query and will
    // say the same thing three times.
    if (res.status >= 500 && attempt < MAX_NETWORK_RETRIES) {
      // 503 in particular tends to carry Retry-After, and the vendor's own
      // estimate beats our guess; exponential back-off is the fallback.
      const wait = retryAfterMs(res) ?? retryDelayMs * 2 ** attempt
      await discardBody(res)
      await new Promise((r) => setTimeout(r, wait))
      return call(url, init, fetchImpl, timeoutMs, attempt + 1, retryDelayMs)
    }
    if (!res.ok) {
      // Reached by a 4xx, and by a 5xx whose retry budget is spent. Either way
      // the body is never read, so release the socket before unwinding.
      await discardBody(res)
      throw new SmQueryError(`Supermetrics ${res.status}`, res.status)
    }
    return await res.json()
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new SmTimeoutError(`Supermetrics request timed out after ${timeoutMs}ms`)
    }
    if (isTransientNetworkError(e) && attempt < MAX_NETWORK_RETRIES) {
      // Exponential, so a source that is briefly unreachable is not hammered.
      // The timer above is cleared in `finally` and a fresh one is armed by the
      // recursive call, so each attempt gets the full timeout rather than a
      // shrinking slice of the first one's budget.
      clearTimeout(timer)
      await new Promise((r) => setTimeout(r, retryDelayMs * 2 ** attempt))
      return call(url, init, fetchImpl, timeoutMs, attempt + 1, retryDelayMs)
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

export async function smQuery(
  p: SmQueryParams,
  opts: { pollMs?: number; maxPolls?: number; timeoutMs?: number; retryDelayMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<SmResult> {
  const fetchImpl = opts.fetchImpl ?? fetch
  const pollMs = opts.pollMs ?? 1500
  const maxPolls = opts.maxPolls ?? 40 // ~60s ceiling
  const timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS
  // Shortened by tests; production always takes the constant.
  const retryDelayMs = opts.retryDelayMs ?? RETRY_DELAY_MS
  const headers = { Authorization: `Bearer ${p.apiKey}`, 'Content-Type': 'application/json' }

  type SmField = { field_id: string; data_column: number }
  type SmResponse = {
    meta?: { schedule_id?: string; status_code?: string; query?: { fields?: SmField[] } }
    data?: string[][]
  }

  // The data[0] header row uses human display names ("Campaign name"); we key
  // rows by canonical field_id (from meta.query.fields) so callers can read
  // r.Campaignname / r.Weekiso / r.ConversionTypeName regardless of display name.
  const fieldHeader = (r: SmResponse): string[] | null => {
    const f = r.meta?.query?.fields
    if (!f?.length) return null
    return f.slice().sort((a, b) => a.data_column - b.data_column).map((x) => x.field_id)
  }

  const submit = (await call(`${BASE}/query/data/json`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      ds_id: p.dsId,
      ds_accounts: [p.dsAccounts],
      fields: p.fields,
      date_range_type: 'custom',
      start_date: p.dateRange.split(',')[0],
      end_date: p.dateRange.split(',')[1],
      max_rows: p.maxRows ?? 10000,
      ...(p.filters ? { filter: p.filters } : {}),
      ...(p.settings ? { settings: p.settings } : {}),
    }),
  }, fetchImpl, timeoutMs, 0, retryDelayMs)) as SmResponse

  if (submit.meta?.status_code && submit.meta.status_code !== 'SUCCESS') {
    throw new SmQueryError(`Supermetrics status ${submit.meta.status_code}`)
  }
  // Synchronous result: the data array is present in the submit response.
  if (Array.isArray(submit.data)) {
    return { header: fieldHeader(submit) ?? submit.data[0] ?? [], rows: submit.data.slice(1) }
  }

  // Async fallback: a schedule_id was returned without data — poll by id until ready.
  const scheduleId = submit.meta?.schedule_id
  if (!scheduleId) throw new SmQueryError('Supermetrics response had neither data nor schedule_id')

  for (let i = 0; i < maxPolls; i++) {
    await new Promise((r) => setTimeout(r, pollMs))
    const out = (await call(`${BASE}/query/data/json/${scheduleId}`, { headers }, fetchImpl, timeoutMs, 0, retryDelayMs)) as SmResponse
    if (out.meta?.status_code === 'FAILURE') throw new SmQueryError('Supermetrics query failed')
    if (Array.isArray(out.data)) {
      return { header: fieldHeader(out) ?? out.data[0] ?? [], rows: out.data.slice(1) }
    }
  }
  throw new SmTimeoutError()
}

// fieldIds overrides the result header so callers can key rows by the field IDs
// they requested (e.g. a [dim, metric] pair), independent of SM's header labels.
export function parseSmRows(result: SmResult, fieldIds?: string[]): Record<string, string>[] {
  const keys = fieldIds ?? result.header
  return result.rows.map((row) => Object.fromEntries(keys.map((k, i) => [k, row[i] ?? ''])))
}
