import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { linkedinUrlResolutions } from '@/lib/db/schema'
import { urlJoinKey } from '@/lib/url'
import { parseCanonicalUrl, parseAuthorUrl } from './parse'

export type Resolution = { urlKey: string; canonicalUrl: string | null; authorUrl: string | null; status: 'ok' | 'unresolved' }
export type ResolutionStore = {
  read: (urlKey: string) => Promise<Resolution | null>
  write: (row: Resolution) => Promise<void>
}
type Fetcher = (url: string) => Promise<Omit<Resolution, 'urlKey'>>

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'

/** One live fetch + parse. LinkedIn URNs canonicalize with capital-P 'ugcPost'. */
export async function fetchAndParse(url: string): Promise<Omit<Resolution, 'urlKey'>> {
  const target = url.replace(/ugcpost/i, 'ugcPost')
  const res = await fetch(target, { redirect: 'follow', headers: { 'User-Agent': UA, Accept: 'text/html' } })
  if (res.status === 404 || res.status === 410) return { canonicalUrl: null, authorUrl: null, status: 'unresolved' }
  if (res.status !== 200) throw new Error(`linkedin transient ${res.status}`)
  const html = await res.text()
  const canonicalUrl = parseCanonicalUrl(html)
  const authorUrl = parseAuthorUrl(html)
  return { canonicalUrl, authorUrl, status: canonicalUrl || authorUrl ? 'ok' : 'unresolved' }
}

/** Testable core: read-through cache with injected store + fetcher. Never throws. */
export async function resolveWith(url: string, store: ResolutionStore, fetcher: Fetcher): Promise<Resolution> {
  const urlKey = urlJoinKey(url) ?? url.toLowerCase()
  try {
    const hit = await store.read(urlKey)
    if (hit) return hit
    const parsed = await fetcher(url)
    const row: Resolution = { urlKey, ...parsed }
    try { await store.write(row) } catch { /* persistence is best-effort */ }
    return row
  } catch {
    return { urlKey, canonicalUrl: null, authorUrl: null, status: 'unresolved' }
  }
}

const dbStore: ResolutionStore = {
  read: async (urlKey) => {
    const rows = await db.select().from(linkedinUrlResolutions).where(eq(linkedinUrlResolutions.urlKey, urlKey))
    const r = rows[0]
    return r ? { urlKey: r.urlKey, canonicalUrl: r.canonicalUrl, authorUrl: r.authorUrl, status: r.status as 'ok' | 'unresolved' } : null
  },
  write: async (row) => {
    await db.insert(linkedinUrlResolutions)
      .values({ urlKey: row.urlKey, canonicalUrl: row.canonicalUrl, authorUrl: row.authorUrl, status: row.status })
      .onConflictDoNothing({ target: linkedinUrlResolutions.urlKey })
  },
}

/** Production entry point: DB-cached resolution. */
export function getResolution(url: string): Promise<Resolution> {
  return resolveWith(url, dbStore, fetchAndParse)
}
