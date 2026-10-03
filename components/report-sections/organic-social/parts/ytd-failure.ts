// What a YTD block may log about a failed month or a failed client read (fix list X1,
// docs/superpowers/specs/2026-10-02-os-jasmine-call-changes-fix-list.md). Dash's messages hold the request URL, which
// names the brand (lib/dash-social/client.ts), so a message is never logged. Only these are: a Dash error's kind and
// HTTP status; the metric names from the one omitted-metric message (outline-headlines.ts), matched whole; the fixed
// no-metrics message; or an error's class name when it is a plain identifier.
import { DashApiError, DashAuthError, DashRateLimitError, DashTimeoutError } from '@/lib/dash-social/client'

const OMITTED = /^(?:INSTAGRAM|FACEBOOK|TWITTER|LINKEDIN|TIKTOK): Dash omitted requested metric\(s\): ([A-Z0-9_]+(?:, [A-Z0-9_]+)*)$/
const NO_METRICS = /^(?:INSTAGRAM|FACEBOOK|TWITTER|LINKEDIN|TIKTOK): Dash returned no metrics for this brand$/
const SAFE_NAME = /^[A-Za-z][A-Za-z0-9]{0,39}$/

/** Never throws: an error object with a throwing getter, or a hostile proxy, gives `error=other` (a throw here would
 *  replace the real error the block rethrows, and lose the log line). */
export function ytdFailureFields(e: unknown): string {
  try {
    return fields(e)
  } catch {
    return 'kind=other status=none error=other'
  }
}

function fields(e: unknown): string {
  if (e instanceof DashApiError) {
    const kind = e instanceof DashTimeoutError ? 'timeout' : e instanceof DashRateLimitError ? 'rate-limit'
      : e instanceof DashAuthError ? 'auth' : 'api'
    const status = e instanceof DashTimeoutError ? 'none' : (/^(\d{3})\b/.exec(e.message)?.[1] ?? 'none')
    return `kind=${kind} status=${status}`
  }
  const message = e instanceof Error ? e.message : ''
  const omitted = OMITTED.exec(message)
  if (omitted) return `kind=other status=none missing=${omitted[1].split(', ').join(',')}`
  if (NO_METRICS.test(message)) return 'kind=other status=none reason=no-metrics'
  const name = e instanceof Error && SAFE_NAME.test(e.name) ? e.name : 'other'
  return `kind=other status=none error=${name}`
}

export function logYtdMonthFailed(version: 1 | 2 | 3, slug: string, channel: string, month: string, e: unknown): void {
  console.error(`[organic-social] ytd-review@${version} Dash request failed slug=${slug} channel=${channel} month=${month} ${ytdFailureFields(e)}`)
}

export function logYtdClientReadFailed(version: 1 | 2 | 3, slug: string): void {
  console.error(`[organic-social] ytd-review@${version} client read failed slug=${slug}`)
}
