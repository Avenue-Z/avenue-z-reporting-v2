import { KeywordsTableClient } from './keywords-table-client'
import type { KeywordsData } from '@/lib/paid-search/keywords'

// RSC: the server fetch (getKeywordsData) aggregates both views (≥10-clicks
// filtered + all) and sends only the top-10 rows + totals per view — never the
// full long tail. The client wrapper just toggles between the two views.
export function KeywordsTable({ data }: { data: KeywordsData }) {
  return <KeywordsTableClient data={data} />
}
