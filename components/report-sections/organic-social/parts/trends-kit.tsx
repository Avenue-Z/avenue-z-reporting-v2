// The trend graphs' design kit part versions (plan docs/superpowers/plans/2026-11-23-os-design-phase1.md, Tasks 3 and 4):
// follower-graph@3 (from @2), engagement-trend@3 (from @2) and engagement-trend@4 (from @1, Overview's template part).
//
// Each one is the old version's own `render` with one thing changed: the section inside its Suspense is wrapped so the
// graph it returns is drawn in a kit card, the line shaded and frameless (asKitChart). The section itself runs as it is,
// so the requests, the annotations, the chart notes, the hides and the fallback cards are the old code, not a copy of it.
// The channel toggles, the callout cards and the note editors are ChannelTrendChart's own and work as before. All
// unpublished: pinned per client, never promoted into the shared template or frozen into a snapshot.
import { Suspense, isValidElement, type ComponentProps, type ReactNode } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import type { OrganicSocialCtx } from '../ctx'
import kit from '../design/kit.module.css'
import { FollowerGraph } from '../follower-graph'
import { EngagementTrend } from '../trends'
import { followerGraphV2 } from './follower-graph'
import { engagementTrendV1, engagementTrendV2 } from './engagement-trend'

/** A graph a trend section returned, in a kit card with the kit's line. A fallback card, or nothing (the follower graph
 *  on Overview), passes through as it is. */
export function asKitChart(node: ReactNode): ReactNode {
  if (!isValidElement(node)) return node
  if (node.type === FollowerGraph) {
    return <div className={`${kit.root} ${kit.tight} ${kit.card}`}><FollowerGraph {...(node.props as ComponentProps<typeof FollowerGraph>)} shaded frameless /></div>
  }
  if (node.type === EngagementTrend) {
    return <div className={`${kit.root} ${kit.tight} ${kit.card}`}><EngagementTrend {...(node.props as ComponentProps<typeof EngagementTrend>)} shaded frameless /></div>
  }
  return node
}

type Section = (props: never) => Promise<ReactNode>
const kitSections = new Map<Section, Section>()

/** The kit form of a section: the same section, its graph drawn by asKitChart. Made once per section and kept, so the
 *  element a render returns always has the same component, and React never remounts the chart (or loses its toggles)
 *  on a re-render. Works on the section the old render holds, so engagement-trend@1's unexported section needs no
 *  change to its file. */
export function kitSectionFor(section: Section): Section {
  let kitted = kitSections.get(section)
  if (!kitted) {
    kitted = async (props: never) => asKitChart(await section(props))
    kitSections.set(section, kitted)
  }
  return kitted
}

/** An old part's rendered element, `<Suspense fallback><Section .../></Suspense>`, with its section in kit form. The
 *  fallback and the section's props are kept exactly. Anything else passes through as it is. */
function withKitSection(node: ReactNode): ReactNode {
  if (!isValidElement(node) || node.type !== Suspense) return node
  const { fallback, children } = node.props as { fallback: ReactNode; children: ReactNode }
  if (!isValidElement(children) || typeof children.type !== 'function') return node
  const Kit = kitSectionFor(children.type as Section) as unknown as (p: object) => ReactNode
  return <Suspense fallback={fallback}><Kit {...(children.props as object)} /></Suspense>
}

function kitOf(old: PartImpl<OrganicSocialCtx>, version: number): PartImpl<OrganicSocialCtx> {
  return {
    id: old.id,
    version,
    published: false,
    defaultLabel: old.defaultLabel,
    // The old renders take ctx only (none reads the resolved part), so it passes straight through.
    render: (ctx, resolved) => withKitSection(old.render(ctx, resolved)),
  }
}

/** The Follower Growth Graph (followers gained per day, annotated) in a kit card. */
export const followerGraphV3 = kitOf(followerGraphV2, 3)
/** The Engagement Graph (daily engagements, annotated on a platform tab) in a kit card. */
export const engagementTrendV3 = kitOf(engagementTrendV2, 3)
/** Overview's Engagement Over Time (the template's part) in a kit card. */
export const engagementTrendV4 = kitOf(engagementTrendV1, 4)
