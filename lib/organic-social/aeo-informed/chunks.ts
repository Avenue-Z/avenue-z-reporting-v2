// lib/organic-social/aeo-informed/chunks.ts
// Pull a dated report in chunks of at most 31 days, one request each, never with an offset.
// Why: Peec's offset pagination can shift under ties (rows missed or repeated), and repeated (url, date) rows are legitimate, so a duplicate
// check cannot catch it. Counts add across days (a chat belongs to one day), so chunk results are simply concatenated and summed by the caller.
// Measured on one real project: a 31-day span of by-day rows is a few thousand rows, and chat-level rows run about 1.4 to 1.8 times that, so a 31-day chunk
// normally fits one 10,000-row page. A denser project gets split chunks automatically.
import { PeecPageCapError, type PeecReader } from './peec-read'
import { assertIsoDate, daysIn, type Window } from './windows'

const PAGE = 10_000
const DAY_MS = 86_400_000
const addDays = (s: string, n: number) => new Date(Date.parse(`${s}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)

/** Consecutive, non-overlapping windows covering `w`, each at most `maxDays` long. */
export function chunkWindow(w: Window, maxDays = 31): Window[] {
  if (!Number.isInteger(maxDays) || maxDays < 1) throw new RangeError(`maxDays must be a whole number of at least 1, got ${maxDays}`)
  assertIsoDate(w.start); assertIsoDate(w.end)
  const total = daysIn(w)
  const out: Window[] = []
  for (let off = 0; off < total; off += maxDays) {
    out.push({ start: addDays(w.start, off), end: addDays(w.start, Math.min(off + maxDays, total) - 1) })
  }
  return out
}

export type PullOptions = { chunkDays?: number }

/**
 * One request per chunk, never an offset. A chunk that comes back with a full page may be missing rows, so it is split in half and each half is
 * pulled again, down to a single day; a single day that still fills a page throws rather than return a partial day.
 */
export async function pullChunks<T>(
  reader: PeecReader,
  path: string,
  body: Record<string, unknown>,
  w: Window,
  parse: (json: unknown, path: string) => T[],
  label: string,
  opts: PullOptions = {},
): Promise<T[]> {
  const pullSpan = async (c: Window): Promise<T[]> => {
    const l = `${label} ${c.start}..${c.end}`
    const rows = parse(await reader.post(path, { ...body, start_date: c.start, end_date: c.end, limit: PAGE, offset: 0 }, l), path)
    if (rows.length < PAGE) return rows
    const n = daysIn(c)
    if (n === 1) throw new PeecPageCapError(path, l)
    const half = Math.floor(n / 2)
    const left = { start: c.start, end: addDays(c.start, half - 1) }
    const right = { start: addDays(c.start, half), end: c.end }
    return [...(await pullSpan(left)), ...(await pullSpan(right))]
  }
  const out: T[] = []
  for (const c of chunkWindow(w, opts.chunkDays ?? 31)) out.push(...(await pullSpan(c)))
  return out
}
