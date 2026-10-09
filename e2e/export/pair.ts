// A staff editor's export and a client's export of the same view, compared, for the export acceptance run
// (./acceptance.mts).
//
// The data caches serve stale-while-revalidate: the first request after an entry expires gets the stale value while it
// refreshes in the background. After the app has sat idle, the staff export (first) can get stale numbers and the
// client export a few seconds later fresh ones, so the pair differs by real data that no role logic caused (seen
// 2026-10-09: 274 vs 275 crawled pages, 41,898 vs 42,353 sessions). The caches are warm after the first pair, so a
// differing pair is exported once more, and only a second difference counts.

export interface PairResult<T> {
  staff: T | null
  client: T | null
  /** null when the two print the same (or one failed to export: its own checks report that). */
  difference: string | null
  /** The first pair's difference when the pair was exported twice, for a note line. */
  retried: string | null
}

/** `exportStaff` / `exportClient` are called with the attempt number (1, then 2 on a retry); `differ` gives null when
 *  the two print the same, else what differs. */
export async function exportPair<T>(
  exportStaff: (attempt: number) => Promise<T | null>,
  exportClient: (attempt: number) => Promise<T | null>,
  differ: (staff: T, client: T) => string | null,
): Promise<PairResult<T>> {
  const staff = await exportStaff(1)
  const client = await exportClient(1)
  if (!staff || !client) return { staff, client, difference: null, retried: null }
  const first = differ(staff, client)
  if (first === null) return { staff, client, difference: null, retried: null }

  const staff2 = await exportStaff(2)
  const client2 = await exportClient(2)
  if (!staff2 || !client2) return { staff, client, difference: first, retried: first }
  return { staff: staff2, client: client2, difference: differ(staff2, client2), retried: first }
}
