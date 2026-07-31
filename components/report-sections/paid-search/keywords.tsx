import { KeywordsTableClient } from './keywords-table-client'
import type { KeywordRow } from '@/lib/paid-search/types'

// RSC: the server fetch (getKeywordRows) now returns the FULL keyword set; the
// client wrapper owns the ≥10-clicks filter, the total over the filtered set,
// and the top-10 display. Only serializable data crosses the boundary.
export function KeywordsTable({ rows }: { rows: KeywordRow[] }) {
  return <KeywordsTableClient rows={rows} />
}
