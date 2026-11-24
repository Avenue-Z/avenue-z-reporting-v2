// The trend graphs' design kit part versions (plan docs/superpowers/plans/2026-11-23-os-design-phase1.md, Tasks 3 and 4):
// follower-graph@3 (from @2), engagement-trend@3 (from @2) and engagement-trend@4 (from @1, Overview's template part).
//
// Each one is the old version's own `render` with one thing changed: the section inside its Suspense is wrapped so the
// graph it returns is drawn in a kit card, the line shaded and frameless (asKitChart). The section itself runs as it is,
// so the requests, the annotations, the chart notes, the hides and the fallback cards are the old code, not a copy of it.
// The channel toggles, the callout cards and the note editors are ChannelTrendChart's own and work as before. All
// unpublished: pinned per client, never promoted into the shared template or frozen into a snapshot.
import { isValidElement, type ComponentProps, type ReactNode } from 'react'
import kit from '../design/kit.module.css'
import { FollowerGraph } from '../follower-graph'
import { EngagementTrend } from '../trends'
import { followerGraphV2 } from './follower-graph'
import { engagementTrendV1, engagementTrendV2 } from './engagement-trend'
import { kitOf, redrawnSections } from './kit-swap'

/** A graph a trend section returned, in a kit card with the kit's line. A fallback card, or nothing (the follower graph
 *  on Overview), passes through as it is. */
export function asKitChart(node: ReactNode): ReactNode {
  if (!isValidElement(node)) return node
  if (node.type === FollowerGraph) {
    return <div className={`${kit.root} ${kit.card}`}><FollowerGraph {...(node.props as ComponentProps<typeof FollowerGraph>)} shaded frameless /></div>
  }
  if (node.type === EngagementTrend) {
    return <div className={`${kit.root} ${kit.card}`}><EngagementTrend {...(node.props as ComponentProps<typeof EngagementTrend>)} shaded frameless /></div>
  }
  return node
}

/** The kit form of a section: the same section, its graph drawn by asKitChart, made once per section (kit-swap.tsx).
 *  Works on the section the old render holds, so engagement-trend@1's unexported section needs no change to its file. */
export const { kitSectionFor, kitFor } = redrawnSections(asKitChart)

/** The Follower Growth Graph (followers gained per day, annotated) in a kit card. */
export const followerGraphV3 = kitOf(followerGraphV2, 3, kitFor)
/** The Engagement Graph (daily engagements, annotated on a platform tab) in a kit card. */
export const engagementTrendV3 = kitOf(engagementTrendV2, 3, kitFor)
/** Overview's Engagement Over Time (the template's part) in a kit card. */
export const engagementTrendV4 = kitOf(engagementTrendV1, 4, kitFor)
