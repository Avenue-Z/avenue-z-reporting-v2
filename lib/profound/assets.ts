import { cached } from '@/lib/cache'
import { profoundGet } from './client'

export type ProfoundAsset = {
  name: string
  website: string | null
  alternateDomains: string[]
  isOwned: boolean
}

type RawAsset = {
  name: string
  website: string | null
  alternate_domains: string[] | null
  is_owned: boolean
}

async function getProfoundAssetsImpl(categoryId: string): Promise<ProfoundAsset[]> {
  const raw = (await profoundGet(`/v1/org/categories/${categoryId}/assets`)) as RawAsset[]
  return raw.map((a) => ({
    name: a.name,
    website: a.website ?? null,
    alternateDomains: a.alternate_domains ?? [],
    isOwned: !!a.is_owned,
  }))
}

/** The category's tracked brands (owned first-party plus competitors). */
export const getProfoundAssets = cached('profound', 'getAssets', getProfoundAssetsImpl, {
  version: 'v1',
  ttlSeconds: 86_400,
  healthCritical: false,
  extractTags: ([categoryId]) => ({ category: categoryId }),
})

/** A website as Profound stores it (possibly a URL) as a bare lowercase host: no protocol, path, query, port or trailing dot. */
function hostOf(raw: string): string {
  return raw.trim().toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d*$/, '')
    .replace(/\.+$/, '')
}

/** The asset's website and alternate domains as bare hosts, empty entries dropped. */
export function assetDomains(a: ProfoundAsset): string[] {
  return [a.website, ...a.alternateDomains].filter((d): d is string => !!d).map(hostOf).filter(Boolean)
}
