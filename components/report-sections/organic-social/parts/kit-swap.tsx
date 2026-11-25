// The one section swap every design kit part version uses (tiles-kit, trends-kit, ytd-kit, posts-kit, kpi-kit). Round 2
// wrote it once per file so its PRs stood alone (docs/qa/os-design-round2-code-review.md, finding 6); this is that
// helper folded into one place, with no change to what any part draws.
//
// A kit part is its old version's own `render` with one thing swapped: the section inside its Suspense becomes the kit
// form of that section. The fallback, the section's props and every request are the old code's.
import { Suspense, isValidElement, type ReactNode } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import type { OrganicSocialCtx } from '../ctx'

export type Section = (props: never) => Promise<ReactNode>
/** The kit form of a rendered section's component, or undefined to leave that section as it is. */
export type KitFor = (section: unknown) => unknown

/** An old part's rendered element, `<Suspense fallback><Section .../></Suspense>`, with its section swapped for
 *  `kitFor(Section)`; the fallback and the section's props are kept exactly. Anything else (null on a tab the part does
 *  not cover), or a section `kitFor` has no kit form for, passes through as it is. */
export function swapSection(node: ReactNode, kitFor: KitFor): ReactNode {
  if (!isValidElement(node) || node.type !== Suspense) return node
  const { fallback, children } = node.props as { fallback: ReactNode; children: ReactNode }
  if (!isValidElement(children)) return node
  const Kit = kitFor(children.type) as ((p: object) => ReactNode) | undefined
  return Kit ? <Suspense fallback={fallback}><Kit {...(children.props as object)} /></Suspense> : node
}

/** Kit forms for any section: the same section, its answer passed through `redraw`. Each is made once per section and
 *  kept, so the element a render returns always has the same component and React never remounts the block (or loses
 *  a chart's toggles, a sort, or the page a viewer is on) on a re-render. `kitFor` gives every function section its
 *  kit form and leaves anything else as it is. */
export function redrawnSections(redraw: (node: ReactNode) => ReactNode): { kitSectionFor: (section: Section) => Section; kitFor: KitFor } {
  const made = new Map<Section, Section>()
  function kitSectionFor(section: Section): Section {
    let kitted = made.get(section)
    if (!kitted) {
      kitted = async (props: never) => redraw(await section(props))
      made.set(section, kitted)
    }
    return kitted
  }
  return { kitSectionFor, kitFor: (section) => (typeof section === 'function' ? kitSectionFor(section as Section) : undefined) }
}

/** The kit version of an old part: its id and label, unpublished (pinned per client, never promoted into the shared
 *  template or frozen into a snapshot), and its render with the section swapped. The resolved part passes straight
 *  through (top-content@3 reads its owned post limit from it). */
export function kitOf(old: PartImpl<OrganicSocialCtx>, version: number, kitFor: KitFor): PartImpl<OrganicSocialCtx> {
  return {
    id: old.id,
    version,
    published: false,
    defaultLabel: old.defaultLabel,
    render: (ctx, resolved) => swapSection(old.render(ctx, resolved), kitFor),
  }
}
