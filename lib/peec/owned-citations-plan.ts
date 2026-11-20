// Orchestration for the merged content table's owned URL citations (D-10, D-17, R8).
// Pure apart from the injected fetcher, so the gates are unit-testable.
import type { OwnedUrlCitations } from './url-citations'

export const OWNED_UNAVAILABLE: OwnedUrlCitations = { rows: [], totalCitationCount: 0, complete: false }

type Fetcher = (
  clientSlug: string,
  ownedHosts: string[],
  opts?: { startDate: string; endDate: string },
) => Promise<OwnedUrlCitations>

export async function planOwnedCitations(input: {
  clientSlug: string
  ownedHosts: string[]
  dateRange: string
  compareDates: { startDate: string; endDate: string } | null
  fetcher: Fetcher
  onError?: (label: string, reason: unknown) => void
}): Promise<{ owned: OwnedUrlCitations; ownedPrior: OwnedUrlCitations | null }> {
  const { clientSlug, dateRange, compareDates, fetcher, onError } = input
  // No Own domain: an empty-host walk would filter every row out and report a
  // "complete" zero, so every row would read 0.0% instead of --.
  if (input.ownedHosts.length === 0) {
    return { owned: OWNED_UNAVAILABLE, ownedPrior: compareDates ? OWNED_UNAVAILABLE : null }
  }
  const hosts = [...input.ownedHosts].sort()
  // R8: current owned citations are fixed at the last 30 days (D-10), so a prior
  // comparison is only like-for-like when the page range is last_30_days.
  const wantPrior = !!compareDates && dateRange === 'last_30_days'
  const [cur, pri] = await Promise.allSettled([
    fetcher(clientSlug, hosts),
    wantPrior ? fetcher(clientSlug, hosts, compareDates!) : Promise.resolve(null),
  ])
  if (cur.status === 'rejected') onError?.('current', cur.reason)
  if (pri.status === 'rejected') onError?.('prior', pri.reason)
  return {
    owned: cur.status === 'fulfilled' ? cur.value : OWNED_UNAVAILABLE,
    ownedPrior: !wantPrior ? null : pri.status === 'fulfilled' && pri.value ? pri.value : OWNED_UNAVAILABLE,
  }
}
