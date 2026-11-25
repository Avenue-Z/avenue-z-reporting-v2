// The next URL for a Social Listening control (issue #529, Paul's #518 review). Every control that writes the URL (the
// Line / Columns toggles, the authors sort, the Brand / Industry pills and Preview as client) builds its URL here.
//
// Why: Next's useSearchParams follows the router's committed URL, which only changes once a navigation lands (after the
// server render comes back; node_modules/next/dist/client/components/app-router.js derives it from `canonicalUrl`). A
// control that built its URL from it alone dropped the change of a second click made before the first one landed, and the
// PDF, whose settings the server reads from the URL, stopped matching the screen.
//
// How: one pending chain for the browser tab. Each URL built here is recorded as the newest; the next build starts from it
// instead of the committed URL while the committed URL is still one this chain started from or made. Once the newest URL
// lands, nothing is pending. A committed URL the chain did not make (another page, the date picker, Back) means something
// else navigated, so the chain is dropped and the build starts from what is on screen. Browser only: it is called from
// click handlers, never during a render. The chain holds the URLs of one burst of clicks, and is cleared when it lands.

type Chain = { known: Set<string>; newest: string }
let chain: Chain | null = null

const hrefOf = (pathname: string, search: string) => (search ? `${pathname}?${search}` : pathname)

/** The URL after `edit`, built on the newest URL not yet landed, else on `committed` (useSearchParams().toString()). */
export function nextHref(pathname: string, committed: string, edit: (params: URLSearchParams) => void): string {
  const now = hrefOf(pathname, committed)
  if (chain && (!chain.known.has(now) || chain.newest === now)) chain = null
  const from = chain?.newest ?? now
  const q = from.indexOf('?')
  const params = new URLSearchParams(q < 0 ? '' : from.slice(q + 1))
  edit(params)
  const href = hrefOf(pathname, params.toString())
  if (chain) {
    chain.known.add(href)
    chain.newest = href
  } else {
    chain = { known: new Set([now, href]), newest: href }
  }
  return href
}

/** Drops anything pending. For tests, which share this module between cases. */
export function forgetPendingUrl(): void {
  chain = null
}
