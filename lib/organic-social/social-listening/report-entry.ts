// lib/organic-social/social-listening/report-entry.ts
// The check behind entering a delivered report's media counts and top authors onto its history row (plan
// docs/superpowers/plans/2026-11-24-social-listening-feedback.md, Unit D). The numbers are read off the delivered deck by hand,
// so every name is checked against the month's upload: a misspelled media type would otherwise compare with nothing and read
// n/a forever, and an author's id (the deck shows none) comes from the upload's row with the same name and network. Pure.
import type { SlExport, SlHistoryAuthor, SlHistoryMedia } from './types'

export type ReportEntryInput = {
  media: { media: string; count: number }[]
  authors: { name: string; network: string; posts: number }[]
}
export type ReportEntryResult = { ok: true; media: SlHistoryMedia[]; authors: SlHistoryAuthor[] } | { ok: false; errors: string[] }

const isCount = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0
/** A network as Talkwalker writes it ("SOCIALMEDIA_INSTAGRAM") or as a deck does ("Instagram"), compared as plain letters. */
const net = (s: string) => s.toUpperCase().replace(/^SOCIALMEDIA_/, '').replace(/[^A-Z]/g, '')

/** Every problem at once, so one dry run shows them all; nothing is returned to write unless all of it is right. */
export function checkReportEntry(input: ReportEntryInput, upload: SlExport): ReportEntryResult {
  const errors: string[] = []
  if (!Array.isArray(input?.media)) return { ok: false, errors: ['media must be a list'] }
  if (!Array.isArray(input?.authors)) return { ok: false, errors: ['authors must be a list'] }

  const known = new Set(upload.sentimentByMedia.map((r) => r.media))
  const seen = new Set<string>()
  const media: SlHistoryMedia[] = []
  for (const m of input.media) {
    const name = typeof m?.media === 'string' ? m.media : ''
    if (seen.has(name)) { errors.push(`media "${name}" is listed twice`); continue }
    seen.add(name)
    if (!known.has(name)) { errors.push(`media "${name}" is not a media type in the ${upload.month} upload`); continue }
    if (!isCount(m.count)) { errors.push(`media "${name}" needs a whole count of 0 or more`); continue }
    media.push({ media: name, count: m.count })
  }

  const authors: SlHistoryAuthor[] = []
  for (const a of input.authors) {
    const name = typeof a?.name === 'string' ? a.name : ''
    const network = typeof a?.network === 'string' ? a.network : ''
    if (!isCount(a?.posts)) { errors.push(`author "${name}" needs a whole post count of 0 or more`); continue }
    const hits = (upload.influencers ?? []).filter((i) => i.name === name && net(i.network) === net(network))
    if (hits.length !== 1) { errors.push(`author "${name}" on ${network} is not in the ${upload.month} upload`); continue }
    authors.push({ authorId: hits[0].authorId, name, network, posts: a.posts })
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, media, authors }
}
