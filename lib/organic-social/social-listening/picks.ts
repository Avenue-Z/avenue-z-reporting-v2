// lib/organic-social/social-listening/picks.ts
// Which authors and overview cards a month shows (plan docs/superpowers/plans/2026-11-24-social-listening-feedback.md,
// Unit F; spec F11: "don't permanently remove authors, only for the current month"). The team picks per month; a pick is a
// row that is never deleted, and the newest row for an item wins. Pure, no I/O.
//
// Author ids and card labels come from an uploaded file, so they are only ever Map keys and Set members, never plain
// object keys ("__proto__" would read back as Object.prototype, #477).
import type { SlExport, SlPick } from './types'

export type { SlPick }
export type SlPickKind = SlPick['kind']
export type SlPickState = SlPick['state']

/** With no pick, the first this many authors in export order are shown: the five the tab showed before picks existed, so
 *  a month nobody has touched looks as it did. */
export const DEFAULT_SHOWN_AUTHORS = 5

type Influencer = NonNullable<SlExport['influencers']>[number]
type Card = NonNullable<SlExport['overview']>[number]

/** A network as Talkwalker's table writes it ("SOCIALMEDIA_INSTAGRAM") or as its cards do ("Instagram"), as plain letters.
 *  Measured on the October export: the most active author's card says "Instagram" where its table row says
 *  "SOCIALMEDIA_INSTAGRAM", with the same name. */
export function networkKey(s: string): string {
  return s.toUpperCase().replace(/^SOCIALMEDIA_/, '').replace(/[^A-Z]/g, '')
}

/** The newest pick per item, ranked by time and then by id, so two picks saved in the same instant still give one answer. */
function newest(picks: readonly SlPick[], kind: SlPickKind): Map<string, SlPickState> {
  const best = new Map<string, SlPick>()
  for (const p of picks) {
    if (p.kind !== kind) continue
    const b = best.get(p.key)
    if (!b || p.at > b.at || (p.at === b.at && p.id > b.id)) best.set(p.key, p)
  }
  return new Map([...best].map(([k, p]) => [k, p.state]))
}

/** Whether each author (by id) and each card (by label) shows this month. An author without a pick shows when it is in the
 *  first DEFAULT_SHOWN_AUTHORS in export order. A card without a pick of its own is hidden only when an author the team
 *  hid has its name and network (D8); an author hidden only by default never hides a card, so an untouched month keeps
 *  every card. A pick for an author or card the upload no longer has is ignored. */
export function applyPicks(influencers: readonly Influencer[], overview: readonly Card[], picks: readonly SlPick[]): {
  authors: Map<string, boolean>; cards: Map<string, boolean>
} {
  const authorPicks = newest(picks, 'author')
  const cardPicks = newest(picks, 'card')
  const authors = new Map(influencers.map((a, i) => {
    const p = authorPicks.get(a.authorId)
    return [a.authorId, p ? p === 'shown' : i < DEFAULT_SHOWN_AUTHORS]
  }))
  const hiddenByTeam = new Set(influencers.filter((a) => authorPicks.get(a.authorId) === 'hidden').map((a) => `${a.name}|${networkKey(a.network)}`))
  const cards = new Map(overview.map((c) => {
    const p = cardPicks.get(c.label)
    return [c.label, p ? p === 'shown' : !hiddenByTeam.has(`${c.who}|${networkKey(c.network)}`)]
  }))
  return { authors, cards }
}

export type SlAuthorSort = 'posts' | 'reach' | 'engagement'

/** Most first by the chosen measure; ties keep export order (a stable sort). */
export function sortAuthors<T extends Pick<Influencer, 'posts' | 'reach' | 'engagement'>>(rows: readonly T[], by: SlAuthorSort): T[] {
  return rows.map((r, i) => ({ r, i })).sort((a, b) => b.r[by] - a.r[by] || a.i - b.i).map((x) => x.r)
}

/** Reach and engagement per mention, as every deck's table shows them: the total over the author's posts. Null with no
 *  posts, never Infinity. */
export function perMention(total: number, posts: number): number | null {
  return posts > 0 ? total / posts : null
}
