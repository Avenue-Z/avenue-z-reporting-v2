// The posts' design kit part versions (plan docs/superpowers/plans/2026-11-23-os-design-phase1.md, Tasks 7 and 8):
// top-content@4 (from @3, the outline clients' Instagram tab), top-content@5 (from @2, Overview's template part and
// Renaissance's platform tabs) and influencer-posts@2 (from @1, the Influencer tab).
//
// Each awaits the old section as it is and walks the tree it returns (kitPosts): the card list it hands to the client
// (SortableTopContent or InfluencerGrid) gets `look="kit"`, which draws the cards in the kit's frame and the sort buttons
// as the kit's pills, and the Influencer totals' KpiCards become KpiTiles (proven to read exactly as KpiCard), in the
// page copy and in the PDF's `lead` copy. So the post read, the client read, the owned and influencer split, the stored
// designations, the labels, the sort, the paging and the fallback cards are the old code, not a copy of it. All
// unpublished: pinned per client, never promoted into the shared template or frozen into a snapshot.
import { Fragment, cloneElement, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react'
import { KpiCard } from '@/components/charts/kpi-card'
import { KpiTile } from '../design/charts'
import kit from '../design/kit.module.css'
import { SortableTopContent } from '../sortable-top-content'
import { InfluencerGrid } from '../influencer-grid'
import { topContentV2 } from './top-content'
import { topContentV3 } from './top-content-outline'
import { influencerPostsV1 } from './influencer-posts'
import { kitOf, redrawnSections } from './kit-swap'

type El = ReactElement<Record<string, unknown>>

/** One element of a returned posts tree in kit form. Only host elements and fragments are walked into; any other
 *  component (the hover hint, a fallback card) is left exactly as it is. */
function kitPosts(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map(kitPosts)
  if (!isValidElement(node)) return node
  const el = node as El
  const p = el.props
  if (el.type === SortableTopContent) return cloneElement(el, { look: 'kit' })
  // The Influencer grid draws its `lead` (the heading and totals) in the PDF's first block, so it is restyled too.
  if (el.type === InfluencerGrid) return cloneElement(el, { look: 'kit', ...(p.lead !== undefined ? { lead: kitPosts(p.lead as ReactNode) } : {}) })
  if (el.type === KpiCard) return <KpiTile key={el.key ?? undefined} {...(p as unknown as ComponentProps<typeof KpiCard>)} />
  if (typeof el.type === 'string' || el.type === Fragment) {
    const kids = p.children as ReactNode
    if (kids === undefined) return el
    return Array.isArray(kids) ? cloneElement(el, undefined, ...kids.map(kitPosts)) : cloneElement(el, undefined, kitPosts(kids))
  }
  return el
}

/** A posts section's answer in kit form: the block inside the kit's colours. A fallback card or nothing passes through. */
function kitPostsBlock(node: ReactNode): ReactNode {
  if (isValidElement(node) && node.type === 'section') return <div className={kit.root}>{kitPosts(node)}</div>
  return node
}

/** Each section's kit form, made once per section (kit-swap.tsx), so a re-render never remounts the cards (or loses the
 *  sort or the page a viewer is on). Anything else (null off the Influencer tab) passes through. */
const { kitFor } = redrawnSections(kitPostsBlock)

/** The outline clients' Top Performing Content (owned top five per platform, the influencer rows), on the kit. */
export const topContentV4 = kitOf(topContentV3, 4, kitFor)
/** Top Content (Overview's template part, Renaissance's platform tabs), on the kit. */
export const topContentV5 = kitOf(topContentV2, 5, kitFor)
/** The Influencer tab's posts and totals, on the kit. */
export const influencerPostsV2 = kitOf(influencerPostsV1, 2, kitFor)
