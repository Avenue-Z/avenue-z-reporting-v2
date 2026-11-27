// "Used as a source" for the AEO Overview v2 (Profound), shared by section 02's brand table and section 03's gauges.
// Profound has no per-answer retrieval metric, so the figure is citation share: the share of the given citations (one
// window, or one model in that window) pointing at the asset's domains.
import { bareDomain, sameOrSubdomain } from '@/lib/aeo-outbound/own-rows'
import { assetDomains, type ProfoundAsset } from './assets'
import type { ProfoundNamedRow } from './report-rows'

/** Percent of the citations pointing at the asset's domains. Null when the asset has no domain or there are no citation
 *  rows at all (no figure, never a fabricated 0; Peec's rule in lib/aeo/v2/used-as-source.ts). */
export function usedAsSource(asset: ProfoundAsset, cites: readonly ProfoundNamedRow[] | undefined): number | null {
  const sites = assetDomains(asset).map(bareDomain).filter(Boolean)
  if (sites.length === 0 || !cites || cites.length === 0) return null
  let sum = 0
  for (const c of cites) {
    const host = c.dims.hostname
    if (!host) continue
    const h = bareDomain(host)
    if (sites.some((s) => sameOrSubdomain(h, s))) sum += (c.metrics.citation_share ?? 0) * 100
  }
  return sum
}
