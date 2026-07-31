// Pure HTML extractors for LinkedIn page resolution. No I/O. Regex, not a DOM parser —
// we only need two well-known head elements, and these pages are large.

/** Public canonical URL: <link rel="canonical" href>, falling back to og:url. */
export function parseCanonicalUrl(html: string): string | null {
  return (
    html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1] ??
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i)?.[1] ??
    html.match(/<meta[^>]+property=["']og:url["'][^>]*content=["']([^"']+)["']/i)?.[1] ??
    null
  )
}

/** JSON-LD author.url (the author's LinkedIn profile or company page). */
export function parseAuthorUrl(html: string): string | null {
  const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  for (const b of blocks) {
    try {
      const json = JSON.parse(b[1])
      for (const node of Array.isArray(json) ? json : [json]) {
        const authorUrl = node?.author?.url
        if (typeof authorUrl === 'string') return authorUrl
      }
    } catch { /* not the block we want */ }
  }
  return null
}
